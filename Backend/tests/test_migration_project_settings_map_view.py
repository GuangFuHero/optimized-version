"""Guard the ADR-395 migration: the settings row gets the map's opening view, set whole or not at all.

The three columns arrive empty, so a deployment keeps opening the site's map where the frontend's
own default puts it until someone sets one. Downgrade drops them, and with them any view that was set.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The revision this one chains off (#125's actor columns), and this one.
_BEFORE = "facf37b5c79d"
_AFTER = "ba24b9c49284"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_map_view"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_MAP_COLUMNS = {"map_center_lat", "map_center_lng", "map_zoom"}


async def _alembic(*args: str) -> tuple[int, str]:
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
    return process.returncode, stdout.decode() + stderr.decode()


async def _drop(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}"')


async def _refused(engine, assignments: str) -> bool:
    """Whether setting `assignments` on the settings row is refused by the database."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text(f"UPDATE project_settings SET {assignments}"))
        return False
    except IntegrityError:
        return True


async def _columns(engine) -> set[str]:
    async with engine.connect() as conn:
        return await conn.run_sync(
            lambda sync: {c["name"] for c in inspect(sync).get_columns("project_settings")}
        )


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """A configured deployment before the migration, upgraded, written to, then downgraded."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
        engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        code, output = await _alembic("upgrade", _BEFORE)
        assert code == 0, output
        async with engine.connect() as conn:
            await conn.execute(
                text(
                    "INSERT INTO project_settings (uuid, name)"
                    " VALUES (gen_random_uuid(), '花蓮馬太鞍溪堰塞湖專案')"
                )
            )

        code, output = await _alembic("upgrade", _AFTER)
        assert code == 0, output
        async with engine.connect() as conn:
            view_after = (
                await conn.execute(
                    text("SELECT map_center_lat, map_center_lng, map_zoom FROM project_settings")
                )
            ).one()
        partial_refused = {
            "lat only": await _refused(engine, "map_center_lat = 23.67"),
            "no zoom": await _refused(engine, "map_center_lat = 23.67, map_center_lng = 121.418"),
        }
        whole_refused = await _refused(
            engine, "map_center_lat = 23.67, map_center_lng = 121.418, map_zoom = 14"
        )
        out_of_range_refused = {
            "swapped centre": await _refused(
                engine, "map_center_lat = 121.418, map_center_lng = 23.67, map_zoom = 14"
            ),
            "longitude off the globe": await _refused(
                engine, "map_center_lat = 23.67, map_center_lng = 181, map_zoom = 14"
            ),
            "zoom 6": await _refused(
                engine, "map_center_lat = 23.67, map_center_lng = 121.418, map_zoom = 6"
            ),
            "zoom 19": await _refused(
                engine, "map_center_lat = 23.67, map_center_lng = 121.418, map_zoom = 19"
            ),
        }

        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        columns_back = await _columns(engine)
        async with engine.connect() as conn:
            name_back = (await conn.execute(text("SELECT name FROM project_settings"))).scalar_one()
        await engine.dispose()

        yield {
            "view_after": tuple(view_after),
            "partial_refused": partial_refused,
            "whole_refused": whole_refused,
            "out_of_range_refused": out_of_range_refused,
            "columns_back": columns_back,
            "name_back": name_back,
        }
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrade_leaves_an_existing_deployment_without_a_view(outcomes):
    """Nothing is backfilled: until someone sets a view, the site opens where its own default is."""
    assert outcomes["view_after"] == (None, None, None)


@pytest.mark.asyncio(loop_scope="module")
async def test_a_view_is_stored_whole_or_not_at_all(outcomes):
    """A centre without a zoom, or half a centre, is no view the map can open on."""
    assert outcomes["partial_refused"] == {"lat only": True, "no zoom": True}
    assert outcomes["whole_refused"] is False


@pytest.mark.asyncio(loop_scope="module")
async def test_a_view_the_map_cannot_open_is_refused_by_the_database(outcomes):
    """The API's ranges hold for a row written by SQL too: a swapped centre or a zoom of 19 never lands."""
    assert outcomes["out_of_range_refused"] == {
        "swapped centre": True,
        "longitude off the globe": True,
        "zoom 6": True,
        "zoom 19": True,
    }


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_drops_the_view_and_keeps_the_row(outcomes):
    """The columns go, and with them any view that was set; the disaster itself stays."""
    assert not outcomes["columns_back"] & _MAP_COLUMNS
    assert outcomes["name_back"] == "花蓮馬太鞍溪堰塞湖專案"
