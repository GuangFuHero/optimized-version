"""Guard the ADR-337/342 grant migration against the grants a deployed database already holds.

The RBAC seed never overwrites a grant (ADR-055), so an existing deployment opens the AI 重複審核
queue only through this migration. Built like test_migration_contact_details_open.py: stop at the
revision before it, write what a live database would hold, upgrade to head and read it back, then
downgrade and read again.
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
_BEFORE = "209c4375c3e1"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_ai_dup"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_ROLES = {"super_admin": "platform", "data_auditor": "platform", "user": "platform", "admin": "team"}

# The seed registers every Perm key, so a live database holds these two rows but no grant of them.
# `ai_duplicate.revoke` is new and absent.
_KEYS_BEFORE = ("ai_duplicate.view", "ai_duplicate.review")

# A grant someone set by hand at /api/v1/admin/rbac before the migration: left alone.
_RUNTIME_GRANT = ("data_auditor", "ai_duplicate.view", "none")

_READ = text(
    "SELECT r.name, p.key, a.scope FROM role_permission_assign a"
    " JOIN roles r ON r.uuid = a.role_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
    " WHERE p.key LIKE 'ai_duplicate.%'"
)


async def _alembic(command: str, revision: str) -> None:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        command,
        revision,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": _DB_URL},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        pytest.fail(f"alembic {command} {revision} failed:\n{stdout.decode()}\n{stderr.decode()}")


async def _drop(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}"')


async def _snapshot(engine) -> dict:
    """Grants as {(role, key): scope} and the registered ai_duplicate keys."""
    async with engine.connect() as conn:
        grants = {(role, key): scope for role, key, scope in (await conn.execute(_READ)).all()}
        keys = set(
            (
                await conn.execute(text("SELECT key FROM permissions WHERE key LIKE 'ai_duplicate.%'"))
            ).scalars()
        )
    return {"grants": grants, "keys": keys}


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def ai_dup_migration():
    """Stop at `_BEFORE`, set up a live database, upgrade, downgrade, upgrade again.

    Yields plain snapshots, so the function-scoped tests can read them from their own loops.
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
            roles = {}
            for name, kind in _ROLES.items():
                roles[name] = (
                    await conn.execute(
                        text(
                            "INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :name, :kind)"
                            " RETURNING uuid"
                        ),
                        {"name": name, "kind": kind},
                    )
                ).scalar_one()
            keys = {}
            for key in _KEYS_BEFORE:
                keys[key] = (
                    await conn.execute(
                        text(
                            "INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), :key)"
                            " RETURNING uuid"
                        ),
                        {"key": key},
                    )
                ).scalar_one()
            role, key, scope = _RUNTIME_GRANT
            await conn.execute(
                text(
                    "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
                    " VALUES (gen_random_uuid(), :role, :permission, :scope)"
                ),
                {"role": roles[role], "permission": keys[key], "scope": scope},
            )

        await _alembic("upgrade", "head")
        upgraded = await _snapshot(engine)
        await _alembic("downgrade", _BEFORE)
        downgraded = await _snapshot(engine)
        await _alembic("upgrade", "head")
        reupgraded = await _snapshot(engine)
        await engine.dispose()

        yield {"upgraded": upgraded, "downgraded": downgraded, "reupgraded": reupgraded}
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio
async def test_super_admin_gets_view_review_and_revoke(ai_dup_migration):
    """ADR-337/342: super_admin holds all three at `all`."""
    grants = ai_dup_migration["upgraded"]["grants"]
    for key in ("ai_duplicate.view", "ai_duplicate.review", "ai_duplicate.revoke"):
        assert grants[("super_admin", key)] == "all"


@pytest.mark.asyncio
async def test_data_auditor_gets_review_but_no_revoke(ai_dup_migration):
    """ADR-342: undoing another reviewer's verdict stays with super_admin."""
    grants = ai_dup_migration["upgraded"]["grants"]
    assert grants[("data_auditor", "ai_duplicate.review")] == "all"
    assert ("data_auditor", "ai_duplicate.revoke") not in grants


@pytest.mark.asyncio
async def test_a_grant_set_at_runtime_keeps_its_scope(ai_dup_migration):
    """The runtime database is the source of truth (ADR-055): only missing grants are inserted."""
    assert ai_dup_migration["upgraded"]["grants"][("data_auditor", "ai_duplicate.view")] == "none"


@pytest.mark.asyncio
async def test_other_roles_get_nothing(ai_dup_migration):
    """Only the two platform roles of DEDUP-008 gain a grant."""
    grants = ai_dup_migration["upgraded"]["grants"]
    assert {role for role, _ in grants} == {"super_admin", "data_auditor"}


@pytest.mark.asyncio
async def test_revoke_is_registered(ai_dup_migration):
    """`ai_duplicate.revoke` is new, so the migration registers it."""
    assert "ai_duplicate.revoke" in ai_dup_migration["upgraded"]["keys"]


@pytest.mark.asyncio
async def test_downgrade_removes_what_the_upgrade_added_and_keeps_the_runtime_grant(ai_dup_migration):
    """Downgrade drops revoke and the `all` grants, not the hand-set `none`."""
    downgraded = ai_dup_migration["downgraded"]
    assert downgraded["keys"] == set(_KEYS_BEFORE)
    assert downgraded["grants"] == {("data_auditor", "ai_duplicate.view"): "none"}


@pytest.mark.asyncio
async def test_upgrading_again_lands_on_the_same_grants(ai_dup_migration):
    """Upgrade after downgrade inserts the same grants and nothing twice."""
    assert ai_dup_migration["reupgraded"] == ai_dup_migration["upgraded"]
