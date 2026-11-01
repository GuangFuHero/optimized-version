"""ADR-394: `stationFacets` counts what `stations` would list, so a page needn't read every station.

One round trip fills the back office's status strip, area options, export counts and review badge,
which #97 worked out in the browser from every station it could read. The counts take the same
filters as `stations`; whether a strip follows the filters is the page's call. Every test works in a
box nobody else puts a station in.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.station_property import StationProperty, StationUpdateSuggestion
from app.models.team import Team
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as db_ctx
from tests.test_graphql.test_station_list_filters import _box, _station, _uuids

FACETS = """
query($bounds: BoundsInput, $official: Boolean) {
    stationFacets(bounds: $bounds, official: $official) {
        total
        byStatus { status count }
        byType { type count exportable }
        areas { county town count }
        pendingReviewCount
    }
}
"""


async def _facets(client, token=None, **variables) -> dict:
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": FACETS, "variables": variables}, headers=headers)
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]["stationFacets"]


async def _team_identity(redis, team_type: str, grants) -> tuple[str, str]:
    """A team of `team_type` and a member acting for it with `grants`; returns (team uuid, token)."""
    tag = uuid_mod.uuid4().hex[:8]
    async with db_ctx() as db:
        team = Team(name=f"facets-{tag}", type=team_type, status="active")
        role = Role(name=f"facets-{tag}", kind="team")
        user = User(name=f"facets-{tag}")
        db.add_all([team, role, user])
        await db.flush()
        for perm, scope in grants:
            permission = await db.scalar(select(Permission).where(Permission.key == perm.value))
            if permission is None:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
            db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid))
        team_uuid, role_uuid, user_uuid = str(team.uuid), str(role.uuid), str(user.uuid)
    return team_uuid, await token_for(redis, user_uuid, role_uuid, team_uuid)


@pytest.mark.asyncio
async def test_the_facets_count_what_stations_lists(client):
    """Total, per status and per area agree with the rows `stations` returns for the same box."""
    lng, lat, bounds = _box()
    corner = (lng, lat)
    await _station(corner, county="花蓮縣", town="光復鄉")
    await _station(corner, county="花蓮縣", town="光復鄉", type="medical")
    await _station(corner, operational_status="temporarily_closed")

    facets = await _facets(client, bounds=bounds)

    assert facets["total"] == len(await _uuids(client, bounds=bounds)) == 3
    assert sorted((s["status"], s["count"]) for s in facets["byStatus"]) == [
        ("active", 2),
        ("temporarily_closed", 1),
    ]
    assert sorted((t["type"], t["count"]) for t in facets["byType"]) == [("medical", 1), ("shelter", 2)]
    # The station with no address is in no area.
    assert facets["areas"] == [{"county": "花蓮縣", "town": "光復鄉", "count": 2}]


@pytest.mark.asyncio
async def test_an_address_with_no_town_is_its_own_row_in_its_county(client):
    """Kept so a county whose stations all lack a 鄉鎮市區 still shows, and the rows add up (ADR-394)."""
    lng, lat, bounds = _box()
    await _station((lng, lat), county="花蓮縣", town="光復鄉")
    await _station((lng, lat), county="花蓮縣")

    facets = await _facets(client, bounds=bounds)

    assert facets["areas"] == [
        {"county": "花蓮縣", "town": "光復鄉", "count": 1},
        {"county": "花蓮縣", "town": None, "count": 1},
    ]


@pytest.mark.asyncio
async def test_the_facets_take_the_same_filters(client):
    """A filter narrows every count, as it narrows the list."""
    lng, lat, bounds = _box()
    await _station((lng, lat), source="official")
    await _station((lng, lat), source="user")

    facets = await _facets(client, bounds=bounds, official=True)

    assert facets["total"] == 1
    assert facets["byStatus"] == [{"status": "active", "count": 1}]


@pytest.mark.asyncio
async def test_exportable_counts_what_station_export_would_include(client, redis):
    """A team's export reaches its own stations; a gov team's widens to all (ADR-285); a guest's none."""
    lng, lat, bounds = _box()
    ngo_uuid, ngo_token = await _team_identity(redis, "ngo", [(Perm.STATION_EXPORT, "team")])
    _, gov_token = await _team_identity(redis, "gov", [(Perm.STATION_EXPORT, "team")])
    _, other_token = await _team_identity(redis, "ngo", [])
    await _station((lng, lat), team_uuid=ngo_uuid)
    await _station((lng, lat))
    await _station((lng, lat))

    counts = {
        who: [
            (t["type"], t["count"], t["exportable"])
            for t in (await _facets(client, token, bounds=bounds))["byType"]
        ]
        for who, token in (
            ("ngo", ngo_token),
            ("gov", gov_token),
            ("no export", other_token),
            ("guest", None),
        )
    }

    assert counts == {
        "ngo": [("shelter", 3, 1)],
        "gov": [("shelter", 3, 3)],
        "no export": [("shelter", 3, 0)],
        "guest": [("shelter", 3, 0)],
    }


