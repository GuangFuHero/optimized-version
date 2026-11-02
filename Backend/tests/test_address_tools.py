"""The address line is a generated column, and the tools that keep the parts honest.

`full_address` is the parts and the remainder joined by the database; the parts come from
`user_input_address` through the parser, which `scripts/resplit_addresses.py` re-runs and
`scripts/check_address_drift.py` checks.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.address import parse_tw_address
from app.models.auth import User
from app.models.geo import Station
from app.models.secondary_location import SecondaryLocation
from app.services.address import apply_address
from scripts.check_address_drift import check, finish
from scripts.resplit_addresses import drifted, lineless, report, resplit, survey

pytestmark = pytest.mark.asyncio


async def _station(db) -> str:
    creator = User(name="建站的人")
    db.add(creator)
    await db.flush()
    station = Station(
        geometry=from_shape(Point(121.42, 23.67), srid=4326),
        created_by=str(creator.uuid),
        type="shelter",
        name="活動中心",
        level=0,
        visibility="public",
    )
    db.add(station)
    await db.flush()
    return str(station.uuid)


async def _save(db, line: str | None, **overrides) -> str:
    """Store an address the way a write does (apply_address), then change columns as `overrides` say."""
    geometry = await _station(db)
    values = apply_address({"location_type": "address", "full_address": line}, point=None)
    row = SecondaryLocation(geometry_uuid=geometry, **values)
    db.add(row)
    await db.flush()
    row_uuid = str(row.uuid)
    if overrides:
        await db.execute(
            text(
                "UPDATE secondary_locations SET "
                + ", ".join(f"{k} = :{k}" for k in overrides)
                + " WHERE uuid = :u"
            ),
            {**overrides, "u": row_uuid},
        )
    await db.commit()
    return row_uuid


async def _full_address(db, row_uuid: str) -> str | None:
    return await db.scalar(
        text("SELECT full_address FROM secondary_locations WHERE uuid = :u"), {"u": row_uuid}
    )


@pytest.mark.parametrize(
    "line",
    [
        "花蓮縣光復鄉大進村3鄰糖廠街19號",
        "台北市中山區民生東路一段1巷2弄3衖4號",
        "花蓮縣光復鄉糖廠街19號後面的鐵皮屋",
        "花蓮縣光復鄉糖廠街19號A棟3樓302室",
        "我家在糖廠附近",
        "花蓮縣光復鄉大平",
    ],
)
async def test_the_database_builds_the_line_the_parser_returned(db, line):
    """The generated column equals the line `parse_tw_address` gives, for lines with and without a tail."""
    row_uuid = await _save(db, line)
    assert await _full_address(db, row_uuid) == parse_tw_address(line).full_address


async def test_a_raw_line_wider_than_the_built_line_is_stored_whole(db):
    """The raw column holds 500: interior whitespace is kept there and dropped from the built line."""
    sent = "花蓮縣" + " " * 300 + "光復鄉糖廠街19號"
    row_uuid = await _save(db, sent)
    stored = await db.scalar(
        text("SELECT user_input_address FROM secondary_locations WHERE uuid = :u"), {"u": row_uuid}
    )
    assert stored == sent and len(stored) > 255
    assert await _full_address(db, row_uuid) == "花蓮縣光復鄉糖廠街19號"


async def test_a_blank_address_has_no_line(db):
    """All parts NULL means NULL, not an empty string."""
    row_uuid = await _save(db, None)
    assert await _full_address(db, row_uuid) is None


async def test_nobody_can_write_the_generated_line(db):
    """An INSERT or UPDATE naming `full_address` is refused by the database."""
    row_uuid = await _save(db, "花蓮縣光復鄉糖廠街19號")
    with pytest.raises(DBAPIError, match="full_address"):
        await db.execute(
            text("UPDATE secondary_locations SET full_address = 'x' WHERE uuid = :u"), {"u": row_uuid}
        )
    await db.rollback()
    with pytest.raises(DBAPIError, match="full_address"):
        await db.execute(
            text(
                "INSERT INTO secondary_locations (uuid, geometry_uuid, location_type, full_address)"
                " SELECT gen_random_uuid(), geometry_uuid, 'address', 'x' FROM secondary_locations"
            )
        )


async def test_the_line_follows_an_edit_of_a_part(db):
    """Changing a part changes the line with it; nothing else has to be kept in step."""
    row_uuid = await _save(db, "花蓮縣光復鄉糖廠街19號", no="21號")
    assert await _full_address(db, row_uuid) == "花蓮縣光復鄉糖廠街21號"


async def test_rows_in_step_with_their_line_are_not_drift(db):
    """Parts that come from the parser match a re-parse."""
    await _save(db, "花蓮縣光復鄉大進村3鄰糖廠街19號")
    await _save(db, "花蓮縣光復鄉糖廠街19號後面的鐵皮屋")
    assert await check() == {}


async def test_a_row_whose_parts_differ_from_a_reparse_is_listed(db):
    """A part edited behind the parser's back shows up with its stored and re-parsed values."""
    in_step = await _save(db, "花蓮縣光復鄉糖廠街19號")
    drifting = await _save(db, "花蓮縣光復鄉糖廠街19號", road="中山路", remainder="多出來")

    found = await check()

    assert set(found) == {drifting} and in_step not in found
    assert found[drifting] == {"road": ("中山路", "糖廠街"), "remainder": ("多出來", None)}
    assert report(found) == [f"{drifting}: road '中山路' -> '糖廠街', remainder '多出來' -> None"]


