"""Spec 026: the join-requests migration, run against data a deployed database holds.

Built like tests/test_migration_backfill_user_role.py: stop at main's head before this feature,
write the role requests Spec 019 left behind, upgrade to head and read what came out.

ADR-350 point 9: a pending `government` / `ngo` application names no team, so no one could ever
approve it. The migration rejects those with a note; everything else is left as it was.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# briefing announcement drafts: main's head when Spec 026 started.
_BEFORE = "209c4375c3e1"
_LEGACY_NOTE = "申請流程已更新，請重新送出申請。"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_join"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# What Spec 019 can leave in `role_requests`: (applicant, requested role, status).
_REQUESTS = [
    ("gov pending", "government", "pending"),
    ("ngo pending", "ngo", "pending"),
    ("auditor pending", "data_auditor", "pending"),
    ("ngo rejected", "ngo", "rejected"),
    ("auditor approved", "data_auditor", "approved"),
]


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


async def _requests(conn) -> dict[str, tuple[str, str | None]]:
    rows = await conn.execute(
        text(
            "SELECT u.name, rr.status, rr.review_note, rr.closed_at IS NOT NULL"
            " FROM role_requests rr JOIN users u ON u.uuid = rr.created_by"
        )
    )
    return {name: (status, note, closed) for name, status, note, closed in rows.all()}


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def migrated():
    """Stop at `_BEFORE`, write Spec 019's requests, upgrade to head; keep the DB for the tests."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
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
        for applicant, role, status in _REQUESTS:
            user_uuid = (
                await conn.execute(
                    text(
                        "INSERT INTO users (uuid, name, credibility_score)"
                        " VALUES (gen_random_uuid(), :name, 50) RETURNING uuid"
                    ),
                    {"name": applicant},
                )
            ).scalar_one()
            await conn.execute(
                text(
                    "INSERT INTO role_requests (uuid, requested_role, reason, status, created_by)"
                    " VALUES (gen_random_uuid(), :role, '理由', :status, :user_uuid)"
                ),
                {"role": role, "status": status, "user_uuid": user_uuid},
            )
    await _alembic("upgrade", "head")
    try:
        yield engine
    finally:
        await engine.dispose()
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="session")
async def test_pending_government_and_ngo_requests_are_rejected_with_the_note(migrated):
    """They name no team, so the migration closes them instead of leaving them in the queues."""
    async with migrated.connect() as conn:
        requests = await _requests(conn)
    assert requests["gov pending"] == ("rejected", _LEGACY_NOTE, True)
    assert requests["ngo pending"] == ("rejected", _LEGACY_NOTE, True)


@pytest.mark.asyncio(loop_scope="session")
async def test_other_requests_are_left_as_they_were(migrated):
    """A data auditor application can still be approved; closed ones keep their outcome."""
    async with migrated.connect() as conn:
        requests = await _requests(conn)
    assert requests["auditor pending"] == ("pending", None, False)
    assert requests["ngo rejected"] == ("rejected", None, False)
    assert requests["auditor approved"] == ("approved", None, False)


async def _insert_request(conn, **columns) -> None:
    user_uuid = (
        await conn.execute(
            text("INSERT INTO users (uuid, name, credibility_score) VALUES (gen_random_uuid(), 'x', 50) RETURNING uuid")
        )
    ).scalar_one()
    values = {"requested_role": "government", "reason": "理由", "status": "rejected", **columns}
    names = ", ".join(values)
    params = ", ".join(f":{name}" for name in values)
    await conn.execute(
        text(f"INSERT INTO role_requests (uuid, created_by, {names}) VALUES (gen_random_uuid(), :user_uuid, {params})"),
        {"user_uuid": user_uuid, **values},
    )


async def _team(conn) -> str:
    return (
        await conn.execute(
            text("INSERT INTO teams (uuid, name, type, status) VALUES (gen_random_uuid(), 't', 'gov', 'active') RETURNING uuid")
        )
    ).scalar_one()


@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.parametrize(
    "columns",
    [
        pytest.param({"requested_role": "data_auditor", "new_team_name": "新隊"}, id="auditor names a team"),
        pytest.param({"new_team_name": "新隊", "team": True}, id="both a team and a new name"),
        pytest.param({"applicant_phone": "+886912345678"}, id="new government request with no target"),
        pytest.param({"invite": True, "new_team_name": "新隊"}, id="invite without a team"),
    ],
)
async def test_checks_refuse_a_request_with_the_wrong_target(migrated, columns):
    """ck_role_requests_target / ck_role_requests_invite, as the spec's data model describes."""
    columns = dict(columns)
    async with migrated.connect() as conn:
        team_uuid = await _team(conn)
        if columns.pop("team", False):
            columns["team_uuid"] = team_uuid
        if columns.pop("invite", False):
            creator = (
                await conn.execute(
                    text("INSERT INTO users (uuid, name, credibility_score) VALUES (gen_random_uuid(), 'c', 50) RETURNING uuid")
                )
            ).scalar_one()
            columns["invite_uuid"] = (
                await conn.execute(
                    text(
                        "INSERT INTO team_invites (uuid, token, team_uuid, created_by)"
                        " VALUES (gen_random_uuid(), md5(random()::text), :team, :creator) RETURNING uuid"
                    ),
                    {"team": team_uuid, "creator": creator},
                )
            ).scalar_one()
        with pytest.raises(IntegrityError):
            await _insert_request(conn, **columns)


@pytest.mark.asyncio(loop_scope="session")
async def test_checks_accept_the_three_kinds(migrated):
    """A member request, a new-team application and a data auditor application all fit."""
    async with migrated.connect() as conn:
        team_uuid = await _team(conn)
        await _insert_request(conn, team_uuid=team_uuid, applicant_phone="+886912345678")
        await _insert_request(conn, requested_role="ngo", new_team_name="新隊", applicant_phone="+886912345678")
        await _insert_request(conn, requested_role="data_auditor", applicant_phone="+886912345678")


@pytest.mark.asyncio(loop_scope="session")
async def test_an_invite_expires_24_hours_after_the_database_created_it(migrated):
    """Both times are database defaults (ADR-353); nothing the client sends sets them."""
    async with migrated.connect() as conn:
        team_uuid = await _team(conn)
        creator = (
            await conn.execute(
                text("INSERT INTO users (uuid, name, credibility_score) VALUES (gen_random_uuid(), 'c', 50) RETURNING uuid")
            )
        ).scalar_one()
        lifetime = (
            await conn.execute(
                text(
                    "INSERT INTO team_invites (uuid, token, team_uuid, created_by)"
                    " VALUES (gen_random_uuid(), 'tok-24h', :team, :creator)"
                    " RETURNING expires_at - created_at"
                ),
                {"team": team_uuid, "creator": creator},
            )
        ).scalar_one()
    assert lifetime.total_seconds() == 24 * 3600


@pytest.mark.asyncio(loop_scope="session")
async def test_team_status_is_one_of_three(migrated):
    """ADR-357: active, suspended or disbanded."""
    async with migrated.connect() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text("INSERT INTO teams (uuid, name, type, status) VALUES (gen_random_uuid(), 'x', 'gov', 'paused')")
            )


@pytest.mark.asyncio(loop_scope="session")
async def test_downgrade_then_upgrade_again(migrated):
    """Stepping back and forward once leaves a working head; rejected requests stay rejected."""
    await _alembic("downgrade", "-1")
    await _alembic("upgrade", "head")
    async with migrated.connect() as conn:
        requests = await _requests(conn)
    assert requests["gov pending"][0] == "rejected"
