"""A bulk import asks the fast dedup layer about every row it would create (ADR-398).

A stub engine decides what is suspected, so these test the import's side: which rows are asked
about, what the preview shows, and what a commit does with each row's decision. The tests at
the end run the real engine.
"""

import base64
import os
import uuid as uuid_mod

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.core.tabular import read_table, write_csv
from app.dedup_engine import registry
from app.dedup_engine.contract import NewStation, NewTicket, Suspect, task_ref
from app.dedup_engine.fast import FastEngine
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import ticket as ticket_service
from app.services.bulk_import import commit_stations, commit_tickets, preview_stations, preview_tickets
from app.services.notification_service import NotificationService
from tests.conftest import acting_as
from tests.dedup_helpers import AsyncStubEngine

LON, LAT = 121.4235, 23.6725
STATION_HEADERS = ("uuid", "name", "type", "comment", "latitude", "longitude", "address")


@pytest.fixture
def engine(monkeypatch) -> AsyncStubEngine:
    """Suspects nothing unless a test says so."""
    stub = AsyncStubEngine()
    monkeypatch.setattr(registry, "_ENGINE", stub)
    return stub


@pytest.fixture(autouse=True)
def notifications(monkeypatch):
    """Record notices instead of sending them."""
    sent = []

    async def record(db_, **kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(NotificationService, "dispatch", record)
    return sent


async def _importer(db, *perms: Perm) -> User:
    """A committed user acting as one platform role holding `perms` at scope `all`."""
    user = User(name="匯入的人")
    role = Role(name=f"bulk-dedup-{uuid_mod.uuid4().hex[:8]}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    for perm in perms:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, role_kind="platform"))
    acting_as(user, role)  # before the commit expires `role`
    await db.commit()
    await db.refresh(user)
    return user


async def _station_importer(db) -> User:
    """Everything a station import needs (ADR-110/111)."""
    return await _importer(
        db, Perm.STATION_IMPORT, Perm.STATION_ADD, Perm.STATION_EDIT, Perm.STATION_CONTRIBUTE
    )


async def _existing_station(db, actor: User, name: str, *, lon=LON, lat=LAT) -> str:
    station = Station(
        geometry=from_shape(Point(lon, lat), srid=4326),
        name=name,
        type="shelter",
        level=0,
        operational_status="active",
        created_by=actor.uuid,
    )
    db.add(station)
    await db.flush()
    uuid = str(station.uuid)
    await db.commit()
    await db.refresh(actor)
    return uuid


def _station_row(name: str, *, lon=LON, lat=LAT) -> dict:
    return {
        "uuid": "",
        "name": name,
        "type": "shelter",
        "comment": "",
        "latitude": str(lat),
        "longitude": str(lon),
        "address": "花蓮縣光復鄉中山路三段10號",
    }


def _stations(rows) -> tuple[bytes, str]:
    return write_csv(STATION_HEADERS, rows), "stations.csv"


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


def _suspect_stations_named(name: str, *, related: str):
    """A stub `check` that suspects the station draft called `name` of being `related`."""

    def suspects(submission):
        if isinstance(submission, NewStation) and submission.station.name == name:
            return [Suspect("station", "station", related, 0.93, {})]
        return []

    return suspects


# --- station preview -----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_preview_names_the_station_a_new_row_looks_like(db, engine):
    """Not counted to create; the preview says what it looks like and how far away it is."""
    actor = await _station_importer(db)
    school = await _existing_station(db, actor, "光復國小")
    engine.suspects = _suspect_stations_named("光復國民小學", related=school)
    # 0.0005° of longitude at 23.67° N is 51 m.
    raw, filename = _stations([_station_row("光復國民小學", lon=LON + 0.0005), _station_row("大進國小")])

    preview = await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert [
        (s.line, s.related_kind, s.related_uuid, s.title, s.task_name, s.type, s.status, s.distance_m)
        for s in preview.suspects
    ] == [(2, "station", school, "光復國小", None, "shelter", "active", 51)]
    assert preview.suspects[0].created_at is not None
    assert (preview.to_create, preview.suspected, preview.dedup_checked) == (1, 1, True)


@pytest.mark.asyncio
async def test_a_preview_asks_only_about_rows_it_would_create_and_records_nothing(db, engine):
    """An update is the same station (ADR-106); the hint is recorded at commit, not here."""
    actor = await _station_importer(db)
    imported = _station_row("光復國小")
    await commit_stations(
        db, actor=actor, raw=_stations([imported])[0], filename="s.csv", station_type="shelter"
    )
    await db.refresh(actor)
    engine.check_calls.clear()
    engine.suspects = lambda submission: [Suspect("station", "station", str(uuid_mod.uuid4()), 0.9, {})]
    raw, filename = _stations([imported, _station_row("大進國小")])

    preview = await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert [call.station.name for call in engine.check_calls] == ["大進國小"]
    assert (preview.to_update, preview.to_create, preview.suspected) == (1, 0, 1)
    assert await _count(db, DedupAuditEvent) == 0


@pytest.mark.asyncio
async def test_after_the_engine_fails_once_it_is_not_asked_again(db, engine):
    """Each call may wait out the 2-second limit, so 500 of them would stretch a commit past 15 minutes.

    The rows land fail-open as before; one filed anyway is still carded, unscored, as for a single
    create whose check failed (ADR-313).
    """
    actor = await _station_importer(db)
    school = await _existing_station(db, actor, "光復國小")
    engine.fail = True
    raw, filename = _stations([_station_row("大進國小"), _station_row("光復國民小學")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter", decisions={3: school}
    )

    assert len(engine.check_calls) == 1
    assert (outcome.created, outcome.suspected, outcome.dedup_checked) == (2, 0, False)
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert (school in {str(pair.low_uuid), str(pair.high_uuid)}, pair.similarity) == (True, None)


@pytest.mark.asyncio
async def test_a_preview_for_someone_who_may_not_add_stations_does_not_ask(db, engine):
    """Their new rows fail at commit anyway; the preview says nothing was compared."""
    actor = await _importer(db, Perm.STATION_IMPORT, Perm.STATION_EDIT)
    raw, filename = _stations([_station_row("大進國小")])

    preview = await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert engine.check_calls == []
    assert preview.dedup_checked is False


@pytest.mark.asyncio
async def test_a_preview_says_so_when_the_engine_fails(db, engine):
    """Fail-open, as for a single create, but not read as "nothing looks like a duplicate"."""
    actor = await _station_importer(db)
    engine.fail = True
    raw, filename = _stations([_station_row("大進國小")])

    preview = await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert (preview.to_create, preview.suspected, preview.dedup_checked) == (1, 0, False)


# --- station commit ------------------------------------------------------------------------


async def _station_names(db) -> list[str]:
    return sorted((await db.execute(select(Station.name))).scalars())


def _report_rows(outcome) -> list[dict[str, str]]:
    report = outcome.error_report
    return list(read_table(base64.b64decode(report.content_base64), report.filename).rows)


@pytest.mark.asyncio
async def test_an_undecided_suspected_row_is_not_created_and_goes_into_the_report(db, engine):
    """Not deciding is not creating, as for a single create; the rest of the file lands."""
    actor = await _station_importer(db)
    school = await _existing_station(db, actor, "光復國小")
    engine.suspects = _suspect_stations_named("光復國民小學", related=school)
    raw, filename = _stations([_station_row("光復國民小學"), _station_row("大進國小")])

    outcome = await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert await _station_names(db) == ["光復國小", "大進國小"]
    assert (outcome.created, outcome.failed, outcome.errors, outcome.suspected) == (1, 0, (), 1)
    assert [(s.line, s.related_uuid, s.title) for s in outcome.suspects] == [(2, school, "光復國小")]
    (held,) = _report_rows(outcome)
    assert held["name"] == "光復國民小學"
    assert "疑似重複，未建立：很像「光復國小」，相距約 0 公尺" in held["error"]
    events = (await db.execute(select(DedupAuditEvent.event_type, DedupAuditEvent.primary_uuid))).all()
    assert [(event, str(uuid)) for event, uuid in events] == [("hint_shown", school)]


@pytest.mark.asyncio
async def test_rows_filed_anyway_are_created_and_carded_and_reviewers_hear_once(db, engine, notifications):
    """`acknowledged_duplicate_of` as on createStation: no second check, a dup_ignored card each."""
    actor = await _station_importer(db)
    school = await _existing_station(db, actor, "光復國小")
    church = await _existing_station(db, actor, "光復教會")
    related = {"光復國民小學": school, "光復長老教會": church}
    engine.suspects = lambda submission: [
        Suspect("station", "station", related[submission.station.name], 0.9, {})
    ]
    raw, filename = _stations([_station_row("光復國民小學"), _station_row("光復長老教會")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter", decisions={2: school, 3: church}
    )

    assert (outcome.created, outcome.suspected, outcome.error_report) == (2, 0, None)
    created = {name: uuid for uuid, name in (await db.execute(select(Station.uuid, Station.name))).all()}
    cards = (
        await db.execute(select(DuplicatePair.low_uuid, DuplicatePair.high_uuid, DuplicatePair.status))
    ).all()
    assert sorted((sorted([str(low), str(high)]), status) for low, high, status in cards) == sorted(
        [
            (sorted([str(created["光復國民小學"]), school]), "dup_ignored"),
            (sorted([str(created["光復長老教會"]), church]), "dup_ignored"),
        ]
    )
    assert sorted((await db.execute(select(DedupAuditEvent.event_type))).scalars()) == [
        "ignored_by_submitter",
        "ignored_by_submitter",
    ]
    assert [n["title"] for n in notifications if n["event_type"] == "dedup_review_pending"] == [
        "疑似重複待審核：2 筆"
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("ack", ["x", "gone", "another"])
async def test_a_decision_naming_anything_but_the_hint_still_holds_the_row(db, engine, ack):
    """Only the station the engine suspects for that line at commit files it anyway (ADR-400).

    "another" is a station that exists, 15 km away, which the engine did not suggest.
    """
    actor = await _station_importer(db)
    school = await _existing_station(db, actor, "光復國小")
    elsewhere = await _existing_station(db, actor, "富源國小", lon=LON + 0.15)
    engine.suspects = _suspect_stations_named("光復國民小學", related=school)
    named = {"x": "x", "gone": str(uuid_mod.uuid4()), "another": elsewhere}[ack]
    raw, filename = _stations([_station_row("光復國民小學")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter", decisions={2: named}
    )

    assert (outcome.created, outcome.suspected) == (0, 1)
    assert [s.related_uuid for s in outcome.suspects] == [school]
    assert await _count(db, DuplicatePair) == 0


# --- the real engine ---------------------------------------------------------------------

SHELTER = "光復國小臨時收容所"
SHELTER_AGAIN = "光復國小臨時收容處"


@pytest.mark.asyncio
async def test_with_the_real_engine_a_station_like_one_already_there_is_held_until_filed_anyway(
    db, monkeypatch
):
    """Previewed, held at commit, then created and carded with the uuid the preview gave."""
    monkeypatch.setattr(registry, "_ENGINE", FastEngine())
    actor = await _station_importer(db)
    first, filename = _stations([_station_row(SHELTER)])
    await commit_stations(db, actor=actor, raw=first, filename=filename, station_type="shelter")
    await db.refresh(actor)
    raw, filename = _stations([_station_row(SHELTER_AGAIN)])

    preview = await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")
    (suspect,) = preview.suspects
    assert (suspect.line, suspect.title) == (2, SHELTER)
    await db.refresh(actor)
    held = await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")
    assert (held.created, held.suspected) == (0, 1)
    await db.refresh(actor)
    filed = await commit_stations(
        db,
        actor=actor,
        raw=raw,
        filename=filename,
        station_type="shelter",
        decisions={2: suspect.related_uuid},
    )

    assert (filed.created, filed.suspected) == (1, 0)
    assert await _station_names(db) == [SHELTER, SHELTER_AGAIN]
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert (pair.entity_kind, pair.status, pair.engine_version) == (
        "station",
        "dup_ignored",
        FastEngine.version,
    )


@pytest.mark.asyncio
async def test_with_the_real_engine_two_alike_rows_of_one_file_both_land(db, monkeypatch):
    """The file is compared before any row is written, so row 3 is not held by row 2 (ADR-398).

    The test above is what shows the engine would hold this pair.
    """
    monkeypatch.setattr(registry, "_ENGINE", FastEngine())
    actor = await _station_importer(db)
    raw, filename = _stations([_station_row(SHELTER), _station_row(SHELTER_AGAIN)])

    outcome = await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert (outcome.created, outcome.suspected) == (2, 0)


# --- tickets -------------------------------------------------------------------------------

TICKET_HEADERS = (
    "uuid",
    "title",
    "status",
    "priority",
    "description",
    "contact_name",
    "contact_phone",
    "latitude",
    "longitude",
    "task_type",
    "task_name",
    "task_quantity",
)


def _ticket_row(title: str, task_name: str, *, phone: str) -> dict:
    return {
        "uuid": "",
        "title": title,
        "status": "",
        "priority": "high",
        "description": "",
        "contact_name": "王小明",
        "contact_phone": phone,
        "latitude": str(LAT),
        "longitude": str(LON),
        "task_type": "rescue",
        "task_name": task_name,
        "task_quantity": "3",
    }


def _tickets(rows) -> tuple[bytes, str]:
    return write_csv(TICKET_HEADERS, rows), "tickets.csv"


async def _ticket_importer(db) -> User:
    """Everything a ticket import needs (ADR-110/111)."""
    return await _importer(db, Perm.TICKET_IMPORT, Perm.TICKET_ADD, Perm.TICKET_EDIT)


async def _existing_ticket(db, actor: User, title: str, phone: str, *task_names: str) -> tuple[str, dict]:
    """A ticket already there, and its tasks' uuids by name."""
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title=title,
        status="pending",
        priority="high",
        contact_name="李",
        contact_phone=phone,
        created_by=actor.uuid,
    )
    db.add(ticket)
    await db.flush()
    tasks = [
        TicketTask(ticket_uuid=ticket.uuid, task_type="rescue", task_name=n, created_by=actor.uuid)
        for n in task_names
    ]
    db.add_all(tasks)
    await db.flush()
    uuids = str(ticket.uuid), {task.task_name: str(task.uuid) for task in tasks}
    await db.commit()
    await db.refresh(actor)
    return uuids


def _suspect_tasks_named(related: dict[str, tuple[str, str]]):
    """A stub `check` that suspects each task draft named in `related` of being (task, ticket)."""

    def suspects(submission):
        drafts = submission.tasks if isinstance(submission, NewTicket) else (submission.task,)
        return [
            Suspect(task_ref(i), "ticket_task", related[d.task_name][0], 0.9, {}, related[d.task_name][1])
            for i, d in enumerate(drafts)
            if d.task_name in related
        ]

    return suspects


def _asked(engine) -> list[tuple]:
    """What the engine was asked about, by kind and task names."""
    return [
        ("ticket", call.ticket.title, tuple(t.task_name for t in call.tasks))
        if isinstance(call, NewTicket)
        else ("task", call.ticket_uuid, (call.task.task_name,))
        for call in engine.check_calls
    ]


@pytest.mark.asyncio
async def test_a_ticket_preview_asks_about_each_new_task_with_its_ticket(db, engine):
    """A new ticket's lines go as one `NewTicket`; a task added to a ticket there as a `NewTask`.

    A task the file shares with its ticket in the database is an update, and not asked about.
    """
    actor = await _ticket_importer(db)
    flooded, _ = await _existing_ticket(db, actor, "民生街淹水", "0911111111", "抽水")
    dry, dry_tasks = await _existing_ticket(db, actor, "中山路缺水", "0922222222", "送水")
    engine.suspects = _suspect_tasks_named({"送水": (dry_tasks["送水"], dry)})
    raw, filename = _tickets(
        [
            _ticket_row("中正路受困", "救人", phone="0933333333"),
            _ticket_row("中正路受困", "送水", phone="0933333333"),
            _ticket_row("民生街淹水", "抽水", phone="0911111111"),
            _ticket_row("民生街淹水", "清淤", phone="0911111111"),
        ]
    )

    preview = await preview_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert _asked(engine) == [("ticket", "中正路受困", ("救人", "送水")), ("task", flooded, ("清淤",))]
    assert [
        (s.line, s.related_kind, s.related_uuid, s.related_ticket_uuid, s.title, s.task_name, s.status)
        for s in preview.suspects
    ] == [(3, "ticket_task", dry_tasks["送水"], dry, "中山路缺水", "送水", "pending")]
    assert (preview.to_create, preview.to_update, preview.suspected) == (1, 2, 1)


async def _task_names(db, title: str) -> list[str]:
    rows = await db.execute(
        select(TicketTask.task_name)
        .join(Tickets, Tickets.uuid == TicketTask.ticket_uuid)
        .where(Tickets.title == title)
    )
    return sorted(rows.scalars())


def _ticket_on_two_lines() -> tuple[bytes, str]:
    """A new ticket whose first line, 送水, is suspected; its second line attaches to it."""
    return _tickets(
        [
            _ticket_row("中正路受困", "送水", phone="0933333333"),
            _ticket_row("中正路受困", "救人", phone="0933333333"),
        ]
    )


@pytest.mark.asyncio
async def test_a_preview_counts_the_lines_after_a_suspected_first_line_with_it(db, engine):
    """The first line creates the ticket, so the rest land only if it does; the preview says so."""
    actor = await _ticket_importer(db)
    dry, dry_tasks = await _existing_ticket(db, actor, "中山路缺水", "0922222222", "送水")
    engine.suspects = _suspect_tasks_named({"送水": (dry_tasks["送水"], dry)})
    raw, filename = _ticket_on_two_lines()

    preview = await preview_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert [(s.line, s.followers) for s in preview.suspects] == [(2, (3,))]
    assert (preview.to_create, preview.to_update, preview.suspected) == (0, 0, 1)


@pytest.mark.asyncio
async def test_a_held_first_line_holds_the_lines_after_it_and_says_why(db, engine):
    """Not failures: held with it, each report line naming the suspected first line."""
    actor = await _ticket_importer(db)
    dry, dry_tasks = await _existing_ticket(db, actor, "中山路缺水", "0922222222", "送水")
    engine.suspects = _suspect_tasks_named({"送水": (dry_tasks["送水"], dry)})
    raw, filename = _ticket_on_two_lines()

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert await _count(db, Tickets) == 1
    assert (outcome.created, outcome.updated, outcome.failed, outcome.errors) == (0, 0, 0, ())
    assert (outcome.suspected, [(s.line, s.followers) for s in outcome.suspects]) == (1, [(2, (3,))])
    first, second = _report_rows(outcome)
    assert (first["task_name"], second["task_name"]) == ("送水", "救人")
    assert "疑似重複，未建立" in first["error"]
    assert "第 2 列疑似重複，未建立，這一列跟著未建立" in second["error"]


@pytest.mark.asyncio
async def test_a_first_line_filed_anyway_takes_the_lines_after_it_with_it(db, engine):
    """Its decision decides for them too, while another ticket's undecided first line is held."""
    actor = await _ticket_importer(db)
    dry, dry_tasks = await _existing_ticket(db, actor, "中山路缺水", "0922222222", "送水", "清淤")
    engine.suspects = _suspect_tasks_named(
        {"送水": (dry_tasks["送水"], dry), "清淤": (dry_tasks["清淤"], dry)}
    )
    raw, filename = _tickets(
        [
            _ticket_row("中正路受困", "送水", phone="0933333333"),
            _ticket_row("中正路受困", "救人", phone="0933333333"),
            _ticket_row("民權路淤泥", "清淤", phone="0944444444"),
        ]
    )

    outcome = await commit_tickets(
        db, actor=actor, raw=raw, filename=filename, task_type="rescue", decisions={2: dry_tasks["送水"]}
    )

    assert (outcome.created, outcome.updated, outcome.suspected) == (1, 1, 1)
    assert await _task_names(db, "中正路受困") == ["救人", "送水"]
    assert [row["title"] for row in _report_rows(outcome)] == ["民權路淤泥"]


@pytest.mark.asyncio
async def test_a_held_later_line_leaves_only_its_own_task_out(db, engine):
    """The ticket and its other tasks land."""
    actor = await _ticket_importer(db)
    dry, dry_tasks = await _existing_ticket(db, actor, "中山路缺水", "0922222222", "送水")
    engine.suspects = _suspect_tasks_named({"送水": (dry_tasks["送水"], dry)})
    raw, filename = _tickets(
        [
            _ticket_row("中正路受困", "救人", phone="0933333333"),
            _ticket_row("中正路受困", "送水", phone="0933333333"),
        ]
    )

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert await _task_names(db, "中正路受困") == ["救人"]
    assert (outcome.created, outcome.failed, outcome.suspected) == (1, 0, 1)
    assert [(s.line, s.task_name) for s in outcome.suspects] == [(3, "送水")]


@pytest.mark.asyncio
async def test_tasks_filed_anyway_are_created_and_carded(db, engine, notifications):
    """On a new ticket's later line and on a ticket already there; reviewers hear once."""
    actor = await _ticket_importer(db)
    dry, dry_tasks = await _existing_ticket(db, actor, "中山路缺水", "0922222222", "送水", "清淤")
    await _existing_ticket(db, actor, "民生街淹水", "0911111111", "抽水")
    engine.suspects = _suspect_tasks_named(
        {"送水": (dry_tasks["送水"], dry), "清淤": (dry_tasks["清淤"], dry)}
    )
    raw, filename = _tickets(
        [
            _ticket_row("中正路受困", "救人", phone="0933333333"),
            _ticket_row("中正路受困", "送水", phone="0933333333"),
            _ticket_row("民生街淹水", "清淤", phone="0911111111"),
        ]
    )

    outcome = await commit_tickets(
        db,
        actor=actor,
        raw=raw,
        filename=filename,
        task_type="rescue",
        decisions={3: dry_tasks["送水"], 4: dry_tasks["清淤"]},
    )

    assert (outcome.created, outcome.updated, outcome.suspected) == (1, 2, 0)
    assert await _task_names(db, "中正路受困") == ["救人", "送水"]
    assert await _task_names(db, "民生街淹水") == ["抽水", "清淤"]
    cards = (await db.execute(select(DuplicatePair.entity_kind, DuplicatePair.status))).all()
    assert sorted(cards) == [("ticket_task", "dup_ignored"), ("ticket_task", "dup_ignored")]
    assert [n["title"] for n in notifications if n["event_type"] == "dedup_review_pending"] == [
        "疑似重複待審核：2 筆"
    ]


@pytest.mark.asyncio
async def test_a_new_ticket_whose_task_cannot_be_written_leaves_no_ticket_behind(db, engine, monkeypatch):
    """The ticket, its first task and the task's card are one commit (ADR-398)."""
    actor = await _ticket_importer(db)

    async def refuse(*args, **kwargs):
        raise ValueError("寫不進去")

    monkeypatch.setattr(ticket_service, "insert_added_task", refuse)
    raw, filename = _tickets([_ticket_row("中正路受困", "救人", phone="0933333333")])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert (outcome.created, outcome.failed, outcome.partial_rows) == (0, 1, ())
    assert await _count(db, Tickets) == 0
