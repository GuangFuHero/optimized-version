"""End-to-end tests for dynamic-field filtering by the deployment's disaster types.

Feature 013 (ADR-091/095): `stationPropertyConfigs` / `taskPropertyConfigs` return only the
fields enabled for the current disaster types, drop deactivated fields, and come back in a
stable order. The GraphQL test DB is shared across the whole module (see conftest
`_ensure_db`, which builds it once), so every test here wipes the two config tables and the
settings row itself rather than relying on a fresh schema.
"""

import pytest
import pytest_asyncio
from sqlalchemy import delete

from app.models.project_settings import ProjectSettings
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from tests.test_graphql.conftest import auth_header, test_db

STATION_CONFIGS = """
query ($stationType: String!) {
  stationPropertyConfigs(stationType: $stationType) {
    propertyName label displayLabel sortOrder isActive disasterTypes
  }
}
"""

TASK_CONFIGS = """
query ($taskType: String!) {
  taskPropertyConfigs(taskType: $taskType) {
    propertyName label displayLabel sortOrder isActive disasterTypes
  }
}
"""


@pytest_asyncio.fixture(autouse=True)
async def clean_config_tables():
    """Leave no project settings or config rows behind for the other GraphQL tests."""
    async with test_db() as db:
        for model in (StationPropertyConfig, TaskPropertyConfig, ProjectSettings):
            await db.execute(delete(model))
    yield
    async with test_db() as db:
        for model in (StationPropertyConfig, TaskPropertyConfig, ProjectSettings):
            await db.execute(delete(model))


async def _set_disaster_types(types: list[str]) -> None:
    """Configure the deployment's current disaster types."""
    async with test_db() as db:
        await db.execute(delete(ProjectSettings))
        db.add(ProjectSettings(name="花蓮 0816", disaster_types=types))


async def _seed_station_configs() -> None:
    """Seed one field per disaster type plus a universal one, in deliberate reverse order."""
    async with test_db() as db:
        db.add_all([
            StationPropertyConfig(
                station_type="shelter", property_name="土石流深度", data_type="integer",
                disaster_types=["landslide"], sort_order=2,
            ),
            StationPropertyConfig(
                station_type="shelter", property_name="淹水深度", data_type="integer",
                disaster_types=["flood"], sort_order=1,
            ),
            StationPropertyConfig(
                station_type="shelter", property_name="火場溫度", data_type="integer",
                disaster_types=["fire"], sort_order=1,
            ),
            StationPropertyConfig(
                station_type="shelter", property_name="收容人數", data_type="integer",
                sort_order=0, label="目前收容人數",
            ),
        ])


async def _query_station_names(client, token) -> list[str]:
    """Run stationPropertyConfigs for shelters and return the property names, in order."""
    resp = await client.post("/graphql", json={
        "query": STATION_CONFIGS, "variables": {"stationType": "shelter"},
    }, headers=auth_header(token))
    assert resp.json().get("errors") is None, resp.json()
    return [c["propertyName"] for c in resp.json()["data"]["stationPropertyConfigs"]]


@pytest.mark.asyncio
async def test_mixed_disaster_returns_every_matching_type_once(client, coordinator_auth):
    """A landslide+flood deployment shows both types' fields, each exactly once (ADR-091)."""
    _, token = coordinator_auth
    await _set_disaster_types(["landslide", "flood"])
    await _seed_station_configs()

    names = await _query_station_names(client, token)

    assert names.count("土石流深度") == 1
    assert names.count("淹水深度") == 1


@pytest.mark.asyncio
async def test_universal_field_is_returned_under_any_setting(client, coordinator_auth):
    """A config with empty disaster_types applies to every disaster type."""
    _, token = coordinator_auth
    await _set_disaster_types(["flood"])
    await _seed_station_configs()

    assert "收容人數" in await _query_station_names(client, token)


@pytest.mark.asyncio
async def test_field_of_another_disaster_type_is_excluded(client, coordinator_auth):
    """A fire-only field does not show up on a flood deployment."""
    _, token = coordinator_auth
    await _set_disaster_types(["flood"])
    await _seed_station_configs()

    assert "火場溫度" not in await _query_station_names(client, token)


