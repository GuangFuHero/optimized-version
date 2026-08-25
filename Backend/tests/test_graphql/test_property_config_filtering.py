"""End-to-end tests for dynamic-field filtering by the deployment's disaster types.

Feature 013 (ADR-091/095): `stationPropertyConfigs` / `taskPropertyConfigs` return only the
fields enabled for the current disaster types, drop deactivated fields, and come back in a
stable order. The GraphQL test DB is shared across the whole module (see conftest
`_ensure_db`, which builds it once), so every test here wipes the two config tables and the
settings row itself rather than relying on a fresh schema.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.project_settings import ProjectSettings
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from tests.test_graphql.conftest import auth_header, test_db

_VIEWER_ROLE = "Field Viewer (test)"

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


# --------------------------------------------------------------------------------------
# The management view: retired fields have to stay reachable by someone (ADR-096)
# --------------------------------------------------------------------------------------

STATION_CONFIGS_INCLUDING_INACTIVE = """
query ($stationType: String!) {
  stationPropertyConfigs(stationType: $stationType, includeInactive: true) {
    propertyName isActive stationType
  }
}
"""

TASK_CONFIGS_INCLUDING_INACTIVE = """
query ($taskType: String!) {
  taskPropertyConfigs(taskType: $taskType, includeInactive: true) { propertyName isActive }
}
"""

UPSERT_STATION = """
mutation ($stationType: String!, $input: UpsertPropertyConfigInput!) {
  upsertStationPropertyConfig(stationType: $stationType, input: $input) {
    propertyName dataType enumOptions label sortOrder isActive
  }
}
"""


async def _field_viewer_token() -> str:
    """A user who may read configs but not edit them — the includeInactive gate's negative case."""
    async with test_db() as db:
        role = (await db.execute(select(Role).where(Role.name == _VIEWER_ROLE))).scalar_one_or_none()
        if role is None:
            role = Role(name=_VIEWER_ROLE, kind="platform")
            db.add(role)
            # The Permission rows already exist (seeded once by the module fixture); reuse
            # the dynamic_field.view one rather than inserting a second.
            view_perm = (await db.execute(
                select(Permission).where(Permission.key == Perm.FIELD_VIEW.value)
            )).scalar_one()
            await db.flush()
            db.add(RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=view_perm.uuid, scope="all"
            ))
        user = User(name=f"viewer_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
        return create_access_token(data={"sub": str(user.uuid)})


@pytest.mark.asyncio
async def test_include_inactive_surfaces_retired_fields(client, coordinator_auth):
    """Without this the only way back to a retired field is remembering its exact key."""
    _, token = coordinator_auth
    await _seed_station_configs()
    async with test_db() as db:
        db.add(StationPropertyConfig(
            station_type="shelter", property_name="已停用欄位",
            data_type="string", is_active=False,
        ))

    assert "已停用欄位" not in await _query_station_names(client, token)

    resp = await client.post("/graphql", json={
        "query": STATION_CONFIGS_INCLUDING_INACTIVE, "variables": {"stationType": "shelter"},
    }, headers=auth_header(token))
    rows = {c["propertyName"]: c for c in resp.json()["data"]["stationPropertyConfigs"]}

    assert rows["已停用欄位"]["isActive"] is False
    assert rows["收容人數"]["isActive"] is True  # active fields still come along


@pytest.mark.asyncio
async def test_include_inactive_also_works_for_tasks(client, coordinator_auth):
    """The task-side query exposes the same management view."""
    _, token = coordinator_auth
    async with test_db() as db:
        db.add(TaskPropertyConfig(
            task_type="rescue", property_name="已停用欄位", data_type="string", is_active=False,
        ))

    resp = await client.post("/graphql", json={
        "query": TASK_CONFIGS_INCLUDING_INACTIVE, "variables": {"taskType": "rescue"},
    }, headers=auth_header(token))

    assert [c["propertyName"] for c in resp.json()["data"]["taskPropertyConfigs"]] == ["已停用欄位"]


@pytest.mark.asyncio
async def test_include_inactive_requires_edit_permission(client):
    """Seeing what someone retired goes with the right to retire it, not with form access."""
    token = await _field_viewer_token()
    async with test_db() as db:
        db.add(StationPropertyConfig(
            station_type="shelter", property_name="已停用欄位",
            data_type="string", is_active=False,
        ))

    ok = await client.post("/graphql", json={
        "query": STATION_CONFIGS, "variables": {"stationType": "shelter"},
    }, headers=auth_header(token))
    assert ok.json().get("errors") is None, ok.json()

    denied = await client.post("/graphql", json={
        "query": STATION_CONFIGS_INCLUDING_INACTIVE, "variables": {"stationType": "shelter"},
    }, headers=auth_header(token))
    assert denied.json().get("errors"), denied.json()


# --------------------------------------------------------------------------------------
# enum_options survives an edit that does not mention it (ADR-098)
# --------------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_editing_the_label_keeps_the_stored_enum_options(client, coordinator_auth):
    """Setting a label on an Enum field must not blank the options the form renders."""
    _, token = coordinator_auth
    async with test_db() as db:
        db.add(StationPropertyConfig(
            station_type="all", property_name="crowd_level", data_type="Enum",
            enum_options=["low", "medium", "high"], sort_order=3,
        ))

    resp = await client.post("/graphql", json={
        "query": UPSERT_STATION, "variables": {
            "stationType": "all",
            "input": {"propertyName": "crowd_level", "dataType": "Enum", "label": "人潮"},
        },
    }, headers=auth_header(token))
    cfg = resp.json()["data"]["upsertStationPropertyConfig"]

    assert cfg["label"] == "人潮"
    assert cfg["enumOptions"] == ["low", "medium", "high"]
    assert cfg["sortOrder"] == 3
    async with test_db() as db:
        row = (await db.execute(select(StationPropertyConfig).where(
            StationPropertyConfig.property_name == "crowd_level"))).scalar_one()
        assert row.enum_options == ["low", "medium", "high"]


@pytest.mark.asyncio
async def test_an_empty_list_is_how_enum_options_are_cleared(client, coordinator_auth):
    """Omission means "leave it"; [] is the explicit "there are no options any more"."""
    _, token = coordinator_auth
    async with test_db() as db:
        db.add(StationPropertyConfig(
            station_type="all", property_name="crowd_level", data_type="Enum",
            enum_options=["low", "high"],
        ))

    resp = await client.post("/graphql", json={
        "query": UPSERT_STATION, "variables": {
            "stationType": "all",
            "input": {"propertyName": "crowd_level", "dataType": "string", "enumOptions": []},
        },
    }, headers=auth_header(token))

    assert resp.json()["data"]["upsertStationPropertyConfig"]["enumOptions"] == []


# --------------------------------------------------------------------------------------
# The order is total, including across the 'all' bucket (ADR-097)
# --------------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_order_is_stable_when_all_and_own_bucket_rows_tie(client, coordinator_auth):
    """('all', X) and ('shelter', X) tie on (sort_order, property_name) — uuid breaks it."""
    _, token = coordinator_auth
    async with test_db() as db:
        db.add_all([
            StationPropertyConfig(station_type="all", property_name="crowd_level",
                                  data_type="string", sort_order=0),
            StationPropertyConfig(station_type="shelter", property_name="crowd_level",
                                  data_type="string", sort_order=0),
        ])

    async def _types() -> list[str]:
        resp = await client.post("/graphql", json={
            "query": STATION_CONFIGS_INCLUDING_INACTIVE, "variables": {"stationType": "shelter"},
        }, headers=auth_header(token))
        return [c["stationType"] for c in resp.json()["data"]["stationPropertyConfigs"]]

    before = await _types()
    # Rewriting a tuple moves it to the end of the heap, which used to flip a seq scan's
    # output order. With uuid in the ORDER BY the result cannot move.
    async with test_db() as db:
        await db.execute(text(
            "UPDATE station_property_config SET data_type = 'string' WHERE station_type = :st"
        ), {"st": before[0]})

    assert await _types() == before
