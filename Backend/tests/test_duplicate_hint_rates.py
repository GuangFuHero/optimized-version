"""提示率 and 誤報率 for the back office (Spec 025 ADR-455).

The service, and its route `GET /admin/duplicate-hint-rates`.
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import duplicate_hint_rates
from tests.conftest import acting_as
from tests.test_dedup_review_api import _headers

pytestmark = pytest.mark.asyncio

URL = "/api/v1/admin/duplicate-hint-rates"
LON, LAT = 121.43, 23.67
# Taipei is UTC+8: 02:00 UTC is 10:00 the same Taipei day.
DAY1 = datetime(2026, 10, 30, 2, 0, tzinfo=UTC)
DAY2 = datetime(2026, 10, 31, 2, 0, tzinfo=UTC)
SINCE = datetime(2026, 10, 25, tzinfo=UTC)
UNTIL = datetime(2026, 11, 1, tzinfo=UTC)


async def _actor(db, *perms: Perm) -> User:
    """A user acting as a fresh platform role that holds `perms` at `all`."""
    user = User(name=f"viewer-{uuid_mod.uuid4().hex[:6]}")
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
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _user(db, name: str) -> User:
    user = User(name=name)
    db.add(user)
    await db.flush()
    return user


async def _task(db, owner: User, *, at: datetime) -> TicketTask:
    """A task on its own ticket, created at `at`."""
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title="一樓淹水",
        status="pending",
        priority="high",
        contact_name="李",
        created_by=owner.uuid,
    )
    db.add(ticket)
    await db.flush()
    task = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type="rescue",
        task_name="需要抽水機",
        status="pending",
        created_by=owner.uuid,
        created_at=at,
    )
    db.add(task)
    await db.flush()
    return task


async def _station(db, owner: User, *, at: datetime) -> Station:
    station = Station(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        name="光復國小收容所",
        type="shelter",
        level=0,
        operational_status="active",
        created_by=owner.uuid,
        created_at=at,
    )
    db.add(station)
    await db.flush()
    return station


def _hint(actor: User, old, *, at: datetime, kind="ticket_task", entry=None) -> DedupAuditEvent:
    """A `hint_shown` pointing at `old` (an entity or a bare uuid)."""
    return DedupAuditEvent(
        entity_kind=kind,
        event_type="hint_shown",
        primary_uuid=getattr(old, "uuid", old),
        actor_uuid=actor.uuid,
        source_layer="fast",
        decision_reason=entry,
        engine_version="fast-v4",
        created_at=at,
    )


async def _filed_anyway(db, actor: User, old, new, *, at: datetime, status: str, kind="ticket_task") -> None:
    """`new` filed after a hint on `old`: its card (in `status`) and its `ignored_by_submitter`."""
    old_uuid = getattr(old, "uuid", old)
    low, high = sorted([old_uuid, new.uuid], key=str)
    card = DuplicatePair(
        entity_kind=kind,
        low_uuid=low,
        high_uuid=high,
        method="fast_rule",
        engine_version="fast-v4",
        source_layer="fast",
        status=status,
        hint_outcome="ignored_hint",
    )
    db.add(card)
    await db.flush()
    db.add(
        DedupAuditEvent(
            entity_kind=kind,
            event_type="ignored_by_submitter",
            pair_uuid=card.uuid,
            primary_uuid=old_uuid,
            duplicate_uuid=new.uuid,
            actor_uuid=actor.uuid,
            source_layer="fast",
            decision_reason="ignored_hint",
            engine_version="fast-v4",
            created_at=at,
        )
    )
    await db.flush()


async def _scenarios(db) -> None:
    """Every case the counts must tell apart; the expected numbers are in the test below."""
    owner = await _user(db, "通報者")
    old = [uuid_mod.uuid4() for _ in range(5)]
    # Created with no hint: two submissions.
    await _task(db, owner, at=DAY1)
    await _task(db, owner, at=DAY2)
    # A hint, then nothing filed: counts as a right hint.
    walked_away = await _user(db, "看了就走")
    db.add(_hint(walked_away, old[0], at=DAY1))
    # A hint, an edit, the same hint again, then filed anyway; judged not a duplicate. One hint.
    edited = await _user(db, "改了又送")
    db.add_all([_hint(edited, old[1], at=DAY1), _hint(edited, old[1], at=DAY1 + timedelta(minutes=5))])
    new = await _task(db, edited, at=DAY1 + timedelta(minutes=6))
    await _filed_anyway(db, edited, old[1], new, at=DAY1 + timedelta(minutes=6), status="not_duplicate")
    # Filed anyway three times: judged a duplicate once, not reviewed twice.
    for i, status in enumerate(("confirmed_duplicate", "dup_ignored", "dup_ignored")):
        actor = await _user(db, f"照樣送出 {i}")
        db.add(_hint(actor, old[2 + i], at=DAY2))
        new = await _task(db, actor, at=DAY2 + timedelta(minutes=1))
        await _filed_anyway(db, actor, old[2 + i], new, at=DAY2 + timedelta(minutes=1), status=status)
    # A batch-import row hinted and left out.
    importer = await _user(db, "匯入的人")
    db.add(_hint(importer, old[0], at=DAY2, entry="bulk_import"))
    # Outside the window, and a slow-layer event: neither counts.
    db.add(_hint(walked_away, old[0], at=SINCE - timedelta(days=1)))
    await _task(db, owner, at=SINCE - timedelta(days=1))
    db.add(
        DedupAuditEvent(
            entity_kind="ticket_task",
            event_type="suggested",
            primary_uuid=old[0],
            source_layer="slow",
            created_at=DAY2,
        )
    )
    # Stations: one filed anyway after a hint and judged not a duplicate, one created with no hint.
    old_station = await _station(db, owner, at=SINCE - timedelta(days=30))
    station_actor = await _user(db, "站點負責人")
    db.add(_hint(station_actor, old_station, at=DAY2, kind="station"))
    new_station = await _station(db, station_actor, at=DAY2 + timedelta(minutes=1))
    await _filed_anyway(
        db,
        station_actor,
        old_station,
        new_station,
        at=DAY2 + timedelta(minutes=1),
        status="not_duplicate",
        kind="station",
    )
    await _station(db, owner, at=DAY2)
    await db.flush()


async def test_counts_and_rates(db_session):
    """Each case lands in the right count, and the rates follow from the counts."""
    await _scenarios(db_session)
    viewer = await _actor(db_session, Perm.AI_DUP_VIEW)

    by_kind = {
        m.entity_kind: m
        for m in await duplicate_hint_rates.duplicate_hint_rates(
            db_session, actor=viewer, since=SINCE, until=UNTIL
        )
    }

    task = by_kind["ticket_task"]
    assert (task.submissions, task.hinted, task.overridden, task.reviewed, task.judged_not_duplicate) == (
        8,
        6,
        4,
        2,
        1,
    )
    assert task.hint_rate == pytest.approx(6 / 8)
    assert task.false_alarm_rate_without_auditors == pytest.approx(4 / 6)
    assert task.false_alarm_rate_with_auditors == pytest.approx(4 * (1 / 2) / 6)
    assert task.review_coverage == pytest.approx(2 / 4)
    station = by_kind["station"]
    assert (station.submissions, station.hinted, station.overridden, station.reviewed) == (2, 1, 1, 1)
    assert station.false_alarm_rate_with_auditors == pytest.approx(1.0)


async def test_nothing_counted_gives_null_rates(db_session):
    """Both kinds are listed; with nothing to divide by, a rate is null, not 0."""
    viewer = await _actor(db_session, Perm.AI_DUP_VIEW)

    metrics = await duplicate_hint_rates.duplicate_hint_rates(
        db_session, actor=viewer, since=SINCE, until=UNTIL
    )

    assert [m.entity_kind for m in metrics] == ["ticket_task", "station"]
    for m in metrics:
        assert (m.submissions, m.hinted) == (0, 0)
        assert m.hint_rate is None
        assert m.false_alarm_rate_without_auditors is None
        assert m.false_alarm_rate_with_auditors is None
        assert m.review_coverage is None


async def test_needs_view_permission(db_session):
    """Without ai_duplicate.view the rates are refused."""
    nobody = await _actor(db_session)

    with pytest.raises(HTTPException) as refused:
        await duplicate_hint_rates.duplicate_hint_rates(db_session, actor=nobody, since=SINCE, until=UNTIL)
    assert refused.value.status_code == 403


@pytest.mark.parametrize(
    ("since", "until"),
    [(UNTIL, SINCE), (SINCE, SINCE), (SINCE.replace(tzinfo=None), UNTIL)],
)
async def test_bad_window_is_refused(db_session, since, until):
    """A backwards, empty or time-zone-less window is refused."""
    viewer = await _actor(db_session, Perm.AI_DUP_VIEW)

    with pytest.raises(ValueError):
        await duplicate_hint_rates.duplicate_hint_rates(db_session, actor=viewer, since=since, until=until)


@pytest.mark.parametrize("role_name", ["super_admin", "data_auditor"])
async def test_the_seeded_reviewers_read_the_rates(client, db_session, redis, role_name):
    """The roles that read the review queue read the rates too."""
    headers = await _headers(db_session, redis, role_name)

    response = await client.get(URL, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["entity_kind"] for item in body["items"]] == ["ticket_task", "station"]
    assert body["items"][0]["hint_rate"] is None


async def test_window_comes_through_and_a_bad_one_is_unprocessable(client, db_session, redis):
    """The window in the query reaches the service; a backwards one is a 422."""
    headers = await _headers(db_session, redis, "data_auditor")

    ok = await client.get(
        URL,
        headers=headers,
        params={"since": "2026-10-25T00:00:00+08:00", "until": "2026-11-01T00:00:00+08:00"},
    )
    backwards = await client.get(
        URL,
        headers=headers,
        params={"since": "2026-11-01T00:00:00+08:00", "until": "2026-10-25T00:00:00+08:00"},
    )

    assert ok.status_code == 200, ok.text
    assert datetime.fromisoformat(ok.json()["since"]) == datetime(2026, 10, 24, 16, tzinfo=UTC)
    assert backwards.status_code == 422
