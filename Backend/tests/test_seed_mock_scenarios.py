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
import uuid
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.services.ticket_verification import disputes_by_ticket
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
REAL_BRIEFING = "99999999-0000-4000-8000-000000000102"
REAL_REQUEST = "99999999-0000-4000-8000-000000000103"
REAL_SUGGESTION = "99999999-0000-4000-8000-000000000104"
REAL_ANNOUNCEMENT = "99999999-0000-4000-8000-000000000105"
BACK_OFFICE_BRIEFING = "99999999-0000-4000-8000-000000000106"
MOCK_NEED = "e0000000-0000-4000-8000-000000000001"
MOCK_BRIEFING = "80000000-0000-4000-8000-000000000001"
MOCK_TEMPLATE = "70000000-0000-4000-8000-000000000001"
MOCK_ANNOUNCEMENT = "90000000-0000-4000-8000-000000000001"
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


SUPER_ADMIN = "c0000000-0000-4000-8000-000000000038"
AUDITOR = "c0000000-0000-4000-8000-000000000039"
_BACK_OFFICE_ROLES = (
    "SELECT c.value, r.name FROM user_contacts c"
    " JOIN user_role_assign a ON a.user_uuid = c.user_uuid"
    " JOIN roles r ON r.uuid = a.role_uuid AND r.kind = 'platform' AND r.name <> 'user'"
    " WHERE c.value IN ('asuper01@mock.test', 'aaudit01@mock.test') AND c.verified"
    " ORDER BY c.value"
)


AVOL04_REQUEST = "60000000-0000-4000-8000-000000000001"
AVOL04_TEAM = "10000000-0000-4000-8000-000000000005"


@pytest.mark.asyncio(loop_scope="module")
async def test_avol04s_pending_government_application_can_be_approved(seeded):
    """The seed's header says asuper01 approves avol04's pending government request — run it.

    Before Spec 026 a `government` request could name no team; after it, approving a team request
    that names none raises 'This application names no team; the applicant should apply again', so
    the row the seed planted (the 角色申請審核中 scenario) could never leave `pending`. The
    applicant says they work for the township disaster-prevention office, so the row must name
    that office's team, and the ordinary join-team approval must go through.
    """
    from app.models.auth import User
    from app.repositories.active_identity_repository import active_identity_repository
    from app.services.role_request import approve

    engine = create_async_engine(f"{_SERVER}/{_CASE_DB}")
    try:
        factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            reviewer = await db.get(User, SUPER_ADMIN)
            # The API layer binds the reviewer's identity before calling approve; without it
            # resolve_scope sees no identity and fail-closes to 403.
            reviewer.active_identity = await active_identity_repository.back_office_identity(
                db, str(reviewer.uuid), None
            )
            request = await approve(db, actor=reviewer, request_uuid=uuid.UUID(AVOL04_REQUEST), note=None)
    finally:
        await engine.dispose()
    assert request.status == "approved", request.status
    assert str(request.granted_team_uuid) == AVOL04_TEAM
    grant = await _fetch(
        _CASE_DSN,
        "SELECT a.role_uuid::text FROM user_role_assign a"
        " JOIN roles r ON r.uuid = a.role_uuid"
        f" WHERE a.user_uuid = 'c0000000-0000-4000-8000-000000000004' AND a.team_uuid = '{AVOL04_TEAM}'"
        " AND r.name = 'member' AND r.kind = 'team'",
    )
    assert len(grant) == 1, "the approval must grant the applicant the team's member role"


@pytest.mark.asyncio(loop_scope="module")
async def test_the_back_office_test_accounts_hold_their_platform_roles(seeded):
    """asuper01 and aaudit01 are super_admin and data_auditor, with verified addresses.

    They were first added on staging by hand, under the mock uuid prefix, so the next SEED_MOCK run
    deleted them along with every other mock account.
    """
    rows = await _fetch(_CASE_DSN, _BACK_OFFICE_ROLES)
    assert [tuple(row) for row in rows] == [
        ("aaudit01@mock.test", "data_auditor"),
        ("asuper01@mock.test", "super_admin"),
    ]


@pytest.mark.asyncio(loop_scope="module")
async def test_the_seed_gives_the_back_office_test_accounts_no_password(seeded):
    """The mock password is in the seed header, and the back office is on a public host.

    Every other mock account signs in with it; these two get theirs from scripts/set_password.py.
    """
    rows = await _fetch(
        _CASE_DSN,
        "SELECT user_uuid::text FROM user_identities WHERE user_uuid = ANY($1::uuid[])",
        [SUPER_ADMIN, AUDITOR],
    )
    assert rows == []


