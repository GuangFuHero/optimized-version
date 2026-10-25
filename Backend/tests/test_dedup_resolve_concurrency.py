"""Claims, releases and edits that start while a resolve holds the tickets (PR #113 review, ADR-388).

A resolve moves needs to the primary ticket, and the claims on folded needs to the need they fold
into. The existing paths read a need's ticket (or a claim's need) before taking the lock, so one
that queues behind a resolve would otherwise go on against the cancelled ticket. Each test pauses a
resolve once its locks are held, starts the other action on a second connection, waits until
Postgres shows it waiting on a lock, then lets the resolve commit.
"""

import asyncio
import uuid as uuid_mod

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.ticket_task import TaskAssignment
from app.services import dedup_resolve
from app.services import ticket as ticket_service
from tests.conftest import TEST_DB_URL
from tests.test_dedup_resolve import _example_one, _versions, _world
from tests.test_dedup_review_read import _actor

pytestmark = pytest.mark.asyncio


async def _waiting_on_a_lock(engine, action_task) -> None:
    """Return once some other connection is blocked on a row lock."""
    for _ in range(200):
        if action_task.done():
            raise AssertionError(f"the second action finished without waiting: {action_task.result()!r}")
        async with engine.connect() as conn:
            waiting = (
                await conn.execute(
                    text("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'")
                )
            ).scalar_one()
        if waiting:
            return
        await asyncio.sleep(0.05)
    raise AssertionError("the second action never waited on the resolve's locks")


async def _during_resolve(db, monkeypatch, action, *perms):
    """Run `action(session, actor, ids)` while a resolve of example one holds its locks.

    Returns (what the action raised or returned, ids).
    """
    reviewer, ids = await _world(db)
    ids["v3_on_b1"] = await _assignment(db, "b1", "v3", ids)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    other = await _actor(db, *perms)
    people = {
        "reviewer": (reviewer.uuid, reviewer.active_identity),
        "other": (other.uuid, other.active_identity),
    }
    await db.commit()

    locked, go = asyncio.Event(), asyncio.Event()
    original = dedup_resolve._write

    async def paused(*args, **kwargs):
        locked.set()
        await go.wait()
        return await original(*args, **kwargs)

    monkeypatch.setattr(dedup_resolve, "_write", paused)
    engines = [create_async_engine(TEST_DB_URL) for _ in range(3)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines[:2]]

    async def as_(session, who):
        user_uuid, identity = people[who]
        actor = await session.get(User, user_uuid)
        actor.active_identity = identity
        return actor

    async def resolving():
        actor = await as_(sessions[0], "reviewer")
        return await dedup_resolve.resolve(
            sessions[0], actor=actor, pair_uuid=uuid_mod.UUID(ids["pair"]), request=request
        )

    async def acting():
        try:
            return await action(sessions[1], await as_(sessions[1], "other"), ids)
        except ValueError as err:
            return err

    try:
        resolve_task = asyncio.create_task(resolving())
        await locked.wait()
        action_task = asyncio.create_task(acting())
        await _waiting_on_a_lock(engines[2], action_task)
        go.set()
        await resolve_task
        outcome = await action_task
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()
    db.expire_all()
    return outcome, ids


async def _assignment(db, task_key, person_key, ids) -> str:
    return str(
        await db.scalar(
            select(TaskAssignment.uuid).where(
                TaskAssignment.task_uuid == ids[task_key], TaskAssignment.actor_uuid == ids[person_key]
            )
        )
    )


async def test_a_release_queued_behind_a_fold_is_refused(db, monkeypatch):
    """v3's place on b1 moves to a1; a release that read it on b1 must not act on the cancelled B."""

    async def action(session, actor, ids):
        return await ticket_service.unassign_task_actor(session, actor=actor, uuid=ids["v3_on_b1"])

    outcome, ids = await _during_resolve(db, monkeypatch, action, Perm.TICKET_ASSIGN)

    assert isinstance(outcome, ValueError) and "merged into another ticket" in str(outcome), outcome
    assert await _assignment(db, "a1", "v3", ids) == ids["v3_on_b1"]  # the place is still there, on a1


async def test_a_claim_queued_behind_a_move_is_refused(db, monkeypatch):
    """b3 moves to A whole; a claim that read it on B must not check room against the cancelled B."""

    async def action(session, actor, ids):
        return await ticket_service.assign_task_actor(
            session, actor=actor, task_uuid=ids["b3"], actor_uuid=None, role=None
        )

    outcome, ids = await _during_resolve(db, monkeypatch, action, Perm.TICKET_ASSIGN)

    assert isinstance(outcome, ValueError) and "merged into another ticket" in str(outcome), outcome


async def test_an_edit_queued_behind_a_move_is_refused(db, monkeypatch):
    """b3 moves to A whole; an edit scoped and locked against B must not land on A's need."""

    async def action(session, actor, ids):
        return await ticket_service.update_ticket_task(
            session, actor=actor, uuid=ids["b3"], changes={"quantity": 9}
        )

    outcome, ids = await _during_resolve(db, monkeypatch, action, Perm.TICKET_EDIT)

    assert isinstance(outcome, ValueError) and "merged into another ticket" in str(outcome), outcome


async def test_adding_an_item_queued_behind_a_move_is_refused(db, monkeypatch):
    """b3 moves to A whole; an item added under the lock taken on B must not land on A's need."""

    async def action(session, actor, ids):
        return await ticket_service.create_task_property(
            session,
            actor=actor,
            task_uuid=ids["b3"],
            property_name="餐盒",
            property_value="葷",
            quantity=3,
            comment=None,
        )

    outcome, ids = await _during_resolve(db, monkeypatch, action, Perm.TICKET_EDIT)

    assert isinstance(outcome, ValueError) and "merged into another ticket" in str(outcome), outcome


async def test_editing_an_item_queued_behind_its_move_is_refused(db, monkeypatch):
    """B's item on b1 moves to a1 with the fold; an edit scoped and locked against B must stop."""

    async def action(session, actor, ids):
        return await ticket_service.update_task_property(
            session, actor=actor, uuid=ids["pb1"], changes={"property_value": "10"}
        )

    outcome, ids = await _during_resolve(db, monkeypatch, action, Perm.TICKET_EDIT)

    assert isinstance(outcome, ValueError) and "merged into another ticket" in str(outcome), outcome
