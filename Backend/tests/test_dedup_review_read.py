"""Reading the AI 重複審核 queue (Spec 025 §2.1–2.2, ADR-339/340): the service layer.

The REST layer on top is tested in test_dedup_review_api.py.
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import event, select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import dedup_review
from app.services.dedup_review import DuplicatePairNotFoundError
from tests.conftest import acting_as

pytestmark = pytest.mark.asyncio

LON, LAT = 121.43, 23.67
T0 = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)


async def _actor(db, *perms: Perm) -> User:
    """A user acting as a fresh platform role that holds `perms` at `all`."""
    user = User(name=f"reviewer-{uuid_mod.uuid4().hex[:6]}")
    role = Role(name=f"role-{user.name}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    for perm in perms:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, role_kind="platform"))
    await db.flush()
    return acting_as(user, role)


async def _ticket(db, owner, *, title="一樓淹水", lon=LON, lat=LAT) -> Tickets:
    ticket = Tickets(
        geometry=from_shape(Point(lon, lat), srid=4326),
        title=title,
        status="pending",
        priority="high",
        contact_name="李",
        created_by=owner.uuid,
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _task(db, owner, ticket, *, name="需要抽水機", deleted=False) -> TicketTask:
    task = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type="rescue",
        task_name=name,
        status="pending",
        created_by=owner.uuid,
        delete_at=T0 if deleted else None,
    )
    db.add(task)
    await db.flush()
    return task


async def _station(db, owner, *, name="光復國小收容所", lon=LON, lat=LAT) -> Station:
    station = Station(
        geometry=from_shape(Point(lon, lat), srid=4326),
        name=name,
        type="shelter",
        level=0,
        operational_status="active",
        created_by=owner.uuid,
    )
    db.add(station)
    await db.flush()
    return station


async def _pair(
    db,
    a,
    b,
    *,
    kind="ticket_task",
    status="dup_ignored",
    similarity="0.9100",
    layer="fast",
    created_at=T0,
    deleted=False,
) -> DuplicatePair:
    low, high = sorted([a.uuid, b.uuid], key=str)
    pair = DuplicatePair(
        entity_kind=kind,
        low_uuid=low,
        high_uuid=high,
        similarity=None if similarity is None else Decimal(similarity),
        evidence={"stub": True},
        method="fast_rule",
        engine_version="fast-v4",
        source_layer=layer,
        status=status,
        created_at=created_at,
        delete_at=T0 if deleted else None,
    )
    db.add(pair)
    await db.flush()
    return pair


async def _two_tasks(db, owner, *, deleted_second=False):
    ticket = await _ticket(db, owner)
    other = await _ticket(db, owner, title="二樓淹水")
    return await _task(db, owner, ticket), await _task(db, owner, other, deleted=deleted_second)


# --- permission ------------------------------------------------------------------------


async def test_listing_needs_ai_duplicate_view(db):
    """Without ai_duplicate.view the queue is refused."""
    actor = await _actor(db, Perm.TICKET_VIEW)
    with pytest.raises(HTTPException) as caught:
        await dedup_review.list_pairs(db, actor=actor)
    assert caught.value.status_code == 403


async def test_reading_one_card_needs_ai_duplicate_view(db):
    """Reading one card takes the same capability as the list."""
    owner = await _actor(db, Perm.AI_DUP_VIEW)
    a, b = await _two_tasks(db, owner)
    pair = await _pair(db, a, b)
    stranger = await _actor(db, Perm.TICKET_VIEW)
    with pytest.raises(HTTPException) as caught:
        await dedup_review.get_pair(db, actor=stranger, pair_uuid=pair.uuid)
    assert caught.value.status_code == 403


# --- what the default list holds (ADR-339) ------------------------------------------------


async def test_default_lists_pending_cards_only(db):
    """dup_ignored and suggested are pending; decided and soft-deleted cards are not listed."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    pending = []
    for status in ("dup_ignored", "suggested"):
        a, b = await _two_tasks(db, actor)
        pending.append(await _pair(db, a, b, status=status))
    for status in ("confirmed", "rejected"):
        a, b = await _two_tasks(db, actor)
        await _pair(db, a, b, status=status)
    a, b = await _two_tasks(db, actor)
    await _pair(db, a, b, deleted=True)

    page = await dedup_review.list_pairs(db, actor=actor)

    assert {item.pair.uuid for item in page.items} == {p.uuid for p in pending}
    assert page.total == 2


