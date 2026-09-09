"""Ticket import: one row is one ticket plus one task (feature 015, ADR-120/122).

The status test is the load-bearing one. An untouched export carries every row's own status
back, so if a same-value status were sent as a change, every completed ticket would fail its
own state machine and a clean round-trip would come back all red.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.core.tabular import write_csv
from app.graphql.masking import mask_phone
from app.models.auth import User
from app.models.property_config import TaskPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.models.ticket_task import TaskProperty, TicketTask
from app.services.bulk_columns import DYNAMIC_PREFIX
from app.services.bulk_export import export_tickets
from app.services.bulk_import import commit_tickets, preview_tickets

IN_ZONE = Point(121.50, 25.00)
OUT_OF_ZONE = Point(121.90, 25.40)
ZONE_POLYGON = Polygon([(121.4, 24.9), (121.6, 24.9), (121.6, 25.1), (121.4, 25.1)])

PEOPLE = f"{DYNAMIC_PREFIX}people_count"
HEADERS = (
    "uuid", "title", "status", "priority", "description",
    "contact_name", "contact_phone", "latitude", "longitude",
    "task_type", "task_name", "task_quantity", PEOPLE,
)


def _row(title, *, phone="0912345678", status="", task_name="送水", people="", description=""):
    return {
        "uuid": "", "title": title, "status": status, "priority": "high",
        "description": description, "contact_name": "王小明", "contact_phone": phone,
        "latitude": "25.0", "longitude": "121.5", "task_type": "rescue",
        "task_name": task_name, "task_quantity": "3", PEOPLE: people,
    }


def _file(rows) -> tuple[bytes, str]:
    return write_csv(HEADERS, rows), "tickets.csv"


async def _grant(db, user: User, *perms_and_scopes) -> None:
    for perm, scope in perms_and_scopes:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        role = Role(name=f"role-{perm.value}-{scope}-{user.name}", kind="platform")
        db.add(role)
        await db.flush()
        db.add(
            RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope)
        )
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()


async def _importer(db, *, scope="all") -> User:
    actor = User(name="Importer")
    db.add(actor)
    await db.flush()
    await _grant(
        db, actor,
        (Perm.TICKET_IMPORT, "all"),
        (Perm.TICKET_ADD, "all"),
        (Perm.TICKET_EDIT, scope),
        (Perm.TICKET_EXPORT, "all"),
        (Perm.TICKET_VIEW_PII, scope),
    )
    return actor


async def _configs(db) -> None:
    db.add(TaskPropertyConfig(
        task_type="rescue", property_name="people_count", data_type="Integer", enum_options=None
    ))
    await db.commit()


async def _count(db, model) -> int:
    return (
        await db.execute(select(func.count()).select_from(model).where(model.delete_at.is_(None)))
    ).scalar_one()


async def _ticket_titled(db, title: str) -> Tickets | None:
    return (
        await db.execute(select(Tickets).where(Tickets.title == title, Tickets.delete_at.is_(None)))
    ).scalar_one_or_none()


# --- creation ---


@pytest.mark.asyncio
async def test_a_new_row_creates_all_three_layers(db):
    """Ticket, task, and the task's dynamic value (ADR-120)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("需要飲用水", people="4")])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert (outcome.created, outcome.failed) == (1, 0)
    ticket = await _ticket_titled(db, "需要飲用水")
    task = (
        await db.execute(select(TicketTask).where(TicketTask.ticket_uuid == ticket.uuid))
    ).scalar_one()
    prop = (
        await db.execute(select(TaskProperty).where(TaskProperty.task_uuid == task.uuid))
    ).scalar_one()

    assert task.task_name == "送水"
    assert task.source == "import"
    assert prop.property_value == "4"


