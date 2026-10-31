"""Migration 197c174410bd: role kind, need timestamps and the address line stored once.

Databases built to the revision before: one whose rows the upgrade repairs and rebuilds, one holding an
address line the parser would not give back, and one holding parts with no line; the last two are refused.
The first goes up, down and up again.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_BEFORE = "9dd1f61063fe"
_REVISION = "197c174410bd"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

USER = "'c0000000-0000-4000-8000-000000000001'"
PLATFORM_ROLE = "'d0000000-0000-4000-8000-000000000001'"
TEAM_ROLE = "'d0000000-0000-4000-8000-000000000002'"
TEAM = "'e0000000-0000-4000-8000-000000000001'"
TICKET = "'a0000000-0000-4000-8000-000000000001'"
STATION = "'a0000000-0000-4000-8000-000000000002'"
_POINT = "ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326)"
_T0, _T1, _T2 = "'2026-10-01 00:00+00'", "'2026-10-02 00:00+00'", "'2026-10-03 00:00+00'"


def _need(number: int, name: str, status: str, updated: str, completed: str = "NULL") -> str:
    """One need row: `completed` is the completed_at it is written with, canceled_at is never set."""
    return (
        f"('f0000000-0000-4000-8000-00000000000{number}', {TICKET}, 'hr', '{name}', 2, '{status}',"
        f" 'user', {USER}, {_T0}, {updated}, {completed}, NULL)"
    )


_SETUP = [
    f"INSERT INTO users (uuid, name, credibility_score) VALUES ({USER}, '甲', 50)",
    f"INSERT INTO roles (uuid, name, kind) VALUES ({PLATFORM_ROLE}, 'platform_role', 'platform'),"
    f" ({TEAM_ROLE}, 'team_role', 'team')",
    f"INSERT INTO teams (uuid, name, type, status) VALUES ({TEAM}, '隊', 'ngo', 'active')",
    "INSERT INTO user_role_assign (user_uuid, role_uuid, role_kind, team_uuid) VALUES"
    f" ({USER}, {PLATFORM_ROLE}, 'platform', NULL), ({USER}, {TEAM_ROLE}, 'team', {TEAM})",
    "INSERT INTO base_geometries (uuid, property_name, geometry, created_by) VALUES"
    f" ({TICKET}, 'request', {_POINT}, {USER}), ({STATION}, 'station', {_POINT}, {USER})",
    "INSERT INTO tickets (uuid, title, contact_name, status, priority, task_type, audit_status)"
    f" VALUES ({TICKET}, '單', '王', 'pending', 'medium', 'hr', 'no_audit')",
    # fulfilled without completed_at, pending with one, canceled without canceled_at, and one that agrees
    "INSERT INTO ticket_tasks (uuid, ticket_uuid, task_type, task_name, quantity, status, source, created_by,"
    " created_at, updated_at, completed_at, canceled_at) VALUES "
    + ", ".join(
        [
            _need(1, "甲", "fulfilled", _T1),
            _need(2, "乙", "pending", _T1, completed=_T1),
            _need(3, "丙", "canceled", _T2),
            _need(4, "丁", "pending", _T1),
        ]
    ),
]
_ADDRESS_COLUMNS = (
    "INSERT INTO secondary_locations (uuid, geometry_uuid, location_type, full_address, county, town, road,"
    " no, alley, lane, section) VALUES "
)
# One line the parser gives back unchanged, one with text it cannot place and a 衖 the old parts dropped.
_ADDRESSES = (
    _ADDRESS_COLUMNS
    + f"('b0000000-0000-4000-8000-000000000001', {TICKET}, 'address', '花蓮縣光復鄉糖廠街19號',"
    " '花蓮縣', '光復鄉', '糖廠街', '19號', NULL, NULL, NULL),"
    f" ('b0000000-0000-4000-8000-000000000002', {STATION}, 'address',"
    " '臺北市中山區民生東路一段1巷2弄3衖4號後面', '臺北市', '中山區', '民生東路', '4號',"
    " '2弄', '1巷', '一段')"
)
# A stored line holding a unit, which the parser cuts from the line, so it would not rebuild to itself.
_UNPARSED_ADDRESS = (
    _ADDRESS_COLUMNS.replace(", alley, lane, section", "")
    + f"('b0000000-0000-4000-8000-000000000003', {TICKET}, 'address', '花蓮縣光復鄉糖廠街19號3樓',"
    " '花蓮縣', '光復鄉', '糖廠街', '19號')"
)
# Parts with no line, as the earlier address rename left them; a re-parse would clear every one.
_PARTS_WITHOUT_LINE = (
    _ADDRESS_COLUMNS.replace(", full_address", "").replace(", alley, lane, section", "")
    + f"('b0000000-0000-4000-8000-000000000004', {TICKET}, 'address', '花蓮縣', '光復鄉', '糖廠街', '19號')"
)


async def _alembic(url: str, *args: str) -> tuple[int, str]:
    """Run alembic against `url` in a subprocess; returns its exit code and what it wrote to stderr."""
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        *args,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": url},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    return process.returncode, stderr.decode()


async def _scalar(engine, sql: str):
    async with engine.connect() as conn:
        return await conn.scalar(text(sql))


async def _refused(engine, sql: str) -> str | None:
    """The database's message for a statement it refuses, or None when it runs."""
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql))
    except DBAPIError as err:
        return str(err.orig)
    return None


