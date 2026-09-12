"""Dedup fast layer: the pre-submit duplicate check and the hint-outcome record.

Same flat-service style as ticket.py / station.py (`db` first, keyword-only args, each
function owns its own authz + validation + persistence — ADR-013/014/015/022).

Two entry points:

- `find_duplicate_hints` — read-only, runs *before* `create_ticket`. **Fail-open**: any
  failure returns an empty list so a broken dedup layer can never block someone reporting a
  disaster. The slow layer catches whatever the fast layer misses.
- `record_hint_outcome` — writes what the submitter did about the hint. Without it the fast
  layer can only ever count its failures (see `DedupAuditEvent`).
"""

import contextlib
import logging
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geom_to_geojson
from app.models.auth import User
from app.models.dedup import PAIR_HINT_OUTCOMES, DuplicatePair
from app.repositories.dedup_repository import (
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

# Per-entity-kind wiring for the two service functions below. Only "ticket" and "station" are
# supported here — "ticket_task" is in the model's ENTITY_KINDS value domain for a later slice
# but this module does not implement it yet.
_ENTITY_LABELS = {"ticket": "Ticket", "station": "Station"}
_ENTITY_REPOSITORIES = {"ticket": ticket_repository, "station": station_repository}
_ENTITY_ADD_PERMS = {"ticket": Perm.TICKET_ADD, "station": Perm.STATION_ADD}
# The parameters a caller gets when it does not pass its own — the station default has
# `time_weight = 0` (see dedup_scoring.py); picking it here, rather than leaving every caller
# to remember it, is what keeps a caller that only passes `entity_kind="station"` correct.
_ENTITY_DEFAULT_PARAMETERS: dict[str, FastLayerParameters] = {
    "ticket": FAST_LAYER_PARAMETERS,
    "station": STATION_FAST_LAYER_PARAMETERS,
}


def _require_supported_entity_kind(entity_kind: str) -> None:
    """Raise for any `entity_kind` this slice does not implement."""
    if entity_kind not in _ENTITY_REPOSITORIES:
        raise ValueError(f"Unsupported dedup entity kind: {entity_kind}")


def _default_parameters(entity_kind: str) -> FastLayerParameters:
    """The parameters to score with when the caller did not supply its own."""
    return _ENTITY_DEFAULT_PARAMETERS.get(entity_kind, FAST_LAYER_PARAMETERS)


def _entity_text_fields(entity_kind: str, entity) -> tuple[str | None, str | None]:
    """The two text fields pg_trgm compares, named differently on each entity."""
    if entity_kind == "station":
        return entity.name, entity.description
    return entity.title, entity.description


def _entity_type(entity_kind: str, entity) -> str | None:
    """The "type" signal, `stations.type` for a station and `tickets.task_type` for a ticket."""
    return entity.type if entity_kind == "station" else entity.task_type

# Bounds on the text handed to pg_trgm. `similarity()` builds a trigram set per call, so an
# unbounded description turns one advisory lookup into real work — and trigram overlap
# saturates long before this anyway, so the tail contributes nothing to the signal.
# TITLE_MAX_CHARS is the width of `tickets.title` (models/request.py), so truncating there
# discards only text the INSERT would reject. DESCRIPTION_MAX_CHARS has no column to match
# — `tickets.description` is unbounded TEXT — so 2000 is this PR's number, listed for the
# team. Over-long input is truncated rather than refused: the check is advisory, and
# refusing would silently drop the hint for exactly the wordiest reports.
TITLE_MAX_CHARS = 200
DESCRIPTION_MAX_CHARS = 2000

# Slack on the derived retrieval radius. Not a modelling choice — the radius and the distance
# signal are computed from the same PostGIS measurement, so they agree — just enough margin
# that floating-point rounding at the boundary cannot drop a candidate scoring exactly on the
# threshold, which `top_hint` would otherwise have shown (the comparison is `>=`).
RETRIEVAL_RADIUS_SAFETY_FACTOR = 1.1
# Backstop, not a tuning knob. The derived radius is unbounded when the parameters make
# distance incapable of ruling anything out (no distance weight, or a threshold the other
# three signals clear on their own), and "scan the planet" is not a sane answer to a
# misconfiguration. Crossing it is logged, because it means the parameters, not the data,
# need looking at.
MAX_CANDIDATE_RADIUS_M = 1000.0


async def find_duplicate_hints(
    db: AsyncSession,
    *,
    geometry: dict,
    title: str,
    description: str | None = None,
    task_type: str | None = None,
    submitted_at: datetime | None = None,
    parameters: FastLayerParameters | None = None,
    entity_kind: str = "ticket",
) -> list[CandidateScore]:
    """Find the one nearby open entity worth warning the submitter about, if any.

    `entity_kind` is `"ticket"` (default, unchanged) or `"station"` — see
    `app/repositories/dedup_repository.py`'s `_ENTITY_CONFIGS` for what differs between them.
    For a station, `title` carries `stations.name` and `task_type` carries `stations.type`;
    the parameter names are kept generic rather than duplicated per entity kind.

    `parameters` defaults to `None`, which resolves to `FAST_LAYER_PARAMETERS` for a ticket
    and `STATION_FAST_LAYER_PARAMETERS` for a station (`_default_parameters`) — so a caller
    that only passes `entity_kind="station"` still gets the right (no-time-signal) formula
    without also having to know which constant that implies. Passing `parameters` explicitly
    (replays, tuning tests) always wins.

    Returns a list of at most one element — top-1 above `hint_threshold`, empty otherwise.
    A list rather than an optional single value so returning top-N later is additive rather
    than a breaking schema change.

    **Never raises.** Everything from parsing the caller's geometry to scoring the candidates
    runs inside one try: a malformed point, a missing pg_trgm, a PostGIS error, or a settings
    object with every weight zeroed all end the same way — logged, empty list. The fast layer
    is an advisory prompt, and an advisory prompt that can 500 a disaster report is worse than
    no prompt at all. Bad geometry is deliberately not an error here either: `create_ticket` /
    `create_station` run their own `validate_point` moments later and are the gate that
    refuses the submission — this one only needs to know whether it can score anything.

    Authorization is *not* handled here — the caller checks it before entering, so a
    permission failure still surfaces as a 403 instead of being swallowed by the fail-open.
    """
    parameters = parameters or _default_parameters(entity_kind)
    try:
        validate_point(geometry, entity=_ENTITY_LABELS.get(entity_kind, "Ticket"))
        longitude, latitude = geometry["coordinates"][:2]
        candidates = await dedup_candidate_repository.list_nearby_open(
            db,
            longitude=longitude,
            latitude=latitude,
            query_text=_query_text(title, description),
            now=submitted_at or datetime.now(UTC),
            radius_m=_retrieval_radius_m(parameters),
            entity_kind=entity_kind,
        )
        best = top_hint(candidates, query_task_type=task_type, parameters=parameters)
    except Exception:
        logger.exception("fast-layer dedup check failed; returning no hint (fail-open)")
        # A failed statement leaves the session's transaction aborted, and that session is
        # shared with every sibling resolver in the same GraphQL request — without this they
        # would all fail on "current transaction is aborted". Suppressed in turn, because the
        # rollback must not be what finally raises out of a path whose contract is "never".
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
    parameters: FastLayerParameters | None = None,
    entity_kind: str = "ticket",
) -> tuple[DuplicatePair | None, str]:
    """Record what the submitter did about a fast-layer hint. Returns (pair, event_uuid).

    `entity_kind` is `"ticket"` (default, unchanged) or `"station"`. The argument names
    (`candidate_ticket_uuid`, `submitted_ticket_uuid`) stay as-is for both — they are the
    frozen GraphQL input's field names, not renamed per entity kind. `parameters` defaults to
    `None`, which resolves per `entity_kind` the same way `find_duplicate_hints` does — the
    re-score behind a station's card must use `STATION_FAST_LAYER_PARAMETERS`, or the
    similarity snapshot it writes would silently include a time signal the check itself never
    showed the caller.

    Deliberately **not** fail-open: this runs after the user has already acted, so an error
    here blocks nothing and swallowing it would corrupt the very measurement the table
    exists for.

    A pair card is written only when a second entity actually exists — accepting the hint
    usually means nothing was created, and `duplicate_pairs` cannot hold a row for an entity
    that was never inserted (both sides would be dangling). The audit event always lands, so
    an accepted hint is still counted.

    Only the submitter may report on their own submission: `ticket.add`/`station.add` alone
    would let any logged-in caller card an arbitrary pair, poisoning both the slow layer's
    re-scan queue and the measurement this table exists for. The capability check passes
    `resource=submitted` so checkpoint 2 engages if the seed ever narrows the add permission
    below `all`, but that is future-proofing, not the guard — today every holder has it at
    `all`, so the explicit creator check below is what actually closes the hole. Both `Tickets`
    and `Station` carry `created_by` (the latter via `BaseGeometry`), so the same comparison
    applies to either entity kind.

    Raises:
        ValueError: unsupported entity kind, unknown outcome, either entity not found, or an
            entity paired with itself.
        HTTPException: 403 when the caller did not create the submitted entity.
    """
    _require_supported_entity_kind(entity_kind)
    if outcome not in PAIR_HINT_OUTCOMES:
        raise ValueError(f"Unknown dedup hint outcome: {outcome}")

    parameters = parameters or _default_parameters(entity_kind)
    repo = _ENTITY_REPOSITORIES[entity_kind]
    add_perm = _ENTITY_ADD_PERMS[entity_kind]
    label = _ENTITY_LABELS[entity_kind]

    candidate = await repo.get_by_uuid_active(db, candidate_ticket_uuid)
    if not candidate:
        raise ValueError(f"{label} not found")

    accepted = outcome == "accepted_hint"
    pair = None
    score = None
    if not submitted_ticket_uuid:
        await require_scope(actor, add_perm, db)
    else:
        submitted = await repo.get_by_uuid_active(db, submitted_ticket_uuid)
        if not submitted:
            raise ValueError(f"{label} not found")
        await require_scope(actor, add_perm, db, resource=submitted)
        if str(submitted.created_by) != str(actor.uuid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied."
            )
        if str(submitted.uuid) == str(candidate.uuid):
            raise ValueError(f"A {entity_kind} cannot be a duplicate of itself")
        score = await _rescore_pair(
            db, submitted=submitted, candidate=candidate, parameters=parameters,
            entity_kind=entity_kind,
        )
        pair = await _upsert_fast_pair(
            db,
            submitted_uuid=str(submitted.uuid),
            candidate_uuid=str(candidate.uuid),
            accepted=accepted,
            score=score,
            entity_kind=entity_kind,
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
    """How far out to look for candidates, derived from the scoring parameters themselves.

    Everything past `max_hint_distance_m` is arithmetically incapable of clearing the hint
    threshold, so that — plus a rounding margin — is the only justified boundary. Tune any
    parameter and the radius follows: raise `distance_half_m` or lower `hint_threshold` and
    the search widens on its own, with no second number to remember to change.
    """
    radius = max_hint_distance_m(parameters) * RETRIEVAL_RADIUS_SAFETY_FACTOR
    if radius > MAX_CANDIDATE_RADIUS_M:
        logger.warning(
            "dedup parameters put the hint boundary at %.1f m; clamping retrieval to %.1f m. "
            "Distance cannot rule any candidate out at these weights — check the settings, "
            "not the data.",
            radius, MAX_CANDIDATE_RADIUS_M,
        )
        return MAX_CANDIDATE_RADIUS_M
    return radius


def _query_text(title: str, description: str | None) -> str:
    """Join and bound the text fields the pg_trgm signal compares (title + description)."""
    parts = ((title or "")[:TITLE_MAX_CHARS], (description or "")[:DESCRIPTION_MAX_CHARS])
    return " ".join(part for part in parts if part).strip()


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
    db: AsyncSession,
    *,
    submitted,
    candidate,
    parameters: FastLayerParameters,
    entity_kind: str = "ticket",
) -> CandidateScore | None:
    """Re-derive the pair's score server-side rather than trusting a client-supplied one.

    Both entities exist by now and every signal is deterministic, so recomputing costs one
    query and removes the client's ability to write whatever similarity it likes into an
    audit table.
    """
    geojson = geom_to_geojson(submitted.geometry)
    if not geojson or geojson.get("type") != "Point":
        return None
    longitude, latitude = geojson["coordinates"][0], geojson["coordinates"][1]
    title, description = _entity_text_fields(entity_kind, submitted)
    features = await dedup_candidate_repository.get_candidate_features(
        db,
        longitude=longitude,
        latitude=latitude,
        query_text=_query_text(title, description),
        candidate_uuid=str(candidate.uuid),
        now=submitted.created_at,
        entity_kind=entity_kind,
    )
    if features is None:
        return None
    return score_candidate(
        features, query_task_type=_entity_type(entity_kind, submitted), parameters=parameters
    )