@pytest.mark.asyncio(loop_scope="module")
async def test_a_password_set_on_the_back_office_test_accounts_survives_a_rerun(seeded):
    """SEED_MOCK keeps the two accounts, so the password set once on the VM is not lost to it.

    Their roles are handed out again, and what they did is still cleared (see RERUN_CASES).
    """
    await _execute(
        _CASE_DSN,
        "INSERT INTO user_identities (uuid, user_uuid, provider, password_hash, created_at)"
        f" VALUES (gen_random_uuid(), '{SUPER_ADMIN}', 'password', 'set-on-the-vm', now())",
    )

    await _execute(_CASE_DSN, SEED_SQL)

    identities = await _fetch(
        _CASE_DSN, f"SELECT password_hash FROM user_identities WHERE user_uuid = '{SUPER_ADMIN}'"
    )
    assert [row["password_hash"] for row in identities] == ["set-on-the-vm"]
    rows = await _fetch(_CASE_DSN, _BACK_OFFICE_ROLES)
    assert [tuple(row) for row in rows] == [
        ("aaudit01@mock.test", "data_auditor"),
        ("asuper01@mock.test", "super_admin"),
    ]


# The hash section 1b gives every other mock account: the published password, under the fixed salt.
_MOCK_HASH = re.search(r"'(pbkdf2_sha256\$600000\$mockdata12345678\$[^']+)'", SEED_SQL).group(1)
# What set_password.py or the login page stores: a random 32-hex frontend salt.
_VM_HASH = (
    "pbkdf2_sha256$600000$5b0e3c9a7d214f6e8a1b2c3d4e5f6a7b$9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f$" + "ab" * 32
)


@pytest.mark.asyncio(loop_scope="module")
async def test_a_rerun_drops_the_published_password_from_the_back_office_test_accounts(seeded):
    """Both were added to staging by hand with the mock password; a rerun must not give it super_admin.

    A password set on the VM is kept: its salt is random, so it never carries the seed's fixed one.
    """
    await _execute(
        _CASE_DSN,
        "INSERT INTO user_identities (uuid, user_uuid, provider, password_hash, created_at) VALUES"
        f" (gen_random_uuid(), '{SUPER_ADMIN}', 'password', '{_MOCK_HASH}', now()),"
        f" (gen_random_uuid(), '{AUDITOR}', 'password', '{_VM_HASH}', now())",
    )

    await _execute(_CASE_DSN, SEED_SQL)

    rows = await _fetch(
        _CASE_DSN,
        "SELECT user_uuid::text, password_hash FROM user_identities WHERE user_uuid = ANY($1::uuid[])",
        [SUPER_ADMIN, AUDITOR],
    )
    assert [tuple(row) for row in rows] == [(AUDITOR, _VM_HASH)]


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
                    'confirmed_duplicate', '{MOCK_USER}')""",
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
                    'confirmed_duplicate', '{MOCK_USER}')""",
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


async def _real_briefing_live() -> None:
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO users (uuid, name, credibility_score) VALUES ('{REAL_USER}', '真人', 50);
            UPDATE briefings SET status = 'inactive' WHERE uuid = '{MOCK_BRIEFING}'""",
    )
    real = f"'{REAL_USER}'"
    await _copy_row(
        "briefings",
        MOCK_BRIEFING,
        REAL_BRIEFING,
        template_uuid="NULL",
        status="'published'",
        created_by=real,
        updated_by=real,
        published_by=real,
    )


async def _real_user() -> None:
    await _execute(
        _CASE_DSN, f"INSERT INTO users (uuid, name, credibility_score) VALUES ('{REAL_USER}', '真人', 50)"
    )


async def _real_station() -> None:
    await _real_user()
    await _copy_row("base_geometries", MOCK_STATION, REAL_STATION, created_by="NULL")
    await _copy_row(
        "stations", MOCK_STATION, REAL_STATION, updated_by="NULL", team_uuid="NULL", child_station_uuid="NULL"
    )


async def _real_request_reviewed_by_mock_account() -> None:
    await _real_user()
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO role_requests (uuid, requested_role, reason, created_by, status, reviewed_by,
                                       review_note, closed_at)
            VALUES ('{REAL_REQUEST}', 'data_auditor', '想幫忙審核', '{REAL_USER}', 'rejected', '{MOCK_USER}',
                    '資料不足', now())""",
    )