async def _run(suffix: str, *, addresses: tuple[str, ...]) -> dict:
    db_name = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_3nf_{suffix}"
    url = TEST_DB_URL.rsplit("/", 1)[0] + "/" + db_name
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await conn.exec_driver_sql(f'CREATE DATABASE "{db_name}"')
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        assert (await _alembic(url, "upgrade", _BEFORE))[0] == 0
        async with engine.begin() as conn:
            for statement in (*_SETUP, *addresses):
                await conn.execute(text(statement))
        audit_rows = "SELECT count(*) FROM audit_logs WHERE table_name = 'secondary_locations'"
        audited_before = await _scalar(engine, audit_rows)
        code, stderr = await _alembic(url, "upgrade", _REVISION)
        result = {"upgraded": code == 0, "says": stderr}
        if code != 0:
            result["role_kind_column_left"] = await _scalar(
                engine,
                "SELECT count(*) FROM information_schema.columns WHERE table_name = 'user_role_assign'"
                " AND column_name = 'role_kind'",
            )
            return result

        result["role_kind_column"] = await _scalar(
            engine,
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'user_role_assign'"
            " AND column_name = 'role_kind'",
        )
        grant = f"INSERT INTO user_role_assign (user_uuid, role_uuid, team_uuid) VALUES ({USER}, "
        result["platform_with_team"] = await _refused(engine, f"{grant}{PLATFORM_ROLE}, {TEAM})")
        result["team_without_team"] = await _refused(engine, f"{grant}{TEAM_ROLE}, NULL)")
        result["kind_change"] = await _refused(
            engine, f"UPDATE roles SET kind = 'platform' WHERE uuid = {TEAM_ROLE}"
        )
        async with engine.connect() as conn:
            tasks = await conn.execute(
                text(
                    "SELECT task_name, status, completed_at IS NOT NULL, canceled_at IS NOT NULL,"
                    " completed_at = updated_at, canceled_at = updated_at FROM ticket_tasks"
                )
            )
            result["tasks"] = {row[0]: row[1:] for row in tasks.all()}
        result["stamps"] = await _refused(
            engine, "UPDATE ticket_tasks SET status = 'fulfilled' WHERE task_name = '丁'"
        )
        async with engine.connect() as conn:
            result["addresses"] = {
                str(row[0])[-1]: row[1:]
                for row in (
                    await conn.execute(
                        text(
                            "SELECT uuid, user_input_address, remainder, alley, full_address"
                            " FROM secondary_locations"
                        )
                    )
                ).all()
            }
        result["audit_rows_added"] = await _scalar(engine, audit_rows) - audited_before
        result["audit_trigger_enabled"] = await _scalar(
            engine,
            "SELECT tgenabled::text FROM pg_trigger WHERE tgname = 'audit_trigger_secondary_locations'",
        )
        result["generated"] = await _refused(engine, "UPDATE secondary_locations SET full_address = 'x'")

        assert (await _alembic(url, "downgrade", _BEFORE))[0] == 0
        async with engine.connect() as conn:
            kinds = await conn.execute(text("SELECT role_kind FROM user_role_assign"))
            result["kinds_after_downgrade"] = sorted(kinds.scalars())
        result["full_address_after_downgrade"] = await _scalar(
            engine, "SELECT full_address FROM secondary_locations WHERE uuid::text LIKE '%2'"
        )
        result["plain_after_downgrade"] = await _refused(
            engine, "UPDATE secondary_locations SET full_address = 'x' WHERE uuid::text LIKE '%1'"
        )
        result["stamps_after_downgrade"] = await _refused(
            engine,
            "INSERT INTO ticket_tasks (uuid, ticket_uuid, task_type, task_name, status, source, created_by)"
            f" VALUES (gen_random_uuid(), {TICKET}, 'hr', 'x', 'fulfilled', 'user',"
            " 'c0000000-0000-4000-8000-000000000001')",
        )
        result["upgraded_again"] = (await _alembic(url, "upgrade", _REVISION))[0] == 0
        return result
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await admin.dispose()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """A database the upgrade can repair, and one holding a line it cannot rebuild."""
    return {
        "repairable": await _run("repairable", addresses=(_ADDRESSES,)),
        "unparsed": await _run("unparsed", addresses=(_ADDRESSES, _UNPARSED_ADDRESS)),
        "lineless": await _run("lineless", addresses=(_ADDRESSES, _PARTS_WITHOUT_LINE)),
    }


