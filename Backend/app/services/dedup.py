"""Dedup fast layer service.

Two entry points:

- `find_duplicate_hints`: runs before `create_ticket` / `create_station` and returns at most
  one hint. Fail-open: any error returns `[]`, so a broken dedup layer never blocks a report.
- `record_hint_outcome`: records what the submitter did with the hint. Not fail-open.

Both take `entity_kind` ("ticket" by default, or "station").
"""

import contextlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geom_to_geojson
from app.infrastructure.repository.base import GenericRepository
from app.models.auth import User
from app.models.dedup import PAIR_HINT_OUTCOMES, DuplicatePair
from app.repositories.dedup_repository import (
    DEDUP_ENTITIES,
    dedup_audit_event_repository,
    dedup_candidate_repository,
    duplicate_pair_repository,
)
from app.repositories.geo_repository import station_repository
from app.repositories.tickets_repository import ticket_repository
from app.services.authz import require_scope
from app.services.dedup_scoring import (
    FAST_LAYER_PARAMETERS,
    STATION_FAST_LAYER_PARAMETERS,
    CandidateScore,
    FastLayerParameters,
    max_hint_distance_m,
    score_candidate,
    top_hint,
)
from app.services.geo_validation import validate_point

logger = logging.getLogger("app.dedup")

# Text handed to pg_trgm is truncated, not refused: the check is advisory. 200 is the width
# of `tickets.title`; `tickets.description` is unbounded, so 2000 is a chosen cap.
TITLE_MAX_CHARS = 200
DESCRIPTION_MAX_CHARS = 2000
# Margin so float rounding cannot drop a candidate that scores exactly on the threshold.
RETRIEVAL_RADIUS_SAFETY_FACTOR = 1.1
# Backstop for parameters where distance rules nothing out (the derived radius is infinite).
MAX_CANDIDATE_RADIUS_M = 1000.0


@dataclass(frozen=True)
class _Kind:
    label: str
    repository: GenericRepository
    add_perm: Perm
    parameters: FastLayerParameters


_KINDS = {
    "ticket": _Kind("Ticket", ticket_repository, Perm.TICKET_ADD, FAST_LAYER_PARAMETERS),
    "station": _Kind("Station", station_repository, Perm.STATION_ADD, STATION_FAST_LAYER_PARAMETERS),
}


async def find_duplicate_hints(
    db: AsyncSession,
    *,
    geometry: dict,
    title: str,
    description: str | None = None,
    task_type: str | None = None,
    parameters: FastLayerParameters | None = None,
    entity_kind: str = "ticket",
) -> list[CandidateScore]:
    """Return the best nearby open entity as a one-element list, or `[]`. Never raises.

    For a station, `title` is its name and `task_type` its type. `parameters` defaults to the
    entity kind's own. The caller checks permissions first, so a 403 is not swallowed by the
    fail-open. Invalid geometry also returns `[]`; the create mutation is the gate that rejects it.
    """
    try:
        kind = _KINDS[entity_kind]
        parameters = parameters or kind.parameters
        validate_point(geometry, entity=kind.label)
        longitude, latitude = geometry["coordinates"][:2]
        candidates = await dedup_candidate_repository.list_nearby_open(
            db,
            longitude=longitude,
            latitude=latitude,
            query_text=_query_text(title, description),
            radius_m=_retrieval_radius_m(parameters),
            now=datetime.now(UTC),
            entity_kind=entity_kind,
        )
        best = top_hint(candidates, query_task_type=task_type, parameters=parameters)
    except Exception:
        logger.exception("fast-layer dedup check failed; returning no hint (fail-open)")
        # The session is shared with sibling resolvers in the same request; an aborted
        # transaction would fail them all. The rollback must not raise either.
        with contextlib.suppress(Exception):
            await db.rollback()
        return []
    return [best] if best else []


async def record_hint_outcome(
    db: AsyncSession,
    *,
    actor: User,
    candidate_ticket_uuid: str,
    outcome: str,
    submitted_ticket_uuid: str | None = None,
    entity_kind: str = "ticket",
) -> tuple[DuplicatePair | None, str]:
    """Record the submitter's response to a hint. Returns (pair card or None, audit event uuid).

    Always writes an audit event. Writes a pair card only when a second entity exists. Only
    the creator of the submitted entity may report on it: the add permission is held at
    `all` by every logged-in role, so without this check anyone could card any pair. The
    `*_ticket_uuid` arguments carry station uuids when `entity_kind` is "station".

    Raises:
        ValueError: unsupported entity kind, unknown outcome, entity not found, or an entity
            paired with itself.
        HTTPException: 403 when the caller did not create the submitted entity.
    """
    kind = _KINDS.get(entity_kind)
    if kind is None:
        raise ValueError(f"Unsupported dedup entity kind: {entity_kind}")
    if outcome not in PAIR_HINT_OUTCOMES:
        raise ValueError(f"Unknown dedup hint outcome: {outcome}")
    candidate = await _get_entity(db, kind, candidate_ticket_uuid)
    accepted = outcome == "accepted_hint"

    pair = score = None
    if not submitted_ticket_uuid:
        await require_scope(actor, kind.add_perm, db)
    else:
        submitted = await _get_entity(db, kind, submitted_ticket_uuid)
        await require_scope(actor, kind.add_perm, db, resource=submitted)
        if str(submitted.created_by) != str(actor.uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        if str(submitted.uuid) == str(candidate.uuid):
            raise ValueError(f"A {entity_kind} cannot be a duplicate of itself")
        score = await _rescore_pair(db, entity_kind, submitted=submitted, candidate=candidate)
        pair = await _upsert_fast_pair(
            db,
            entity_kind,
            uuids=(str(submitted.uuid), str(candidate.uuid)),
            accepted=accepted,
            score=score,
        )

    event = await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": entity_kind,
            "event_type": "hint_accepted" if accepted else "ignored_by_submitter",
            "pair_uuid": str(pair.uuid) if pair else None,
            "primary_uuid": str(candidate.uuid),
            "duplicate_uuid": submitted_ticket_uuid,
            "actor_uuid": str(actor.uuid),
            "source_layer": "fast",
            "decision_reason": outcome,
            "evidence": _evidence(score),
        },
    )
    await db.commit()
    return pair, str(event.uuid)


