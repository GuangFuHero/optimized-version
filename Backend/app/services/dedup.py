"""Dedup fast layer: the pre-submit duplicate check and the hint-outcome record.

Same flat-service style as ticket.py / station.py (`db` first, keyword-only args, each
function owns its own authz + validation + persistence — ADR-013/014/015/022).

Two entry points:

- `find_duplicate_hints` — read-only, runs *before* `create_ticket`. **Fail-open**: any
  failure returns an empty list so a broken dedup layer can never block someone reporting a
  disaster. The slow layer catches whatever the fast layer misses.
- `record_hint_outcome` — writes what the submitter did about the hint. Without it the fast
  layer can only ever count its failures (see `TicketDedupAuditEvent`).
"""

import logging
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geom_to_geojson
from app.models.auth import User
from app.models.dedup import TicketDuplicatePair
from app.repositories.dedup_repository import (
    DEFAULT_CANDIDATE_LIMIT,
    DEFAULT_CANDIDATE_RADIUS_M,
    dedup_candidate_repository,
    ticket_dedup_audit_event_repository,
    ticket_duplicate_pair_repository,
)
from app.repositories.tickets_repository import ticket_repository
from app.services.authz import require_scope
from app.services.dedup_scoring import (
    FAST_LAYER_PARAMETERS,
    CandidateScore,
    FastLayerParameters,
    score_candidate,
    top_hint,
)

logger = logging.getLogger("app.dedup")

# The four choices the hint offers the submitter (design §三, 2026-07-06 ground truth). The
# frozen contract only defines the two-valued `hint_outcome` these collapse into, so these
# names are **this PR's proposal** and are on the list for the team to ratify — the extra
# granularity is kept on the audit event's `decision_reason` so nothing is lost either way.
HINT_OUTCOME_CHOICES = (
    "commented_on_original",       # 去原單留言
    "suggested_edit_to_original",  # 對原單建議修改
    "updated_own_ticket",          # 更新自己的舊單
    "submitted_anyway",            # 照樣送出
)
# Everything except "submitted anyway" means the hint did its job.
ACCEPTED_HINT_CHOICES = frozenset(HINT_OUTCOME_CHOICES[:3])
# Card states the fast layer may still move. `confirmed` / `rejected` carry an admin
# decision, and contract §1.1 reserves overturning those for soft-delete + a new row.
UNSETTLED_PAIR_STATUSES = frozenset({"suggested", "dup_ignored"})