async def test_status_filter_reaches_decided_cards(db):
    """Asking for confirmed returns only those, not the pending ones."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    a, b = await _two_tasks(db, actor)
    confirmed = await _pair(db, a, b, status="confirmed")
    a, b = await _two_tasks(db, actor)
    await _pair(db, a, b)

    page = await dedup_review.list_pairs(db, actor=actor, statuses=["confirmed"])

    assert [item.pair.uuid for item in page.items] == [confirmed.uuid]


async def test_entity_kind_and_source_layer_filters(db):
    """Each filter narrows to the cards of that kind or layer."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    a, b = await _two_tasks(db, actor)
    task_pair = await _pair(db, a, b)
    s1, s2 = await _station(db, actor), await _station(db, actor, name="光復國中")
    station_pair = await _pair(db, s1, s2, kind="station", layer="slow")

    by_kind = await dedup_review.list_pairs(db, actor=actor, entity_kinds=["station"])
    by_layer = await dedup_review.list_pairs(db, actor=actor, source_layers=["fast"])

    assert [item.pair.uuid for item in by_kind.items] == [station_pair.uuid]
    assert [item.pair.uuid for item in by_layer.items] == [task_pair.uuid]


# --- order and pages ---------------------------------------------------------------------


async def _three_scored(db, actor):
    """Cards scored 0.70, none and 0.95, created one hour apart in that order."""
    cards = []
    for hours, score in enumerate(("0.7000", None, "0.9500")):
        a, b = await _two_tasks(db, actor)
        cards.append(await _pair(db, a, b, similarity=score, created_at=T0 + timedelta(hours=hours)))
    return cards


async def test_newest_first_by_default(db):
    """The default order is the card's creation time, newest first."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    low, unscored, high = await _three_scored(db, actor)

    page = await dedup_review.list_pairs(db, actor=actor)

    assert [item.pair.uuid for item in page.items] == [high.uuid, unscored.uuid, low.uuid]


@pytest.mark.parametrize(("sort", "expected"), [("-similarity", [2, 0, 1]), ("similarity", [0, 2, 1])])
async def test_similarity_sort_puts_unscored_cards_last(db, sort, expected):
    """A card with no score sorts last both ways."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    cards = await _three_scored(db, actor)

    page = await dedup_review.list_pairs(db, actor=actor, sort=sort)

    assert [item.pair.uuid for item in page.items] == [cards[i].uuid for i in expected]


async def test_pages_keep_the_total(db):
    """`total` counts every match, not just the page."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    _low, unscored, _high = await _three_scored(db, actor)

    page = await dedup_review.list_pairs(db, actor=actor, skip=1, limit=1)

    assert [item.pair.uuid for item in page.items] == [unscored.uuid]
    assert page.total == 3


@pytest.mark.parametrize(
    "kwargs",
    [
        {"limit": dedup_review.MAX_LIMIT + 1},
        {"limit": 0},
        {"skip": -1},
        {"sort": "status"},
        {"statuses": ["pending"]},
        {"entity_kinds": ["route"]},
        {"source_layers": ["ai"]},
    ],
)
async def test_bad_arguments_are_refused(db, kwargs):
    """Out-of-range pages and unknown values raise instead of being ignored."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    with pytest.raises(ValueError):
        await dedup_review.list_pairs(db, actor=actor, **kwargs)


# --- the two sides (ADR-340) -------------------------------------------------------------