def _retrieval_radius_m(parameters: FastLayerParameters) -> float:
    """The hint boundary plus a rounding margin, clamped to `MAX_CANDIDATE_RADIUS_M`."""
    radius = max_hint_distance_m(parameters) * RETRIEVAL_RADIUS_SAFETY_FACTOR
    if radius > MAX_CANDIDATE_RADIUS_M:
        logger.warning(
            "dedup parameters put the hint boundary at %.1f m; clamping retrieval to %.1f m. "
            "Distance cannot rule any candidate out at these weights — check the settings, "
            "not the data.",
            radius,
            MAX_CANDIDATE_RADIUS_M,
        )
        return MAX_CANDIDATE_RADIUS_M
    return radius


def _query_text(title: str | None, description: str | None) -> str:
    parts = ((title or "")[:TITLE_MAX_CHARS], (description or "")[:DESCRIPTION_MAX_CHARS])
    return " ".join(part for part in parts if part).strip()


async def _get_entity(db: AsyncSession, kind: _Kind, entity_uuid: str):
    entity = await kind.repository.get_by_uuid_active(db, entity_uuid)
    if not entity:
        raise ValueError(f"{kind.label} not found")
    return entity


async def _rescore_pair(db: AsyncSession, entity_kind: str, *, submitted, candidate) -> CandidateScore | None:
    """Recompute the pair's score server-side instead of trusting the client's."""
    geojson = geom_to_geojson(submitted.geometry)
    if not geojson or geojson.get("type") != "Point":
        return None
    longitude, latitude = geojson["coordinates"][:2]
    entity = DEDUP_ENTITIES[entity_kind]
    features = await dedup_candidate_repository.get_candidate_features(
        db,
        longitude=longitude,
        latitude=latitude,
        query_text=_query_text(*entity.texts(submitted)),
        candidate_uuid=str(candidate.uuid),
        now=submitted.created_at,
        entity_kind=entity_kind,
    )
    if features is None:
        return None
    return score_candidate(
        features, query_task_type=entity.type_of(submitted), parameters=_KINDS[entity_kind].parameters
    )


async def _upsert_fast_pair(
    db: AsyncSession,
    entity_kind: str,
    *,
    uuids: tuple[str, str],
    accepted: bool,
    score: CandidateScore | None,
) -> DuplicatePair:
    """Create the live card for this pair, or update it in place.

    An ignored hint always moves the card to `dup_ignored` + `rescan_needed`, whatever its
    current status, so the slow layer re-scans it.
    """
    low_uuid, high_uuid = sorted(uuids)  # satisfies CHECK (low_uuid < high_uuid)
    hint_outcome = "accepted_hint" if accepted else "ignored_hint"

    existing = await duplicate_pair_repository.get_active_by_entities(
        db, entity_kind=entity_kind, low_uuid=low_uuid, high_uuid=high_uuid
    )
    if existing:
        existing.hint_outcome = hint_outcome
        if not accepted:
            existing.status = "dup_ignored"
            existing.rescan_needed = True
        db.add(existing)
        await db.flush()
        return existing

    return await duplicate_pair_repository.add(
        db,
        obj_in={
            "entity_kind": entity_kind,
            "low_uuid": low_uuid,
            "high_uuid": high_uuid,
            "similarity": None if score is None else Decimal(f"{score.similarity:.4f}"),
            "score_components": None if score is None else _components_json(score),
            "method": "fast_rule",
            "source_layer": "fast",
            "status": "suggested" if accepted else "dup_ignored",
            "hint_outcome": hint_outcome,
            "rescan_needed": not accepted,
        },
    )


def _evidence(score: CandidateScore | None) -> dict:
    evidence = {"source_layer": "fast", "method": "fast_rule"}
    if score is not None:
        evidence |= {"similarity": round(score.similarity, 4), "score_components": _components_json(score)}
    return evidence


def _components_json(score: CandidateScore) -> list[dict]:
    return [
        {"name": c.name, "score": round(c.score, 4), "weight": c.weight, "passed": c.passed}
        for c in score.components
    ]
