"""Pending cards the 重複審核 queue leaves out because their sides leave nothing to decide (ADR-461).

A pending card naming a deleted or cancelled ticket, need or station is neither listed nor counted,
and its status stays. A side a resolve folded into the primary is deleted, so it leaves too; a need
the resolve moved over is still there, but a card it now shares one ticket with leaves. The
疑似重複 mark and the dashboard count drop the same cards. Sides are deleted and merged by the
real services where there is one, so a change to what those write shows here.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import dedup_review, ticket_analytics, ticket_verification
from app.services import ticket as ticket_service
from tests import test_dedup_resolve as resolving
from tests.test_dedup_review_read import _actor, _pair, _station, _task, _ticket

pytestmark = pytest.mark.asyncio


async def _listed(db, actor, **filters) -> tuple[set[str], int]:
    await db.refresh(actor)  # a delete or resolve earlier in the test commits, which expires it
    page = await dedup_review.list_pairs(db, actor=actor, **filters)
    return {str(item.pair.uuid) for item in page.items}, page.total


async def _marked(db, *tickets: str) -> set[str]:
    """Which of `tickets` read as 疑似重複."""
    return set(await ticket_verification.disputes_by_ticket(db, tickets))


async def _dashboard(db) -> int:
    """How many tickets the dashboard counts as flagged duplicates."""
    (row,) = await ticket_analytics.get_duplicate_count(
        db, x=None, x_granularity="day", start_date=None, end_date=None, tz=ZoneInfo("UTC")
    )
    return row["count"]


async def _reviewer(db):
    return await _actor(db, Perm.AI_DUP_VIEW, Perm.TICKET_DELETE)


# --- deleted by the requester or an admin --------------------------------------------------


async def test_a_card_on_a_deleted_need_leaves_the_queue_as_it_stands(db):
    """Deleting one need takes its card out of the list and the total; nothing on the card changes."""
    actor = await _reviewer(db)
    kept = await _task(db, actor, await _ticket(db, actor))
    doomed = await _task(db, actor, await _ticket(db, actor, title="二樓淹水"))
    other = await _task(db, actor, await _ticket(db, actor, title="三樓淹水"))
    gone_card = str((await _pair(db, kept, doomed)).uuid)
    live_card = str((await _pair(db, kept, other)).uuid)
    doomed_uuid = str(doomed.uuid)

    await ticket_service.delete_ticket_task(db, actor=actor, uuid=doomed_uuid)

    assert await _listed(db, actor) == ({live_card}, 1)
    card = await db.get(DuplicatePair, gone_card, populate_existing=True)
    assert (card.status, card.delete_at, card.reviewed_by) == ("dup_ignored", None, None)
    events = await db.scalar(select(func.count()).where(DedupAuditEvent.pair_uuid == gone_card))
    assert events == 0


async def test_a_deleted_need_takes_the_mark_and_the_dashboard_count_off_its_card(db):
    """Both tickets are still there, but the requester deleted b's need: nothing is left to duplicate.

    It was b's one need, so b is completed now, not cancelled; it is still not marked.
    """
    actor = await _reviewer(db)
    a, b = await _ticket(db, actor), await _ticket(db, actor, title="二樓淹水")
    doomed = await _task(db, actor, b)
    await _pair(db, await _task(db, actor, a), doomed)
    a_uuid, b_uuid, doomed_uuid = str(a.uuid), str(b.uuid), str(doomed.uuid)
    assert (await _marked(db, a_uuid, b_uuid), await _dashboard(db)) == ({a_uuid, b_uuid}, 2)

    await ticket_service.delete_ticket_task(db, actor=actor, uuid=doomed_uuid)

    assert await _listed(db, actor) == (set(), 0)
    assert (await _marked(db, a_uuid, b_uuid), await _dashboard(db)) == (set(), 0)
    assert (await db.get(Tickets, b_uuid, populate_existing=True)).status == "completed"


async def test_deleting_a_ticket_takes_its_ticket_and_need_cards_out(db):
    """A deleted ticket's own card and the cards on its needs all leave the queue."""
    actor = await _reviewer(db)
    doomed, other = await _ticket(db, actor), await _ticket(db, actor, title="二樓淹水")
    await _pair(db, await _task(db, actor, doomed), await _task(db, actor, other))
    await _pair(db, doomed, other, kind="ticket")
    third = await _ticket(db, actor, title="三樓淹水")
    live_card = str((await _pair(db, other, third, kind="ticket")).uuid)
    doomed_uuid = str(doomed.uuid)
    assert (await _listed(db, actor))[1] == 3

    await ticket_service.delete_ticket(db, actor=actor, uuid=doomed_uuid)

    assert await _listed(db, actor) == ({live_card}, 1)


