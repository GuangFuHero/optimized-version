"""Guard the ADR-286 grant migration against the grants a deployed database already holds.

The RBAC seed never overwrites a grant (ADR-055), so an existing deployment opens a requester's
contact details only through this migration. Built like test_migration_legacy_disaster_data.py:
stop at the revision before it, write the grants a live database would hold, upgrade to head and
read them back. Every other test builds its schema from `Base.metadata` and never runs it.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The revision this migration chains off.
_BEFORE = "6c5a9d3d3444"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_view_pii"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Each role's ticket.view_pii grant as a live database would hold it before the migration.
_GRANTS_BEFORE = {
    ("user", "platform"): "own",          # the seed's default: moves to all
    ("member", "team"): "zone",           # the seed's default: moves to all
    ("admin", "team"): "none",            # narrowed at runtime (/api/v1/admin/rbac): left alone
    ("data_auditor", "platform"): "all",  # already all
    ("field_lead", "team"): "own",        # a role the seed does not define: left alone
}


async def _alembic(revision: str) -> None:
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "alembic", "upgrade", revision,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": _DB_URL},
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        pytest.fail(f"alembic upgrade {revision} failed:\n{stdout.decode()}\n{stderr.decode()}")


async def _drop(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}"')


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def view_pii_after_upgrade():
    """Stop at `_BEFORE`, grant as a live database would, upgrade to head; yield role -> scope.

    Plain data, so the function-scoped tests can read it from their own event loops.
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

        await _alembic(_BEFORE)

        engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            permission = (await conn.execute(text(
                "INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'ticket.view_pii')"
                " RETURNING uuid"
            ))).scalar_one()
            for (name, kind), scope in _GRANTS_BEFORE.items():
                role = (await conn.execute(text(
                    "INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :name, :kind)"
                    " RETURNING uuid"
                ), {"name": name, "kind": kind})).scalar_one()
                await conn.execute(text(
                    "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
                    " VALUES (gen_random_uuid(), :role, :permission, :scope)"
                ), {"role": role, "permission": permission, "scope": scope})

        await _alembic("head")

        async with engine.connect() as conn:
            scopes = dict((await conn.execute(text(
                "SELECT r.name, a.scope FROM role_permission_assign a"
                " JOIN roles r ON r.uuid = a.role_uuid"
            ))).all())
        await engine.dispose()

        yield scopes
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio
async def test_the_seeded_roles_open_contact_details_to_anyone_signed_in(view_pii_after_upgrade):
    """`user` at own and the team roles at zone were the seed's defaults: they move to all."""
    assert view_pii_after_upgrade["user"] == "all"
    assert view_pii_after_upgrade["member"] == "all"
    assert view_pii_after_upgrade["data_auditor"] == "all"


@pytest.mark.asyncio
async def test_a_grant_changed_at_runtime_or_a_role_the_seed_lacks_is_left_alone(view_pii_after_upgrade):
    """The runtime database is the source of truth (ADR-055): only seed defaults move."""
    assert view_pii_after_upgrade["admin"] == "none"
    assert view_pii_after_upgrade["field_lead"] == "own"