async def _real_suggestion_reviewed_by_mock_account() -> None:
    await _real_station()
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO station_update_suggestions (uuid, target_type, target_uuid, field_name, new_value,
                                                    status, reviewed_by, created_by)
            VALUES ('{REAL_SUGGESTION}', 'station', '{REAL_STATION}', 'name', '新站名', 'rejected',
                    '{MOCK_USER}', '{REAL_USER}')""",
    )


async def _real_merge_reviewed_by_mock_account() -> None:
    await _real_station()
    await _execute(
        _CASE_DSN,
        f"""INSERT INTO station_suggestion_merges (uuid, station_uuid, status, reviewed_by)
            VALUES ('{REAL_MERGE}', '{REAL_STATION}', 'applied', '{MOCK_USER}');
            INSERT INTO station_update_suggestions (uuid, target_type, target_uuid, field_name, new_value,
                                                    status, reviewed_by, created_by, merge_uuid)
            VALUES ('{REAL_SUGGESTION}', 'station', '{REAL_STATION}', 'name', '新站名', 'approved',
                    '{MOCK_USER}', '{REAL_USER}', '{REAL_MERGE}')""",
    )


async def _real_briefing(**actors: str) -> None:
    """A real person's briefing version, taken down so it never competes with the seed's live one."""
    await _real_user()
    real = f"'{REAL_USER}'"
    values = {
        "template_uuid": "NULL",
        "status": "'inactive'",
        "created_by": real,
        "updated_by": real,
        "published_by": real,
        **actors,
    }
    await _copy_row("briefings", MOCK_BRIEFING, REAL_BRIEFING, **values)


async def _real_briefing_published_by_mock_account() -> None:
    await _real_briefing(updated_by=f"'{MOCK_USER}'", published_by=f"'{MOCK_USER}'")


async def _real_briefing_taken_down_by_mock_account() -> None:
    # Publishing a new version takes the live one down and names the publisher as its updater.
    await _real_briefing(updated_by=f"'{MOCK_USER}'")


async def _real_briefing_from_a_mock_template() -> None:
    await _real_briefing(template_uuid=f"'{MOCK_TEMPLATE}'")


async def _real_announcement_published_by_mock_account() -> None:
    await _real_user()
    await _copy_row(
        "announcements",
        MOCK_ANNOUNCEMENT,
        REAL_ANNOUNCEMENT,
        active="false",
        created_by=f"'{REAL_USER}'",
        updated_by=f"'{MOCK_USER}'",
        published_by=f"'{MOCK_USER}'",
    )


async def _briefing_by_a_back_office_test_account() -> None:
    account = f"'{SUPER_ADMIN}'"
    await _copy_row(
        "briefings",
        MOCK_BRIEFING,
        BACK_OFFICE_BRIEFING,
        template_uuid="NULL",
        status="'inactive'",
        created_by=account,
        updated_by=account,
        published_by=account,
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
    "real briefing live in the mock briefing's state": (
        _real_briefing_live,
        (
            f"SELECT EXISTS (SELECT 1 FROM briefings WHERE uuid = '{REAL_BRIEFING}' AND status = 'published')"
            f" AND NOT EXISTS (SELECT 1 FROM briefings WHERE uuid = '{MOCK_BRIEFING}')"
        ),
    ),
    # A real person's row that a mock account only reviewed, published or last touched stays, with
    # that reference emptied (ADR-393).
    "real role request a mock account reviewed": (
        _real_request_reviewed_by_mock_account,
        (
            "SELECT EXISTS (SELECT 1 FROM role_requests"
            f" WHERE uuid = '{REAL_REQUEST}' AND status = 'rejected' AND reviewed_by IS NULL)"
        ),
    ),
    "real station suggestion a mock account reviewed": (
        _real_suggestion_reviewed_by_mock_account,
        (
            "SELECT EXISTS (SELECT 1 FROM station_update_suggestions"
            f" WHERE uuid = '{REAL_SUGGESTION}' AND status = 'rejected' AND reviewed_by IS NULL)"
        ),
    ),
    "real merge a mock account reviewed": (
        _real_merge_reviewed_by_mock_account,
        (
            "SELECT EXISTS (SELECT 1 FROM station_suggestion_merges"
            f" WHERE uuid = '{REAL_MERGE}' AND status = 'applied' AND reviewed_by IS NULL)"
            " AND EXISTS (SELECT 1 FROM station_update_suggestions"
            f" WHERE uuid = '{REAL_SUGGESTION}' AND merge_uuid = '{REAL_MERGE}' AND reviewed_by IS NULL)"
        ),
    ),
    "real briefing a mock account published": (
        _real_briefing_published_by_mock_account,
        (
            f"SELECT EXISTS (SELECT 1 FROM briefings WHERE uuid = '{REAL_BRIEFING}'"
            f" AND created_by = '{REAL_USER}' AND updated_by IS NULL AND published_by IS NULL)"
        ),
    ),
    "real briefing a mock account took down": (
        _real_briefing_taken_down_by_mock_account,
        (
            "SELECT EXISTS (SELECT 1 FROM briefings WHERE uuid = "
            f"'{REAL_BRIEFING}' AND updated_by IS NULL AND published_by = '{REAL_USER}')"
        ),
    ),
    "real briefing from a mock template": (
        _real_briefing_from_a_mock_template,
        f"SELECT EXISTS (SELECT 1 FROM briefings WHERE uuid = '{REAL_BRIEFING}' AND template_uuid IS NULL)",
    ),
    "real announcement a mock account published": (
        _real_announcement_published_by_mock_account,
        (
            "SELECT EXISTS (SELECT 1 FROM announcements WHERE uuid = "
            f"'{REAL_ANNOUNCEMENT}' AND updated_by IS NULL AND published_by IS NULL)"
        ),
    ),
    # The back-office test accounts are kept, and what they did is cleared like any mock account's.
    "briefing a back-office test account wrote": (
        _briefing_by_a_back_office_test_account,
        f"SELECT NOT EXISTS (SELECT 1 FROM briefings WHERE uuid = '{BACK_OFFICE_BRIEFING}')",
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


_SETTINGS = "SELECT name, short_name, map_center_lat, map_center_lng, map_zoom FROM project_settings"


async def _settings() -> list[tuple]:
    return [tuple(row) for row in await _fetch(_CASE_DSN, _SETTINGS)]


@pytest.mark.asyncio(loop_scope="module")
async def test_the_seed_names_an_unconfigured_deployment_and_opens_its_map_on_guangfu(seeded):
    """ADR-395: with no settings row, as on staging, the seed's disaster becomes the deployment's."""
    assert await _settings() == [("花蓮馬太鞍溪堰塞湖專案", "花蓮馬太鞍溪", 23.67, 121.418, 14)]


@pytest.mark.asyncio(loop_scope="module")
async def test_the_seed_fills_a_missing_view_and_leaves_what_someone_set(seeded):
    """The row is the whole deployment's, so the seed fills only what nobody set, as with announcements."""
    await _execute(
        _CASE_DSN,
        "DELETE FROM project_settings;"
        " INSERT INTO project_settings (uuid, name) VALUES (gen_random_uuid(), '真的災害')",
    )
    await _execute(_CASE_DSN, SEED_SQL)
    filled = await _settings()
    await _execute(
        _CASE_DSN, "UPDATE project_settings SET map_center_lat = 24.0, map_center_lng = 121.6, map_zoom = 12"
    )
    await _execute(_CASE_DSN, SEED_SQL)
    kept = await _settings()

    assert filled == [("真的災害", None, 23.67, 121.418, 14)]
    assert kept == [("真的災害", None, 24.0, 121.6, 12)]


