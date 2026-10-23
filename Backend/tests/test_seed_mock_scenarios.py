"""scripts/seed_mock_scenarios.sql runs again after testers have used the mock accounts.

Section 0 of the seed deletes the previous seed and whatever testers did with the mock accounts, so
SEED_MOCK can run again on staging. A foreign key into a table that section deletes from, which the
section does not clear first, stops the rerun on that key — and nothing failed when one was added,
because no test ran the seed. The catalog test below catches a new key the section has not heard of;
the rerun tests replay, one each, the keys that were missed before.

The seed runs where it runs on staging: on a database `alembic upgrade head` built, after
scripts/seed_rbac.py. `Base.metadata.create_all` is not enough — some defaults the seed relies on
live only in migrations. Both run as subprocesses, as in tests/test_migration_join_requests.py.
"""

import asyncio
import os
import re
import sys
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_SQL = (_BACKEND_DIR / "scripts" / "seed_mock_scenarios.sql").read_text()


def _dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


_SERVER = TEST_DB_URL.rsplit("/", 1)[0]
_TEMPLATE_DB = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_seed_template"
_CASE_DB = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_seed"
_CASE_DSN = _dsn(f"{_SERVER}/{_CASE_DB}")

MOCK_USER = "c0000000-0000-4000-8000-000000000014"
MOCK_TEAM = "10000000-0000-4000-8000-000000000001"
MOCK_STATION = "a0000000-0000-4000-8000-000000000004"
MOCK_TICKET = "d0000000-0000-4000-8000-000000000001"
MOCK_TICKET_2 = "d0000000-0000-4000-8000-000000000002"
# Rows a real person made: the rerun must leave them where they are.
REAL_USER = "99999999-0000-4000-8000-000000000001"
REAL_TICKET = "99999999-0000-4000-8000-0000000000aa"
REAL_NEED = "99999999-0000-4000-8000-0000000000cc"
REAL_TICKET_2 = "99999999-0000-4000-8000-0000000000dd"
REAL_TEAM = "99999999-0000-4000-8000-0000000000ee"
REAL_STATION = "99999999-0000-4000-8000-0000000000ff"
REAL_MERGE = "99999999-0000-4000-8000-000000000101"
MOCK_NEED = "e0000000-0000-4000-8000-000000000001"
BUILDING = "99999999-0000-4000-8000-0000000000bb"


async def _execute(dsn: str, sql: str) -> None:
    """Run sql on its own connection: the seed is a multi-statement script with its own BEGIN/COMMIT."""
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


async def _fetch(dsn: str, sql: str, *args) -> list[asyncpg.Record]:
    conn = await asyncpg.connect(dsn)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _admin(sql: str) -> None:
    await _execute(_dsn(_ADMIN_DB_URL), sql)


async def _drop_database(name: str) -> None:
    await _admin(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity"
        f" WHERE datname = '{name}' AND pid <> pg_backend_pid()"
    )
    await _admin(f'DROP DATABASE IF EXISTS "{name}"')


