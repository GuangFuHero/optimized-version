"""Which tickets 重複審核 still waits on, read from the duplicate pair cards (ADR-443).

A ticket is disputed while a live card on it, or on one of its needs, can still be acted on in
重複審核: it waits for a verdict, or was judged a duplicate and not merged yet. That is the card
`dedup_resolve` will still resolve, so the condition is taken from there. Nothing is stored on the
ticket: the cards are written by the dedup layers and the review page, and read here as they stand.

Read with `ai_duplicate.view` (checked by the caller, `TicketType.verification_status`).
"""

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import and_, case, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services.dedup_resolve import RESOLVABLE_STATUSES
from app.services.dedup_resolve_plan import RESOLVABLE_KINDS


@dataclass(frozen=True)
class DuplicateRef:
    """A live ticket on the far side of a disputed ticket's card."""

    uuid: str
    title: str


async def disputes_by_ticket(db: AsyncSession, ticket_uuids: Iterable[str]) -> dict[str, list[DuplicateRef]]:
    """The disputed tickets among `ticket_uuids`, each with the tickets it may duplicate.

    A ticket absent from the result is not disputed. A need card counts on the ticket the need is on
    now, as `dedup_review_tickets.ticket_uuids_for_pair` reads it, so a need a merge moved takes its
    cards along, and a need taken off keeps its card in the queue. The far tickets are named once
    each, oldest card first, leaving out the ticket itself and any ticket cancelled or deleted; the
    list is empty when none is left, the card still waiting. Two statements at most.
    """
    wanted = {str(uuid) for uuid in ticket_uuids}
    if not wanted:
        return {}
    low_task, high_task = aliased(TicketTask), aliased(TicketTask)
    need_card = DuplicatePair.entity_kind == "ticket_task"
    low_ticket = case((need_card, low_task.ticket_uuid), else_=DuplicatePair.low_uuid)
    high_ticket = case((need_card, high_task.ticket_uuid), else_=DuplicatePair.high_uuid)
    merged = exists().where(
        DedupAuditEvent.pair_uuid == DuplicatePair.uuid, DedupAuditEvent.event_type == "merged"
    )
    rows = (
        await db.execute(
            select(low_ticket, high_ticket)
            .select_from(DuplicatePair)
            .outerjoin(low_task, and_(need_card, low_task.uuid == DuplicatePair.low_uuid))
            .outerjoin(high_task, and_(need_card, high_task.uuid == DuplicatePair.high_uuid))
            .where(
                DuplicatePair.delete_at.is_(None),
                DuplicatePair.entity_kind.in_(RESOLVABLE_KINDS),
                DuplicatePair.status.in_(RESOLVABLE_STATUSES),
                ~merged,
                or_(low_ticket.in_(wanted), high_ticket.in_(wanted)),
            )
            .order_by(DuplicatePair.created_at, DuplicatePair.uuid)
        )
    ).all()

    far: dict[str, list[str]] = {}
    for low, high in rows:
        sides = (str(low) if low else None, str(high) if high else None)
        for mine, theirs in (sides, sides[::-1]):
            if mine not in wanted:
                continue
            named = far.setdefault(mine, [])
            if theirs and theirs != mine and theirs not in named:
                named.append(theirs)

    titles = await _live_titles(db, {uuid for named in far.values() for uuid in named})
    return {
        mine: [DuplicateRef(uuid=uuid, title=titles[uuid]) for uuid in named if uuid in titles]
        for mine, named in far.items()
    }


async def _live_titles(db: AsyncSession, ticket_uuids: set[str]) -> dict[str, str]:
    """The titles of the tickets among `ticket_uuids` that are neither cancelled nor deleted."""
    if not ticket_uuids:
        return {}
    rows = await db.execute(
        select(Tickets.uuid, Tickets.title).where(
            Tickets.uuid.in_(ticket_uuids), Tickets.delete_at.is_(None), Tickets.status != "cancelled"
        )
    )
    return {str(uuid): title for uuid, title in rows.all()}