@pytest.mark.asyncio
async def test_a_new_ticket_is_always_pending_whatever_the_file_says(db):
    """`create_ticket` writes "pending" unconditionally (app/services/ticket.py:99)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("需要飲用水", status="completed")])

    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert (await _ticket_titled(db, "需要飲用水")).status == "pending"


@pytest.mark.asyncio
async def test_two_tasks_under_one_ticket_stay_two_tasks(db):
    """Two rows sharing a title but naming different tasks are not duplicates (ADR-120)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救", task_name="送水"), _row("求救", task_name="清淤")])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert outcome.failed == 0
    assert await _count(db, Tickets) == 1
    assert await _count(db, TicketTask) == 2


@pytest.mark.asyncio
async def test_a_row_declaring_another_task_type_is_refused(db):
    """One file is one task type (ADR-119), so a stray row of another type is a mistake."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([{**_row("求救"), "task_type": "supply"}])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert outcome.failed == 1
    assert "supply" in outcome.errors[0].message


# --- status (ADR-122) ---


@pytest.mark.asyncio
async def test_a_completed_ticket_round_trips_without_tripping_its_state_machine(db):
    """The core regression: same-value status must never be sent as a change."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")
    ticket = await _ticket_titled(db, "求救")
    ticket.status = "completed"
    await db.commit()

    exported = await export_tickets(db, actor=actor, task_type="rescue")
    outcome = await commit_tickets(
        db, actor=actor, raw=exported.content, filename=exported.filename, task_type="rescue"
    )

    assert (outcome.created, outcome.updated, outcome.failed) == (0, 1, 0)
    assert (await _ticket_titled(db, "求救")).status == "completed"


@pytest.mark.asyncio
async def test_an_illegal_transition_fails_that_row_and_says_why(db):
    """`completed` is terminal (app/services/ticket.py:28)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")
    ticket = await _ticket_titled(db, "求救")
    ticket.status = "completed"
    await db.commit()

    raw, filename = _file([_row("求救", status="pending")])
    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert outcome.failed == 1
    assert (await _ticket_titled(db, "求救")).status == "completed"


@pytest.mark.asyncio
async def test_a_legal_transition_goes_through(db):
    """Pending → in_progress is allowed, so the import applies it like the UI would."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    raw, filename = _file([_row("求救", status="in_progress")])
    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert outcome.updated == 1
    assert (await _ticket_titled(db, "求救")).status == "in_progress"


# --- matching and PII ---


