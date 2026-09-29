"""The requester deletes a whole ticket (team decision 2026-09-28, note/help-request-spec.md).

Service-level (root conftest). The ticket is cancelled and soft-deleted, and every need on it that
is still there goes with it the way a single deleted need does (tests/test_delete_ticket_task.py).
Everyone on those needs hears once, however many of them they were on. Cancelled is final, so the
ticket's status is never worked out again.

Each ticket and need starts somewhere other than where the test expects it, so a no-op cannot pass.
"""

import asyncio
import os
import uuid as uuidlib
from datetime import UTC, datetime, timedelta

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
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
LONG_AGO = datetime(2026, 9, 1, tzinfo=UTC)


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


async def _person(db, name: str) -> str:
    person = User(name=name)
    db.add(person)
    await db.flush()
    return str(person.uuid)


async def _need(
    db, ticket: Tickets, name: str = "清淤", *, status: str = "pending", on_it: tuple[str, ...] = (),
    deleted: bool = False,
) -> str:
    """A need on `ticket` with the people in `on_it` (user uuids) on it; returns its uuid."""
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="hr", task_name=name,
        quantity=5, status="canceled" if deleted else status, created_by=ticket.created_by,
        completed_at=datetime.now(UTC) if status == "fulfilled" else None,
        canceled_at=LONG_AGO if deleted else None, delete_at=LONG_AGO if deleted else None,
    )
    db.add(task)
    await db.flush()
    for person_uuid in on_it:
        db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=person_uuid))
    await db.flush()
    return str(task.uuid)


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


async def _delete(db, actor: User, ticket_uuid: str) -> None:
    """Delete the ticket. It commits, which expires every ORM object: take ids out beforehand."""
    await ticket_service.delete_ticket(db, actor=actor, uuid=ticket_uuid)


async def _read_ticket(db, ticket_uuid: str) -> Tickets:
    return await db.scalar(
        select(Tickets).where(Tickets.uuid == ticket_uuid).execution_options(populate_existing=True)
    )


async def _read_need(db, task_uuid: str) -> TicketTask:
    return await db.scalar(
        select(TicketTask).where(TicketTask.uuid == task_uuid).execution_options(populate_existing=True)
    )


async def _notices(db, recipient: str) -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(
            Notification.recipient_uuid == recipient, Notification.type == "ticket_deleted"
        )
    )
    return list(rows.scalars().all())


# --- what deleting does to the ticket and its needs ---


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["in_progress", "completed"])
async def test_a_deleted_ticket_is_cancelled_and_gone(db, status):
    """Cancelled and soft-deleted, whatever it was doing — a completed ticket included."""
    ticket = await _ticket(db, status=status)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)

    await _delete(db, requester, ticket_uuid)

    deleted = await _read_ticket(db, ticket_uuid)
    assert deleted.status == "cancelled"
    assert deleted.delete_at is not None


@pytest.mark.asyncio
async def test_every_need_on_it_goes_with_it(db):
    """Each one as a single deleted need goes: canceled, soft-deleted, no longer counted as done."""
    ticket = await _ticket(db, status="in_progress")
    open_need = await _need(db, ticket)
    filled_need = await _need(db, ticket, "搬家具", status="fulfilled", on_it=(await _person(db, "甲"),))
    requester = await _requester(db, ticket)

    await _delete(db, requester, str(ticket.uuid))

    for task_uuid in (open_need, filled_need):
        need = await _read_need(db, task_uuid)
        assert (need.status, need.completed_at) == ("canceled", None), task_uuid
        assert need.canceled_at is not None
        assert need.delete_at is not None


@pytest.mark.asyncio
async def test_a_need_deleted_earlier_is_left_as_it_was(db):
    """It already went, and its people were told then; its record keeps the day it went."""
    ticket = await _ticket(db)
    earlier = await _need(db, ticket, "搬家具", deleted=True)
    await _need(db, ticket)
    requester = await _requester(db, ticket)

    await _delete(db, requester, str(ticket.uuid))

    need = await _read_need(db, earlier)
    assert (need.canceled_at, need.delete_at) == (LONG_AGO, LONG_AGO)