@pytest.mark.asyncio(loop_scope="module")
async def test_the_seed_marks_its_official_stations_by_source(seeded):
    """ADR-394: `source = 'official'` defines official, so the `official` filter finds the seed's 17."""
    rows = await _fetch(
        _CASE_DSN, "SELECT source, is_official, count(*) FROM stations GROUP BY 1, 2 ORDER BY 1, 2"
    )
    official = {(source, flag): count for source, flag, count in rows if source == "official" or flag}
    assert official == {("official", True): 17}


def _seed_ticket(n: int) -> str:
    return f"d0000000-0000-4000-8000-{n:012d}"


@pytest.mark.asyncio(loop_scope="module")
async def test_the_seed_marks_suspected_duplicates_in_each_state_the_review_page_leaves(seeded):
    """ADR-443: a need card filed past the hint, a ticket card waiting, one judged a duplicate and not merged.

    Each marks both of its tickets, naming the other, as the board reads them; no other ticket is marked.
    """
    tickets = [row[0] for row in await _fetch(_CASE_DSN, "SELECT uuid::text FROM tickets")]
    engine = create_async_engine(f"{_SERVER}/{_CASE_DB}")
    try:
        async with AsyncSession(engine) as db:
            disputes = await disputes_by_ticket(db, tickets)
    finally:
        await engine.dispose()

    named = {mine: [ref.uuid for ref in refs] for mine, refs in disputes.items()}
    pairs = [(7, 25), (10, 12), (17, 19)]
    assert named == {
        _seed_ticket(mine): [_seed_ticket(theirs)] for a, b in pairs for mine, theirs in ((a, b), (b, a))
    }