@pytest.mark.asyncio
async def test_a_matched_row_updates_rather_than_duplicating(db):
    """A second upload of the same request edits it instead of creating another one."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救", description="第一版")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    raw, filename = _file([_row("求救", description="第二版")])
    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert (outcome.created, outcome.updated) == (0, 1)
    assert await _count(db, Tickets) == 1
    assert (await _ticket_titled(db, "求救")).description == "第二版"


@pytest.mark.asyncio
async def test_a_different_phone_makes_it_a_different_ticket(db):
    """The same words from another person are another request (ADR-107)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("需要飲用水", phone="0912345678")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    raw, filename = _file([_row("需要飲用水", phone="0987654321")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert await _count(db, Tickets) == 2


@pytest.mark.asyncio
async def test_a_masked_phone_cannot_be_written_back(db):
    """It would never match, so letting it through would create a silent duplicate (ADR-109)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救", phone=mask_phone("0912345678"))])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert outcome.failed == 1
    assert "PII" in outcome.errors[0].message
    assert await _count(db, Tickets) == 0


@pytest.mark.asyncio
async def test_a_zone_scoped_export_comes_back_half_writable(db):
    """The whole PII path end to end: out-of-zone rows exported masked cannot be re-imported."""
    await _configs(db)
    team = Team(name="Hualien", type="gov")
    db.add(team)
    await db.flush()
    assigner = User(name="assigner")
    db.add(assigner)
    zone = WorkZone(name="Z", geometry=from_shape(ZONE_POLYGON, srid=4326))
    db.add(zone)
    await db.flush()
    db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)))
    team_uuid = team.uuid  # read before the commit expires it
    await db.commit()

    author = await _importer(db)  # creates both tickets with full reach
    raw, filename = _file([
        _row("區內", phone="0912345678"),
        {**_row("區外", phone="0987654321"), "latitude": "25.40", "longitude": "121.90"},
    ])
    await commit_tickets(db, actor=author, raw=raw, filename=filename, task_type="rescue")

    zoned = User(name="Zoned", team_uuid=team_uuid)
    db.add(zoned)
    await db.flush()
    await _grant(
        db, zoned,
        (Perm.TICKET_IMPORT, "all"), (Perm.TICKET_ADD, "all"),
        (Perm.TICKET_EDIT, "zone"), (Perm.TICKET_EXPORT, "all"), (Perm.TICKET_VIEW_PII, "zone"),
    )

    exported = await export_tickets(db, actor=zoned, task_type="rescue")
    outcome = await commit_tickets(
        db, actor=zoned, raw=exported.content, filename=exported.filename, task_type="rescue"
    )

    assert outcome.updated == 1
    assert outcome.failed == 1
    assert "PII" in outcome.errors[0].message


# --- round trip ---


@pytest.mark.asyncio
async def test_an_untouched_export_previews_clean(db):
    """The guard against the two directions drifting apart (ADR-119)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救", people="4")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    exported = await export_tickets(db, actor=actor, task_type="rescue")
    result = await preview_tickets(
        db, actor=actor, raw=exported.content, filename=exported.filename, task_type="rescue"
    )

    assert result.errors == ()
    assert (result.to_create, result.to_update) == (0, 1)


@pytest.mark.asyncio
async def test_re_importing_an_export_adds_no_rows(db):
    """All three layers stay at one row each — the round trip is idempotent (ADR-106)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("求救", people="4")])
    await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    exported = await export_tickets(db, actor=actor, task_type="rescue")
    await commit_tickets(
        db, actor=actor, raw=exported.content, filename=exported.filename, task_type="rescue"
    )

    assert await _count(db, Tickets) == 1
    assert await _count(db, TicketTask) == 1
    assert await _count(db, TaskProperty) == 1


# --- a row that attaches to an earlier row of the same file (ADR-211) ---


@pytest.mark.asyncio
async def test_a_second_line_is_planned_as_a_create_when_the_first_one_fails_validation(db):
    """`seen_keys` used to mark the follower as an update whether or not the leader landed.

    Planning it as an update drops every create-only column (title, contact fields,
    coordinates), and the writer then takes the create branch anyway — `create_ticket` gets
    `geometry=None` and shapely raises `AttributeError`, which `_write_all` does not catch.
    """
    await _configs(db)
    actor = await _importer(db)
    follower = _row("斷水求助", task_name="送電")
    follower["latitude"] = follower["longitude"] = ""  # a follower line leaves them to line 2
    raw, filename = _file([_row("斷水求助", people="abc"), follower])  # line 2 fails its Integer

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert (outcome.created, outcome.failed) == (0, 2)
    assert any("latitude" in error.column for error in outcome.errors)
    assert await _ticket_titled(db, "斷水求助") is None


@pytest.mark.asyncio
async def test_a_second_line_fails_cleanly_when_the_first_one_fails_at_write_time(db):
    """Validation cannot see this one coming: the leader passes and then is refused."""
    await _configs(db)
    actor = User(name="NoAddImporter")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, (Perm.TICKET_IMPORT, "all"), (Perm.TICKET_EDIT, "all"))
    raw, filename = _file([_row("倒塌受困"), _row("倒塌受困", task_name="送電")])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename, task_type="rescue")

    assert (outcome.created, outcome.updated, outcome.failed) == (0, 0, 2)
    assert await _ticket_titled(db, "倒塌受困") is None
    assert "沒有匯入成功" in outcome.errors[1].message


# --------------------------------------------------------------------------------------
# PR #42 review round 2 (ADR-240/241)
# --------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_new_task_under_a_matched_ticket_keeps_its_own_fields(db):
    """A task being created carries the file's values even when its parent ticket is matched.

    `task_description` and `task_quantity` are `_create_only` because `UpdateTicketTaskInput`
    cannot carry them — but "the ticket is an update" does not mean "the task is an update".
    A row attaching a NEW task to a matched ticket still took the create branch, by which
    point `writable_values(is_update=True)` had dropped both. `task_name` survived on a
    `plan.row` fallback; its two siblings had none, so they were written as NULL and the row
    was still reported as a success (ADR-240).
    """
    await _configs(db)
    actor = await _importer(db)

    first, filename = _file([_row("求救", task_name="送水", description="第一次")])
    await commit_tickets(db, actor=actor, raw=first, filename=filename, task_type="rescue")

    # same title -> the ticket matches; a different task name -> the task is a create
    second, filename = _file([_row("求救", task_name="清淤")])
    outcome = await commit_tickets(db, actor=actor, raw=second, filename=filename,
                                   task_type="rescue")

    assert outcome.failed == 0, outcome.errors
    assert await _count(db, Tickets) == 1
    tasks = list((await db.execute(
        select(TicketTask).where(TicketTask.task_name == "清淤"))).scalars())
    assert len(tasks) == 1
    assert tasks[0].quantity == 3, "the file said 3; a dropped create-only column writes NULL"


@pytest.mark.asyncio
async def test_an_over_length_cell_fails_its_own_row_and_the_rest_land(db):
    """`tickets.title` is `String(200)`; 300 characters must not reach the driver (ADR-241).

    Nothing checked width before, so PostgreSQL raised `StringDataRightTruncation` →
    `sqlalchemy.exc.DataError`, which is not a `ValueError`. It escaped `_write_all`, escaped
    the endpoint's handler and 500'd the request — with every earlier row already committed
    by its own service call and no error report returned.
    """
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("正常的一列"), _row("長" * 300)])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename,
                                   task_type="rescue")

    assert outcome.created == 1, "the good row still lands"
    assert outcome.failed == 1
    assert await _count(db, Tickets) == 1
    message = " ".join(e.message for e in outcome.errors)
    assert "200" in message and "長度" in message, message
    assert outcome.error_report is not None, "a failed row must come back in the report"


@pytest.mark.asyncio
async def test_an_integer_beyond_int4_fails_its_own_row(db):
    """A Python int coerces fine and overflows `int4` at the driver (ADR-241)."""
    await _configs(db)
    actor = await _importer(db)
    row = {**_row("求救"), "task_quantity": "9999999999"}
    raw, filename = _file([row])

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename,
                                   task_type="rescue")

    assert outcome.failed == 1
    assert "整數範圍" in " ".join(e.message for e in outcome.errors)


@pytest.mark.asyncio
async def test_the_error_report_is_re_uploadable_when_the_file_has_an_error_column(db):
    """A file already carrying an `error` header must still produce a readable report.

    `_as_report` appended `error` unconditionally, and `_clean_headers` refuses duplicate
    headers on read — so the report could not be re-uploaded, which is ADR-112's whole loop
    ("fix what it says, re-upload, done") broken for exactly the files that need it.
    """
    from app.core.tabular import read_table

    await _configs(db)
    actor = await _importer(db)
    headers = (*HEADERS, "error")
    rows = [{**_row("長" * 300), "error": "上一輪的訊息"}]
    raw, filename = write_csv(headers, rows), "tickets.csv"

    outcome = await commit_tickets(db, actor=actor, raw=raw, filename=filename,
                                   task_type="rescue")

    assert outcome.failed == 1
    assert outcome.error_report is not None
    import base64
    report = read_table(base64.b64decode(outcome.error_report.content_base64),
                        outcome.error_report.filename, max_rows=100)
    assert "error" in report.headers and "error_1" in report.headers
    assert report.rows[0]["error"] == "上一輪的訊息", "the file's own column is preserved"
