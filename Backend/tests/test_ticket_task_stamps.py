"""A need's `completed_at` and `canceled_at` agree with its `status` (ck_ticket_tasks_stamps_match_status).

The database refuses a row where they disagree, and every action that moves a need's status leaves a row
it accepts: the claim that fills it, the release that reopens it, stopping recruitment, deleting it, and a
duplicate review's cancel and settle.
"""

import os

os.environ["ENV"] = "testing"

import uuid as uuidlib
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models.auth import User
from app.models.ticket_task import TicketTask
from app.services import ticket as ticket_service
from app.services.authz import refresh_actor
from app.services.dedup_resolve import _settle
from app.services.ticket import stop_recruiting, unassign_task_actor
from tests.test_delete_ticket_task import _may_delete, _ticket
from tests.test_delete_ticket_task import _need as _delete_need
from tests.test_volunteer_claim import _claim, _need, _requester_of, _volunteer

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 10, 30, 4, 0, tzinfo=UTC)
CHECK = "ck_ticket_tasks_stamps_match_status"


async def _disagreeing(db) -> int:
    """How many needs break the rule; read straight from the table so the session's copies cannot hide one."""
    return await db.scalar(
        text(
            "SELECT count(*) FROM ticket_tasks WHERE NOT ((completed_at IS NOT NULL) = (status = 'fulfilled')"
            " AND (canceled_at IS NOT NULL) = (status = 'canceled'))"
        )
    )


async def _insert(db, status: str, *, completed: bool = False, canceled: bool = False) -> None:
    """Write a need with these exact fields and commit."""
    ticket = await _ticket(db)
    db.add(
        TicketTask(
            uuid=uuidlib.uuid4(),
            ticket_uuid=str(ticket.uuid),
            task_type="hr",
            task_name="清淤",
            quantity=2,
            status=status,
            created_by=ticket.created_by,
            completed_at=NOW if completed else None,
            canceled_at=NOW if canceled else None,
        )
    )
    await db.commit()


@pytest.mark.parametrize(
    ("status", "completed", "canceled"),
    [("pending", False, False), ("fulfilled", True, False), ("canceled", False, True)],
)
async def test_a_row_that_agrees_is_stored(db, status, completed, canceled):
    """Each status with exactly its own timestamp, or none for an open need."""
    await _insert(db, status, completed=completed, canceled=canceled)
    assert await _disagreeing(db) == 0


@pytest.mark.parametrize(
    ("status", "completed", "canceled"),
    [
        ("fulfilled", False, False),
        ("pending", True, False),
        ("canceled", False, False),
        ("pending", False, True),
        ("canceled", True, True),
        ("fulfilled", True, True),
    ],
)
async def test_a_row_that_disagrees_is_refused(db, status, completed, canceled):
    """A timestamp missing for its status, or set for another, is an IntegrityError naming the CHECK."""
    with pytest.raises(IntegrityError, match=CHECK):
        await _insert(db, status, completed=completed, canceled=canceled)


async def test_an_update_that_makes_them_disagree_is_refused(db):
    """Moving the status without its timestamp fails on update too."""
    await _insert(db, "pending")
    with pytest.raises(IntegrityError, match=CHECK):
        await db.execute(text("UPDATE ticket_tasks SET status = 'fulfilled'"))


async def test_claiming_giving_back_and_stopping_leave_rows_the_check_accepts(db):
    """The claim that fills a need, the release that reopens it and stopping recruitment."""
    task = await _need(db, quantity=2)
    task_uuid = str(task.uuid)
    first, second = await _volunteer(db, "甲"), await _volunteer(db, "乙")
    await _claim(db, first, task_uuid)
    assignment_uuid = str((await _claim(db, second, task_uuid)).uuid)
    assert await _disagreeing(db) == 0
    assert (await db.scalar(select(TicketTask.completed_at).where(TicketTask.uuid == task_uuid))) is not None

    await refresh_actor(db, second)
    await unassign_task_actor(db, actor=second, uuid=assignment_uuid)
    assert await _disagreeing(db) == 0
    assert (await db.scalar(select(TicketTask.completed_at).where(TicketTask.uuid == task_uuid))) is None

    await stop_recruiting(db, actor=await _requester_of(db, task_uuid), task_uuid=task_uuid)
    assert await _disagreeing(db) == 0


@pytest.mark.parametrize("status", ["pending", "fulfilled"])
async def test_deleting_a_need_leaves_a_row_the_check_accepts(db, status):
    """A deleted need is canceled with canceled_at and loses the completed_at of the state it leaves."""
    ticket = await _ticket(db)
    task_uuid = str((await _delete_need(db, ticket, status=status)).uuid)
    actor = await _may_delete(db, await db.get(User, ticket.created_by))

    await ticket_service.delete_ticket_task(db, actor=actor, uuid=task_uuid)

    assert await _disagreeing(db) == 0
    row = (await db.execute(select(TicketTask.status, TicketTask.completed_at, TicketTask.canceled_at))).one()
    assert row.status == "canceled" and row.completed_at is None and row.canceled_at is not None


@pytest.mark.parametrize(
    ("status", "quantity", "headcount", "expected"),
    [("pending", 2, 2, "fulfilled"), ("fulfilled", 3, 2, "pending"), ("pending", 3, 2, "pending")],
)
async def test_a_duplicate_reviews_settle_leaves_a_row_the_check_accepts(
    db, status, quantity, headcount, expected
):
    """A kept need that becomes full is fulfilled with completed_at; one with room again, open without."""
    ticket = await _ticket(db)
    task = TicketTask(
        uuid=uuidlib.uuid4(),
        ticket_uuid=str(ticket.uuid),
        task_type="hr",
        task_name="清淤",
        quantity=quantity,
        status=status,
        created_by=ticket.created_by,
        completed_at=NOW if status == "fulfilled" else None,
    )
    db.add(task)
    await db.flush()

    _settle(task, headcount, NOW)
    await db.commit()

    assert await _disagreeing(db) == 0
    assert (await db.scalar(select(TicketTask.status))) == expected