async def _subprocess(*args: str, database_url: str) -> None:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        *args,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": database_url},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        pytest.fail(f"{' '.join(args)} failed:\n{stdout.decode()[-3000:]}\n{stderr.decode()[-3000:]}")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def seeded_template():
    """A database at alembic head, with RBAC roles and one run of the mock seed — staging before a rerun."""
    url = f"{_SERVER}/{_TEMPLATE_DB}"
    await _drop_database(_TEMPLATE_DB)
    await _admin(f'CREATE DATABASE "{_TEMPLATE_DB}"')
    await _execute(
        _dsn(url), "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    )
    try:
        await _subprocess("-m", "alembic", "upgrade", "head", database_url=url)
        await _subprocess("scripts/seed_rbac.py", database_url=url)
        await _execute(_dsn(url), SEED_SQL)
        yield
    finally:
        await _drop_database(_TEMPLATE_DB)


@pytest_asyncio.fixture(loop_scope="module")
async def seeded(seeded_template):
    """A copy of the template for one test, so what one test leaves behind never reaches another."""
    await _drop_database(_CASE_DB)
    await _admin(f'CREATE DATABASE "{_CASE_DB}" TEMPLATE "{_TEMPLATE_DB}"')
    try:
        yield
    finally:
        await _drop_database(_CASE_DB)


def _cleanup_statements() -> list[str]:
    """Section 0's statements, comments stripped, one per `;`."""
    section = SEED_SQL.split("-- 0.", 1)[1].split("-- 1. USERS", 1)[0]
    code = "\n".join(line.split("--", 1)[0] for line in section.splitlines())
    return [" ".join(stmt.split()) for stmt in code.split(";") if stmt.strip()]


@pytest.mark.asyncio(loop_scope="module")
async def test_every_key_into_a_cleared_table_is_cleared_first(seeded):
    """Each NO ACTION key into a table section 0 deletes from is named where section 0 clears its table.

    That is a DELETE or UPDATE of the table, or the temp table that picks its rows (mock_geometries
    picks base_geometries by created_by). Keys that cascade or set null clear themselves. Naming the
    column does not prove the order is right; the rerun tests below do that for the keys that were
    missed.
    """
    statements = _cleanup_statements()
    cleared = {m.group(1) for s in statements if (m := re.match(r"DELETE FROM (\w+)", s))}
    keys = await _fetch(
        _CASE_DSN,
        "SELECT c.conrelid::regclass::text AS child, a.attname AS col, c.confrelid::regclass::text AS parent"
        " FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)"
        " WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r')",
    )
    missing = [
        f"{key['child']}.{key['col']} -> {key['parent']}"
        for key in keys
        if key["parent"] in cleared
        and not any(
            re.match(rf"(DELETE FROM|UPDATE|CREATE TEMP TABLE .* FROM) {key['child']}\b", s)
            and re.search(rf"\b{key['col']}\b", s)
            for s in statements
        )
    ]
    assert not missing, f"section 0 of seed_mock_scenarios.sql does not clear: {sorted(missing)}"


@pytest.mark.asyncio(loop_scope="module")
async def test_seed_runs_again_untouched(seeded):
    """The plain rerun SEED_MOCK does on every staging deploy."""
    await _execute(_CASE_DSN, SEED_SQL)


async def _copy_row(table: str, source: str, new_uuid: str, **overrides: str) -> None:
    """Copy a seeded row under a new uuid, so a test gets a valid row without spelling out every column."""
    columns = [
        row["column_name"]
        for row in await _fetch(
            _CASE_DSN,
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'"
            " ORDER BY ordinal_position",
            table,
        )
    ]
    values = {"uuid": f"'{new_uuid}'", **overrides}
    select = ", ".join(values.get(col, col) for col in columns)
    await _execute(
        _CASE_DSN,
        f"INSERT INTO {table} ({', '.join(columns)}) SELECT {select} FROM {table} WHERE uuid = '{source}'",
    )


async def _building(created_by: str) -> None:
    await _copy_row("base_geometries", MOCK_TICKET, BUILDING, created_by=created_by)
    await _execute(
        _CASE_DSN,
        f"INSERT INTO building_maps (uuid, name, floors_above_ground) VALUES ('{BUILDING}', '大樓', 3)",
    )


async def _dedup_verdict() -> None:
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO duplicate_pairs (uuid, entity_kind, low_uuid, high_uuid, method, source_layer,
                                         status, reviewed_by)
            VALUES (gen_random_uuid(), 'ticket', '{MOCK_TICKET}', '{MOCK_TICKET_2}', 'manual', 'manual',
                    'confirmed', '{MOCK_USER}')""",
    )


async def _dedup_verdict_on_real_tickets() -> None:
    for ticket in (REAL_TICKET, REAL_TICKET_2):
        await _copy_row("base_geometries", MOCK_TICKET, ticket, created_by="NULL")
        await _copy_row("tickets", MOCK_TICKET, ticket)
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO duplicate_pairs (uuid, entity_kind, low_uuid, high_uuid, method, source_layer,
                                         status, reviewed_by)
            VALUES (gen_random_uuid(), 'ticket', '{REAL_TICKET}', '{REAL_TICKET_2}', 'manual', 'manual',
                    'confirmed', '{MOCK_USER}')""",
    )


