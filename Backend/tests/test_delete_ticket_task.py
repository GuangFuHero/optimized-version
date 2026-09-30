"""The requester deletes one need of their ticket (team decision 2026-09-28, note/help-request-spec.md).

Service-level (root conftest). A deleted need is canceled and soft-deleted in one go: nobody sees
it again and it cannot come back. Any need not already deleted can go, one that has everyone it
asked for included, since the requester's plans can change after people signed up — which is why
everyone on it is told not to come. The ticket's status is worked out again in the same
transaction (services/ticket_status.py).

Each need and ticket starts somewhere other than where the test expects it, so a no-op cannot pass.
"""

import asyncio
import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import ticket as ticket_service
from tests.conftest import TEST_DB_URL, acting_as

TITLE = "一樓客廳積泥需要幫忙清"


async def _ticket(db, *, status: str = "pending") -> Tickets:
    requester = User(name="求助者")
    db.add(requester)
    await db.flush()
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(requester.uuid),
        title=TITLE, contact_name="王阿嬤", status=status, priority="medium",
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _need(
    db, ticket: Tickets, name: str = "清淤", *, status: str = "pending", claims: tuple[str, ...] = (),
    created_by: str | None = None,
) -> TicketTask:
    """A need on `ticket`, with one volunteer on it per name in `claims`."""
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="hr", task_name=name,
        quantity=5, status=status, created_by=created_by or ticket.created_by,
        completed_at=datetime.now(UTC) if status == "fulfilled" else None,
    )
    db.add(task)
    await db.flush()
    for volunteer_name in claims:
        volunteer = User(name=volunteer_name)
        db.add(volunteer)
        await db.flush()
        db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=str(volunteer.uuid)))
    await db.flush()
    return task


async def _may_delete(db, user: User, scope: str = "own") -> User:
    """Act as holding ticket.delete at `scope`; `own` is the platform `user` role's (seed_rbac.py)."""
    role = Role(name=f"deleter-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add(role)
    await db.flush()
    permission = await db.scalar(select(Permission).where(Permission.key == Perm.TICKET_DELETE.value))
    if permission is None:
        permission = Permission(key=Perm.TICKET_DELETE.value)
        db.add(permission)
        await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _requester(db, ticket: Tickets) -> User:
    """The ticket's requester, signed in."""
    return await _may_delete(db, await db.get(User, ticket.created_by))


async def _stranger(db, scope: str = "own") -> User:
    stranger = User(name="路人")
    db.add(stranger)
    await db.flush()
    return await _may_delete(db, stranger, scope)


async def _delete(db, actor: User, task_uuid: str) -> None:
    """Delete the need. It commits, which expires every ORM object: take ids out beforehand."""
    await ticket_service.delete_ticket_task(db, actor=actor, uuid=task_uuid)


async def _read_need(db, task_uuid: str) -> TicketTask:
    """The need as committed, read afresh rather than from the session's copy."""
    return await db.scalar(
        select(TicketTask).where(TicketTask.uuid == task_uuid).execution_options(populate_existing=True)
    )


async def _ticket_status(db, ticket_uuid: str) -> str:
    return await db.scalar(
        select(Tickets.status).where(Tickets.uuid == ticket_uuid).execution_options(populate_existing=True)
    )


async def _notices(db, recipient: str, event_type: str = "task_deleted") -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(Notification.recipient_uuid == recipient, Notification.type == event_type)
    )
    return list(rows.scalars().all())


async def _volunteers_on(db, task_uuid: str) -> list[str]:
    rows = await db.execute(select(TaskAssignment.actor_uuid).where(TaskAssignment.task_uuid == task_uuid))
    return [str(uuid) for uuid in rows.scalars().all()]


# --- what deleting does to the need ---


