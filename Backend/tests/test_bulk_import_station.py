"""Station import: preview and commit (feature 015, ADR-106/112/121).

The round-trip test is the important one — export, re-import, nothing changes — because it
is the only check that the two directions actually agree about the file.
"""

import base64
import os

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.core.tabular import read_table, write_csv
from app.models.auth import User
from app.models.geo import Station
from app.models.property_config import StationPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import StationProperty
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.services.bulk_columns import DYNAMIC_PREFIX
from app.services.bulk_export import export_stations
from app.services.bulk_import import (
    MAX_ROWS,
    BulkImportError,
    commit_stations,
    preview_stations,
)

IN_ZONE = Point(121.50, 25.00)
OUT_OF_ZONE = Point(121.90, 25.40)
ZONE_POLYGON = Polygon([(121.4, 24.9), (121.6, 24.9), (121.6, 25.1), (121.4, 25.1)])

CAPACITY = f"{DYNAMIC_PREFIX}capacity_total"
HEADERS = ("uuid", "name", "type", "comment", "latitude", "longitude", "county", "city", CAPACITY)


def _row(
    name, *, comment="", capacity="", latitude="25.0", longitude="121.5",
    county="花蓮縣", city="光復鄉",
):
    return {
        "uuid": "", "name": name, "type": "shelter", "comment": comment,
        "latitude": latitude, "longitude": longitude,
        "county": county, "city": city, CAPACITY: capacity,
    }


def _file(rows) -> tuple[bytes, str]:
    return write_csv(HEADERS, rows), "stations.csv"


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
    """A user holding everything a station import needs (ADR-110/111)."""
    actor = User(name="Importer")
    db.add(actor)
    await db.flush()
    await _grant(
        db, actor,
        (Perm.STATION_IMPORT, "all"),
        (Perm.STATION_ADD, "all"),
        (Perm.STATION_EDIT, scope),
        (Perm.STATION_CONTRIBUTE, "all"),
        (Perm.STATION_EXPORT, "all"),
    )
    return actor


async def _configs(db) -> None:
    db.add(StationPropertyConfig(
        station_type="shelter", property_name="capacity_total", data_type="Integer", enum_options=None
    ))
    await db.commit()


async def _count_stations(db) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(Station).where(Station.delete_at.is_(None))
        )
    ).scalar_one()


async def _station_named(db, name: str) -> Station | None:
    return (
        await db.execute(select(Station).where(Station.name == name, Station.delete_at.is_(None)))
    ).scalar_one_or_none()


# --- preview ---


@pytest.mark.asyncio
async def test_preview_writes_nothing(db):
    """A dry run must not touch the database at all (ADR-112)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小")])

    result = await preview_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert result.to_create == 1
    assert await _count_stations(db) == 0


@pytest.mark.asyncio
async def test_preview_requires_the_import_capability(db):
    """Otherwise it would be a probe for someone who cannot import (ADR-110)."""
    actor = User(name="Nobody")
    db.add(actor)
    await db.flush()
    raw, filename = _file([_row("光復國小")])

    with pytest.raises(HTTPException) as exc:
        await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_preview_reports_every_problem_at_once(db):
    """One fix per upload would make a broken file take all afternoon (ADR-112)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([
        _row("好資料"),
        _row("沒座標", latitude="", longitude=""),
        _row("壞數量", capacity="abc"),
    ])

    result = await preview_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert {error.line for error in result.errors} == {3, 4}
    assert result.to_create == 1


@pytest.mark.asyncio
async def test_preview_suggests_a_mapping_and_names_what_it_could_not_place(db):
    """Headers that already match a column are paired up; the rest are named for the user."""
    await _configs(db)
    actor = await _importer(db)
    raw = write_csv(("name", "自訂欄"), [{"name": "光復國小", "自訂欄": "x"}])

    result = await preview_stations(
        db, actor=actor, raw=raw, filename="stations.csv", station_type="shelter"
    )

    assert result.suggested_mapping["name"] == "name"
    assert result.unmapped_headers == ("自訂欄",)