async def _dedup_event() -> None:
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO dedup_audit_events (uuid, entity_kind, event_type, source_layer, actor_uuid)
            VALUES (gen_random_uuid(), 'ticket', 'manual_note', 'manual', '{MOCK_USER}')""",
    )


async def _station_merge() -> None:
    await _execute(
        _CASE_DSN,
        "INSERT INTO station_suggestion_merges (station_uuid, reviewed_by)"
        f" VALUES ('{MOCK_STATION}', '{MOCK_USER}')",
    )


async def _real_merge_revoked_by_mock_account() -> None:
    await _execute(
        _CASE_DSN, f"INSERT INTO users (uuid, name, credibility_score) VALUES ('{REAL_USER}', '真人', 50)"
    )
    await _copy_row("base_geometries", MOCK_STATION, REAL_STATION, created_by="NULL")
    await _copy_row(
        "stations", MOCK_STATION, REAL_STATION, updated_by="NULL", team_uuid="NULL", child_station_uuid="NULL"
    )
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO station_suggestion_merges (uuid, station_uuid, status, reviewed_by, revoked_by,
                                                   revoked_at)
            VALUES ('{REAL_MERGE}', '{REAL_STATION}', 'revoked', '{REAL_USER}', '{MOCK_USER}', now());
            INSERT INTO station_update_suggestions (uuid, target_type, target_uuid, field_name, new_value,
                                                    status, reviewed_by, created_by, merge_uuid)
            VALUES (gen_random_uuid(), 'station', '{REAL_STATION}', 'name', '新站名', 'revoked',
                    '{REAL_USER}', '{REAL_USER}', '{REAL_MERGE}')""",
    )


async def _building_by_mock_account() -> None:
    await _building(created_by=f"'{MOCK_USER}'")


async def _mock_ticket_on_a_building() -> None:
    await _building(created_by="NULL")
    await _execute(
        _CASE_DSN,
        "INSERT INTO building_map_ticket_map (building_map_uuid, ticket_uuid)"
        f" VALUES ('{BUILDING}', '{MOCK_TICKET}')",
    )


async def _real_ticket_audited_by_mock_account() -> None:
    await _copy_row("base_geometries", MOCK_TICKET, REAL_TICKET, created_by="NULL")
    await _copy_row("tickets", MOCK_TICKET, REAL_TICKET, audited_by=f"'{MOCK_USER}'")


async def _real_need_routed_from_a_mock_station() -> None:
    await _execute(
        _CASE_DSN, f"INSERT INTO users (uuid, name, credibility_score) VALUES ('{REAL_USER}', '真人', 50)"
    )
    await _copy_row("base_geometries", MOCK_TICKET, REAL_TICKET, created_by="NULL")
    await _copy_row("tickets", MOCK_TICKET, REAL_TICKET)
    route = (
        await _fetch(
            _CASE_DSN,
            "INSERT INTO routes (uuid, origin_uuid, destination_uuid) VALUES (gen_random_uuid(), $1, $2)"
            " RETURNING uuid::text",
            MOCK_STATION,
            REAL_TICKET,
        )
    )[0][0]
    await _copy_row(
        "ticket_tasks",
        MOCK_NEED,
        REAL_NEED,
        ticket_uuid=f"'{REAL_TICKET}'",
        created_by=f"'{REAL_USER}'",
        route_uuid=f"'{route}'",
    )


async def _invite_link() -> None:
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO team_invites (uuid, token, team_uuid, created_by)
            VALUES (gen_random_uuid(), 'mock-invite', '{MOCK_TEAM}', '{MOCK_USER}')""",
    )


async def _real_person_applies_through_a_mock_invite() -> None:
    await _copy_row("teams", MOCK_TEAM, REAL_TEAM, name="'真的團隊'")
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO users (uuid, name, credibility_score) VALUES ('{REAL_USER}', '真人', 50);
            INSERT INTO team_invites (uuid, token, team_uuid, created_by)
            VALUES ('{BUILDING}', 'mock-invite', '{REAL_TEAM}', '{MOCK_USER}');
            INSERT INTO role_requests (uuid, requested_role, reason, created_by, team_uuid, invite_uuid)
            VALUES ('{REAL_NEED}', 'ngo', '想加入', '{REAL_USER}', '{REAL_TEAM}', '{BUILDING}')""",
    )


