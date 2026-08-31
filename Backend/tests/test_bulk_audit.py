"""Dynamic-field values join the audit trail (feature 015, ADR-124).

`station_properties` and `task_properties` were the only mutable content tables outside
AUDITED_TABLES, so a station's stock quantity or a crowd-sourced entry's review status could
be changed with no trail at all. Bulk import writes them in batches, which turns an existing
blind spot into an easy one to hit.

Batch traceability itself is deliberately NOT here: `audit_logs.context` and the
`app.active_identity` session setting both arrive with feature 010 (PR #37), which is not in
this branch's ancestry. See ADR-124.
"""

import os
import pathlib
import re

os.environ["ENV"] = "testing"

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select, text

from app.db.triggers import (
    AUDIT_TRIGGER_FUNC_SQL,
    AUDITED_TABLES,
    PROTECT_AUDIT_LOGS_FUNC_SQL,
    PROTECT_AUDIT_LOGS_TRIGGER_SQL,
    get_audit_trigger_sql,
)
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.station_property import StationProperty
from app.models.ticket_task import TaskProperty, TicketTask


@pytest_asyncio.fixture(autouse=True)
async def audit_triggers(db):
    """Deploy the audit trigger function and attach it to every table in AUDITED_TABLES."""
    await db.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    for table in AUDITED_TABLES:
        await db.execute(text(get_audit_trigger_sql(table)))
    await db.execute(text(PROTECT_AUDIT_LOGS_FUNC_SQL))
    await db.execute(text(PROTECT_AUDIT_LOGS_TRIGGER_SQL))
    await db.commit()


async def _logs_for(db, table_name: str) -> list[AuditLog]:
    result = await db.execute(
        select(AuditLog).where(AuditLog.table_name == table_name).order_by(AuditLog.created_at)
    )
    return list(result.scalars().all())


async def _station_property(db) -> tuple[User, StationProperty]:
    author = User(name="Contributor")
    db.add(author)
    await db.flush()
    station = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(author.uuid))
    db.add(station)
    await db.flush()
    prop = StationProperty(
        station_uuid=station.uuid,
        property_type="supply",
        property_name="water",
        quantity=200,
        status="pending",
        created_by=str(author.uuid),
    )
    db.add(prop)
    await db.commit()
    # The `db` fixture expires on commit; refresh explicitly so reading the row back stays
    # inside async IO rather than tripping MissingGreenlet on first attribute access.
    await db.refresh(prop)
    return author, prop


async def _task_property(db) -> TaskProperty:
    author = User(name="Reporter")
    db.add(author)
    await db.flush()
    ticket = Tickets(
        geometry=from_shape(Point(121.5, 25.0), srid=4326),
        created_by=str(author.uuid),
        title="Need water",
        contact_name="Wang",
        status="pending",
        priority="high",
        task_type="supply",
        visibility="public",
    )
    db.add(ticket)
    await db.flush()
    task = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type="supply",
        task_name="Deliver bottled water",
        quantity=50,
        source="user",
        visibility="public",
        created_by=str(author.uuid),
    )
    db.add(task)
    await db.flush()
    prop = TaskProperty(task_uuid=task.uuid, property_name="item_name", property_value="bottled water")
    db.add(prop)
    await db.commit()
    await db.refresh(prop)
    return prop


# --- membership ---


@pytest.mark.parametrize("table", ["station_properties", "task_properties"])
def test_dynamic_field_tables_are_audited(table):
    """Both EAV value tables must be in AUDITED_TABLES."""
    assert table in AUDITED_TABLES


# --- station_properties ---


@pytest.mark.asyncio
async def test_station_property_insert_is_audited(db):
    """Attaching a property to a station leaves a trail."""
    _, prop = await _station_property(db)

    logs = await _logs_for(db, "station_properties")

    assert len(logs) == 1
    assert logs[0].action == "INSERT"
    assert str(logs[0].row_id) == str(prop.uuid)
    assert logs[0].new_values["property_name"] == "water"
    assert logs[0].new_values["quantity"] == 200


