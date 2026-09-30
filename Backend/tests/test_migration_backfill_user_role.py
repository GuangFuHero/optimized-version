"""Spec/019 Q17: the backfill gives every account the `user` grant the site acts as.

Built the way tests/test_migration_legacy_disaster_data.py is: stop before the backfill, write
the accounts a deployed database holds, upgrade to head, and read what came out. Every other
test builds its schema from `Base.metadata`, which carries no migration's data changes. An
empty database — no `user` role to grant — is covered by test_migrations_match_models, which
upgrades one to head.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# role_requests (C-B1): the last revision before the backfill.
_BEFORE = "666b59ab2581"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_backfill"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Who holds what before the backfill. A super admin set by bootstrap_admin has had `user`
# replaced (ADR-184), and a team-only account is what an unassigned platform role leaves.
_ACCOUNTS = {
    "super admin": ["super_admin"],
    "team member": ["member"],
    "citizen": ["user"],
    "data auditor": ["user", "data_auditor"],
}


async def _alembic(*args: str) -> None:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        *args,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": _DB_URL},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        pytest.fail(f"alembic {' '.join(args)} failed:\n{stdout.decode()}\n{stderr.decode()}")


async def _drop(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}"')


async def _roles_by_account(conn) -> dict[str, list[str]]:
    rows = await conn.execute(
        text(
            "SELECT u.name, r.name FROM user_role_assign ura"
            " JOIN users u ON u.uuid = ura.user_uuid JOIN roles r ON r.uuid = ura.role_uuid"
            " ORDER BY u.name, r.name"
        )
    )
    held: dict[str, list[str]] = {}
    for account, role in rows.all():
        held.setdefault(account, []).append(role)
    return held


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def backfilled():
    """Stop at `_BEFORE`, write the accounts, upgrade to head, then step back down once.

    Yields what each account holds after the upgrade and after the downgrade, as plain data
    so the function-scoped tests can read it from their own event loops.
    """
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
        setup = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with setup.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await setup.dispose()

        await _alembic("upgrade", _BEFORE)

        engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            for role, kind in (
                ("user", "platform"),
                ("data_auditor", "platform"),
                ("super_admin", "platform"),
                ("member", "team"),
            ):
                await conn.execute(
                    text("INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :name, :kind)"),
                    {"name": role, "kind": kind},
                )
            team_uuid = (
                await conn.execute(
                    text(
                        "INSERT INTO teams (uuid, name, type, status)"
                        " VALUES (gen_random_uuid(), '慈濟', 'ngo', 'active') RETURNING uuid"
                    )
                )
            ).scalar_one()
            for account, roles in _ACCOUNTS.items():
                user_uuid = (
                    await conn.execute(
                        text(
                            "INSERT INTO users (uuid, name, credibility_score)"
                            " VALUES (gen_random_uuid(), :name, 50) RETURNING uuid"
                        ),
                        {"name": account},
                    )
                ).scalar_one()
                for role in roles:
                    await conn.execute(
                        text(
                            "INSERT INTO user_role_assign (uuid, user_uuid, role_uuid, team_uuid, role_kind)"
                            " SELECT gen_random_uuid(), :user_uuid, uuid,"
                            "        CASE WHEN kind = 'team' THEN CAST(:team_uuid AS uuid) END, kind"
                            " FROM roles WHERE name = :role"
                        ),
                        {"user_uuid": user_uuid, "team_uuid": team_uuid, "role": role},
                    )

        await _alembic("upgrade", "head")
        async with engine.connect() as conn:
            upgraded = await _roles_by_account(conn)
        await _alembic("downgrade", "-1")
        async with engine.connect() as conn:
            downgraded = await _roles_by_account(conn)
        await engine.dispose()

        yield {"upgraded": upgraded, "downgraded": downgraded}
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="session")
async def test_every_account_holds_user_once_and_keeps_what_it_had(backfilled):
    """Accounts without `user` gain it; those holding it are not given a second; nothing is lost."""
    assert backfilled["upgraded"] == {
        "citizen": ["user"],
        "data auditor": ["data_auditor", "user"],
        "super admin": ["super_admin", "user"],
        "team member": ["member", "user"],
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_stepping_back_leaves_the_grants_in_place(backfilled):
    """Downgrade cannot tell a backfilled `user` from one granted since, so it removes none."""
    assert backfilled["downgraded"] == backfilled["upgraded"]
