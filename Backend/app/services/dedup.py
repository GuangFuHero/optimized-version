"""Dedup fast-layer service: calls the engine (`app.dedup_engine`) safely and writes what it decided.

- `check_submission`: ask the engine about a submission, guarded — savepoint always rolled
  back, timeout, write detection, malformed and acknowledged results dropped. Fail-open.
  `try_check_submission` is the same, but says when the engine gave no answer.
- `record_suspect_shown`: audit that a hint was shown.
- `settle_submission`: one check of a single create: which of the submitter's "file it anyway"
  answers name what the engine suspects for their draft (ADR-400), and what is still suspected.
  Batch import uses its parts, `acknowledged_uuids`, `borne_out` and `unchecked_pairs`.
- `record_pair_ignored`: card that pair once the new entity exists. Does not commit.

Every engine call goes through `_guarded` before anything is written, so a failure can roll back
the whole transaction.
"""

import asyncio
import contextlib
import logging
import uuid as _uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
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

# How long the backend waits for the engine before creating without a hint. The contract
# test holds the engine to a much smaller budget; this is the backstop.
ENGINE_TIMEOUT_S = 2.0

# Submissions in one area queue so the later one sees the earlier (ADR-396). The wait is capped
# above the engine's worst measured check (p99 ~245 ms, ADR-307); past it the submission goes on
# unlocked, as before the lock existed.
AREA_LOCK_TIMEOUT_MS = 500
# The furthest apart two submissions can be and still meet on a lock. The engine's search radius
# must not exceed it; tests/test_dedup_area_lock.py guards both.
AREA_LOCK_MAX_RADIUS_M = 500


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

    The engine may query the database, so it runs inside a savepoint that is always
    rolled back, under `ENGINE_TIMEOUT_S`. If it wrote anyway — detected by Postgres assigning a
    transaction id, which only a write does — its answer is discarded. Any failure is logged and
    treated as "no suspects" (fail-open). The actor is reloaded on the way out in case a rollback
    expired it, since the caller goes on to create with it.
    """
    suspects = await try_check_submission(
        db, submission=submission, acknowledged=acknowledged, actor=actor, now=now
    )
    return suspects or []


async def try_check_submission(
    db: AsyncSession,
    *,
    submission: Submission,
    acknowledged: frozenset[str],
    actor: User,
    now: datetime,
) -> list[Suspect] | None:
    """`check_submission`, but None when the engine gave no answer, so the caller can say so.

    Batch import reports whether its rows were compared at all (ADR-398): an engine that failed
    must not read as "nothing looks like a duplicate".
    """
    engine = get_engine()
    try:
        suspects = await _guarded(db, lambda: engine.check(db, submission, now))
    except EngineWroteError:
        logger.error(
            "dedup engine %s wrote to the database during check; ignoring its answer", engine.version
        )
        return None
    except Exception:
        logger.exception("dedup check failed or timed out; creating without a hint (fail-open)")
        with contextlib.suppress(Exception):
            await db.rollback()
        await refresh_actor(db, actor)
        return None
    await refresh_actor(db, actor)
    return _usable(suspects, acknowledged)


async def record_suspect_shown(
    db: AsyncSession, *, suspect: Suspect, actor_uuid: str, entry: str | None = None
) -> None:
    """Audit that a hint was shown. Does not commit.

    A single create writes this when it holds the draft. A batch import writes it for every suspected
    row it showed in the preview, the ones filed anyway too, with `entry` (ADR-398).
    """
    await dedup_audit_event_repository.add(
        db,
        obj_in={
            "entity_kind": suspect.related_kind,
            "event_type": "hint_shown",
            "primary_uuid": suspect.related_uuid,
            "actor_uuid": actor_uuid,
            "source_layer": "fast",
            "decision_reason": entry,
            "evidence": _suspect_evidence(suspect),
            "engine_version": get_engine().version,
        },
    )


@dataclass(frozen=True)
class AcknowledgedPair:
    """A pair the submitter filed anyway, settled before anything was created.

    `related_uuid` is in canonical form; `suspect` is the engine's own hint for the draft, or
    None when the engine gave no answer (carded unscored).
    """

    draft_ref: str
    related_kind: RelatedKind
    related_uuid: str
    suspect: Suspect | None
    engine_version: str


@dataclass(frozen=True)
class Settled:
    """One check of a submission: the acknowledgements it bears out, and what it still suspects."""

    pairs: list[AcknowledgedPair]
    suspects: list[Suspect]


async def settle_submission(
    db: AsyncSession,
    *,
    submission: Submission,
    acknowledged: Mapping[str, str | None],
    actor: User,
    now: datetime,
) -> Settled:
    """Ask the engine about `submission` once: what to card and what to hold. Never raises.

    An acknowledgement answers the hint its draft was shown, so it counts only when it names the
    entity the engine suspects for that draft now (ADR-400). One naming anything else, or a draft
    no longer suspected, counts for nothing: the draft is held like any other and is not carded.
    The same answer decides what is held, so a submission filed anyway asks once, as one that isn't
    does: under ADR-396's area lock, the wait it was sized for. When the engine gives no answer it
    is not asked again: each acknowledgement naming an entity that exists is carded unscored
    (ADR-313) and nothing is held, as an import stops asking (ADR-398). Called before anything is
    written, like `check`.
    """
    named = acknowledged_uuids(acknowledged)
    suspects = await try_check_submission(
        db, submission=submission, acknowledged=frozenset(), actor=actor, now=now
    )
    if suspects is None:
        return Settled(pairs=await unchecked_pairs(db, named), suspects=[])
    pairs = borne_out(suspects, named)
    filed = {pair.draft_ref for pair in pairs}
    return Settled(pairs=pairs, suspects=[s for s in suspects if s.draft_ref not in filed])


def acknowledged_uuids(acknowledged: Mapping[str, str | None]) -> dict[str, str]:
    """Each acknowledged draft's uuid in canonical form; one that is not a uuid is left out."""
    named = {}
    for draft_ref, related_uuid in acknowledged.items():
        if not related_uuid:
            continue
        canonical = _canonical_uuid(related_uuid)
        if canonical is None:
            logger.warning(
                "acknowledged duplicate %r is not a uuid; checking the draft as usual", related_uuid
            )
            continue
        named[draft_ref] = canonical
    return named


