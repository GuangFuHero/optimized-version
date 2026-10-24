"""The two whole tickets behind a pair card (Spec 028 §2, ADR-372/373): the service layer.

`dedup_review.get_pair` carries them; the REST shape is checked in test_dedup_review_tickets_api.py.
"""

import uuid as uuid_mod
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import update

from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services import dedup_review
from tests.test_dedup_review_read import _actor, _count_queries

pytestmark = pytest.mark.asyncio

LON, LAT = 121.43, 23.67
T0 = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)


async def _ticket(db, owner, *, title="一樓淹水", phone="0912345678", cancelled=False) -> Tickets:
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title=title,
        description="客廳進水",
        status="cancelled" if cancelled else "pending",
        priority="high",
        contact_name="李",
        contact_phone=phone,
        contact_email="li@example.com",
        disaster_types=["flood"],
        created_by=owner.uuid,
        delete_at=T0 if cancelled else None,
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _task(db, owner, ticket, *, task_type="hr", name="清淤", quantity=2, deleted=False) -> TicketTask:
    task = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type=task_type,
        task_name=name,
        quantity=quantity,
        status="pending",
        created_by=owner.uuid,
        delete_at=T0 if deleted else None,
    )
    db.add(task)
    await db.flush()
    return task


async def _property(db, task, *, name="鏟子", deleted=False) -> TaskProperty:
    prop = TaskProperty(
        task_uuid=task.uuid,
        property_name=name,
        property_value="5",
        quantity=5,
        delete_at=T0 if deleted else None,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _claim(db, task) -> None:
    volunteer = User(name=f"志工-{uuid_mod.uuid4().hex[:6]}")
    db.add(volunteer)
    await db.flush()
    db.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=volunteer.uuid))
    await db.flush()


async def _pair(db, a, b, *, kind="ticket_task") -> DuplicatePair:
    low, high = sorted([a.uuid, b.uuid], key=str)
    pair = DuplicatePair(
        entity_kind=kind,
        low_uuid=low,
        high_uuid=high,
        similarity=Decimal("0.9"),
        evidence={"stub": True},
        method="fast_rule",
        engine_version="fast-v4",
        source_layer="fast",
        status="dup_ignored",
    )
    db.add(pair)
    await db.flush()
    return pair


async def _setup(db):
    """A (two needs, one with an item and a claim) and B (one need); a card between A.1 and B.1."""
    owner = User(name="開單者")
    db.add(owner)
    await db.flush()
    a = await _ticket(db, owner, title="A 一樓淹水")
    b = await _ticket(db, owner, title="B 一樓淹水", phone="0987654321")
    a1 = await _task(db, owner, a, quantity=2)
    a2 = await _task(db, owner, a, task_type="supply", name="飲用水", quantity=1)
    b1 = await _task(db, owner, b, quantity=5)
    await _property(db, a2, name="瓶裝水")
    await _claim(db, a1)
    pair = await _pair(db, a1, b1)
    return {"owner": owner, "a": a, "b": b, "a1": a1, "a2": a2, "b1": b1, "pair": pair}


def _by_uuid(tickets):
    return {t.uuid: t for t in tickets if t is not None}


async def test_a_need_card_carries_both_whole_tickets(db):
    """A need-to-need card shows each need's ticket in full: fields, contacts, every live need."""
    s = await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    tickets = _by_uuid(detail.tickets)
    a, b = tickets[str(s["a"].uuid)], tickets[str(s["b"].uuid)]
    assert (a.title, a.contact_phone, a.contact_email, a.disaster_types) == (
        "A 一樓淹水",
        "0912345678",
        "li@example.com",
        ("flood",),
    )
    assert b.contact_phone == "0987654321"
    assert (a.longitude, a.latitude) == pytest.approx((LON, LAT))
    assert {t.uuid for t in a.tasks} == {str(s["a1"].uuid), str(s["a2"].uuid)}
    assert [t.uuid for t in b.tasks] == [str(s["b1"].uuid)]


