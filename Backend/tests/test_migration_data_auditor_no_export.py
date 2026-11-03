"""Migration d8a3f6c2e417: existing databases take the data auditor's two exports away (ADR-460).

Built like tests/test_migration_audit_export_grant.py: a deployed database where the auditor holds
both exports — one of them narrowed at runtime through /admin/rbac — beside a super admin and a direct
grant to one account. The upgrade must take the role's grants at any scope and leave the others; the
downgrade must put the role's `all` grants back.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The revision this one chains off (BE-RBAC-3 B3, gov member grants).
_BEFORE = "c4e7a2b91d05"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_KEYS = ("ticket.export", "station.export")


async def _alembic(url: str, *args: str) -> None:
    """Run alembic against `url` in a subprocess, failing the test on an error."""
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
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        pytest.fail(f"alembic {' '.join(args)} failed:\n{stdout.decode()}\n{stderr.decode()}")


async def _grants(conn) -> set[tuple[str, str, str]]:
    """(holder, key, scope) of every grant of the two exports, by role name or by user name."""
    roles = await conn.execute(
        text(
            "SELECT r.name, p.key, a.scope FROM role_permission_assign a"
            " JOIN roles r ON r.uuid = a.role_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
            " WHERE p.key IN ('ticket.export', 'station.export')"
        )
    )
    users = await conn.execute(
        text(
            "SELECT u.name, p.key, a.scope FROM user_permission_assign a"
            " JOIN users u ON u.uuid = a.user_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
            " WHERE p.key IN ('ticket.export', 'station.export')"
        )
    )
    return set(roles.all()) | set(users.all())


def _role_grant(role: str, key: str, scope: str) -> str:
    return (
        "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
        f" SELECT gen_random_uuid(), r.uuid, p.uuid, '{scope}' FROM roles r, permissions p"
        f" WHERE r.name = '{role}' AND p.key = '{key}'"
    )


_DEPLOYED = [
    _role_grant("data_auditor", "ticket.export", "all"),
    _role_grant("data_auditor", "station.export", "team"),  # narrowed at runtime
    _role_grant("super_admin", "ticket.export", "all"),
    _role_grant("super_admin", "station.export", "all"),
    "INSERT INTO users (uuid, name, credibility_score) VALUES (gen_random_uuid(), '特例', 50)",
    (
        "INSERT INTO user_permission_assign (uuid, user_uuid, permission_uuid, scope)"
        " SELECT gen_random_uuid(), u.uuid, p.uuid, 'all' FROM users u, permissions p"
        " WHERE u.name = '特例' AND p.key = 'ticket.export'"
    ),
]


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcome():
    """A deployed database, migrated up and back."""
    db_name = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_auditor_no_export"
    url = TEST_DB_URL.rsplit("/", 1)[0] + "/" + db_name
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await conn.exec_driver_sql(f'CREATE DATABASE "{db_name}"')
    engine = create_async_engine(url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await _alembic(url, "upgrade", _BEFORE)
        async with engine.connect() as conn:
            for name in ("super_admin", "data_auditor"):
                await conn.execute(
                    text("INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :n, 'platform')"),
                    {"n": name},
                )
            for key in _KEYS:
                await conn.execute(
                    text(
                        "INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), :k)"
                        " ON CONFLICT DO NOTHING"
                    ),
                    {"k": key},
                )
            for statement in _DEPLOYED:
                await conn.execute(text(statement))
        await _alembic(url, "upgrade", "head")
        async with engine.connect() as conn:
            upgraded = await _grants(conn)
        await _alembic(url, "downgrade", _BEFORE)
        async with engine.connect() as conn:
            downgraded = await _grants(conn)
        return {"upgraded": upgraded, "downgraded": downgraded}
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await admin.dispose()


_OTHERS = {
    ("super_admin", "ticket.export", "all"),
    ("super_admin", "station.export", "all"),
    ("特例", "ticket.export", "all"),
}


@pytest.mark.asyncio(loop_scope="module")
async def test_the_data_auditor_loses_both_exports_at_any_scope(outcome):
    """The role's grants go, whatever scope /admin/rbac left them at; nobody else's do."""
    assert outcome["upgraded"] == _OTHERS


@pytest.mark.asyncio(loop_scope="module")
async def test_stepping_back_gives_the_data_auditor_both_exports_at_all(outcome):
    """The downgrade puts back the `all` grants the role held before."""
    assert outcome["downgraded"] == _OTHERS | {
        ("data_auditor", "ticket.export", "all"),
        ("data_auditor", "station.export", "all"),
    }
