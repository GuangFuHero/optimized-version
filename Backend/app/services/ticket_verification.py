"""Which tickets 重複審核 still waits on, read from the duplicate pair cards (ADR-443).

A ticket is disputed while a live card on it, or on one of its needs, can still be merged in
重複審核: it waits for a verdict, or was judged a duplicate and not merged yet, and its two sides are
two different tickets, neither cancelled nor deleted. That is the card `dedup_resolve` will still
resolve, so the condition is taken from there. Nothing is stored on the ticket: the cards are
written by the dedup layers and the review page, and read here as they stand.

`TicketType.verification_status` reads it with `ai_duplicate.view`, checked there;
`TicketType.suspected_duplicate_of` gives anyone the far tickets alone (ADR-454).
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
    cards along, and a need taken off keeps its card in the queue. A card whose far ticket is gone,
    or that a merge left with the same ticket on both sides, cannot be resolved and does not count,
    so a disputed ticket names at least one other: each once, oldest card first. Two statements at
    most.
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

    titles = await _live_titles(db, {str(side) for row in rows for side in row if side})
    found: dict[str, list[DuplicateRef]] = {}
    for low, high in rows:
        sides = (str(low) if low else None, str(high) if high else None)
        # What a resolve refuses: a side cancelled, deleted or missing, or one ticket on both sides.
        if sides[0] == sides[1] or not all(side in titles for side in sides):
            continue
        for mine, theirs in (sides, sides[::-1]):
            if mine not in wanted:
                continue
            named = found.setdefault(mine, [])
            if all(ref.uuid != theirs for ref in named):
                named.append(DuplicateRef(uuid=theirs, title=titles[theirs]))
    return found


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
