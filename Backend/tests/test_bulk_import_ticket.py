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