async def find_duplicate_hints(
    db: AsyncSession,
    *,
    longitude: float,
    latitude: float,
    title: str,
    description: str | None = None,
    task_type: str | None = None,
    submitted_at: datetime | None = None,
    radius_m: float = DEFAULT_CANDIDATE_RADIUS_M,
    limit: int = DEFAULT_CANDIDATE_LIMIT,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> list[CandidateScore]:
    """Find the one nearby open ticket worth warning the submitter about, if any.

    Returns a list of at most one element — top-1 above `hint_threshold`, empty otherwise.
    A list rather than an optional single value so returning top-N later is additive rather
    than a breaking schema change.

    **Never raises.** Retrieval or scoring blowing up (pg_trgm missing, PostGIS error, a
    settings object with every weight zeroed) is logged and answered with an empty list:
    the fast layer is an advisory prompt, and an advisory prompt that can 500 a submission
    is worse than no prompt at all. Authorization is *not* handled here — the caller checks
    it before entering, so a permission failure still surfaces as a 403 instead of being
    swallowed by the fail-open.
    """
    try:
        candidates = await dedup_candidate_repository.list_nearby_open(
            db,
            longitude=longitude,
            latitude=latitude,
            query_text=_query_text(title, description),
            now=submitted_at or datetime.now(UTC),
            radius_m=radius_m,
            limit=limit,
        )
        best = top_hint(candidates, query_task_type=task_type, parameters=parameters)
    except Exception:
        logger.exception("fast-layer dedup check failed; returning no hint (fail-open)")
        return []
    return [best] if best else []


async def record_hint_outcome(
    db: AsyncSession,
    *,
    actor: User,
    candidate_ticket_uuid: str,
    outcome: str,
    submitted_ticket_uuid: str | None = None,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> tuple[TicketDuplicatePair | None, str]:
    """Record what the submitter did about a fast-layer hint. Returns (pair, event_uuid).

    Deliberately **not** fail-open: this runs after the user has already acted, so an error
    here blocks nothing and swallowing it would corrupt the very measurement the table
    exists for.

    A pair card is written only when a second ticket actually exists — accepting the hint
    usually means no ticket was created, and `ticket_duplicate_pairs` cannot hold a row for
    a ticket that was never inserted (both sides are FKs). The audit event always lands, so
    an accepted hint is still counted.

    Only the submitter may report on their own submission: `ticket.add` alone would let any
    logged-in caller card an arbitrary pair of tickets, poisoning both the slow layer's
    re-scan queue and the measurement this table exists for. The capability check passes
    `resource=submitted` so checkpoint 2 engages if the seed ever narrows `ticket.add` below
    `all`, but that is future-proofing, not the guard — today every holder has it at `all`,
    so the explicit creator check below is what actually closes the hole.

    Raises:
        ValueError: unknown outcome, either ticket not found, or a ticket paired with itself.
        HTTPException: 403 when the caller did not create the submitted ticket.
    """
    if outcome not in HINT_OUTCOME_CHOICES:
        raise ValueError(f"Unknown dedup hint outcome: {outcome}")

    candidate = await ticket_repository.get_by_uuid_active(db, candidate_ticket_uuid)
    if not candidate:
        raise ValueError("Ticket not found")

    accepted = outcome in ACCEPTED_HINT_CHOICES
    pair = None
    score = None
    if not submitted_ticket_uuid:
        await require_scope(actor, Perm.TICKET_ADD, db)
    else:
        submitted = await ticket_repository.get_by_uuid_active(db, submitted_ticket_uuid)
        if not submitted:
            raise ValueError("Ticket not found")
        await require_scope(actor, Perm.TICKET_ADD, db, resource=submitted)
        if str(submitted.created_by) != str(actor.uuid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied."
            )
        if str(submitted.uuid) == str(candidate.uuid):
            raise ValueError("A ticket cannot be a duplicate of itself")
        score = await _rescore_pair(db, submitted=submitted, candidate=candidate, parameters=parameters)
        pair = await _upsert_fast_pair(
            db,
            submitted_uuid=str(submitted.uuid),
            candidate_uuid=str(candidate.uuid),
            accepted=accepted,
            score=score,
        )

    event = await ticket_dedup_audit_event_repository.add(
        db,
        obj_in={
            "event_type": "hint_accepted" if accepted else "ignored_by_submitter",
            "pair_uuid": str(pair.uuid) if pair else None,
            "primary_ticket_uuid": str(candidate.uuid),
            "duplicate_ticket_uuid": submitted_ticket_uuid,
            "actor_uuid": str(actor.uuid),
            "source_layer": "fast",
            # The contract's hint_outcome only has two values; the submitter's actual choice
            # (comment / suggest an edit / refresh my own ticket) survives here.
            "decision_reason": outcome,
            "evidence": _evidence(score),
        },
    )
    await db.commit()
    return pair, str(event.uuid)


def _query_text(title: str, description: str | None) -> str:
    """Join the text fields the pg_trgm signal compares (title + description)."""
    return " ".join(part for part in (title, description) if part).strip()


def _evidence(score: CandidateScore | None) -> dict:
    """Snapshot the score behind a decision, for the audit event's `evidence` column."""
    if score is None:
        return {"source_layer": "fast", "method": "fast_rule"}
    return {
        "source_layer": "fast",
        "method": "fast_rule",
        "similarity": round(score.similarity, 4),
        "score_components": _components_json(score),
    }


def _components_json(score: CandidateScore) -> list[dict]:
    """Render the per-signal breakdown as the contract's `score_components` jsonb array."""
    return [
        {"name": c.name, "score": round(c.score, 4), "weight": c.weight, "passed": c.passed}
        for c in score.components
    ]


async def _rescore_pair(
    db: AsyncSession, *, submitted, candidate, parameters: FastLayerParameters
) -> CandidateScore | None:
    """Re-derive the pair's score server-side rather than trusting a client-supplied one.

    Both tickets exist by now and every signal is deterministic, so recomputing costs one
    query and removes the client's ability to write whatever similarity it likes into an
    audit table.
    """
    geojson = geom_to_geojson(submitted.geometry)
    if not geojson or geojson.get("type") != "Point":
        return None
    longitude, latitude = geojson["coordinates"][0], geojson["coordinates"][1]
    features = await dedup_candidate_repository.get_candidate_features(
        db,
        longitude=longitude,
        latitude=latitude,
        query_text=_query_text(submitted.title, submitted.description),
        candidate_uuid=str(candidate.uuid),
        now=submitted.created_at,
    )
    if features is None:
        return None
    return score_candidate(features, query_task_type=submitted.task_type, parameters=parameters)


async def _upsert_fast_pair(
    db: AsyncSession,
    *,
    submitted_uuid: str,
    candidate_uuid: str,
    accepted: bool,
    score: CandidateScore | None,
) -> TicketDuplicatePair:
    """Create or update the live fast-layer card for this ticket pair.

    Ordering the two uuids satisfies the table's `ticket_low_id < ticket_high_id` CHECK, so
    the same two tickets always land on one row whichever was submitted second.

    An existing live card is updated in place, but `status` is only touched while the card is
    still unsettled (`suggested` / `dup_ignored`). Contract §1.1 is explicit that overturning
    a settled verdict is soft-delete + insert a new row, never an in-place UPDATE, so
    stamping `dup_ignored` over an admin's `confirmed`/`rejected` would erase a human
    decision with a user-triggered write. `hint_outcome` is still recorded either way: it
    describes what the submitter did, not what the verdict is, so it cannot overturn
    anything — and dropping it would lose the measurement this whole path exists for.
    """
    ticket_low_id, ticket_high_id = sorted((submitted_uuid, candidate_uuid))
    hint_outcome = "accepted_hint" if accepted else "ignored_hint"
    similarity = None if score is None else Decimal(f"{score.similarity:.4f}")
    components = None if score is None else _components_json(score)

    existing = await ticket_duplicate_pair_repository.get_active_by_tickets(
        db, ticket_low_id=ticket_low_id, ticket_high_id=ticket_high_id
    )
    if existing:
        existing.hint_outcome = hint_outcome
        if existing.status not in UNSETTLED_PAIR_STATUSES:
            logger.info(
                "dedup pair %s is already %s; recording hint_outcome only (contract §1.1)",
                existing.uuid, existing.status,
            )
        elif not accepted:
            # 使用者不聽勸：the card becomes the slow layer's to re-scan (design §三).
            existing.status = "dup_ignored"
            existing.rescan_needed = True
        db.add(existing)
        await db.flush()
        return existing

    return await ticket_duplicate_pair_repository.add(
        db,
        obj_in={
            "ticket_low_id": ticket_low_id,
            "ticket_high_id": ticket_high_id,
            "similarity": similarity,
            "score_components": components,
            "method": "fast_rule",
            "source_layer": "fast",
            # `dup_ignored` is the fast layer's terminal status (design §三): the submitter
            # was warned and submitted anyway. `rescan_needed` hands it to the slow layer.
            "status": "dup_ignored" if not accepted else "suggested",
            "hint_outcome": hint_outcome,
            "rescan_needed": not accepted,
        },
    )