async def _upsert_fast_pair(
    db: AsyncSession,
    *,
    submitted_uuid: str,
    candidate_uuid: str,
    accepted: bool,
    score: CandidateScore | None,
    entity_kind: str = "ticket",
) -> DuplicatePair:
    """Create or update the live fast-layer card for this pair.

    Ordering the two uuids satisfies the table's `low_uuid < high_uuid` CHECK, so the same
    two entities always land on one row whichever was submitted second.

    An existing live card is always updated in place: `hint_outcome` records what the
    submitter did, and `status`/`rescan_needed` flip to `dup_ignored` whenever the hint was
    ignored, whatever the card's current status — including a settled `confirmed`/`rejected`
    verdict.
    """
    low_uuid, high_uuid = sorted((submitted_uuid, candidate_uuid))
    hint_outcome = "accepted_hint" if accepted else "ignored_hint"
    similarity = None if score is None else Decimal(f"{score.similarity:.4f}")
    components = None if score is None else _components_json(score)

    existing = await duplicate_pair_repository.get_active_by_entities(
        db, entity_kind=entity_kind, low_uuid=low_uuid, high_uuid=high_uuid
    )
    if existing:
        existing.hint_outcome = hint_outcome
        if not accepted:
            # 使用者不聽勸：the card becomes the slow layer's to re-scan (design §三).
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