async def test_the_resplit_prints_what_would_change_and_writes_nothing(db):
    """The default run is a dry run: the same report, and the table is left as it was."""
    drifting = await _save(db, "花蓮縣光復鄉糖廠街19號", road="中山路")

    found = await resplit(apply=False)

    assert set(found) == {drifting}
    assert (
        await db.scalar(text("SELECT road FROM secondary_locations WHERE uuid = :u"), {"u": drifting})
        == "中山路"
    )


async def test_the_resplit_with_apply_writes_the_parts_and_the_line_follows(db):
    """`--apply` rewrites the drifted parts from `user_input_address`; a second run finds nothing."""
    drifting = await _save(db, "花蓮縣光復鄉糖廠街19號", road="中山路")
    untouched = await _save(db, "花蓮縣光復鄉大進村3鄰糖廠街19號")

    assert set(await resplit(apply=True)) == {drifting}

    assert await _full_address(db, drifting) == "花蓮縣光復鄉糖廠街19號"
    assert await _full_address(db, untouched) == "花蓮縣光復鄉大進村3鄰糖廠街19號"
    assert await resplit(apply=False) == {}
    assert (await db.execute(select(SecondaryLocation.uuid))).all()  # the rows are still there
    assert await drifted(db) == {}


async def test_a_parser_change_reaches_old_rows_through_the_resplit(db):
    """A row saved before the parser kept 衖 in the alley is re-split to hold it."""
    row_uuid = await _save(db, "臺北市中山區民生東路一段1巷2弄3衖4號", alley="2弄")

    found = await check()

    assert found == {row_uuid: {"alley": ("2弄", "2弄3衖")}}
    await resplit(apply=True)
    assert await _full_address(db, row_uuid) == "臺北市中山區民生東路一段1巷2弄3衖4號"


async def test_a_row_with_parts_but_no_line_is_reported_and_never_cleared(db, capsys):
    """There is nothing to re-parse, so the re-split leaves its parts alone and the tools list it."""
    bare = await _save(db, None, county="花蓮縣", town="光復鄉", road="糖廠街", no="19號")
    drifting = await _save(db, "花蓮縣光復鄉糖廠街19號", road="中山路")

    found, unplaced = await survey(db)
    assert set(found) == {drifting} and unplaced == [bare]
    assert await lineless(db) == [bare]
    assert set(await resplit(apply=True)) == {drifting}

    assert await _full_address(db, bare) == "花蓮縣光復鄉糖廠街19號"
    assert await lineless(db) == [bare]
    assert finish({}, unplaced) == 0  # parts-only rows alone are informational, not drift
    assert bare in capsys.readouterr().out
    assert finish(found, unplaced) == 1


async def test_the_resplit_fills_an_empty_unit_from_the_line_but_never_overwrites_one(db):
    """A unit the line carries and the row lacks is reported and filled; a filled one is left as it is."""
    empty = await _save(db, "花蓮縣光復鄉糖廠街19號3樓", floor=None)
    filled = await _save(db, "花蓮縣光復鄉糖廠街19號3樓", floor="5樓")

    found = await check()

    assert found == {empty: {"floor": (None, "3樓")}}
    assert report(found) == [f"{empty}: floor None -> '3樓'"]
    assert set(await resplit(apply=True)) == {empty}
    floors = dict((await db.execute(text("SELECT uuid::text, floor FROM secondary_locations"))).all())
    assert floors[empty] == "3樓" and floors[filled] == "5樓"
    assert await check() == {}
