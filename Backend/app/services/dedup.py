"""Dedup fast layer service, on the pluggable engine (Spec 020).

- `find_match`: the best match for a submission, or None. Fail-open.
- `record_hint_shown`: audit that a hint was shown (ADR-296).
- `record_acknowledged`: card a pair the submitter chose to file anyway. Does not commit.

The scoring itself lives in `app.dedup_engine`; this module only retrieves candidates, calls
the engine, and writes what it decided.
"""

import contextlib
import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import EntityKind, Match, Snapshot
from app.dedup_engine.registry import get_engine
from app.models.auth import User
from app.models.dedup import DuplicatePair
from app.repositories.dedup_repository import (
    dedup_audit_event_repository,
    dedup_candidate_repository,
    duplicate_pair_repository,
)
from app.services.authz import refresh_actor
from app.services.dedup_snapshot import to_candidate

logger = logging.getLogger("app.dedup")

# Backstop whatever the engine asks for (ADR-292): a mis-tuned engine must not turn every
# submission into a scan of the whole map.
MAX_CANDIDATE_RADIUS_M = 1000.0


async def find_match(
    db: AsyncSession,
    *,
    kind: EntityKind,
    submission: Snapshot,
    submission_phone: str | None,
    actor: User,
    now: datetime,
) -> Match | None:
    """The engine's best match among nearby open entities, or None. Never raises (fail-open).

    The caller has already authorized, so a 403 is never swallowed here. On failure the session
    is rolled back — the transaction is shared with the create that follows — and because a
    rollback expires every loaded object, the actor is reloaded before returning: the caller
    goes on to write with it, and an expired actor is a MissingGreenlet under asyncio.
    """
    engine = get_engine()
    try:
        radius_m = _clamp_radius(engine.retrieval(kind).radius_m)
        rows = await dedup_candidate_repository.nearby_open_rows(
            db,
            kind=kind,
            longitude=submission.location.lon,
            latitude=submission.location.lat,
            radius_m=radius_m,
            now=now,
        )
        candidates = [
            to_candidate(kind, row, distance_m=distance_m, submission_phone=submission_phone)
            for row, distance_m in rows
        ]
        matches = engine.rank(submission, candidates, now)
    except Exception:
        logger.exception("dedup check failed; creating without a hint (fail-open)")
        with contextlib.suppress(Exception):
            await db.rollback()
        await refresh_actor(db, actor)
        return None
    return matches[0] if matches else None


async def record_hint_shown(db: AsyncSession, *, kind: EntityKind, match: Match, actor_uuid: str) -> None:
    """Audit that a hint was shown and nothing was created (ADR-296). Does not commit.

    Only the uuid, similarity, engine version and the engine's evidence — never the submitted
    snapshot (ADR-295).
    """
    await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": kind,
            "event_type": "hint_shown",
            "primary_uuid": match.candidate_uuid,
            "actor_uuid": actor_uuid,
            "source_layer": "fast",
            "evidence": _match_evidence(match),
            "engine_version": get_engine().version,
        },
    )


async def record_acknowledged(
    db: AsyncSession,
    *,
    kind: EntityKind,
    created: Snapshot,
    submission_phone: str | None,
    acknowledged_uuid: str,
    actor_uuid: str,
    now: datetime,
) -> DuplicatePair | None:
    """Card the pair a submitter filed anyway after a hint. Does not commit.

    The just-created entity (`created`, uuid set) against the one the submitter acknowledged.
    A missing or deleted target leaves nothing to pair with: log and return None. An engine
    failure still records the submitter's choice, with no score (spec §5).
    """
    found = await dedup_candidate_repository.row_with_distance(
        db,
        kind=kind,
        uuid=acknowledged_uuid,
        longitude=created.location.lon,
        latitude=created.location.lat,
    )
    if found is None:
        logger.warning(
            "acknowledged duplicate %s (%s) not found; created without a pair card", acknowledged_uuid, kind
        )
        return None
    row, distance_m = found
    engine = get_engine()
    try:
        match = engine.score(
            created, to_candidate(kind, row, distance_m=distance_m, submission_phone=submission_phone), now
        )
    except Exception:
        logger.exception("dedup scoring failed for an acknowledged pair; carding it without a score")
        match = None

    pair = await _ignore_pair(db, kind=kind, uuids=(str(created.uuid), str(row.uuid)), match=match)
    await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": kind,
            "event_type": "ignored_by_submitter",
            "pair_uuid": str(pair.uuid),
            "primary_uuid": str(row.uuid),
            "duplicate_uuid": str(created.uuid),
            "actor_uuid": actor_uuid,
            "source_layer": "fast",
            "decision_reason": "ignored_hint",
            "evidence": None if match is None else _match_evidence(match),
            "engine_version": engine.version,
        },
    )
    return pair


async def _ignore_pair(
    db: AsyncSession, *, kind: EntityKind, uuids: tuple[str, str], match: Match | None
) -> DuplicatePair:
    """Create the pair's card as dup_ignored, or flip the live one in place.

    An existing card keeps the evidence of the verdict that made it; only its status moves, so
    the slow layer re-scans it.
    """
    low_uuid, high_uuid = sorted(uuids)  # satisfies CHECK (low_uuid < high_uuid)
    existing = await duplicate_pair_repository.get_active_by_entities(
        db, entity_kind=kind, low_uuid=low_uuid, high_uuid=high_uuid
    )
    if existing:
        existing.status = "dup_ignored"
        existing.hint_outcome = "ignored_hint"
        existing.rescan_needed = True
        db.add(existing)
        await db.flush()
        return existing
    return await duplicate_pair_repository.add(
        db,
        obj_in={
            "entity_kind": kind,
            "low_uuid": low_uuid,
            "high_uuid": high_uuid,
            "similarity": None if match is None else Decimal(f"{match.similarity:.4f}"),
            "evidence": None if match is None else dict(match.evidence),
            "method": "fast_rule",
            "engine_version": get_engine().version,
            "source_layer": "fast",
            "status": "dup_ignored",
            "hint_outcome": "ignored_hint",
            "rescan_needed": True,
        },
    )


def _clamp_radius(radius_m: float) -> float:
    if radius_m > MAX_CANDIDATE_RADIUS_M:
        logger.warning(
            "engine asked for a %.1f m search; clamping to %.1f m. Check the engine's parameters.",
            radius_m,
            MAX_CANDIDATE_RADIUS_M,
        )
        return MAX_CANDIDATE_RADIUS_M
    return radius_m


def _match_evidence(match: Match) -> dict:
    """The backend's envelope: its own similarity, and the engine's evidence untouched."""
    return {"similarity": round(match.similarity, 4), "engine": dict(match.evidence)}