@pytest.mark.asyncio
async def test_a_deleted_need_is_canceled_and_gone(db):
    """Canceled and soft-deleted at once, so no query shows it and nothing can bring it back."""
    ticket = await _ticket(db)
    task_uuid = str((await _need(db, ticket)).uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    deleted = await _read_need(db, task_uuid)
    assert deleted.status == "canceled"
    assert deleted.canceled_at is not None
    assert deleted.delete_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("stopped_by_hand", [False, True])
async def test_a_need_that_has_its_people_can_be_deleted_too(db, stopped_by_hand):
    """Filled by claims or stopped by hand, it can still go; it no longer counts as completed."""
    ticket = await _ticket(db, status="in_progress")
    task = await _need(db, ticket, status="fulfilled", claims=("甲", "乙"))
    if stopped_by_hand:
        task.recruiting_stopped_at = datetime.now(UTC)
    task_uuid = str(task.uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    deleted = await _read_need(db, task_uuid)
    assert (deleted.status, deleted.completed_at) == ("canceled", None)
    assert deleted.delete_at is not None


@pytest.mark.asyncio
async def test_the_people_on_a_deleted_need_stay_recorded(db):
    """Their claims are kept for the record; flow A's 「我承接的」 drops a deleted need by itself."""
    ticket = await _ticket(db, status="in_progress")
    task_uuid = str((await _need(db, ticket, claims=("甲", "乙"))).uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    assert len(await _volunteers_on(db, task_uuid)) == 2


# --- the ticket's status follows ---


@pytest.mark.asyncio
async def test_deleting_the_last_open_need_completes_the_ticket(db):
    """The other need is filled, so once this one goes nothing is open."""
    ticket = await _ticket(db, status="in_progress")
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket, "搬家具", status="fulfilled", claims=("甲",))
    task_uuid = str((await _need(db, ticket)).uuid)
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    assert await _ticket_status(db, ticket_uuid) == "completed"


@pytest.mark.asyncio
async def test_deleting_every_need_completes_the_ticket(db):
    """A ticket whose needs were all deleted has nothing open either (spec: 含全部刪光)."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    task_uuid = str((await _need(db, ticket)).uuid)
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    assert await _ticket_status(db, ticket_uuid) == "completed"


@pytest.mark.asyncio
async def test_deleting_the_only_claimed_need_leaves_the_ticket_pending(db):
    """Nobody is on any need that is left, so the ticket waits for volunteers again."""
    ticket = await _ticket(db, status="in_progress")
    ticket_uuid = str(ticket.uuid)
    task_uuid = str((await _need(db, ticket, claims=("甲",))).uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    assert await _ticket_status(db, ticket_uuid) == "pending"


# --- who hears ---


@pytest.mark.asyncio
async def test_everyone_on_the_need_hears_they_need_not_go(db):
    """One high-priority notice per person on it; nobody on another need, nor the requester."""
    ticket = await _ticket(db, status="in_progress")
    task_uuid = str((await _need(db, ticket, claims=("甲", "乙"))).uuid)
    sibling_uuid = str((await _need(db, ticket, "搬家具", claims=("丙",))).uuid)
    on_it, on_sibling = await _volunteers_on(db, task_uuid), await _volunteers_on(db, sibling_uuid)
    requester = await _requester(db, ticket)
    requester_uuid = str(requester.uuid)

    await _delete(db, requester, task_uuid)

    for volunteer_uuid in on_it:
        [notice] = await _notices(db, volunteer_uuid)
        assert notice.title == "你承接的「清淤」已刪除"
        assert notice.body == f"{TITLE}　這筆需求已經刪除，不用前往了。"
        assert notice.priority == "high"
    assert await _notices(db, on_sibling[0]) == []
    assert await _notices(db, requester_uuid) == []


# --- who may delete, and what cannot be ---


@pytest.mark.asyncio
async def test_the_requester_can_delete_a_need_someone_else_added(db):
    """ticket.delete is checked against the need's ticket, not whoever added the need."""
    ticket = await _ticket(db)
    coordinator = User(name="協調者")
    db.add(coordinator)
    await db.flush()
    task_uuid = str((await _need(db, ticket, created_by=str(coordinator.uuid))).uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)

    await _delete(db, requester, task_uuid)

    assert (await _read_need(db, task_uuid)).delete_at is not None


@pytest.mark.asyncio
async def test_only_someone_who_may_delete_the_ticket_can_delete_its_needs(db):
    """ticket.delete: own reaches only one's own tickets: a stranger is refused, nothing changes."""
    ticket = await _ticket(db)
    task_uuid = str((await _need(db, ticket)).uuid)
    stranger = await _stranger(db)

    with pytest.raises(HTTPException) as exc:
        await _delete(db, stranger, task_uuid)

    assert exc.value.status_code == 403
    kept = await _read_need(db, task_uuid)
    assert (kept.status, kept.delete_at) == ("pending", None)


@pytest.mark.asyncio
async def test_a_coordinator_can_delete_anyones_need(db):
    """Back-office scope is untouched: ticket.delete: all reaches every ticket."""
    ticket = await _ticket(db)
    task_uuid = str((await _need(db, ticket)).uuid)
    await _need(db, ticket, "搬家具")
    coordinator = await _stranger(db, scope="all")

    await _delete(db, coordinator, task_uuid)

    assert (await _read_need(db, task_uuid)).delete_at is not None


@pytest.mark.asyncio
async def test_a_deleted_need_cannot_be_deleted_again(db):
    """Gone is gone: the second attempt finds nothing."""
    ticket = await _ticket(db)
    task_uuid = str((await _need(db, ticket)).uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)
    await _delete(db, requester, task_uuid)

    with pytest.raises(ValueError, match="Ticket task not found"):
        await _delete(db, requester, task_uuid)


@pytest.mark.asyncio
async def test_a_need_of_a_deleted_ticket_cannot_be_deleted(db):
    """Its ticket went first, and took the need with it."""
    ticket = await _ticket(db)
    task_uuid = str((await _need(db, ticket)).uuid)
    ticket.delete_at = datetime.now(UTC)
    await db.flush()
    requester = await _requester(db, ticket)

    with pytest.raises(ValueError, match="Ticket task not found"):
        await _delete(db, requester, task_uuid)

    assert (await _read_need(db, task_uuid)).status == "pending"


# --- the lock order every writer keeps: the ticket, then its need (spec Q44) ---


@pytest.mark.asyncio
async def test_deleting_a_need_waits_for_whoever_holds_its_ticket(db):
    """Deleting a need changes its ticket's status, so it queues behind the ticket's holder.

    The holder stands in for any writer on the same ticket (a claim, a release): the delete must
    still be waiting a second later, and finish once it lets go.
    """
    ticket = await _ticket(db)
    task_uuid, ticket_uuid = str((await _need(db, ticket)).uuid), str(ticket.uuid)
    await _need(db, ticket, "搬家具")
    requester = await _requester(db, ticket)
    requester_uuid, identity = str(requester.uuid), requester.active_identity
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    holder, other = (sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines)
    try:
        await holder.execute(select(Tickets).where(Tickets.uuid == ticket_uuid).with_for_update())
        actor = await other.get(User, requester_uuid)
        actor.active_identity = identity
        running = asyncio.create_task(ticket_service.delete_ticket_task(other, actor=actor, uuid=task_uuid))
        done, _ = await asyncio.wait({running}, timeout=1)
        if done:
            running.result()  # a failure is the real story; re-raise it
            pytest.fail("finished while another connection held the ticket: it never asked for the ticket")
        await holder.rollback()
        await running
    finally:
        await holder.close()
        await other.close()
        for engine in engines:
            await engine.dispose()

    assert (await _read_need(db, task_uuid)).delete_at is not None