@pytest.mark.parametrize(
    ("status", "deleted"), [("cancelled", False), ("pending", True)], ids=["cancelled-only", "deleted-only"]
)
async def test_either_mark_alone_takes_a_ticket_out(db, status, deleted):
    """A cancelled status alone or a delete_at alone takes a ticket's cards out.

    A ticket cancelled by hand before statuses were derived has no delete_at, and resolve refuses
    it too. delete_at is on the ticket's base row, so this also checks that row is joined in.
    """
    actor = await _reviewer(db)
    gone, other = await _ticket(db, actor), await _ticket(db, actor, title="二樓淹水")
    await _pair(db, gone, other, kind="ticket")
    await _pair(db, await _task(db, actor, gone), await _task(db, actor, other))
    gone.status, gone.delete_at = status, datetime.now(UTC) if deleted else None
    await db.flush()

    assert await _listed(db, actor) == (set(), 0)


async def test_a_need_canceled_without_being_deleted_stays(db):
    """Stopping recruitment once left a need `canceled` and still on its ticket: it is not gone."""
    actor = await _reviewer(db)
    stopped = await _task(db, actor, await _ticket(db, actor))
    other = await _task(db, actor, await _ticket(db, actor, title="二樓淹水"))
    card = await _pair(db, stopped, other)
    stopped.status, stopped.canceled_at = "canceled", datetime.now(UTC)
    await db.flush()

    assert await _listed(db, actor) == ({str(card.uuid)}, 1)


async def test_a_card_on_a_deleted_station_leaves_the_queue(db):
    """A station card follows the same rule."""
    actor = await _reviewer(db)
    kept, doomed = await _station(db, actor), await _station(db, actor, name="光復國中")
    await _pair(db, kept, doomed, kind="station")
    live_card = await _pair(db, kept, await _station(db, actor, name="光復高中"), kind="station")
    doomed.delete_at = datetime.now(UTC)
    await db.flush()

    assert await _listed(db, actor) == ({str(live_card.uuid)}, 1)


async def test_a_decided_card_is_listed_whatever_its_sides_are(db):
    """已處理 keeps who decided what: a decided card stays, its deleted side marked; a pending one goes."""
    actor = await _reviewer(db)
    kept = await _task(db, actor, await _ticket(db, actor))
    doomed = await _task(db, actor, await _ticket(db, actor, title="二樓淹水"))
    decided = str((await _pair(db, kept, doomed, status="not_duplicate")).uuid)
    fourth = await _task(db, actor, await _ticket(db, actor, title="四樓淹水"))
    pending_on_doomed = str((await _pair(db, doomed, fourth)).uuid)
    doomed_uuid = str(doomed.uuid)

    await ticket_service.delete_ticket_task(db, actor=actor, uuid=doomed_uuid)

    listed, total = await _listed(db, actor, statuses=["dup_ignored", "not_duplicate"])
    assert (listed, total) == ({decided}, 1)
    assert pending_on_doomed not in listed
    (item,) = (await dedup_review.list_pairs(db, actor=actor, statuses=["not_duplicate"])).items
    gone = item.low if item.low.uuid == doomed_uuid else item.high
    assert gone.uuid == doomed_uuid and gone.deleted


# --- merged away by a resolve --------------------------------------------------------------