async def _real_person_applies_to_mock_team() -> None:
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO users (uuid, name, credibility_score) VALUES ('{REAL_USER}', '真人', 50);
            INSERT INTO role_requests (uuid, requested_role, reason, created_by, team_uuid)
            VALUES (gen_random_uuid(), 'ngo', '想加入', '{REAL_USER}', '{MOCK_TEAM}')""",
    )


# What a tester did with a mock account, and a query that is true once the rerun has handled it.
RERUN_CASES = {
    "dedup verdict by a mock account": (
        _dedup_verdict,
        f"SELECT NOT EXISTS (SELECT 1 FROM duplicate_pairs WHERE reviewed_by = '{MOCK_USER}')",
    ),
    "dedup verdict on real tickets by a mock account": (
        _dedup_verdict_on_real_tickets,
        (
            "SELECT EXISTS (SELECT 1 FROM duplicate_pairs"
            f" WHERE low_uuid = '{REAL_TICKET}' AND reviewed_by IS NULL)"
        ),
    ),
    "dedup audit event by a mock account": (
        _dedup_event,
        f"SELECT NOT EXISTS (SELECT 1 FROM dedup_audit_events WHERE actor_uuid = '{MOCK_USER}')",
    ),
    "station suggestion merge on a mock station": (
        _station_merge,
        "SELECT NOT EXISTS (SELECT 1 FROM station_suggestion_merges)",
    ),
    "real merge revoked by a mock account": (
        _real_merge_revoked_by_mock_account,
        (
            "SELECT EXISTS (SELECT 1 FROM station_suggestion_merges"
            f" WHERE uuid = '{REAL_MERGE}' AND revoked_by IS NULL)"
            f" AND EXISTS (SELECT 1 FROM station_update_suggestions WHERE merge_uuid = '{REAL_MERGE}')"
        ),
    ),
    "building map pinned by a mock account": (
        _building_by_mock_account,
        f"SELECT NOT EXISTS (SELECT 1 FROM building_maps WHERE uuid = '{BUILDING}')",
    ),
    "mock ticket filed on a real building map": (
        _mock_ticket_on_a_building,
        (
            f"SELECT NOT EXISTS (SELECT 1 FROM building_map_ticket_map WHERE ticket_uuid = '{MOCK_TICKET}')"
            f" AND EXISTS (SELECT 1 FROM building_maps WHERE uuid = '{BUILDING}')"
        ),
    ),
    "real ticket audited by a mock account": (
        _real_ticket_audited_by_mock_account,
        f"SELECT EXISTS (SELECT 1 FROM tickets WHERE uuid = '{REAL_TICKET}' AND audited_by IS NULL)",
    ),
    "real need routed from a mock station": (
        _real_need_routed_from_a_mock_station,
        f"SELECT EXISTS (SELECT 1 FROM ticket_tasks WHERE uuid = '{REAL_NEED}' AND route_uuid IS NULL)",
    ),
    "invite link a mock account made": (
        _invite_link,
        "SELECT NOT EXISTS (SELECT 1 FROM team_invites)",
    ),
    "real person applying through a mock account's invite": (
        _real_person_applies_through_a_mock_invite,
        (
            "SELECT NOT EXISTS (SELECT 1 FROM team_invites)"
            f" AND EXISTS (SELECT 1 FROM role_requests WHERE uuid = '{REAL_NEED}' AND invite_uuid IS NULL)"
        ),
    ),
    "real person applying to a mock team": (
        _real_person_applies_to_mock_team,
        (
            f"SELECT NOT EXISTS (SELECT 1 FROM role_requests WHERE team_uuid = '{MOCK_TEAM}')"
            f" AND EXISTS (SELECT 1 FROM users WHERE uuid = '{REAL_USER}')"
        ),
    ),
}


@pytest.mark.asyncio(loop_scope="module")
@pytest.mark.parametrize("case", list(RERUN_CASES))
async def test_seed_runs_again_after_a_tester_used_a_mock_account(seeded, case):
    """The rerun gets past what the tester left, and keeps what a real person made."""
    set_up, handled = RERUN_CASES[case]
    await set_up()

    await _execute(_CASE_DSN, SEED_SQL)

    assert (await _fetch(_CASE_DSN, handled))[0][0] is True