def borne_out(suspects: Sequence[Suspect], named: Mapping[str, str]) -> list[AcknowledgedPair]:
    """The acknowledgements in `named` that name their draft's suspect, each scored by it."""
    version = get_engine().version
    pairs = []
    for suspect in suspects:
        related = named.get(suspect.draft_ref)
        if related is not None and related == _canonical_uuid(suspect.related_uuid):
            pairs.append(AcknowledgedPair(suspect.draft_ref, suspect.related_kind, related, suspect, version))
    for draft_ref in named.keys() - {pair.draft_ref for pair in pairs}:
        logger.warning(
            "acknowledged duplicate %s is not the hint for %s; checking it as usual",
            named[draft_ref],
            draft_ref,
        )
    return pairs


async def unchecked_pairs(db: AsyncSession, named: Mapping[str, str]) -> list[AcknowledgedPair]:
    """With no answer from the engine: each acknowledgement naming an entity that exists, unscored."""
    version = get_engine().version
    pairs = []
    for draft_ref, related_uuid in named.items():
        kind = kind_of_ref(draft_ref)
        if await duplicate_pair_repository.entity_exists(db, entity_kind=kind, uuid=related_uuid):
            pairs.append(AcknowledgedPair(draft_ref, kind, related_uuid, None, version))
        else:
            logger.warning(
                "acknowledged duplicate %s (%s) not found; creating without a pair card", related_uuid, kind
            )
    return pairs


async def record_pair_ignored(
    db: AsyncSession, *, pair: AcknowledgedPair, created_uuid: str, actor_uuid: str, entry: str | None = None
) -> DuplicatePair:
    """Card `pair` against `created_uuid`, the entity made from its draft. Does not commit.

    `entry` goes on the card as `reason.entry` when the draft did not come from a single create, so
    the review queue and the slow layer can tell an import's cards apart (ADR-398).
    """
    suspect = pair.suspect
    card = await _ignore_pair(
        db,
        kind=pair.related_kind,
        uuids=(created_uuid, pair.related_uuid),
        similarity=None if suspect is None else suspect.similarity,
        evidence=None if suspect is None else dict(suspect.evidence),
        engine_version=pair.engine_version,
        reason=None if entry is None else {"entry": entry},
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
    reason: dict | None = None,
) -> DuplicatePair:
    """Create the pair's card as dup_ignored, or flip the live one in place.

    An existing card keeps the evidence and reason of the verdict that made it; only its status
    moves, so the slow layer re-scans it.
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
            "reason": reason,
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