async def _cards_on_b(db, ids) -> dict[str, str]:
    """Ticket C with water and food, and pending cards b2↔c2, b3↔c3 and B↔C, by name."""
    c_owner = await resolving._user(db, "C 的開單者")
    c = await resolving._ticket(db, c_owner, "C 一樓淹水")
    c2 = await resolving._need(db, c_owner, c, "supply", "飲用水", 2)
    c3 = await resolving._need(db, c_owner, c, "supply", "便當", 2)
    b = await db.get(Tickets, ids["b"])
    b2, b3 = await db.get(TicketTask, ids["b2"]), await db.get(TicketTask, ids["b3"])
    return {
        "b2_c2": str((await _pair(db, b2, c2)).uuid),
        "b3_c3": str((await _pair(db, b3, c3)).uuid),
        "b_c": str((await _pair(db, b, c, kind="ticket")).uuid),
    }


async def test_sides_folded_into_the_primary_leave_and_a_moved_need_stays(db):
    """B folds into A whole: b2 into a2, b3 moves. b2↔c2 and B↔C leave; b3↔c3 stays, b3 being on A now."""
    reviewer, ids = await resolving._world(db)
    cards = await _cards_on_b(db, ids)
    assert (await _listed(db, reviewer))[1] == 4

    await resolving._resolve(db, reviewer, ids)

    assert await _listed(db, reviewer) == ({cards["b3_c3"]}, 1)


def _a1_absorbs_b1(ids) -> dict:
    """a1 takes b1 in, as in example one, dropping b1's item."""
    return {
        "task": ids["a1"],
        "action": "keep",
        "absorb": [ids["b1"]],
        "values": {"quantity": 7},
        "properties": [
            {"property": ids["pa1"], "action": "keep"},
            {"property": ids["pb1"], "action": "cancel"},
        ],
    }


async def test_a_need_the_resolve_cancelled_leaves_as_well(db):
    """b2 cancelled with B rather than folded: b2↔c2 leaves all the same."""
    reviewer, ids = await resolving._world(db)
    cards = await _cards_on_b(db, ids)
    versions = await resolving._versions(db, reviewer, ids)
    request = resolving._example_one(
        ids,
        versions,
        primary_tasks=[_a1_absorbs_b1(ids), {"task": ids["a2"], "action": "keep", "properties": []}],
        secondary_tasks=[
            {"task": ids["b2"], "action": "cancel"},
            {"task": ids["b3"], "action": "move", "properties": []},
        ],
    )

    await resolving._resolve(db, reviewer, ids, request)

    assert await _listed(db, reviewer) == ({cards["b3_c3"]}, 1)


async def test_a_card_the_resolve_leaves_with_one_ticket_on_both_sides_leaves(db):
    """a2↔b2, both water: b2 moves over to A rather than folding into a2, so the card is A against A.

    There is nothing to merge any more: the queue, the mark and the dashboard all drop it, and A,
    with no other card left, is not marked.
    """
    reviewer, ids = await resolving._world(db)
    a2, b2 = await db.get(TicketTask, ids["a2"]), await db.get(TicketTask, ids["b2"])
    water = str((await _pair(db, a2, b2)).uuid)
    assert await _listed(db, reviewer) == ({ids["pair"], water}, 2)
    versions = await resolving._versions(db, reviewer, ids)
    request = resolving._example_one(
        ids,
        versions,
        primary_tasks=[_a1_absorbs_b1(ids), {"task": ids["a2"], "action": "keep", "properties": []}],
        secondary_tasks=[
            {"task": ids["b2"], "action": "move", "properties": []},
            {"task": ids["b3"], "action": "move", "properties": []},
        ],
    )

    await resolving._resolve(db, reviewer, ids, request)

    moved = await db.get(TicketTask, ids["b2"], populate_existing=True)
    assert (str(moved.ticket_uuid), moved.delete_at) == (ids["a"], None)
    assert await _listed(db, reviewer) == (set(), 0)
    assert (await _marked(db, ids["a"]), await _dashboard(db)) == (set(), 0)
