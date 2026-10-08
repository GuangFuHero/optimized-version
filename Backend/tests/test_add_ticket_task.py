"""Adding a need to a ticket that already exists.

Service-level (root conftest). `create_ticket_task` is what createTicketTask calls — the site's
「再加一件」 among others. Since 2026-09-28 it takes ticket.edit on that ticket rather than ticket.add
alone, so a signed-in citizen adds to their own ticket and nobody else's, while back-office roles
keep whatever reach their ticket.edit has. A ticket that is completed takes a new need and is open
again; a deleted one takes none.

Bulk import adds its needs through `import_ticket_task`, which keeps the rule it had (ticket.add):
who may import what is the back office's to decide. Both work the ticket's status out afterwards,
because a completed ticket turns away every claim (ADR-291), so a need added to it must reopen it.

Each ticket starts somewhere other than where the test expects it, so a no-op cannot pass.
"""

import asyncio
import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import ticket as ticket_service
from tests.conftest import TEST_DB_URL, acting_as


async def _ticket(db, *, status: str = "pending", deleted: bool = False) -> Tickets:
    requester = User(name="求助者")
    db.add(requester)
    await db.flush()
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(requester.uuid),
        title="一樓客廳積泥需要幫忙清", contact_name="王阿嬤", status=status, priority="medium",
        delete_at=datetime.now(UTC) if deleted else None,
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _need(db, ticket: Tickets, *, status: str = "pending", claims: int = 0, deleted: bool = False):
    """A need already on `ticket`, with `claims` volunteers on it."""
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="hr", task_name="清淤",
        quantity=claims or 3, status="canceled" if deleted else status, created_by=ticket.created_by,
        delete_at=datetime.now(UTC) if deleted else None,
    )
    db.add(task)
    await db.flush()
    for _ in range(claims):
        volunteer = User(name="志工")
        db.add(volunteer)
        await db.flush()
        db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=str(volunteer.uuid)))
    await db.flush()


