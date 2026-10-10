"""Who may write the review of a ticket or a need (ADR-312).

The back office's verdict — a need's moderation status, the review notes on a ticket or a need —
takes ticket.review. A requester's ticket.edit `own` still reaches everything else they filed, and
a data auditor, who holds ticket.review without ticket.edit, reviews without editing.
"""

import uuid as uuidlib

import pytest
from fastapi import HTTPException

from app.core.permissions import Perm
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services.ticket import update_ticket, update_ticket_task
from tests.test_add_ticket_task import _requester, _stranger, _ticket


async def _need_on(db, ticket: Tickets) -> str:
    """A need the requester filed on `ticket`; returns its uuid."""
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="hr", task_name="清淤",
        quantity=3, created_by=ticket.created_by,
    )
    db.add(task)
    await db.flush()
    return str(task.uuid)


async def _need_row(db, task_uuid: str) -> TicketTask:
    return await db.get(TicketTask, task_uuid, populate_existing=True)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {"moderation_status": "approved"},
        {"review_note": "已電話確認"},
        {"progress_note": "x", "review_note": "y"},
    ],
    ids=["moderation status", "review note", "with another field"],
)
async def test_a_requester_cannot_review_their_own_need(db, changes):
    """ticket.edit `own` reaches what they filed, not the back office's verdict on it."""
    ticket = await _ticket(db)
    task_uuid = await _need_on(db, ticket)
    requester = await _requester(db, ticket)

    with pytest.raises(HTTPException) as refused:
        await update_ticket_task(db, actor=requester, uuid=task_uuid, changes=changes)

    assert refused.value.status_code == 403
    need = await _need_row(db, task_uuid)
    assert (need.moderation_status, need.review_note, need.progress_note) == ("pending_review", None, None)


@pytest.mark.asyncio
async def test_a_requester_still_edits_the_rest_of_their_need(db):
    """Only the review fields moved behind ticket.review."""
    ticket = await _ticket(db)
    task_uuid = await _need_on(db, ticket)
    requester = await _requester(db, ticket)

    await update_ticket_task(db, actor=requester, uuid=task_uuid, changes={"progress_note": "已有鄰居幫忙"})

    assert (await _need_row(db, task_uuid)).progress_note == "已有鄰居幫忙"


@pytest.mark.asyncio
async def test_a_requester_cannot_write_the_review_note_on_their_own_ticket(db):
    """The ticket's review note is the back office's too, as its verification status already was."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)

    with pytest.raises(HTTPException) as refused:
        await update_ticket(db, actor=requester, uuid=ticket_uuid, changes={"review_note": "已確認"})

    assert refused.value.status_code == 403


@pytest.mark.asyncio
async def test_a_data_auditor_reviews_any_need(db):
    """ticket.review `all`, as the seed gives a data auditor, and no ticket.edit at all."""
    ticket = await _ticket(db)
    task_uuid = await _need_on(db, ticket)
    auditor = await _stranger(db, Perm.TICKET_REVIEW, "all")

    verdict = {"moderation_status": "rejected", "review_note": "重複通報"}
    await update_ticket_task(db, actor=auditor, uuid=task_uuid, changes=verdict)

    need = await _need_row(db, task_uuid)
    assert (need.moderation_status, need.review_note) == ("rejected", "重複通報")


@pytest.mark.asyncio
async def test_a_data_auditor_cannot_rewrite_what_was_filed(db):
    """Reviewing is all the role writes: anything beside the review fields takes ticket.edit."""
    ticket = await _ticket(db)
    task_uuid = await _need_on(db, ticket)
    auditor = await _stranger(db, Perm.TICKET_REVIEW, "all")

    with pytest.raises(HTTPException) as refused:
        await update_ticket_task(
            db, actor=auditor, uuid=task_uuid, changes={"moderation_status": "approved", "progress_note": "x"}
        )

    assert refused.value.status_code == 403
    need = await _need_row(db, task_uuid)
    assert (need.moderation_status, need.progress_note) == ("pending_review", None)


@pytest.mark.asyncio
async def test_a_data_auditor_writes_the_review_note_on_any_ticket(db):
    """`updateTicket` with only `review_note` asks for ticket.review alone."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    auditor = await _stranger(db, Perm.TICKET_REVIEW, "all")

    await update_ticket(db, actor=auditor, uuid=ticket_uuid, changes={"review_note": "已電話確認"})

    assert (await db.get(Tickets, ticket_uuid, populate_existing=True)).review_note == "已電話確認"