@pytest.mark.asyncio
async def test_a_station_with_no_type_is_never_exportable(client, redis):
    """The export asks for one type (`station_type` is required), so a station with none is in no export."""
    lng, lat, bounds = _box()
    _, gov_token = await _team_identity(redis, "gov", [(Perm.STATION_EXPORT, "team")])
    await _station((lng, lat))
    await _station((lng, lat), type=None)

    by_type = (await _facets(client, gov_token, bounds=bounds))["byType"]

    assert [(t["type"], t["count"], t["exportable"]) for t in by_type] == [("shelter", 1, 1), (None, 1, 0)]


@pytest.mark.asyncio
async def test_the_review_count_is_the_callers_own_queue(client, coordinator_auth, login_user_auth):
    """Stations with a pending suggestion that the caller holds station.review over; none without it."""
    coordinator_uuid, coordinator_token = coordinator_auth
    _, login_token = login_user_auth
    lng, lat, bounds = _box()
    pending = await _station((lng, lat))
    await _station((lng, lat))
    async with db_ctx() as db:
        db.add(
            StationUpdateSuggestion(
                target_type="station",
                target_uuid=pending,
                field_name="name",
                new_value="新站名",
                status="pending",
                created_by=coordinator_uuid,
            )
        )

    reviewer = await _facets(client, coordinator_token, bounds=bounds)
    citizen = await _facets(client, login_token, bounds=bounds)
    guest = await _facets(client, bounds=bounds)

    assert (reviewer["pendingReviewCount"], citizen["pendingReviewCount"], guest["pendingReviewCount"]) == (
        1,
        0,
        0,
    )


@pytest.mark.asyncio
async def test_the_review_count_takes_a_suggestion_on_a_property_unless_the_property_is_gone(
    client, coordinator_auth
):
    """The station's own suggestions and its properties' are counted apart (ADR-394); a deleted one isn't."""
    coordinator_uuid, coordinator_token = coordinator_auth
    lng, lat, bounds = _box()
    live, gone = await _station((lng, lat)), await _station((lng, lat))
    async with db_ctx() as db:
        for station, deleted in ((live, None), (gone, datetime.now(UTC))):
            item = StationProperty(
                station_uuid=station,
                property_type="supply",
                property_name="飲用水",
                created_by=coordinator_uuid,
                delete_at=deleted,
            )
            db.add(item)
            await db.flush()
            db.add(
                StationUpdateSuggestion(
                    target_type="station_property",
                    target_uuid=str(item.uuid),
                    field_name="quantity",
                    new_value="5",
                    status="pending",
                    created_by=coordinator_uuid,
                )
            )

    facets = await _facets(client, coordinator_token, bounds=bounds)

    assert facets["pendingReviewCount"] == 1
