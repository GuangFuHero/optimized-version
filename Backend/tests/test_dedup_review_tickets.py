"""The two whole tickets behind a pair card (Spec 028 §2, ADR-373/374): the service layer.

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
from app.models.photo import Photo
from app.models.property_config import TaskPropertyConfig
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_disaster_detail import TicketDisasterDetail
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
    """Stations are not resolved (ADR-377), so their cards carry none."""
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
    """ADR-373: only the detail loads whole tickets; a page of 200 cards does not."""
    await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    page = await dedup_review.list_pairs(db, actor=actor)

    assert not hasattr(page.items[0], "tickets")


# --- version (ADR-374) ------------------------------------------------------------------


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
    elif change == "location":
        db.add(SecondaryLocation(geometry_uuid=ids["a"], location_type="address", full_address="中正路45號"))
    await db.flush()


@pytest.mark.parametrize(
    "change", ["ticket_field", "contact", "need_field", "item_field", "new_need", "new_item", "location"]
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
    """A claim, and the fill it causes, are checked under the locks when resolving (ADR-374)."""
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
        await _config(db, "hr", f"品項 {n}", f"品項 {n} 的名稱")
        await _claim(db, need)
    many = await _count_queries(db, lambda: dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid))

    assert many == few


# --- photos and disaster answers (ADR-384, 385) -------------------------------------------


async def _photo(db, ticket, owner, url="https://example.com/a.jpg", *, deleted=False) -> Photo:
    photo = Photo(
        ref_uuid=ticket.uuid,
        ref_type="geometry",
        url=url,
        created_by=owner.uuid,
        delete_at=T0 if deleted else None,
    )
    db.add(photo)
    await db.flush()
    return photo


async def _answer(db, ticket, name: str, value: str) -> None:
    db.add(TicketDisasterDetail(ticket_uuid=ticket.uuid, property_name=name, value=value))
    await db.flush()


async def test_the_detail_carries_each_tickets_photos_and_answers(db):
    """The reviewer sees what would otherwise vanish with the other ticket."""
    s = await _setup(db)
    kept = await _photo(db, s["b"], s["owner"], "https://example.com/b.jpg")
    await _photo(db, s["b"], s["owner"], "https://example.com/gone.jpg", deleted=True)
    await _answer(db, s["b"], "utility_hazards", "gas")
    await _answer(db, s["b"], "utility_hazards", "water")
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    b = _by_uuid(detail.tickets)[str(s["b"].uuid)]
    assert [(p.uuid, p.url) for p in b.photos] == [(str(kept.uuid), "https://example.com/b.jpg")]
    assert b.disaster_details == {"utility_hazards": ("gas", "water")}
    a = _by_uuid(detail.tickets)[str(s["a"].uuid)]
    assert (a.photos, a.disaster_details) == ((), {})


@pytest.mark.parametrize("change", ["new_photo", "new_answer"])
async def test_the_version_moves_with_photos_and_answers(db, change):
    """A photo or an answer added meanwhile sends the reviewer back (ADR-374)."""
    s = await _versioned(db)
    before = await _versions(db, s)

    a = await db.get(Tickets, s["ids"]["a"])
    if change == "new_photo":
        await _photo(db, a, s["owner"])
    else:
        await _answer(db, a, "power_outage", "yes")

    assert (await _versions(db, s))[str(s["ids"]["a"])] != before[str(s["ids"]["a"])]


async def test_a_soft_deleted_answer_is_left_out(db):
    """As every other reader of ticket_disaster_details does."""
    s = await _setup(db)
    db.add(
        TicketDisasterDetail(ticket_uuid=s["b"].uuid, property_name="power_outage", value="yes", delete_at=T0)
    )
    await _answer(db, s["b"], "utility_hazards", "gas")
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    assert _by_uuid(detail.tickets)[str(s["b"].uuid)].disaster_details == {"utility_hazards": ("gas",)}


# --- where the ticket is (ADR-440) ---------------------------------------------------------


async def _location(db, ticket, **values) -> SecondaryLocation:
    location = SecondaryLocation(geometry_uuid=ticket.uuid, **{"location_type": "address", **values})
    db.add(location)
    await db.flush()
    return location


async def test_the_detail_carries_where_each_ticket_is(db):
    """The address the reviewer picks the ticket to keep by, down to the room; a pole by its id."""
    s = await _setup(db)
    await _location(
        db,
        s["a"],
        full_address="花蓮縣光復鄉中正路45號",
        building_section="A棟",
        floor="2F",
        room="201",
        landmark_note="紅色鐵門",
    )
    await _location(db, s["b"], location_type="pole", pole_id="光復幹123")
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    tickets = _by_uuid(detail.tickets)
    a, b = tickets[str(s["a"].uuid)].location, tickets[str(s["b"].uuid)].location
    assert (a.location_type, a.full_address, a.building_section, a.floor, a.room, a.pole_id) == (
        "address",
        "花蓮縣光復鄉中正路45號",
        "A棟",
        "2F",
        "201",
        None,
    )
    assert (b.location_type, b.full_address, b.pole_id) == ("pole", None, "光復幹123")
    assert not hasattr(a, "landmark_note")


async def test_a_ticket_without_a_location_has_none(db):
    """No address and no pole: `location` is None, not an empty place."""
    s = await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    assert [t.location for t in detail.tickets] == [None, None]


async def test_free_text_about_the_place_does_not_move_the_version(db):
    """Only what the detail shows goes into the version: a landmark note is not compared."""
    s = await _versioned(db)
    location = await _location(db, await db.get(Tickets, s["ids"]["a"]), full_address="光復鄉中正路45號")
    before = await _versions(db, s)

    await db.execute(
        update(SecondaryLocation)
        .where(SecondaryLocation.uuid == location.uuid)
        .values(landmark_note="紅色鐵門")
    )
    await db.flush()

    assert await _versions(db, s) == before


async def test_the_location_costs_one_query_however_many_tickets(db):
    """Still a fixed number of queries per detail with both sides located (ADR-373)."""
    s = await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    def read():
        return dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    bare = await _count_queries(db, read)
    await _location(db, s["a"], full_address="光復鄉中正路45號")
    await _location(db, s["b"], full_address="光復鄉中正路47號")
    located = await _count_queries(db, read)

    assert located == bare


# --- who is on each need, as a per-card key (ADR-445) -------------------------------------


async def _volunteer(db, name="志工") -> User:
    person = User(name=name)
    db.add(person)
    await db.flush()
    return person


async def test_one_person_on_both_sides_has_the_same_key(db):
    """The page can count a fold: a person on A.1 and B.1 shows the same key on both."""
    s = await _setup(db)
    both, only_b = await _volunteer(db, "兩邊都接"), await _volunteer(db, "只接 B")
    for task in (s["a1"], s["b1"]):
        db.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=both.uuid))
    db.add(TaskAssignment(task_uuid=s["b1"].uuid, actor_uuid=only_b.uuid))
    await db.flush()
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    tickets = _by_uuid(detail.tickets)
    a1 = {t.uuid: t for t in tickets[str(s["a"].uuid)].tasks}[str(s["a1"].uuid)]
    b1 = {t.uuid: t for t in tickets[str(s["b"].uuid)].tasks}[str(s["b1"].uuid)]
    assert (len(a1.claimant_keys), a1.claim_count) == (2, 2)
    assert (len(b1.claimant_keys), b1.claim_count) == (2, 2)
    assert len(set(a1.claimant_keys) & set(b1.claimant_keys)) == 1
    assert len(set(a1.claimant_keys) | set(b1.claimant_keys)) == 3


async def test_a_need_nobody_is_on_has_no_keys(db):
    """No claims, no keys."""
    s = await _setup(db)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    a2 = {t.uuid: t for t in _by_uuid(detail.tickets)[str(s["a"].uuid)].tasks}[str(s["a2"].uuid)]
    assert a2.claimant_keys == ()


async def test_the_same_person_has_another_key_on_another_card(db):
    """Keys only line up within one card: they neither name the person nor link cards."""
    s = await _setup(db)
    person = await _volunteer(db)
    db.add(TaskAssignment(task_uuid=s["b1"].uuid, actor_uuid=person.uuid))
    c = await _ticket(db, s["owner"], title="C 一樓淹水")
    c1 = await _task(db, s["owner"], c)
    other = await _pair(db, s["b1"], c1)
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    def b1_keys(detail):
        b = _by_uuid(detail.tickets)[str(s["b"].uuid)]
        return {t.uuid: t for t in b.tasks}[str(s["b1"].uuid)].claimant_keys

    here = b1_keys(await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid))
    there = b1_keys(await dedup_review.get_pair(db, actor=actor, pair_uuid=other.uuid))

    assert here and there and not set(here) & set(there)
    assert all(str(person.uuid) not in key and person.uuid.hex not in key for key in here)


# --- an item's label (ADR-446) ------------------------------------------------------------


async def test_items_carry_their_label(db):
    """The label set for the item's need type, else the key, as taskPropertyConfigs gives it (ADR-095)."""
    s = await _setup(db)
    await _property(db, s["a2"], name="no_config")
    await _property(db, s["a2"], name="blank_label")
    db.add_all(
        [
            TaskPropertyConfig(
                task_type="supply", property_name="瓶裝水", data_type="number", label="瓶裝水（箱）"
            ),
            TaskPropertyConfig(task_type="supply", property_name="blank_label", data_type="text", label=None),
            # Same key under another need type: not this item's label.
            TaskPropertyConfig(task_type="hr", property_name="no_config", data_type="text", label="別的類型"),
        ]
    )
    await db.flush()
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=s["pair"].uuid)

    a2 = {t.uuid: t for t in _by_uuid(detail.tickets)[str(s["a"].uuid)].tasks}[str(s["a2"].uuid)]
    assert {p.property_name: p.display_label for p in a2.properties} == {
        "瓶裝水": "瓶裝水（箱）",
        "no_config": "no_config",
        "blank_label": "blank_label",
    }