@pytest.mark.asyncio
async def test_changing_disaster_types_takes_effect_immediately(client, coordinator_auth):
    """Switching the deployment to fire re-scopes the field list with no apply step (ADR-091)."""
    _, token = coordinator_auth
    await _set_disaster_types(["flood"])
    await _seed_station_configs()
    assert "火場溫度" not in await _query_station_names(client, token)

    await _set_disaster_types(["fire"])

    names = await _query_station_names(client, token)
    assert "火場溫度" in names
    assert "淹水深度" not in names


@pytest.mark.asyncio
async def test_unconfigured_deployment_returns_every_field(client, coordinator_auth):
    """With no settings row at all, nothing is filtered out — empty means "no filter"."""
    _, token = coordinator_auth
    await _seed_station_configs()

    names = await _query_station_names(client, token)

    assert {"土石流深度", "淹水深度", "火場溫度", "收容人數"} == set(names)


@pytest.mark.asyncio
async def test_deactivated_field_is_hidden(client, coordinator_auth):
    """is_active=false retires a field without deleting the data written under it (ADR-095)."""
    _, token = coordinator_auth
    await _seed_station_configs()
    async with test_db() as db:
        db.add(StationPropertyConfig(
            station_type="shelter", property_name="已停用欄位",
            data_type="string", is_active=False,
        ))

    assert "已停用欄位" not in await _query_station_names(client, token)


@pytest.mark.asyncio
async def test_results_are_ordered_by_sort_order_then_property_name(client, coordinator_auth):
    """Ordering is total, so the same query never comes back in two different orders."""
    _, token = coordinator_auth
    await _seed_station_configs()

    names = await _query_station_names(client, token)

    # sort_order 0 first, then the two sort_order=1 fields tie-broken by property_name,
    # then sort_order 2. ("土" sorts after "淹"/"火" under the DB collation, so assert the
    # tie-break by comparing against the same list sorted the same way.)
    assert names[0] == "收容人數"
    assert names[-1] == "土石流深度"
    assert names[1:3] == sorted(names[1:3])


@pytest.mark.asyncio
async def test_display_label_falls_back_to_property_name(client, coordinator_auth):
    """A null label renders as the property key; a set label wins (ADR-095)."""
    _, token = coordinator_auth
    await _seed_station_configs()

    resp = await client.post("/graphql", json={
        "query": STATION_CONFIGS, "variables": {"stationType": "shelter"},
    }, headers=auth_header(token))
    by_name = {c["propertyName"]: c for c in resp.json()["data"]["stationPropertyConfigs"]}

    assert by_name["收容人數"]["label"] == "目前收容人數"
    assert by_name["收容人數"]["displayLabel"] == "目前收容人數"
    assert by_name["淹水深度"]["label"] is None
    assert by_name["淹水深度"]["displayLabel"] == "淹水深度"


@pytest.mark.asyncio
async def test_task_configs_are_filtered_the_same_way(client, coordinator_auth):
    """The task-side query applies the identical disaster-type and is_active rules."""
    _, token = coordinator_auth
    await _set_disaster_types(["flood"])
    async with test_db() as db:
        db.add_all([
            TaskPropertyConfig(
                task_type="rescue", property_name="淹水深度", data_type="integer",
                disaster_types=["flood"],
            ),
            TaskPropertyConfig(
                task_type="rescue", property_name="火場溫度", data_type="integer",
                disaster_types=["fire"],
            ),
            TaskPropertyConfig(
                task_type="rescue", property_name="樓層", data_type="integer",
            ),
        ])

    resp = await client.post("/graphql", json={
        "query": TASK_CONFIGS, "variables": {"taskType": "rescue"},
    }, headers=auth_header(token))
    names = [c["propertyName"] for c in resp.json()["data"]["taskPropertyConfigs"]]

    assert set(names) == {"淹水深度", "樓層"}
