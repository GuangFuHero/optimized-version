"""Column model shared by bulk export and import (feature 015, ADR-118/119).

One definition serves both directions, so an exported file is by construction a valid import
template. These tests pin the three things that makes true: which dynamic fields become
columns, which columns may be written on create versus update, and a stable order.

Config rows are created per test rather than relying on the migration's seed — the `db`
fixture builds the schema with `create_all`, so migration seed data is not there.
"""

import os

os.environ["ENV"] = "testing"

import pytest

from app.models.project_settings import ProjectSettings
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.services.bulk_columns import (
    DYNAMIC_PREFIX,
    dynamic_columns_skipped_for_station,
    station_columns,
    ticket_columns,
)


async def _station_configs(db, rows: list[tuple[str, str, str]], **kwargs) -> None:
    """Seed (station_type, property_name, data_type) config rows."""
    for station_type, property_name, data_type in rows:
        db.add(
            StationPropertyConfig(
                station_type=station_type,
                property_name=property_name,
                data_type=data_type,
                enum_options=None,
                **kwargs,
            )
        )
    await db.flush()


async def _task_configs(db, rows: list[tuple[str, str, str]], **kwargs) -> None:
    for task_type, property_name, data_type in rows:
        db.add(
            TaskPropertyConfig(
                task_type=task_type,
                property_name=property_name,
                data_type=data_type,
                enum_options=None,
                **kwargs,
            )
        )
    await db.flush()


def _dynamic(columns) -> list[str]:
    return [c.header for c in columns if c.header.startswith(DYNAMIC_PREFIX)]


def _by_header(columns, header):
    return next(c for c in columns if c.header == header)


# --- which dynamic fields become columns (ADR-118) ---


@pytest.mark.asyncio
async def test_station_takes_only_the_integer_dynamic_fields(db):
    """`station_properties` can only store a number, so only Integer configs get a column."""
    await _station_configs(
        db,
        [
            ("shelter", "capacity_total", "Integer"),
            ("shelter", "beds_available", "Integer"),
            ("shelter", "price", "Integer"),
            ("shelter", "pet_friendly", "Boolean"),
            ("shelter", "long_term_stay", "Boolean"),
        ],
    )

    columns = await station_columns(db, "shelter")

    assert _dynamic(columns) == [
        f"{DYNAMIC_PREFIX}beds_available",
        f"{DYNAMIC_PREFIX}capacity_total",
        f"{DYNAMIC_PREFIX}price",
    ]


@pytest.mark.asyncio
async def test_a_station_type_with_no_integer_field_gets_no_dynamic_column(db):
    """Eight of the twelve seeded station types are in this state — the file is still valid."""
    await _station_configs(
        db, [("water", "is_potable", "Boolean"), ("water", "water_level", "Enum")]
    )

    columns = await station_columns(db, "water")

    assert _dynamic(columns) == []
    assert columns, "the fixed columns must still be there"


@pytest.mark.asyncio
async def test_skipped_station_fields_are_reported_with_a_reason(db):
    """`preview` has to explain the absence, otherwise the file looks like it lost fields."""
    await _station_configs(
        db, [("water", "is_potable", "Boolean"), ("water", "water_level", "Enum")]
    )
    await _station_configs(db, [("all", "crowd_level", "Enum")])

    skipped = await dynamic_columns_skipped_for_station(db, "water")

    assert {s.property_name for s in skipped} == {"is_potable", "water_level", "crowd_level"}
    assert all("Boolean" in s.reason or "Enum" in s.reason for s in skipped)
    assert all(s.data_type in ("Boolean", "Enum") for s in skipped)


@pytest.mark.asyncio
async def test_the_universal_all_bucket_reaches_every_station_type(db):
    """`list_by_type` unions the 'all' bucket, so a shared field belongs to each type's file."""
    await _station_configs(db, [("all", "shared_count", "Integer")])
    await _station_configs(db, [("shelter", "capacity_total", "Integer")])

    columns = await station_columns(db, "shelter")

    assert _dynamic(columns) == [
        f"{DYNAMIC_PREFIX}capacity_total",
        f"{DYNAMIC_PREFIX}shared_count",
    ]


@pytest.mark.asyncio
async def test_ticket_takes_every_data_type(db):
    """`task_properties.property_value` is text, so any config type round-trips."""
    await _task_configs(
        db,
        [
            ("rescue", "people_count", "Integer"),
            ("rescue", "floor_level", "Integer"),
            ("rescue", "unit_number", "String"),
            ("rescue", "hazard_note", "String"),
        ],
    )

    columns = await ticket_columns(db, "rescue")

    assert _dynamic(columns) == [
        f"{DYNAMIC_PREFIX}floor_level",
        f"{DYNAMIC_PREFIX}hazard_note",
        f"{DYNAMIC_PREFIX}people_count",
        f"{DYNAMIC_PREFIX}unit_number",
    ]
    assert _by_header(columns, f"{DYNAMIC_PREFIX}unit_number").data_type == "String"