@pytest.mark.asyncio
async def test_station_property_quantity_change_records_both_sides(db):
    """A stock quantity dropping to zero is exactly the change that needed a trail."""
    _, prop = await _station_property(db)

    prop.quantity = 0
    await db.commit()

    logs = await _logs_for(db, "station_properties")
    update = [log for log in logs if log.action == "UPDATE"]

    assert len(update) == 1
    assert update[0].old_values["quantity"] == 200
    assert update[0].new_values["quantity"] == 0


@pytest.mark.asyncio
async def test_station_property_review_status_change_is_audited(db):
    """`status` is the review decision (pending/verified/rejected), not the value — audit it."""
    _, prop = await _station_property(db)

    prop.status = "verified"
    await db.commit()

    update = [log for log in await _logs_for(db, "station_properties") if log.action == "UPDATE"]

    assert update[0].old_values["status"] == "pending"
    assert update[0].new_values["status"] == "verified"


@pytest.mark.asyncio
async def test_station_property_delete_is_audited(db):
    """Deleting a property keeps the pre-delete row, so the value is not lost with it."""
    _, prop = await _station_property(db)

    await db.delete(prop)
    await db.commit()

    deletes = [log for log in await _logs_for(db, "station_properties") if log.action == "DELETE"]

    assert len(deletes) == 1
    assert deletes[0].old_values["property_name"] == "water"
    assert deletes[0].new_values is None


# --- task_properties ---


@pytest.mark.asyncio
async def test_task_property_insert_records_its_value(db):
    """`task_properties.property_value` holds any data type — the trail must carry it."""
    prop = await _task_property(db)

    logs = await _logs_for(db, "task_properties")

    assert len(logs) == 1
    assert logs[0].action == "INSERT"
    assert str(logs[0].row_id) == str(prop.uuid)
    assert logs[0].new_values["property_value"] == "bottled water"


@pytest.mark.asyncio
async def test_task_property_value_change_records_both_sides(db):
    """Editing a dynamic field's value leaves before and after."""
    prop = await _task_property(db)

    prop.property_value = "drinking water"
    await db.commit()

    update = [log for log in await _logs_for(db, "task_properties") if log.action == "UPDATE"]

    assert update[0].old_values["property_value"] == "bottled water"
    assert update[0].new_values["property_value"] == "drinking water"


# --- the list alone does nothing without a migration ---


def test_every_audited_table_has_a_trigger_installed_by_some_migration():
    """AUDITED_TABLES is only a Python list — a migration is what attaches the trigger.

    `71bd05e07df3` iterates a FROZEN snapshot of the list as it stood at that revision, so
    appending a table here later has no effect on an already-migrated database unless a new
    migration calls `get_audit_trigger_sql` for it (which is what feature 013 did for
    `project_settings`). Without this test the failure mode is silent: the list says the
    table is audited, the suite agrees because its fixture attaches triggers at runtime, and
    production never writes a single audit row for it.

    Matching is deliberately on the trigger call and on the frozen snapshot only — a bare
    table name is not enough, since every table is also named by its own CREATE TABLE.
    """
    versions = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions"
    sources = {p.name: p.read_text(encoding="utf-8") for p in versions.glob("*.py")}
    joined = "\n".join(sources.values())

    # A migration either loops over its own frozen snapshot list (71bd05e07df3's
    # _AUDITED_TABLES_AT_THIS_REVISION, c219aac56556's _RBAC_V1_AUDITED_TABLES — frozen on
    # purpose, so editing AUDITED_TABLES never rewrites history) or names one table outright.
    covered: set[str] = set()
    for snapshot in re.findall(r"^_\w*AUDITED_TABLES\w*\s*=\s*\[(.*?)^\]", joined, re.DOTALL | re.MULTILINE):
        covered |= set(re.findall(r"[\"']([\w.]+)[\"']", snapshot))
    covered |= set(re.findall(r"get_audit_trigger_sql\(\s*[\"']([\w.]+)[\"']\s*\)", joined))

    missing = [table for table in AUDITED_TABLES if table not in covered]

    assert not missing, (
        f"in AUDITED_TABLES but no migration ever attaches their trigger: {missing}"
    )
