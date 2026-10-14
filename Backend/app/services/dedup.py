"""Dedup fast layer service (Spec 022, ADR-304).

- `check_submission`: ask the engine about a submission, guarded — savepoint always rolled
  back, timeout, write detection, malformed and acknowledged results dropped. Fail-open.
- `record_suspect_shown`: audit that a hint was shown (ADR-296/303).
- `score_acknowledged`: score a pair the submitter chose to file anyway, before creating.
- `record_pair_ignored`: card that pair once the new entity exists. Does not commit.

Both engine calls, `check` and `score`, run before anything is written and go through `_guarded`
(ADR-313).

The engine (`app.dedup_engine`) finds and scores candidates itself; this module only calls it
safely and writes what it decided.
"""

import asyncio
import contextlib
import logging
import uuid as _uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import RelatedKind, Submission, Suspect, kind_of_ref
from app.dedup_engine.registry import get_engine
from app.models.auth import User
from app.models.dedup import DuplicatePair
from app.repositories.dedup_repository import dedup_audit_event_repository, duplicate_pair_repository
from app.services.authz import refresh_actor

logger = logging.getLogger("app.dedup")

# How long the backend waits for the engine before creating without a hint (ADR-304). The
# contract test holds the engine to a much smaller budget; this is the backstop.
ENGINE_TIMEOUT_S = 2.0


class EngineWroteError(RuntimeError):
    """The engine wrote to the database during a call that must be read-only."""


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
    engine = get_engine()
    try:
        suspects = await _guarded(db, lambda: engine.check(db, submission, now))
    except EngineWroteError:
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
            "engine_version": get_engine().version,
        },
    )


@dataclass(frozen=True)
class AcknowledgedPair:
    """A pair the submitter filed anyway, scored before anything was created.

    `related_uuid` is in canonical form; `suspect` is None when scoring failed (carded unscored).
    """

    draft_ref: str
    related_kind: RelatedKind
    related_uuid: str
    suspect: Suspect | None
    engine_version: str


async def score_acknowledged(
    db: AsyncSession,
    *,
    submission: Submission,
    draft_ref: str,
    related_kind: RelatedKind,
    related_uuid: str,
    actor: User,
    now: datetime,
) -> AcknowledgedPair | None:
    """Score a pair the submitter acknowledged, before anything is created. Never raises.

    Called while the transaction has written nothing, under the same guard as `check`
    (ADR-313), so a failure can roll everything back and the create still goes ahead. None
    means nothing to card: not a uuid, or the related entity is gone. If the engine fails, the
    submitter's choice is still carded unscored — but only when the related entity exists,
    since nobody vouched for that uuid.
    """
    engine = get_engine()
    canonical = _canonical_uuid(related_uuid)
    if canonical is None:
        logger.warning("acknowledged duplicate %r is not a uuid; creating without a pair card", related_uuid)
        return None
    try:
        suspect = await _guarded(
            db, lambda: engine.score(db, submission, draft_ref, related_kind, canonical, now)
        )
        found = suspect is not None
    except Exception:
        logger.exception("dedup scoring failed for an acknowledged pair; carding it without a score")
        with contextlib.suppress(Exception):
            await db.rollback()
        await refresh_actor(db, actor)
        suspect = None
        found = await duplicate_pair_repository.entity_exists(db, entity_kind=related_kind, uuid=canonical)
    if not found:
        logger.warning(
            "acknowledged duplicate %s (%s) not found; creating without a pair card", canonical, related_kind
        )
        return None
    return AcknowledgedPair(draft_ref, related_kind, canonical, suspect, engine.version)


async def record_pair_ignored(
    db: AsyncSession, *, pair: AcknowledgedPair, created_uuid: str, actor_uuid: str
) -> DuplicatePair:
    """Card `pair` against `created_uuid`, the entity made from its draft. Does not commit."""
    suspect = pair.suspect
    card = await _ignore_pair(
        db,
        kind=pair.related_kind,
        uuids=(created_uuid, pair.related_uuid),
        similarity=None if suspect is None else suspect.similarity,
        evidence=None if suspect is None else dict(suspect.evidence),
        engine_version=pair.engine_version,
    )
    await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": pair.related_kind,
            "event_type": "ignored_by_submitter",
            "pair_uuid": str(card.uuid),
            "primary_uuid": pair.related_uuid,
            "duplicate_uuid": created_uuid,
            "actor_uuid": actor_uuid,
            "source_layer": "fast",
            "decision_reason": "ignored_hint",
            "evidence": None if suspect is None else _suspect_evidence(suspect),
            "engine_version": pair.engine_version,
        },
    )
    return card


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


async def _guarded[T](db: AsyncSession, call: Callable[[], Awaitable[T]]) -> T:
    """Run one engine call in a savepoint that is always rolled back, under `ENGINE_TIMEOUT_S`.

    Raises whatever the call raised, `TimeoutError`, or `EngineWroteError`. The rollback undoes
    any write; detection works because callers run this before writing anything themselves.
    A timeout can cut a query in flight and leave the connection unusable, so on any failure the
    caller rolls the whole transaction back — safe only because nothing was written yet.
    """
    wrote_before = await _transaction_has_written(db)
    savepoint = await db.begin_nested()
    try:
        result = await asyncio.wait_for(call(), ENGINE_TIMEOUT_S)
        wrote = not wrote_before and await _transaction_has_written(db)
    finally:
        await savepoint.rollback()
    if wrote:
        raise EngineWroteError("engine wrote during a read-only call")
    return result


def _canonical_uuid(value: str) -> str | None:
    """`value` as Postgres prints a uuid (lower case, hyphenated), or None if it is not one."""
    try:
        return str(_uuid.UUID(str(value)))
    except ValueError:
        return None


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