async def test_task_cards_carry_both_sides(db):
    """A task side carries its own fields and its ticket's title and point."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    ticket = await _ticket(db, actor, title="一樓淹水", lon=121.5, lat=23.5)
    a = await _task(db, actor, ticket, name="需要抽水機")
    b = await _task(db, actor, await _ticket(db, actor), name="抽水")
    pair = await _pair(db, a, b)

    (item,) = (await dedup_review.list_pairs(db, actor=actor)).items

    side = item.low if pair.low_uuid == a.uuid else item.high
    assert side.uuid == str(a.uuid)
    assert not side.deleted
    assert (side.title, side.type, side.status) == ("需要抽水機", "rescue", "pending")
    assert (side.ticket_uuid, side.ticket_title) == (str(ticket.uuid), "一樓淹水")
    assert (side.longitude, side.latitude) == pytest.approx((121.5, 23.5))
    assert side.created_by == str(actor.uuid)


async def test_station_cards_carry_both_sides(db):
    """A station side carries its name, type, operational status and point."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    s1 = await _station(db, actor, name="光復國小收容所", lon=121.4, lat=23.6)
    s2 = await _station(db, actor, name="光復國中")
    pair = await _pair(db, s1, s2, kind="station")

    (item,) = (await dedup_review.list_pairs(db, actor=actor)).items

    side = item.low if pair.low_uuid == s1.uuid else item.high
    assert (side.title, side.type, side.status) == ("光復國小收容所", "shelter", "active")
    assert side.ticket_uuid is None
    assert (side.longitude, side.latitude) == pytest.approx((121.4, 23.6))


async def test_a_deleted_side_is_marked_and_the_card_still_listed(db):
    """The reviewer can still judge a card whose side was deleted."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    a, b = await _two_tasks(db, actor, deleted_second=True)
    pair = await _pair(db, a, b)

    (item,) = (await dedup_review.list_pairs(db, actor=actor)).items

    gone = item.low if pair.low_uuid == b.uuid else item.high
    kept = item.high if gone is item.low else item.low
    assert gone.deleted and gone.uuid == str(b.uuid) and gone.title is None
    assert not kept.deleted


async def _count_queries(db, call) -> int:
    count = Mock()
    engine = db.bind.sync_engine
    event.listen(engine, "before_cursor_execute", count)
    try:
        await call()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return count.call_count


async def test_the_sides_cost_one_query_per_kind_not_per_card(db):
    """Five times the cards, the same number of queries."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)

    async def add_cards(n):
        for _ in range(n):
            a, b = await _two_tasks(db, actor)
            await _pair(db, a, b)
            s1, s2 = await _station(db, actor), await _station(db, actor)
            await _pair(db, s1, s2, kind="station")

    await add_cards(1)
    few = await _count_queries(db, lambda: dedup_review.list_pairs(db, actor=actor))
    await add_cards(4)
    many = await _count_queries(db, lambda: dedup_review.list_pairs(db, actor=actor))

    assert many == few


# --- one card ----------------------------------------------------------------------------


async def test_one_card_comes_with_its_events_in_order(db):
    """The detail lists the card's events oldest first."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    a, b = await _two_tasks(db, actor)
    pair = await _pair(db, a, b)
    for minutes, kind in ((5, "ignored_by_submitter"), (0, "hint_shown")):
        db.add(
            DedupAuditEvent(
                entity_kind="ticket_task",
                event_type=kind,
                pair_uuid=pair.uuid,
                source_layer="fast",
                created_at=T0 + timedelta(minutes=minutes),
            )
        )
    await db.flush()

    detail = await dedup_review.get_pair(db, actor=actor, pair_uuid=pair.uuid)

    assert detail.item.pair.uuid == pair.uuid
    assert detail.item.low.uuid == str(pair.low_uuid)
    assert [e.event_type for e in detail.events] == ["hint_shown", "ignored_by_submitter"]


@pytest.mark.parametrize("deleted", [False, True], ids=["unknown", "soft-deleted"])
async def test_a_missing_card_is_not_found(db, deleted):
    """An unknown or soft-deleted card is not found."""
    actor = await _actor(db, Perm.AI_DUP_VIEW)
    target = uuid_mod.uuid4()
    if deleted:
        a, b = await _two_tasks(db, actor)
        target = (await _pair(db, a, b, deleted=True)).uuid
    with pytest.raises(DuplicatePairNotFoundError):
        await dedup_review.get_pair(db, actor=actor, pair_uuid=target)