# --- 013's filtering comes for free ---


@pytest.mark.asyncio
async def test_deactivated_fields_never_become_columns(db):
    """A field turned off in the console must not reappear as a spreadsheet column."""
    await _station_configs(db, [("shelter", "capacity_total", "Integer")])
    await _station_configs(db, [("shelter", "retired_count", "Integer")], is_active=False)

    columns = await station_columns(db, "shelter")

    assert _dynamic(columns) == [f"{DYNAMIC_PREFIX}capacity_total"]


@pytest.mark.asyncio
async def test_fields_for_another_disaster_type_never_become_columns(db):
    """The deployment runs a flood; a landslide-only field is not part of its file."""
    db.add(ProjectSettings(name="Hualien 0816", disaster_types=["flood"]))
    await _station_configs(
        db, [("shelter", "flood_depth", "Integer")], disaster_types=["flood"]
    )
    await _station_configs(
        db, [("shelter", "slope_angle", "Integer")], disaster_types=["landslide"]
    )
    await _station_configs(db, [("shelter", "capacity_total", "Integer")])  # empty = all

    columns = await station_columns(db, "shelter")

    assert _dynamic(columns) == [
        f"{DYNAMIC_PREFIX}capacity_total",
        f"{DYNAMIC_PREFIX}flood_depth",
    ]


@pytest.mark.asyncio
async def test_an_unconfigured_deployment_filters_nothing(db):
    """No project settings row means "no filter", not "no fields"."""
    await _station_configs(db, [("shelter", "flood_depth", "Integer")], disaster_types=["flood"])

    columns = await station_columns(db, "shelter")

    assert _dynamic(columns) == [f"{DYNAMIC_PREFIX}flood_depth"]


# --- writability (ADR-108) ---


@pytest.mark.asyncio
async def test_station_match_key_columns_are_read_only_on_update(db):
    """Matching on a column means the file's value already equals the row's — writing is a no-op."""
    columns = await station_columns(db, "shelter")

    for header in ("name", "county", "city"):
        assert _by_header(columns, header).writable_on_update is False, header


@pytest.mark.asyncio
async def test_ticket_match_key_columns_are_read_only_on_update(db):
    """Same structural reason as stations, plus UpdateTicketInput has no contact_* at all."""
    columns = await ticket_columns(db, "rescue")

    for header in ("title", "contact_phone"):
        assert _by_header(columns, header).writable_on_update is False, header


@pytest.mark.asyncio
async def test_export_only_columns_are_writable_in_neither_direction(db):
    """Values the platform decides — a reviewer's verdict, a timestamp — are never imported."""
    columns = await station_columns(db, "shelter")

    for header in ("uuid", "verification_status", "created_at", "updated_at"):
        column = _by_header(columns, header)
        assert (column.writable_on_create, column.writable_on_update) == (False, False), header


@pytest.mark.asyncio
async def test_ticket_status_is_updatable_but_ignored_on_create(db):
    """`create_ticket` always writes "pending", so a status column on a new row means nothing."""
    column = _by_header(await ticket_columns(db, "rescue"), "status")

    assert column.writable_on_create is False
    assert column.writable_on_update is True


@pytest.mark.asyncio
async def test_coordinates_are_required_when_creating(db):
    """A new row cannot be created without a point (ADR-123); an update keeps the old one."""
    for columns in (await station_columns(db, "shelter"), await ticket_columns(db, "rescue")):
        for header in ("latitude", "longitude"):
            assert _by_header(columns, header).required_on_create is True, header


# --- order (ADR-119) ---


@pytest.mark.asyncio
async def test_fixed_columns_come_first_and_uuid_leads(db):
    """A stable, readable layout: identity, then content, then the dynamic tail."""
    await _station_configs(db, [("shelter", "capacity_total", "Integer")])

    headers = [c.header for c in await station_columns(db, "shelter")]

    assert headers[0] == "uuid"
    assert headers[-1] == f"{DYNAMIC_PREFIX}capacity_total"


@pytest.mark.asyncio
async def test_dynamic_columns_follow_sort_order_then_name(db):
    """013 orders configs by (sort_order, property_name); the file must not reshuffle them."""
    await _station_configs(db, [("shelter", "zzz_first", "Integer")], sort_order=1)
    await _station_configs(db, [("shelter", "aaa_second", "Integer")], sort_order=2)

    assert _dynamic(await station_columns(db, "shelter")) == [
        f"{DYNAMIC_PREFIX}zzz_first",
        f"{DYNAMIC_PREFIX}aaa_second",
    ]


@pytest.mark.asyncio
async def test_the_same_type_yields_the_same_headers_twice(db):
    """Export must not hand back a different layout on the second click."""
    await _station_configs(db, [("shelter", "capacity_total", "Integer")])

    first = [c.header for c in await station_columns(db, "shelter")]
    second = [c.header for c in await station_columns(db, "shelter")]

    assert first == second
