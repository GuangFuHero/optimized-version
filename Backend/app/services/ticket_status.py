"""A ticket's status, worked out from its needs.

Nobody sets a ticket's status by hand any more: every action that changes a need — claiming,
releasing, stopping recruitment, deleting a need or the ticket, adding a need — calls
`recompute_ticket_status` in the same transaction, and the status follows.

- pending: a need is still open and nobody is on any need.
- in_progress: a need is still open and somebody is on some need, a filled one included.
- completed: no need is open — filled, stopped or deleted, every one of them.
- cancelled: the requester deleted the ticket; it is never recomputed again.

Its own module so the claim actions and the deleting and adding of needs can all call the one rule
without either reshaping the other's code.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask

# The need statuses that still take volunteers. Needs no longer get `in_progress` (ADR-293), with
# no data migration; on rows written before that, it still means "open".
OPEN_NEED_STATUSES = frozenset({"pending", "in_progress"})


async def recompute_ticket_status(db: AsyncSession, *, ticket_uuid: str) -> None:
    """Set the ticket's status from its needs; flush, never commit.

    Call it inside the action's transaction, after flushing the changes to the needs; the action
    commits once, at the end. Callers lock the ticket row before any of its needs (ADR-291's lock
    order). The row is locked again here — a no-op when already held — so a caller that forgot
    still cannot race another.
    """
    ticket = await db.scalar(select(Tickets).where(Tickets.uuid == ticket_uuid).with_for_update())
    # Cancelled means the requester deleted the ticket, and it stays that way. A ticket cancelled
    # by hand before statuses were derived (no data migration, 2026-09-28) is left alone too.
    if ticket is None or ticket.delete_at is not None or ticket.status == "cancelled":
        return
    open_needs = await db.scalar(
        select(TicketTask.uuid)
        .where(
            TicketTask.ticket_uuid == ticket_uuid,
            TicketTask.delete_at.is_(None),
            TicketTask.status.in_(OPEN_NEED_STATUSES),
        )
        .limit(1)
    )
    if open_needs is None:
        ticket.status = "completed"
    else:
        claimed = await db.scalar(
            select(TaskAssignment.uuid)
            .join(TicketTask, TicketTask.uuid == TaskAssignment.task_uuid)
            .where(TicketTask.ticket_uuid == ticket_uuid, TicketTask.delete_at.is_(None))
            .limit(1)
        )
        ticket.status = "in_progress" if claimed is not None else "pending"
    await db.flush()