async def _config(db, task_type: str, name: str, label: str | None, *, order=0, active=True):
    config = TaskPropertyConfig(
        task_type=task_type,
        property_name=name,
        data_type="number",
        label=label,
        sort_order=order,
        is_active=active,
    )
    db.add(config)
    await db.flush()
    return config


async def test_each_item_carries_its_configured_label(db):
    """The label and order for the need's type and the item's key, inactive or not (ADR-446, ADR-447).

    Without a setting the label is the key and the order is null.
    """
    s = await _versioned(db)
    await _property(db, s["a1"], name="鏟子")
    await _property(db, s["b1"], name="手套")
    await _config(db, "supply", "瓶裝水", "瓶裝飲用水", order=2)
    await _config(db, "hr", "鏟子", "鏟子（支）", order=5, active=False)
    await _config(db, "hr", "瓶裝水", "另一種需求的名稱", order=9)

    detail = await dedup_review.get_pair(db, actor=s["reviewer"], pair_uuid=s["ids"]["pair"])

    labels = {
        prop.property_name: (prop.display_label, prop.sort_order)
        for ticket in detail.tickets
        for task in ticket.tasks
        for prop in task.properties
    }
    assert labels == {"瓶裝水": ("瓶裝飲用水", 2), "鏟子": ("鏟子（支）", 5), "手套": ("手套", None)}