async def test_the_sides_follow_the_cards_low_and_high(db):
    """`tickets` is (low, high) in the card's order, so `primary: low` names the right ticket."""
    s = await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    owner_of = {str(s["a1"].uuid): str(s["a"].uuid), str(s["b1"].uuid): str(s["b"].uuid)}
    low, high = detail.tickets
    assert (low.uuid, high.uuid) == (owner_of[str(s["pair"].low_uuid)], owner_of[str(s["pair"].high_uuid)])


async def test_needs_carry_their_headcount_and_items(db):
    """Each need says how many are on it, whether recruiting was stopped, and its live items."""
    s = await _setup(db)
    gone = await _property(db, s["a2"], name="已刪的品項", deleted=True)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    a = _by_uuid(detail.tickets)[str(s["a"].uuid)]
    tasks = {t.uuid: t for t in a.tasks}
    a1, a2 = tasks[str(s["a1"].uuid)], tasks[str(s["a2"].uuid)]
    assert (a1.claim_count, a1.quantity, a1.recruiting_stopped, a1.properties) == (1, 2, False, ())
    assert (a2.claim_count, [p.property_name for p in a2.properties]) == (0, ["瓶裝水"])
    assert str(gone.uuid) not in {p.uuid for p in a2.properties}


async def test_deleted_needs_are_left_out(db):
    """A deleted need is not on the ticket a reviewer merges."""
    s = await _setup(db)
    deleted = await _task(db, s["owner"], s["a"], name="已刪的需求", deleted=True)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    assert str(deleted.uuid) not in {t.uuid for t in _by_uuid(detail.tickets)[str(s["a"].uuid)].tasks}


async def test_a_ticket_card_carries_its_two_tickets(db):
    """A ticket-to-ticket card's sides are the tickets themselves."""
    s = await _setup(db)
    pair = await _pair(db, s["a"], s["b"], kind="ticket")
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=pair.uuid)

    assert set(_by_uuid(detail.tickets)) == {str(s["a"].uuid), str(s["b"].uuid)}


async def test_a_station_card_has_no_tickets(db):
    """Stations are not resolved (ADR-376), so their cards carry none."""
    owner = User(name="站長")
    db.add(owner)
    await db.flush()
    stations = []
    for name in ("光復國小", "光復國小收容所"):
        station = Station(
            geometry=from_shape(Point(LON, LAT), srid=4326),
            name=name,
            type="shelter",
            level=0,
            operational_status="active",
            created_by=owner.uuid,
        )
        db.add(station)
        await db.flush()
        stations.append(station)
    pair = await _pair(db, *stations, kind="station")
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=pair.uuid)

    assert detail.tickets is None


async def test_a_cancelled_ticket_is_none(db):
    """A side whose ticket is cancelled shows nothing to merge."""
    s = await _setup(db)
    gone = await _ticket(db, s["owner"], title="已取消", cancelled=True)
    gone_task = await _task(db, s["owner"], gone)
    pair = await _pair(db, s["a1"], gone_task)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=pair.uuid)

    sides = dict(zip((str(pair.low_uuid), str(pair.high_uuid)), detail.tickets, strict=True))
    assert sides[str(gone_task.uuid)] is None
    assert sides[str(s["a1"].uuid)].uuid == str(s["a"].uuid)


async def test_both_sides_cancelled_gives_two_nones(db):
    """A card whose tickets are both gone has nothing to merge on either side."""
    owner = User(name="開單者")
    db.add(owner)
    await db.flush()
    gone = [await _ticket(db, owner, title=f"已取消 {n}", cancelled=True) for n in range(2)]
    tasks = [await _task(db, owner, ticket) for ticket in gone]
    pair = await _pair(db, *tasks)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=pair.uuid)

    assert detail.tickets == (None, None)


