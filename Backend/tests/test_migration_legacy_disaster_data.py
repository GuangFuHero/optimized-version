"""Guard the feature-018 migration against data that predates it.

`test_migrations_match_models.py` proves the migrations build the right *shape*; this proves
they survive the rows already in a deployed database. Both findings it covers were reproduced
against a real instance and neither was visible to any other test, because every other test
builds its schema from `Base.metadata` and starts empty.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The revision this feature chains off: the last one where `tickets.disaster_type` is still a
# scalar and `data_type` is still free text.
_BEFORE = "c3f0a1b2d4e6"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_legacy"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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
async def migrated_legacy_rows():
    """Stop at `_BEFORE`, write the rows a live deployment would hold, then upgrade to head.

    Yields the resulting values as plain data so the function-scoped tests can read them from
    their own event loops.
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
            # `data_type` as main's own API docs describe it: lower case, free text.
            for name, data_type in (
                ("legacy_lower_string", "string"),
                ("legacy_lower_integer", "integer"),
                ("legacy_lower_enum", "enum"),
                ("legacy_capital_enum", "Enum"),
            ):
                await conn.execute(text(
                    "INSERT INTO station_property_config"
                    " (uuid, station_type, property_name, data_type, disaster_types)"
                    " VALUES (gen_random_uuid(), 'shelter', :name, :data_type, '{mudslide}')"
                ), {"name": name, "data_type": data_type})
            await conn.execute(text(
                "INSERT INTO project_settings (uuid, name, disaster_types)"
                " VALUES (gen_random_uuid(), '花蓮 0816', '{mudslide,flood}')"
            ))
            # A ticket is `base_geometries` + `tickets`; the legacy label lives on the child.
            ticket_uuid = (await conn.execute(text(
                "INSERT INTO base_geometries (uuid, property_name, geometry)"
                " VALUES (gen_random_uuid(), 'request',"
                "         ST_SetSRID(ST_MakePoint(121.42, 23.67), 4326))"
                " RETURNING uuid"
            ))).scalar_one()
            await conn.execute(text(
                "INSERT INTO tickets"
                " (uuid, title, contact_name, status, priority, disaster_type)"
                " VALUES (:uuid, '土石流受困', '王小明', 'pending', 'low', 'mudslide')"
            ), {"uuid": ticket_uuid})

        await _alembic("head")

        async with engine.connect() as conn:
            configs = dict((await conn.execute(text(
                "SELECT property_name, data_type FROM station_property_config"
                " WHERE property_name LIKE 'legacy_%'"
            ))).all())
            scoped = (await conn.execute(text(
                "SELECT disaster_types FROM station_property_config"
                " WHERE property_name = 'legacy_lower_string'"
            ))).scalar_one()
            settings = (await conn.execute(text(
                "SELECT disaster_types FROM project_settings"
            ))).scalar_one()
            tickets = (await conn.execute(text(
                "SELECT disaster_types FROM tickets"
            ))).scalar_one()
        await engine.dispose()

        yield {
            "configs": configs, "config_scope": scoped,
            "settings": settings, "tickets": tickets,
        }
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="session")
async def test_lower_case_legacy_data_types_are_migrated_not_left_to_fail_the_check(
    migrated_legacy_rows,
):
    """Reaching head at all is the assertion: an unmapped token violates the new CHECK.

    `data_type` was free text and main's `stationPropertyConfigs` documented it as `'string',
    'integer', 'float', or 'enum'`, so a capital-only map failed the upgrade outright.
    """
    configs = migrated_legacy_rows["configs"]
    assert configs["legacy_lower_string"] == "text"
    assert configs["legacy_lower_integer"] == "number"
    assert configs["legacy_lower_enum"] == "single_select"
    assert configs["legacy_capital_enum"] == "single_select"


@pytest.mark.asyncio(loop_scope="session")
async def test_the_mudslide_rename_reaches_settings_and_configs_not_only_tickets(
    migrated_legacy_rows,
):
    """Renaming one side would leave the config scoped to a key no ticket carries (ADR-270)."""
    assert migrated_legacy_rows["tickets"] == ["landslide"]
    assert migrated_legacy_rows["config_scope"] == ["landslide"]
    assert migrated_legacy_rows["settings"] == ["landslide", "flood"]
