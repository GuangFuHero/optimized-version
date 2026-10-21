"""Undoing a verdict on a pair card (Spec 025 §2.4, ADR-342/343/344): the service layer.

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
from app.services import dedup_review
from app.services.dedup_review import DuplicatePairConflictError, DuplicatePairNotFoundError
from tests.conftest import TEST_DB_URL
from tests.test_dedup_review_read import _actor, _pair, _two_tasks

pytestmark = pytest.mark.asyncio


async def _events(db, pair_uuid) -> list[str]:
    rows = await db.execute(
        select(DedupAuditEvent.event_type)
        .where(DedupAuditEvent.pair_uuid == pair_uuid)
        .order_by(DedupAuditEvent.created_at)
    )
    return list(rows.scalars().all())


async def _decided(db, reviewer, *, pending="dup_ignored", verdict="confirm"):
    """A card that `reviewer` has decided through the service; returns its uuid."""
    a, b = await _two_tasks(db, reviewer)
    pair_uuid = (await _pair(db, a, b, status=pending)).uuid
    decide = dedup_review.confirm if verdict == "confirm" else dedup_review.reject
    await decide(db, actor=reviewer, pair_uuid=pair_uuid, note=None)
    await db.refresh(reviewer)  # the decision committed; `active_identity` is not a column and stays
    return pair_uuid


@pytest.mark.parametrize("verdict", ["confirm", "reject"])
@pytest.mark.parametrize("pending", ["dup_ignored", "suggested"])
async def test_a_reviewer_undoes_their_own_verdict_with_review_alone(db, pending, verdict):
    """ADR-342: one's own verdict needs no more than ai_duplicate.review."""
    reviewer = await _actor(db, Perm.AI_DUP_VIEW, Perm.AI_DUP_REVIEW)
    reviewer_uuid = reviewer.uuid
    pair_uuid = await _decided(db, reviewer, pending=pending, verdict=verdict)
    decided = "confirmed" if verdict == "confirm" else "rejected"

    item = await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)

    assert (item.pair.status, item.pair.reviewed_by, item.pair.reviewed_at) == (pending, None, None)
    assert await _events(db, pair_uuid) == [decided, "verdict_revoked"]
    event = (
        await db.execute(
            select(DedupAuditEvent).where(
                DedupAuditEvent.pair_uuid == pair_uuid, DedupAuditEvent.event_type == "verdict_revoked"
            )
        )
    ).scalar_one()
    assert (event.actor_uuid, event.source_layer) == (reviewer_uuid, "manual")
    assert event.before_state == {"status": decided, "reviewed_by": str(reviewer_uuid)}
    assert event.after_state == {"status": pending}


async def test_the_undone_card_is_back_in_the_queue(db):
    """An undone card is pending again, so the default list shows it."""
    reviewer = await _actor(db, Perm.AI_DUP_VIEW, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, reviewer)

    await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)
    await db.refresh(reviewer)

    page = await dedup_review.list_pairs(db, actor=reviewer)
    assert [item.pair.uuid for item in page.items] == [pair_uuid]


async def test_someone_elses_verdict_needs_ai_duplicate_revoke(db):
    """ADR-342: another reviewer with review alone is refused, and nothing changes."""
    first = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, first)
    second = await _actor(db, Perm.AI_DUP_REVIEW)

    with pytest.raises(HTTPException) as caught:
        await dedup_review.revoke(db, actor=second, pair_uuid=pair_uuid)

    assert caught.value.status_code == 403
    db.expire_all()
    assert (await db.get(DuplicatePair, pair_uuid)).status == "confirmed"
    assert await _events(db, pair_uuid) == ["confirmed"]


async def test_ai_duplicate_revoke_undoes_anyones_verdict(db):
    """ADR-342: revoke reaches verdicts the caller did not give."""
    first = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, first)
    overseer = await _actor(db, Perm.AI_DUP_REVIEW, Perm.AI_DUP_REVOKE)

    item = await dedup_review.revoke(db, actor=overseer, pair_uuid=pair_uuid)

    assert item.pair.status == "dup_ignored"


