"""Dedup fast layer service (Spec 020).

ADR-304 (the engine fetches its own candidates):

- `check_submission`: ask the engine about a submission, guarded — savepoint always rolled
  back, timeout, write detection, malformed and acknowledged results dropped. Fail-open.
- `record_suspect_shown`: audit that a hint was shown (ADR-296/303).
- `record_pair_ignored`: card a pair the submitter chose to file anyway. Does not commit.

Phase 1 (`find_match`, `record_hint_shown`, `record_acknowledged`) stays until the create paths
have switched over (plan Task 23).
"""

import asyncio
import contextlib
import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import (
    EntityKind,
    Match,
    RelatedKind,
    Snapshot,
    Submission,
    Suspect,
    kind_of_ref,
)
from app.dedup_engine.registry import get_engine, get_submission_engine
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
# How long the backend waits for the engine before creating without a hint (ADR-304). The
# contract test holds the engine to a much smaller budget; this is the backstop.
ENGINE_TIMEOUT_S = 2.0


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

    pair = await _ignore_pair(
        db,
        kind=kind,
        uuids=(str(created.uuid), str(row.uuid)),
        similarity=None if match is None else match.similarity,
        evidence=None if match is None else dict(match.evidence),
        engine_version=engine.version,
    )
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
    db: AsyncSession,
    *,
    kind: str,
    uuids: tuple[str, str],
    similarity: float | None,
    evidence: dict | None,
    engine_version: str,
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
            "similarity": None if similarity is None else Decimal(f"{similarity:.4f}"),
            "evidence": evidence,
            "method": "fast_rule",
            "engine_version": engine_version,
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


# --- ADR-304 --------------------------------------------------------------------------------


async def check_submission(
    db: AsyncSession,
    *,
    submission: Submission,
    acknowledged: frozenset[str],
    actor: User,
    now: datetime,
) -> list[Suspect]:
    """What the engine suspects in `submission`, minus acknowledged drafts. Never raises.

    The engine may query the database (ADR-304), so it runs inside a savepoint that is always
    rolled back, under `ENGINE_TIMEOUT_S`. If it wrote anyway — detected by Postgres assigning a
    transaction id, which only a write does — its answer is discarded. Any failure is logged and
    treated as "no suspects" (fail-open). The actor is reloaded on the way out in case a rollback
    expired it, since the caller goes on to create with it.
    """
    engine = get_submission_engine()
    try:
        wrote_before = await _transaction_has_written(db)
        savepoint = await db.begin_nested()
        try:
            suspects = await asyncio.wait_for(engine.check(db, submission, now), ENGINE_TIMEOUT_S)
            wrote = not wrote_before and await _transaction_has_written(db)
        finally:
            await savepoint.rollback()
        if wrote:
            logger.error(
                "dedup engine %s wrote to the database during check; ignoring its answer", engine.version
            )
            return []
    except Exception:
        logger.exception("dedup check failed or timed out; creating without a hint (fail-open)")
        with contextlib.suppress(Exception):
            await db.rollback()
        await refresh_actor(db, actor)
        return []
    await refresh_actor(db, actor)
    return _usable(suspects, acknowledged)


async def record_suspect_shown(db: AsyncSession, *, suspect: Suspect, actor_uuid: str) -> None:
    """Audit that a hint was shown and nothing was created (ADR-296/303). Does not commit."""
    await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": suspect.related_kind,
            "event_type": "hint_shown",
            "primary_uuid": suspect.related_uuid,
            "actor_uuid": actor_uuid,
            "source_layer": "fast",
            "evidence": _suspect_evidence(suspect),
            "engine_version": get_submission_engine().version,
        },
    )


async def record_pair_ignored(
    db: AsyncSession,
    *,
    submission: Submission,
    draft_ref: str,
    created_uuid: str,
    related_kind: RelatedKind,
    related_uuid: str,
    actor_uuid: str,
    now: datetime,
) -> DuplicatePair | None:
    """Card the pair a submitter filed anyway: `created_uuid` (made from `draft_ref`) and the related one.

    The engine scores the pair. It reporting the related entity gone means nothing to pair with
    (None, nothing written); it failing still records the submitter's choice, unscored.
    """
    engine = get_submission_engine()
    scoring_failed = False
    try:
        suspect = await engine.score(db, submission, draft_ref, related_kind, related_uuid, now)
    except Exception:
        logger.exception("dedup scoring failed for an acknowledged pair; carding it without a score")
        suspect, scoring_failed = None, True
    if suspect is None and not scoring_failed:
        logger.warning(
            "acknowledged duplicate %s (%s) not found; created without a pair card",
            related_uuid,
            related_kind,
        )
        return None
    pair = await _ignore_pair(
        db,
        kind=related_kind,
        uuids=(created_uuid, related_uuid),
        similarity=None if suspect is None else suspect.similarity,
        evidence=None if suspect is None else dict(suspect.evidence),
        engine_version=engine.version,
    )
    await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": related_kind,
            "event_type": "ignored_by_submitter",
            "pair_uuid": str(pair.uuid),
            "primary_uuid": related_uuid,
            "duplicate_uuid": created_uuid,
            "actor_uuid": actor_uuid,
            "source_layer": "fast",
            "decision_reason": "ignored_hint",
            "evidence": None if suspect is None else _suspect_evidence(suspect),
            "engine_version": engine.version,
        },
    )
    return pair


async def _transaction_has_written(db: AsyncSession) -> bool:
    """Whether this transaction has written: Postgres assigns a transaction id on the first write only."""
    return (await db.execute(text("SELECT pg_current_xact_id_if_assigned()"))).scalar() is not None


def _usable(suspects, acknowledged: frozenset[str]) -> list[Suspect]:
    """Drop results that name no draft, pair different kinds, repeat a draft, or were acknowledged."""
    usable: list[Suspect] = []
    seen: set[str] = set()
    for suspect in suspects:
        try:
            kind_matches = kind_of_ref(suspect.draft_ref) == suspect.related_kind
        except ValueError:
            kind_matches = False
        if not kind_matches or suspect.draft_ref in seen:
            logger.warning(
                "dropping dedup suspect %s -> %s %s",
                suspect.draft_ref,
                suspect.related_kind,
                suspect.related_uuid,
            )
            continue
        seen.add(suspect.draft_ref)
        if suspect.draft_ref not in acknowledged:
            usable.append(suspect)
    return usable


def _suspect_evidence(suspect: Suspect) -> dict:
    """The backend's envelope: its own similarity and draft_ref, the engine's evidence untouched."""
    return {
        "similarity": round(suspect.similarity, 4),
        "draft_ref": suspect.draft_ref,
        "engine": dict(suspect.evidence),
    }