@pytest.mark.asyncio
async def test_the_people_on_its_needs_stay_recorded(db):
    """Their claims are kept for the record; flow A's 「我承接的」 drops a deleted ticket by itself."""
    ticket = await _ticket(db, status="in_progress")
    task_uuid = await _need(db, ticket, on_it=(await _person(db, "甲"), await _person(db, "乙")))
    requester = await _requester(db, ticket)

    await _delete(db, requester, str(ticket.uuid))

    assert await db.scalar(select(func.count()).where(TaskAssignment.task_uuid == task_uuid)) == 2


# --- who hears ---


@pytest.mark.asyncio
async def test_everyone_on_its_needs_hears_once(db):
    """One high-priority notice per person, however many of its needs they were on.

    Nobody else hears: not the requester, and not someone whose need was deleted earlier — they
    were told when it went.
    """
    ticket = await _ticket(db, status="in_progress")
    ticket_uuid = str(ticket.uuid)
    on_two, on_one, told_before = [await _person(db, name) for name in ("甲", "乙", "丙")]
    await _need(db, ticket, on_it=(on_two, on_one))
    await _need(db, ticket, "搬家具", on_it=(on_two,))
    await _need(db, ticket, "送水", on_it=(told_before,), deleted=True)
    requester = await _requester(db, ticket)
    requester_uuid = str(requester.uuid)

    await _delete(db, requester, ticket_uuid)

    for person in (on_two, on_one):
        [notice] = await _notices(db, person)
        assert notice.title == f"你承接的求助「{TITLE}」已刪除"
        assert notice.body == "整張求助單已經刪除，你承接的需求都不用前往了。"
        assert notice.priority == "high"
        assert (notice.ref_type, str(notice.ref_uuid)) == ("ticket", ticket_uuid)
    assert await _notices(db, told_before) == []
    assert await _notices(db, requester_uuid) == []


# --- who may delete, and what cannot be ---


@pytest.mark.asyncio
async def test_only_someone_who_may_delete_the_ticket_can(db):
    """ticket.delete: own reaches only one's own tickets: a stranger is refused, nothing changes."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    task_uuid = await _need(db, ticket)
    stranger = await _stranger(db)

    with pytest.raises(HTTPException) as exc:
        await _delete(db, stranger, ticket_uuid)

    assert exc.value.status_code == 403
    kept = await _read_ticket(db, ticket_uuid)
    assert (kept.status, kept.delete_at) == ("pending", None)
    assert (await _read_need(db, task_uuid)).delete_at is None


@pytest.mark.asyncio
async def test_a_coordinator_can_delete_anyones_ticket(db):
    """Back-office scope is untouched: ticket.delete: all reaches every ticket."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    coordinator = await _stranger(db, scope="all")

    await _delete(db, coordinator, ticket_uuid)

    assert (await _read_ticket(db, ticket_uuid)).status == "cancelled"


@pytest.mark.asyncio
async def test_a_deleted_ticket_cannot_be_deleted_again(db):
    """Gone is gone: the second attempt finds nothing."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)
    await _delete(db, requester, ticket_uuid)

    with pytest.raises(ValueError, match="Ticket not found"):
        await _delete(db, requester, ticket_uuid)


# --- the lock order every writer keeps: the ticket, then its needs (spec Q44) ---


@pytest.mark.asyncio
async def test_deleting_a_ticket_waits_for_whoever_holds_it(db):
    """A claim or a release on one of its needs holds the ticket first; the delete queues behind it.

    The holder must still be waited for a second later, and the delete finish once it lets go.
    """
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    task_uuid = await _need(db, ticket)
    requester = await _requester(db, ticket)
    requester_uuid, identity = str(requester.uuid), requester.active_identity
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    holder, other = (sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines)
    try:
        await holder.execute(select(Tickets).where(Tickets.uuid == ticket_uuid).with_for_update())
        actor = await other.get(User, requester_uuid)
        actor.active_identity = identity
        running = asyncio.create_task(ticket_service.delete_ticket(other, actor=actor, uuid=ticket_uuid))
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
    assert datetime.now(UTC) - (await _read_ticket(db, ticket_uuid)).delete_at < timedelta(minutes=1)