async def test_revoking_needs_ai_duplicate_review_even_for_revoke_holders(db):
    """Revoke without review is not enough: undoing is a review action first."""
    first = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, first)
    only_revoke = await _actor(db, Perm.AI_DUP_REVOKE)

    with pytest.raises(HTTPException) as caught:
        await dedup_review.revoke(db, actor=only_revoke, pair_uuid=pair_uuid)

    assert caught.value.status_code == 403


@pytest.mark.parametrize("status", ["dup_ignored", "suggested"])
async def test_a_pending_card_has_nothing_to_revoke(db, status):
    """ADR-343: revoke applies to confirmed and rejected cards only."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW, Perm.AI_DUP_REVOKE)
    a, b = await _two_tasks(db, reviewer)
    pair_uuid = (await _pair(db, a, b, status=status)).uuid

    with pytest.raises(DuplicatePairConflictError):
        await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)


async def test_revoking_twice_is_refused_the_second_time(db):
    """The first revoke put it back to pending; the second has nothing to undo."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, reviewer)
    await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)
    await db.refresh(reviewer)

    with pytest.raises(DuplicatePairConflictError):
        await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)

    assert await _events(db, pair_uuid) == ["confirmed", "verdict_revoked"]


async def test_after_a_revoke_the_card_can_be_decided_again(db):
    """Changing a verdict is revoke then decide; the history keeps all three steps."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, reviewer)
    await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)
    await db.refresh(reviewer)

    item = await dedup_review.reject(db, actor=reviewer, pair_uuid=pair_uuid, note=None)

    assert item.pair.status == "rejected"
    assert await _events(db, pair_uuid) == ["confirmed", "verdict_revoked", "rejected"]


async def test_a_second_revoke_restores_what_the_latest_verdict_replaced(db):
    """Decide, revoke, decide again from `suggested`... the newest verdict's before_state wins."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, reviewer, pending="suggested")
    await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)
    await db.refresh(reviewer)
    await dedup_review.reject(db, actor=reviewer, pair_uuid=pair_uuid, note=None)
    await db.refresh(reviewer)

    item = await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)

    assert item.pair.status == "suggested"


@pytest.mark.parametrize("deleted", [False, True], ids=["unknown", "soft-deleted"])
async def test_a_missing_card_is_not_found(db, deleted):
    """An unknown or soft-deleted card is not found."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW)
    target = uuid_mod.uuid4()
    if deleted:
        a, b = await _two_tasks(db, reviewer)
        target = (await _pair(db, a, b, status="confirmed", deleted=True)).uuid
    with pytest.raises(DuplicatePairNotFoundError):
        await dedup_review.revoke(db, actor=reviewer, pair_uuid=target)


async def test_two_revokes_at_once_leave_one(db):
    """Two real connections revoke together; the lock lets one through, the other is refused."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW)
    pair_uuid = await _decided(db, reviewer)
    user_uuid, identity = reviewer.uuid, reviewer.active_identity

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def undo(session):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identity
            return await dedup_review.revoke(session, actor=actor, pair_uuid=pair_uuid)

        outcomes = await asyncio.gather(*(undo(s) for s in sessions), return_exceptions=True)
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, DuplicatePairConflictError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    assert await _events(db, pair_uuid) == ["confirmed", "verdict_revoked"]


async def test_a_verdict_with_no_recorded_event_is_not_guessed(db):
    """A card decided outside this module has no before_state to restore: refused, not defaulted."""
    reviewer = await _actor(db, Perm.AI_DUP_REVIEW, Perm.AI_DUP_REVOKE)
    a, b = await _two_tasks(db, reviewer)
    pair_uuid = (await _pair(db, a, b, status="confirmed")).uuid

    with pytest.raises(DuplicatePairConflictError, match="No recorded verdict"):
        await dedup_review.revoke(db, actor=reviewer, pair_uuid=pair_uuid)

    db.expire_all()
    assert (await db.get(DuplicatePair, pair_uuid)).status == "confirmed"