@pytest.mark.asyncio
async def test_preview_explains_which_dynamic_fields_the_file_cannot_carry(db):
    """A file silently missing half a type's fields reads as data loss (ADR-118)."""
    await _configs(db)
    db.add(StationPropertyConfig(
        station_type="shelter", property_name="pet_friendly", data_type="Boolean", enum_options=None
    ))
    await db.commit()
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小")])

    result = await preview_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert [s["property_name"] for s in result.skipped_columns] == ["pet_friendly"]
    assert "Boolean" in result.skipped_columns[0]["reason"]


@pytest.mark.asyncio
async def test_a_file_over_the_row_cap_is_refused_before_anything_runs(db):
    """ADR-116: the cap exists because this runs inside one synchronous request."""
    actor = await _importer(db)
    raw, filename = _file([_row(f"站 {n}") for n in range(MAX_ROWS + 1)])

    with pytest.raises(BulkImportError, match=str(MAX_ROWS)):
        await preview_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")


# --- commit: create ---


@pytest.mark.asyncio
async def test_a_row_that_matches_nothing_is_created(db):
    """An unmatched row becomes a new station, owned by the importer and marked as imported."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", capacity="120")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert (outcome.created, outcome.updated, outcome.failed) == (1, 0, 0)
    station = await _station_named(db, "光復國小")
    assert str(station.created_by) == str(actor.uuid)
    assert station.source == "import"


@pytest.mark.asyncio
async def test_a_created_row_gets_its_address_and_dynamic_value(db):
    """A created row also writes its secondary_location and its Integer dynamic field."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", capacity="120")])

    await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    station = await _station_named(db, "光復國小")
    address = (
        await db.execute(
            select(SecondaryLocation).where(SecondaryLocation.geometry_uuid == str(station.uuid))
        )
    ).scalar_one()
    prop = (
        await db.execute(
            select(StationProperty).where(StationProperty.station_uuid == station.uuid)
        )
    ).scalar_one()

    assert (address.county, address.city) == ("花蓮縣", "光復鄉")
    assert prop.quantity == 120