async def test_the_listing_stays_without_tickets(db):
    """ADR-372: only the detail loads whole tickets; a page of 200 cards does not."""
    await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    page = await dedup_review.list_pairs(db, actor=actor)

    assert not hasattr(page.items[0], "tickets")


# --- version (ADR-373) ------------------------------------------------------------------


async def _versions(db, s) -> dict[str, str]:
    """Each live ticket's version, read through the detail; ids come from `s["ids"]`, never ORM rows."""
    detail = await dedup_review.get_pair(db, actor=s["reviewer"], pair_uuid=s["ids"]["pair"])
    return {t.uuid: t.version for t in detail.tickets if t is not None}


async def _versioned(db):
    s = await _setup(db)
    s["reviewer"] = await _actor(db, Perm.AI_DUP_VIEW)
    s["ids"] = {key: s[key].uuid for key in ("pair", "a", "b", "a1", "a2", "owner")}
    return s


async def _change(db, ids, change: str) -> None:
    if change == "ticket_field":
        await db.execute(update(Tickets).where(Tickets.uuid == ids["a"]).values(title="A 二樓淹水"))
    elif change == "contact":
        await db.execute(update(Tickets).where(Tickets.uuid == ids["a"]).values(contact_phone="0900000000"))
    elif change == "need_field":
        await db.execute(update(TicketTask).where(TicketTask.uuid == ids["a1"]).values(quantity=3))
    elif change == "item_field":
        await db.execute(
            update(TaskProperty).where(TaskProperty.task_uuid == ids["a2"]).values(property_value="10")
        )
    elif change == "new_need":
        db.add(
            TicketTask(
                ticket_uuid=ids["a"], task_type="hr", task_name="新需求", quantity=1, created_by=ids["owner"]
            )
        )
    elif change == "new_item":
        db.add(TaskProperty(task_uuid=ids["a1"], property_name="新品項", property_value="1"))
    await db.flush()


@pytest.mark.parametrize(
    "change", ["ticket_field", "contact", "need_field", "item_field", "new_need", "new_item"]
)
async def test_the_version_moves_when_what_the_reviewer_compared_changes(db, change):
    """An edit to the ticket, a need or an item, or a new need or item, gives A a new version; B's stays."""
    s = await _versioned(db)
    before = await _versions(db, s)

    await _change(db, s["ids"], change)
    after = await _versions(db, s)

    a, b = str(s["ids"]["a"]), str(s["ids"]["b"])
    assert after[a] != before[a]
    assert after[b] == before[b]


async def test_a_claim_does_not_move_the_version(db):
    """A claim, and the fill it causes, are checked under the locks when resolving (ADR-373)."""
    s = await _versioned(db)
    before = await _versions(db, s)

    volunteer = User(name="志工")
    db.add(volunteer)
    await db.flush()
    db.add(TaskAssignment(task_uuid=s["ids"]["a1"], actor_uuid=volunteer.uuid))
    await db.execute(update(TicketTask).where(TicketTask.uuid == s["ids"]["a1"]).values(status="fulfilled"))
    await db.execute(update(Tickets).where(Tickets.uuid == s["ids"]["a"]).values(status="in_progress"))
    await db.flush()

    assert await _versions(db, s) == before


async def test_the_version_is_the_same_on_every_read(db):
    """Nothing changed, nothing moves: two reads agree."""
    s = await _versioned(db)

    assert await _versions(db, s) == await _versions(db, s)


# --- cost ---------------------------------------------------------------------------------


async def test_the_query_count_does_not_grow_with_needs_or_items(db):
    """Fixed queries per detail, however many needs and items the tickets have."""
    s = await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    few = await _count_queries(db, lambda: dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid))

    for n in range(5):
        need = await _task(db, s["owner"], s["a"], name=f"需求 {n}")
        await _property(db, need, name=f"品項 {n}")
        await _claim(db, need)
    many = await _count_queries(db, lambda: dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid))

    assert many == few