async def test_renaming_or_reordering_an_item_does_not_move_the_version(db):
    """A label and order are configuration, not the ticket (ADR-446, ADR-447).

    Changing them does not send the reviewer back.
    """
    s = await _versioned(db)
    config = await _config(db, "supply", "瓶裝水", "瓶裝飲用水")
    before = await _versions(db, s)

    await db.execute(
        update(TaskPropertyConfig)
        .where(TaskPropertyConfig.uuid == config.uuid)
        .values(label="水", sort_order=7)
    )
    await db.flush()

    assert await _versions(db, s) == before


# --- how an item is shown and edited (ADR-447) -----------------------------------------------


async def test_each_item_carries_how_it_is_shown_and_edited(db):
    """Type, options, unit and whether the setting is in use, from the same setting (ADR-447).

    Without a setting all four are null, so the page treats the item as plain text.
    """
    s = await _versioned(db)
    await _property(db, s["a1"], name="鏟子")
    await _property(db, s["b1"], name="手套")
    db.add_all(
        [
            TaskPropertyConfig(
                task_type="supply", property_name="瓶裝水", data_type="number", unit="箱", label="水"
            ),
            TaskPropertyConfig(
                task_type="hr",
                property_name="鏟子",
                data_type="single_select",
                enum_options=["平頭", "尖頭"],
                is_active=False,
            ),
        ]
    )
    await db.flush()

    detail = await dedup_review.get_pair(db, actor=s["reviewer"], pair_uuid=s["ids"]["pair"])

    items = {
        prop.property_name: (prop.data_type, prop.enum_options, prop.unit, prop.is_active)
        for ticket in detail.tickets
        for task in ticket.tasks
        for prop in task.properties
    }
    assert items == {
        "瓶裝水": ("number", None, "箱", True),
        "鏟子": ("single_select", ("平頭", "尖頭"), None, False),
        "手套": (None, None, None, None),
    }


async def test_changing_how_an_item_is_shown_does_not_move_the_version(db):
    """Type, options, unit and in-use are configuration, not the ticket (ADR-447)."""
    s = await _versioned(db)
    config = await _config(db, "supply", "瓶裝水", "瓶裝飲用水")
    before = await _versions(db, s)

    await db.execute(
        update(TaskPropertyConfig)
        .where(TaskPropertyConfig.uuid == config.uuid)
        .values(data_type="single_select", enum_options=["1", "2"], unit="箱", is_active=False)
    )
    await db.flush()

    assert await _versions(db, s) == before