@pytest.mark.asyncio
async def test_importing_without_the_add_capability_fails_every_new_row(db):
    """Holding import alone is a dead grant (ADR-110)."""
    actor = User(name="ImportOnly")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, (Perm.STATION_IMPORT, "all"))
    await _configs(db)
    raw, filename = _file([_row("光復國小")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert (outcome.created, outcome.failed) == (0, 1)
    assert await _count_stations(db) == 0


# --- commit: update ---


@pytest.mark.asyncio
async def test_a_row_that_matches_updates_in_place(db):
    """The uuid must not change — a match is an update, never a quiet second row."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", comment="第一版")])
    await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")
    original = await _station_named(db, "光復國小")
    original_uuid = str(original.uuid)

    raw, filename = _file([_row("光復國小", comment="第二版")])
    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert (outcome.created, outcome.updated) == (0, 1)
    assert await _count_stations(db) == 1
    updated = await _station_named(db, "光復國小")
    assert str(updated.uuid) == original_uuid
    assert updated.comment == "第二版"


@pytest.mark.asyncio
async def test_a_blank_cell_leaves_the_existing_value_alone(db):
    """Blank means "leave it alone"; there is no way to clear a field (ADR-121)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", comment="原本的備註")])
    await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    raw, filename = _file([_row("光復國小", comment="")])
    await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert (await _station_named(db, "光復國小")).comment == "原本的備註"


@pytest.mark.asyncio
async def test_importing_the_same_file_twice_changes_nothing_the_second_time(db):
    """Idempotence is what makes re-uploading a corrected file safe (ADR-106)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小"), _row("大進國小", city="大進里")])

    first = await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")
    second = await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    assert (first.created, first.updated) == (2, 0)
    assert (second.created, second.updated) == (0, 2)
    assert await _count_stations(db) == 2


@pytest.mark.asyncio
async def test_a_zone_scoped_importer_cannot_update_outside_its_area(db):
    """Import is not a way around the per-row scope check (ADR-110)."""
    await _configs(db)
    team = Team(name="Hualien", type="gov")
    assigner = User(name="assigner")
    zone = WorkZone(name="Z", geometry=from_shape(ZONE_POLYGON, srid=4326))
    db.add_all([team, assigner, zone])
    await db.flush()
    # Every uuid is read here, before the first commit: a commit expires loaded objects, and
    # async SQLAlchemy cannot reload one lazily.
    team_uuid, assigner_uuid, zone_uuid = team.uuid, str(assigner.uuid), zone.uuid

    db.add(TeamZoneAssign(team_uuid=team_uuid, zone_uuid=zone_uuid, assigned_by=assigner_uuid))
    outsider = Station(
        geometry=from_shape(OUT_OF_ZONE, srid=4326), created_by=assigner_uuid,
        type="shelter", name="區外站", level=0, visibility="public",
    )
    db.add(outsider)
    await db.flush()
    db.add(SecondaryLocation(
        geometry_uuid=str(outsider.uuid), location_type="address", county="宜蘭縣", city="蘇澳鎮"
    ))
    await db.commit()

    actor = await _importer(db, scope="zone")
    actor.team_uuid = team_uuid
    await db.commit()

    raw, filename = _file([
        _row("區外站", comment="不該進去", county="宜蘭縣", city="蘇澳鎮",
             latitude="25.40", longitude="121.90")
    ])
    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert outcome.failed == 1
    assert (await _station_named(db, "區外站")).comment is None


# --- commit: failures and the report ---


@pytest.mark.asyncio
async def test_good_rows_land_while_bad_rows_are_reported(db):
    """Row by row, not all or nothing (ADR-112)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([
        _row("好站一"),
        _row("壞站", capacity="abc"),
        _row("好站二", city="大進里"),
    ])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert (outcome.created, outcome.failed) == (2, 1)
    assert await _count_stations(db) == 2
    assert outcome.errors[0].line == 3


@pytest.mark.asyncio
async def test_the_error_report_is_the_original_rows_plus_a_reason(db):
    """Fix what the `error` column says, re-upload, done (ADR-112)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("好站"), _row("壞站", capacity="abc")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )
    report = read_table(base64.b64decode(outcome.error_report.content_base64), outcome.error_report.filename)

    assert outcome.error_report.filename == "stations-errors.csv"
    assert report.headers == (*HEADERS, "error")
    assert [row["name"] for row in report.rows] == ["壞站"]
    assert CAPACITY in report.rows[0]["error"]


@pytest.mark.asyncio
async def test_a_clean_import_produces_no_report(db):
    """Nothing failed, so there is nothing to hand back to fix."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert outcome.error_report is None
    assert outcome.batch_id


@pytest.mark.asyncio
async def test_two_rows_sharing_a_key_both_fail(db):
    """Later does not win — they are very often two genuinely different places (ADR-113)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", comment="A"), _row("光復國小", comment="B")])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert (outcome.created, outcome.failed) == (0, 2)
    assert await _count_stations(db) == 0


@pytest.mark.asyncio
async def test_a_row_declaring_another_type_is_refused(db):
    """One file is one type (ADR-119), so a stray row of another type is a mistake."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([{**_row("加水站"), "type": "water"}])

    outcome = await commit_stations(
        db, actor=actor, raw=raw, filename=filename, station_type="shelter"
    )

    assert outcome.failed == 1
    assert "water" in outcome.errors[0].message


# --- the round trip ---


@pytest.mark.asyncio
async def test_an_untouched_export_re_imports_with_no_errors_and_no_new_rows(db):
    """The point of one shared column model: export, re-import, nothing moves (ADR-119)."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", capacity="120", comment="備註")])
    await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    exported = await export_stations(db, actor=actor, station_type="shelter")
    outcome = await commit_stations(
        db, actor=actor, raw=exported.content, filename=exported.filename, station_type="shelter"
    )

    assert (outcome.created, outcome.updated, outcome.failed) == (0, 1, 0)
    assert await _count_stations(db) == 1
    station = await _station_named(db, "光復國小")
    assert station.comment == "備註"


@pytest.mark.asyncio
async def test_an_exported_file_previews_clean(db):
    """The guard for the two directions drifting apart."""
    await _configs(db)
    actor = await _importer(db)
    raw, filename = _file([_row("光復國小", capacity="120")])
    await commit_stations(db, actor=actor, raw=raw, filename=filename, station_type="shelter")

    exported = await export_stations(db, actor=actor, station_type="shelter")
    result = await preview_stations(
        db, actor=actor, raw=exported.content, filename=exported.filename, station_type="shelter"
    )

    assert result.errors == ()
    assert (result.to_create, result.to_update) == (0, 1)
