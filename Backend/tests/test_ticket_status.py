"""A ticket's status follows its needs.

Service-level (root conftest): every action that changes a need calls `recompute_ticket_status` —
claiming and releasing and stopping recruitment, deleting a need or a ticket and adding a need —
so the rules are pinned against it directly.

- pending: a need is still open and nobody is on any need.
- in_progress: a need is still open and somebody is on some need, including one that has since
  filled: people are on their way, so the ticket is being handled.
- completed: no need is open, whether they filled or were deleted, all of them included.
- cancelled: only the requester deleting the ticket gets there, and it stays there.

Each ticket starts in a status other than the expected one, so a no-op cannot pass.
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import select

from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services.ticket_status import recompute_ticket_status


async def _ticket(db, *, status: str, deleted: bool = False) -> Tickets:
    requester = User(name="求助者")
    db.add(requester)
    await db.flush()
    ticket = Tickets(
        uuid=uuidlib.uuid4(),
        property_name="request",
        created_by=str(requester.uuid),
        title="一樓客廳積泥需要幫忙清",
        contact_name="王阿嬤",
        status=status,
        priority="medium",
        delete_at=datetime.now(UTC) if deleted else None,
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _need(db, ticket: Tickets, *, status: str = "pending", deleted: bool = False, claims: int = 0):
    """A need on `ticket`, with `claims` volunteers on it."""
    task = TicketTask(
        uuid=uuidlib.uuid4(),
        ticket_uuid=str(ticket.uuid),
        task_type="hr",
        task_name="清淤",
        status=status,
        created_by=ticket.created_by,
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
    return task


async def _recomputed(db, ticket: Tickets) -> str:
    await recompute_ticket_status(db, ticket_uuid=str(ticket.uuid))
    return await db.scalar(select(Tickets.status).where(Tickets.uuid == ticket.uuid))


@pytest.mark.asyncio
async def test_an_open_need_nobody_is_on_leaves_the_ticket_pending(db):
    """E.g. the only volunteer released their place."""
    ticket = await _ticket(db, status="in_progress")
    await _need(db, ticket)

    assert await _recomputed(db, ticket) == "pending"


@pytest.mark.asyncio
async def test_somebody_on_an_open_need_puts_the_ticket_in_progress(db):
    """The first volunteer claims a place."""
    ticket = await _ticket(db, status="pending")
    await _need(db, ticket, claims=1)

    assert await _recomputed(db, ticket) == "in_progress"


@pytest.mark.asyncio
async def test_every_need_fulfilled_completes_the_ticket(db):
    """Filled by claims or stopped by the requester: either way nothing is open."""
    ticket = await _ticket(db, status="in_progress")
    await _need(db, ticket, status="fulfilled", claims=2)
    await _need(db, ticket, status="fulfilled")

    assert await _recomputed(db, ticket) == "completed"


@pytest.mark.asyncio
async def test_every_need_deleted_completes_the_ticket(db):
    """Deleting the last need completes the ticket rather than cancelling it.

    Only deleting the ticket itself cancels it.
    """
    ticket = await _ticket(db, status="pending")
    await _need(db, ticket, status="canceled", deleted=True)

    assert await _recomputed(db, ticket) == "completed"


@pytest.mark.asyncio
async def test_needs_fulfilled_or_deleted_complete_the_ticket(db):
    """A mix of the two closes it just the same."""
    ticket = await _ticket(db, status="in_progress")
    await _need(db, ticket, status="fulfilled", claims=1)
    await _need(db, ticket, status="canceled", deleted=True)

    assert await _recomputed(db, ticket) == "completed"


@pytest.mark.asyncio
async def test_volunteers_on_a_deleted_need_do_not_count(db):
    """They were told not to come; the open need still has nobody."""
    ticket = await _ticket(db, status="in_progress")
    await _need(db, ticket, status="canceled", deleted=True, claims=2)
    await _need(db, ticket)

    assert await _recomputed(db, ticket) == "pending"


@pytest.mark.asyncio
async def test_a_new_open_need_reopens_a_completed_ticket(db):
    """The requester adds a need after everything was done."""
    ticket = await _ticket(db, status="completed")
    await _need(db, ticket, status="fulfilled")
    await _need(db, ticket)

    assert await _recomputed(db, ticket) == "pending"


@pytest.mark.asyncio
async def test_volunteers_on_a_filled_need_keep_the_ticket_in_progress(db):
    """5/5 on one need and 0/3 on another: people are on their way."""
    ticket = await _ticket(db, status="pending")
    await _need(db, ticket, status="fulfilled", claims=5)
    await _need(db, ticket)

    assert await _recomputed(db, ticket) == "in_progress"


@pytest.mark.asyncio
async def test_a_deleted_ticket_stays_cancelled(db):
    """Only deleting the ticket cancels it, and nothing afterwards brings it back."""
    ticket = await _ticket(db, status="cancelled", deleted=True)
    await _need(db, ticket)

    assert await _recomputed(db, ticket) == "cancelled"


@pytest.mark.asyncio
async def test_it_leaves_the_commit_to_the_caller(db):
    """Flush only: the caller's change to a need and the new status land in one commit or not at all."""
    ticket = await _ticket(db, status="in_progress")
    await _need(db, ticket)
    ticket_uuid = str(ticket.uuid)
    await db.commit()

    await recompute_ticket_status(db, ticket_uuid=ticket_uuid)
    await db.rollback()

    assert await db.scalar(select(Tickets.status).where(Tickets.uuid == ticket_uuid)) == "in_progress"


@pytest.mark.asyncio
async def test_a_need_still_marked_in_progress_counts_as_open(db):
    """A need still marked `in_progress` is open, not done.

    Needs no longer get that status (ADR-293), with no data migration: on rows written before,
    such a need is still taking people and must not complete the ticket.
    """
    ticket = await _ticket(db, status="pending")
    await _need(db, ticket, status="in_progress", claims=1)

    assert await _recomputed(db, ticket) == "in_progress"