@pytest.mark.asyncio(loop_scope="module")
async def test_the_role_kind_column_is_replaced_by_triggers(outcomes):
    """The copy is gone; a platform grant with a team, a team grant without, and a kind change are refused."""
    done = outcomes["repairable"]
    assert done["upgraded"] and done["role_kind_column"] == 0
    assert "a platform role carries no team" in done["platform_with_team"]
    assert (
        "ck_ura_role_team_kind" in done["platform_with_team"]
        or "carries no team" in done["platform_with_team"]
    )
    assert "a team role must carry a team" in done["team_without_team"]
    assert "cannot change" in done["kind_change"]


@pytest.mark.asyncio(loop_scope="module")
async def test_needs_whose_timestamps_disagreed_are_repaired_from_the_status(outcomes):
    """Missing times are stamped with updated_at, stray ones cleared, and the CHECK then refuses more."""
    done = outcomes["repairable"]
    assert (
        "0 rows" not in done["says"] and "3 rows have completed_at or canceled_at disagreeing" in done["says"]
    )
    tasks = done["tasks"]
    assert tasks["甲"] == ("fulfilled", True, False, True, None)
    assert tasks["乙"] == ("pending", False, False, None, None)
    assert tasks["丙"] == ("canceled", False, True, None, True)
    assert tasks["丁"] == ("pending", False, False, None, None)
    assert "ck_ticket_tasks_stamps_match_status" in done["stamps"]


@pytest.mark.asyncio(loop_scope="module")
async def test_each_address_is_split_again_and_the_line_is_rebuilt_unchanged(outcomes):
    """The raw line is the old line; the remainder and the 衖 appear; the generated line is the old one."""
    addresses = outcomes["repairable"]["addresses"]
    assert addresses["1"] == ("花蓮縣光復鄉糖廠街19號", None, None, "花蓮縣光復鄉糖廠街19號")
    assert addresses["2"] == (
        "臺北市中山區民生東路一段1巷2弄3衖4號後面",
        "後面",
        "2弄3衖",
        "臺北市中山區民生東路一段1巷2弄3衖4號後面",
    )
    assert "full_address" in outcomes["repairable"]["generated"]


@pytest.mark.asyncio(loop_scope="module")
async def test_the_backfill_writes_no_audit_rows_and_leaves_the_audit_trigger_on(outcomes):
    """Rewriting the derived columns is not an edit, and later edits are still audited."""
    assert outcomes["repairable"]["audit_rows_added"] == 0
    assert outcomes["repairable"]["audit_trigger_enabled"] == "O"


@pytest.mark.asyncio(loop_scope="module")
async def test_a_line_that_would_not_rebuild_stops_the_upgrade_and_changes_nothing(outcomes):
    """The upgrade says how many rows, and the transaction leaves the schema as it was."""
    stopped = outcomes["unparsed"]
    assert stopped["upgraded"] is False
    assert "1 secondary_locations rows would rebuild to a different address line" in stopped["says"]
    assert stopped["role_kind_column_left"] == 1


@pytest.mark.asyncio(loop_scope="module")
async def test_parts_with_no_line_are_kept_and_the_line_is_built_from_them(outcomes):
    """Nothing to re-parse: the upgrade succeeds, the parts stay, user_input_address stays NULL."""
    done = outcomes["lineless"]
    assert done["upgraded"] and done["upgraded_again"]
    assert done["addresses"]["4"] == (None, None, None, "花蓮縣光復鄉糖廠街19號")
    assert "2 rows re-parsed, 0 would rebuild" in done["says"]


@pytest.mark.asyncio(loop_scope="module")
async def test_stepping_back_restores_the_copy_the_plain_line_and_drops_the_check(outcomes):
    """role_kind and a plain full_address come back with their values; a mismatch is stored again."""
    done = outcomes["repairable"]
    assert done["kinds_after_downgrade"] == ["platform", "team"]
    assert done["full_address_after_downgrade"] == "臺北市中山區民生東路一段1巷2弄3衖4號後面"
    assert done["plain_after_downgrade"] is None
    assert done["stamps_after_downgrade"] is None
    assert done["upgraded_again"] is True