async def _holding(db, user: User, perm: Perm, scope: str) -> User:
    """Act as holding `perm` at `scope` and nothing else."""
    role = Role(name=f"holder-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add(role)
    await db.flush()
    permission = await db.scalar(select(Permission).where(Permission.key == perm.value))
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _requester(db, ticket: Tickets) -> User:
    """The ticket's requester, signed in: the platform `user` role's ticket.edit: own (seed_rbac.py)."""
    return await _holding(db, await db.get(User, ticket.created_by), Perm.TICKET_EDIT, "own")


async def _stranger(db, perm: Perm = Perm.TICKET_EDIT, scope: str = "own") -> User:
    stranger = User(name="路人")
    db.add(stranger)
    await db.flush()
    return await _holding(db, stranger, perm, scope)


async def _add(db, actor: User, ticket_uuid: str, *, name: str = "搬家具", quantity: int | None = 3) -> str:
    """Add a need through createTicketTask's service. It commits: take ids out beforehand."""
    task = await ticket_service.create_ticket_task(
        db, actor=actor, ticket_uuid=ticket_uuid, task_type="hr", task_name=name,
        task_description=None, quantity=quantity, source="user", visibility="public", route_uuid=None,
    )
    return str(task.uuid)


async def _import(db, actor: User, ticket_uuid: str, *, quantity: int | None = 3) -> str:
    """Add a need the way a bulk import does."""
    task = await ticket_service.import_ticket_task(
        db, actor=actor, ticket_uuid=ticket_uuid, task_type="hr", task_name="搬家具",
        task_description=None, quantity=quantity, source="import", visibility="public", route_uuid=None,
    )
    return str(task.uuid)


async def _needs(db, ticket_uuid: str) -> int:
    return await db.scalar(select(func.count()).where(TicketTask.ticket_uuid == ticket_uuid))


async def _ticket_status(db, ticket_uuid: str) -> str:
    return await db.scalar(
        select(Tickets.status).where(Tickets.uuid == ticket_uuid).execution_options(populate_existing=True)
    )


# --- who may add ---


@pytest.mark.asyncio
@pytest.mark.parametrize("quantity", [3, None])
async def test_the_requester_adds_a_need_to_their_ticket(db, quantity):
    """The need is open, and recorded as added by the requester; a need need not say how many."""
    ticket = await _ticket(db, status="in_progress")
    await _need(db, ticket, claims=1)
    requester = await _requester(db, ticket)
    requester_uuid = str(requester.uuid)

    task_uuid = await _add(db, requester, str(ticket.uuid), quantity=quantity)

    added = await db.get(TicketTask, uuidlib.UUID(task_uuid))
    assert (added.task_name, added.quantity, added.status) == ("搬家具", quantity, "pending")
    assert str(added.created_by) == requester_uuid


@pytest.mark.asyncio
async def test_someone_else_cannot_add_to_the_ticket(db):
    """ticket.edit: own reaches only one's own tickets, so a stranger is refused and nothing is added."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket)
    stranger = await _stranger(db)

    with pytest.raises(HTTPException) as exc:
        await _add(db, stranger, ticket_uuid)

    assert exc.value.status_code == 403
    assert await _needs(db, ticket_uuid) == 1


@pytest.mark.asyncio
async def test_ticket_add_alone_no_longer_lets_anyone_add(db):
    """What createTicketTask used to ask for is not enough any more."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket)
    filer = await _stranger(db, Perm.TICKET_ADD, "all")

    with pytest.raises(HTTPException) as exc:
        await _add(db, filer, ticket_uuid)

    assert exc.value.status_code == 403
    assert await _needs(db, ticket_uuid) == 1


@pytest.mark.asyncio
async def test_a_coordinator_can_add_to_anyones_ticket(db):
    """Back-office reach is untouched: ticket.edit: all reaches every ticket."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket)
    coordinator = await _stranger(db, Perm.TICKET_EDIT, "all")

    await _add(db, coordinator, ticket_uuid)

    assert await _needs(db, ticket_uuid) == 2


# --- the ticket's status follows ---


@pytest.mark.asyncio
async def test_a_completed_ticket_nobody_is_on_waits_for_volunteers_again(db):
    """Its only need was deleted, so it was completed; a new need opens it with nobody on it."""
    ticket = await _ticket(db, status="completed")
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket, deleted=True)
    requester = await _requester(db, ticket)

    await _add(db, requester, ticket_uuid)

    assert await _ticket_status(db, ticket_uuid) == "pending"


@pytest.mark.asyncio
async def test_a_completed_ticket_with_people_on_it_is_in_progress_again(db):
    """Its filled need still has people going, so with a new open need it is being handled."""
    ticket = await _ticket(db, status="completed")
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket, status="fulfilled", claims=2)
    requester = await _requester(db, ticket)

    await _add(db, requester, ticket_uuid)

    assert await _ticket_status(db, ticket_uuid) == "in_progress"


# --- what cannot be added, nor added to ---


@pytest.mark.asyncio
async def test_a_deleted_ticket_takes_no_need(db):
    """Deleted is gone, for its requester as well."""
    ticket = await _ticket(db, status="cancelled", deleted=True)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)

    with pytest.raises(ValueError, match="Ticket not found"):
        await _add(db, requester, ticket_uuid)

    assert await _needs(db, ticket_uuid) == 0


@pytest.mark.asyncio
async def test_a_ticket_cancelled_by_hand_takes_no_need(db):
    """Cancelled before statuses were derived (no data migration): nobody could claim a need on it."""
    ticket = await _ticket(db, status="cancelled")
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)

    with pytest.raises(ValueError, match="Ticket is no longer open"):
        await _add(db, requester, ticket_uuid)

    assert await _needs(db, ticket_uuid) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("name", "quantity", "message"),
    [
        ("清" * 201, 3, "task_name must be at most 200 characters"),
        ("搬家具", 0, "quantity must be at least 1"),
    ],
    ids=["name too long", "zero quantity"],
)
async def test_a_need_the_site_would_misread_is_refused(db, name, quantity, message):
    """Checked before anything is written, so the caller hears why instead of "Unexpected error."

    A name longer than its column would fail in the database, and a zero quantity would read as
    full the moment it was filed.
    """
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)

    with pytest.raises(ValueError, match=message):
        await _add(db, requester, ticket_uuid, name=name, quantity=quantity)

    assert await _needs(db, ticket_uuid) == 0


# --- the lock order every writer keeps: the ticket first (ADR-291) ---


@pytest.mark.asyncio
async def test_adding_a_need_waits_for_whoever_holds_the_ticket(db):
    """A need added while the ticket is being deleted must not land on a deleted ticket.

    So adding takes the ticket's lock first, and queues behind whoever holds it: still waiting a
    second later, done once it lets go.
    """
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)
    requester_uuid, identity = str(requester.uuid), requester.active_identity
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    holder, other = (sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines)
    try:
        await holder.execute(select(Tickets).where(Tickets.uuid == ticket_uuid).with_for_update())
        actor = await other.get(User, requester_uuid)
        actor.active_identity = identity
        running = asyncio.create_task(_add(other, actor, ticket_uuid))
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

    assert await _needs(db, ticket_uuid) == 1


# --- bulk import keeps its own rule (the back office's to decide) ---


@pytest.mark.asyncio
async def test_an_import_still_needs_only_ticket_add(db):
    """Unchanged by the 2026-09-28 rule: ticket.add is enough to add a need through an import."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket)
    importer = await _stranger(db, Perm.TICKET_ADD, "all")

    await _import(db, importer, ticket_uuid)

    assert await _needs(db, ticket_uuid) == 2


@pytest.mark.asyncio
async def test_an_import_reopens_a_completed_ticket_too(db):
    """Left completed, the ticket would turn away every claim on the need the import just added."""
    ticket = await _ticket(db, status="completed")
    ticket_uuid = str(ticket.uuid)
    await _need(db, ticket, deleted=True)
    importer = await _stranger(db, Perm.TICKET_ADD, "all")

    await _import(db, importer, ticket_uuid)

    assert await _ticket_status(db, ticket_uuid) == "pending"


@pytest.mark.asyncio
async def test_an_import_takes_no_need_for_nobody_either(db):
    """A zero quantity reads as full at once, whoever adds it.

    The import's preview refuses such a row first (`task_quantity`'s minimum in bulk_columns);
    this is the backstop for a caller that skips the preview.
    """
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    importer = await _stranger(db, Perm.TICKET_ADD, "all")

    with pytest.raises(ValueError, match="quantity must be at least 1"):
        await _import(db, importer, ticket_uuid, quantity=0)

    assert await _needs(db, ticket_uuid) == 0
