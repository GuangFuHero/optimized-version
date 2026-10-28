"""`currentDisaster`: the deployment's disaster as the public site names it (ADR-392).

The site's top bar shows the disaster's name before anyone signs in, while the settings it comes from
stay behind project.view (ADR-090, ADR-324). The GraphQL test DB is shared across modules (conftest
`_ensure_db`), so every test here clears the settings row itself, before and after.
"""

import pytest
import pytest_asyncio
from sqlalchemy import delete

from app.models.project_settings import ProjectSettings
from tests.test_graphql.conftest import test_db

pytestmark = pytest.mark.asyncio

CURRENT_DISASTER = "query { currentDisaster { name } }"
WITH_SHORT_NAME = "query { currentDisaster { name shortName } }"
WITH_MAP_VIEW = "query { currentDisaster { name mapView { lat lng zoom } } }"


@pytest_asyncio.fixture(autouse=True)
async def _no_settings_row():
    """Leave no settings row behind for the other GraphQL tests."""
    async with test_db() as db:
        await db.execute(delete(ProjectSettings))
    yield
    async with test_db() as db:
        await db.execute(delete(ProjectSettings))


async def _configure(**fields) -> None:
    async with test_db() as db:
        db.add(ProjectSettings(**fields))


async def _query(client, query: str) -> dict:
    body = (await client.post("/graphql", json={"query": query})).json()
    assert "errors" not in body, body
    return body["data"]


async def test_a_guest_reads_the_disasters_name(client):
    """No sign-in and no capability: it names the site, as its title does."""
    await _configure(name="花蓮馬太鞍溪堰塞湖專案", disaster_types=["flood"])

    assert (await _query(client, CURRENT_DISASTER))["currentDisaster"] == {"name": "花蓮馬太鞍溪堰塞湖專案"}


async def test_the_short_name_is_what_the_top_bar_writes(client):
    """The full name goes in the tooltip; the short one fits a phone's top bar, and is null until set."""
    await _configure(name="花蓮馬太鞍溪堰塞湖專案", short_name="花蓮馬太鞍溪", disaster_types=[])
    named = (await _query(client, WITH_SHORT_NAME))["currentDisaster"]
    async with test_db() as db:
        await db.execute(delete(ProjectSettings))
    await _configure(name="花蓮 0816", disaster_types=[])
    unnamed = (await _query(client, WITH_SHORT_NAME))["currentDisaster"]

    assert named == {"name": "花蓮馬太鞍溪堰塞湖專案", "shortName": "花蓮馬太鞍溪"}
    assert unnamed == {"name": "花蓮 0816", "shortName": None}


async def test_a_guest_reads_where_the_map_opens(client):
    """ADR-395: the site's map opens on the disaster, before anyone signs in."""
    await _configure(
        name="花蓮馬太鞍溪堰塞湖專案",
        disaster_types=[],
        map_center_lat=23.67,
        map_center_lng=121.418,
        map_zoom=14,
    )

    assert (await _query(client, WITH_MAP_VIEW))["currentDisaster"] == {
        "name": "花蓮馬太鞍溪堰塞湖專案",
        "mapView": {"lat": 23.67, "lng": 121.418, "zoom": 14},
    }


async def test_without_a_view_the_site_opens_its_map_where_it_always_did(client):
    """Null rather than a made-up centre, so the site can tell nobody set one and keeps its own default."""
    await _configure(name="花蓮 0816", disaster_types=[])

    assert (await _query(client, WITH_MAP_VIEW))["currentDisaster"] == {"name": "花蓮 0816", "mapView": None}


async def test_an_unconfigured_deployment_has_no_current_disaster(client):
    """Null until the settings are first written, so the site keeps its platform name."""
    assert (await _query(client, CURRENT_DISASTER))["currentDisaster"] is None
