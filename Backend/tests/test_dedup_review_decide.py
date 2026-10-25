"""Confirming or rejecting a pair card (Spec 025 §2.3, ADR-341/343): the service layer.

The REST layer on top is tested in test_dedup_review_api.py.
"""

import asyncio
import uuid as uuid_mod

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.ticket_task import TicketTask
from app.services import dedup_review
from app.services.dedup_review import (
    NOTE_MAX_LENGTH,
    DuplicatePairConflictError,
    DuplicatePairNotFoundError,
)
from tests.conftest import TEST_DB_URL
from tests.test_dedup_review_read import _actor, _pair, _two_tasks

pytestmark = pytest.mark.asyncio

DECISIONS = {"confirm": dedup_review.confirm, "reject": dedup_review.reject}
# The card's status and the event type of each verdict (ADR-391: only the status was renamed).
VERDICTS = {"confirm": ("confirmed_duplicate", "confirmed"), "reject": ("not_duplicate", "rejected")}


async def _events(db, pair_uuid) -> list[DedupAuditEvent]:
    rows = await db.execute(
        select(DedupAuditEvent)
        .where(DedupAuditEvent.pair_uuid == pair_uuid)
        .order_by(DedupAuditEvent.created_at)
    )
    return list(rows.scalars().all())


@pytest.mark.parametrize("decision", ["confirm", "reject"])
@pytest.mark.parametrize("pending", ["dup_ignored", "suggested"])
async def test_a_pending_card_is_decided_and_the_event_recorded(db, decision, pending):
    """The card takes the verdict and its reviewer; one event says what changed and why."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    reviewer_uuid = actor.uuid
    a, b = await _two_tasks(db, actor)
    pair = await _pair(db, a, b, status=pending)
    pair_uuid = pair.uuid

    item = await DECISIONS[decision](db, actor=actor, pair_uuid=pair_uuid, note="  同一戶人家  ")

    verdict, event_type = VERDICTS[decision]
    assert (item.pair.status, item.pair.reviewed_by) == (verdict, reviewer_uuid)
    assert item.pair.reviewed_at is not None
    assert item.low.uuid == str(item.pair.low_uuid)  # the response carries both sides
    (event,) = await _events(db, pair_uuid)
    assert (event.event_type, event.actor_uuid, event.source_layer) == (event_type, reviewer_uuid, "manual")
    assert (event.before_state, event.after_state) == ({"status": pending}, {"status": verdict})
    assert event.decision_reason == "同一戶人家"
    assert event.entity_kind == "ticket_task"


async def test_a_blank_note_is_stored_as_none(db):
    """Whitespace only is no note."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    a, b = await _two_tasks(db, actor)
    pair_uuid = (await _pair(db, a, b)).uuid

    await dedup_review.reject(db, actor=actor, pair_uuid=pair_uuid, note="   ")

    (event,) = await _events(db, pair_uuid)
    assert event.decision_reason is None


async def test_a_note_over_the_limit_is_refused_and_nothing_changes(db):
    """An oversized note is a 422-type refusal, not a conflict, and writes nothing."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    a, b = await _two_tasks(db, actor)
    pair_uuid = (await _pair(db, a, b)).uuid

    with pytest.raises(ValueError, match="at most") as caught:
        await dedup_review.confirm(db, actor=actor, pair_uuid=pair_uuid, note="字" * (NOTE_MAX_LENGTH + 1))

    assert not isinstance(caught.value, DuplicatePairConflictError)
    assert (await db.get(DuplicatePair, pair_uuid)).status == "dup_ignored"
    assert await _events(db, pair_uuid) == []


@pytest.mark.parametrize("decided", ["confirmed_duplicate", "not_duplicate"])
@pytest.mark.parametrize("decision", ["confirm", "reject"])
async def test_a_decided_card_cannot_be_decided_again(db, decided, decision):
    """ADR-343: to change a verdict, revoke it first, so the history stays whole."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    a, b = await _two_tasks(db, actor)
    pair_uuid = (await _pair(db, a, b, status=decided)).uuid

    with pytest.raises(DuplicatePairConflictError):
        await DECISIONS[decision](db, actor=actor, pair_uuid=pair_uuid, note=None)

    assert await _events(db, pair_uuid) == []


@pytest.mark.parametrize("deleted", [False, True], ids=["unknown", "soft-deleted"])
async def test_a_missing_card_is_not_found(db, deleted):
    """An unknown or soft-deleted card is not found."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    target = uuid_mod.uuid4()
    if deleted:
        a, b = await _two_tasks(db, actor)
        target = (await _pair(db, a, b, deleted=True)).uuid
    with pytest.raises(DuplicatePairNotFoundError):
        await dedup_review.confirm(db, actor=actor, pair_uuid=target, note=None)


async def test_deciding_needs_ai_duplicate_review(db):
    """View alone reads the queue but decides nothing."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    a, b = await _two_tasks(db, actor)
    pair_uuid = (await _pair(db, a, b)).uuid

    with pytest.raises(HTTPException) as caught:
        await dedup_review.confirm(db, actor=actor, pair_uuid=pair_uuid, note=None)

    assert caught.value.status_code == 403


_TASK_FIELDS = (
    "status",
    "is_duplicate",
    "dedup_group_id",
    "task_name",
    "canceled_at",
    "delete_at",
    "updated_at",
)


@pytest.mark.parametrize("decision", ["confirm", "reject"])
async def test_the_entities_are_left_untouched(db, decision):
    """ADR-341: a verdict is a record about the pair; merging and cancelling are another ticket."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    a, b = await _two_tasks(db, actor)
    pair_uuid = (await _pair(db, a, b)).uuid
    task_uuids = (a.uuid, b.uuid)
    await db.commit()
    await db.refresh(actor)  # the commit expired it; `active_identity` is not a column and stays

    async def snapshot():
        rows = await db.execute(
            select(*(getattr(TicketTask, f) for f in _TASK_FIELDS)).where(TicketTask.uuid.in_(task_uuids))
        )
        return sorted(rows.all(), key=str)

    before = await snapshot()
    await DECISIONS[decision](db, actor=actor, pair_uuid=pair_uuid, note=None)

    assert await snapshot() == before


async def test_two_reviewers_deciding_at_once_leave_one_verdict(db):
    """Two real connections confirm and reject together; the lock lets one through, the other is refused."""
    actor = await _actor(db, Perm.AI_DUP_REVIEW)
    a, b = await _two_tasks(db, actor)
    pair_uuid = (await _pair(db, a, b)).uuid
    user_uuid, identity = actor.uuid, actor.active_identity
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def decide(session, decision):
            reviewer = await session.get(User, user_uuid)
            reviewer.active_identity = identity
            return await decision(session, actor=reviewer, pair_uuid=pair_uuid, note=None)

        outcomes = await asyncio.gather(
            decide(sessions[0], dedup_review.confirm),
            decide(sessions[1], dedup_review.reject),
            return_exceptions=True,
        )
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, DuplicatePairConflictError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    (event,) = await _events(db, pair_uuid)
    status = {event_type: status for status, event_type in VERDICTS.values()}[event.event_type]
    db.expire_all()
    assert (await db.get(DuplicatePair, pair_uuid)).status == status
