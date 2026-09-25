"""A volunteer claims a need — one `ticket_tasks` row — for themselves (PUB-PS-140).

Service-level (root conftest): the rules live in `assign_task_actor`, so that is where they
are observed. The public site claims per need, never per ticket: 「志工以『需求』為單位承接」.
"""

import asyncio
import contextlib
import os
import uuid as uuidlib

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import ticket as ticket_service
from app.services.authz import refresh_actor
from app.services.ticket import assign_task_actor
from tests.conftest import TEST_DB_URL, acting_as


async def _volunteer(db, name: str = "志工", scope: str = "own") -> User:
    """A signed-in citizen: the platform `user` role's `ticket.assign: own` (seed_rbac.py).

    `scope="all"` makes a coordinator instead, who may assign other people.
    """
    user = User(name=name)
    role = Role(name=f"user-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    permission = (
        await db.execute(select(Permission).where(Permission.key == Perm.TICKET_ASSIGN.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=Perm.TICKET_ASSIGN.value)
        db.add(permission)
        await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _need(db, *, quantity: int | None, status: str = "pending") -> TicketTask:
    """One need on a fresh ticket, created by someone other than the volunteers."""
    requester = User(name="求助者")
    db.add(requester)
    await db.flush()
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(requester.uuid),
        title="需要清淤人力", contact_name="王小姐", status="pending", priority="high",
    )
    db.add(ticket)
    await db.flush()
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="hr",
        task_name="清淤", quantity=quantity, status=status, created_by=str(requester.uuid),
    )
    db.add(task)
    await db.flush()
    return task


async def _claim(db, volunteer: User, task_uuid: str):
    """Claim for oneself. A claim commits, so a volunteer loaded earlier may be expired by now."""
    await refresh_actor(db, volunteer)
    return await assign_task_actor(db, actor=volunteer, task_uuid=task_uuid, actor_uuid=None, role=None)


async def _claims(db, task_uuid: str) -> int:
    return await db.scalar(select(func.count()).where(TaskAssignment.task_uuid == task_uuid))


@pytest.mark.asyncio
async def test_a_full_need_cannot_be_claimed(db):
    """Once as many volunteers have claimed as the need asks for, the next one is turned away."""
    task = await _need(db, quantity=1)
    task_uuid = str(task.uuid)
    first = await _volunteer(db, "先到")
    second = await _volunteer(db, "後到")
    await _claim(db, first, task_uuid)

    with pytest.raises(ValueError, match="Task is full"):
        await _claim(db, second, task_uuid)

    assert await _claims(db, task_uuid) == 1


@pytest.mark.asyncio
async def test_a_coordinator_may_still_send_more_than_the_need_asks_for(db):
    """The cap binds volunteers signing themselves up, not a coordinator assigning others (d847624)."""
    task = await _need(db, quantity=1)
    task_uuid = str(task.uuid)
    first = await _volunteer(db, "先到")
    extra = await _volunteer(db, "加派")
    extra_uuid = str(extra.uuid)
    coordinator = await _volunteer(db, "協調者", scope="all")
    await _claim(db, first, task_uuid)
    await refresh_actor(db, coordinator)

    await assign_task_actor(db, actor=coordinator, task_uuid=task_uuid, actor_uuid=extra_uuid, role=None)

    assert await _claims(db, task_uuid) == 2


@pytest.mark.asyncio
async def test_a_need_without_a_quantity_has_no_cap(db):
    """No quantity means the requester never said how many — so nobody is turned away."""
    task = await _need(db, quantity=None)
    task_uuid = str(task.uuid)
    volunteers = [await _volunteer(db, f"志工{n}") for n in range(3)]

    for volunteer in volunteers:
        await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["fulfilled", "canceled"])
async def test_a_closed_need_cannot_be_claimed(db, status):
    """A need that is done or called off has nothing left to go and do."""
    task = await _need(db, quantity=5, status=status)
    task_uuid = str(task.uuid)
    volunteer = await _volunteer(db)

    with pytest.raises(ValueError, match="Task is no longer open"):
        await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 0


@pytest.mark.asyncio
async def test_a_need_awaiting_review_can_be_claimed(db):
    """`pending_review` needs are already on the public site; blocking them would strand them."""
    task = await _need(db, quantity=2)
    assert task.moderation_status == "pending_review"
    task_uuid = str(task.uuid)
    volunteer = await _volunteer(db)

    await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 1


@pytest.mark.asyncio
async def test_two_volunteers_racing_for_the_last_place_get_one_claim(db, monkeypatch):
    """The need row is locked while counting, so the last place is given out once.

    Same recipe as the station reassignment race: two real connections, with a rendezvous
    between the count and the insert. Unlocked, both count zero and both insert. Locked, the
    second waits for the first commit, the first times out of the rendezvous alone, and the
    second then counts one and is turned away.
    """
    task = await _need(db, quantity=1)
    first = await _volunteer(db, "甲")
    second = await _volunteer(db, "乙")
    identities = {str(first.uuid): first.active_identity, str(second.uuid): second.active_identity}
    task_uuid = str(task.uuid)
    await db.commit()

    arrived, both_arrived = [], asyncio.Event()
    real_create = ticket_service.task_assignment_repository.create

    async def rendezvous(*args, **kwargs):
        """Hold each insert until the other has counted too, or give up waiting."""
        arrived.append(None)
        if len(arrived) == 2:
            both_arrived.set()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(both_arrived.wait(), timeout=1)
        return await real_create(*args, **kwargs)

    monkeypatch.setattr(ticket_service.task_assignment_repository, "create", rendezvous)

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:
        async def claim(session, user_uuid):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identities[user_uuid]
            await assign_task_actor(session, actor=actor, task_uuid=task_uuid, actor_uuid=None, role=None)

        outcomes = await asyncio.gather(
            *(claim(session, uid) for session, uid in zip(sessions, identities, strict=True)),
            return_exceptions=True,
        )
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, ValueError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    assert "Task is full" in str(refused[0])
    assert await _claims(db, task_uuid) == 1
