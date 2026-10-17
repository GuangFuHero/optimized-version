"""Who reads a station's internal comment (Spec/008-rbac-authorization/decisions.md ADR-332).

`comment` is the back office's own note on a station ("水退後已撤站", "與 b…07 疑似重複"). It used to
reach every caller, the anonymous map included. It now follows `station.view_pii`, the key that
already guards the station's contact details, and reads as null outside it rather than masked:
free text has no shape to redact.
"""

import uuid as uuid_mod

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from tests.conftest import token_for
from tests.test_graphql.conftest import _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as db_ctx

COMMENT = "水退後已撤站，記錄未更新"

STATION = """
query($uuid: UUID!) { station(uuid: $uuid) { uuid comment } }
"""
STATIONS = """
query { stations(limit: 50) { items { uuid comment } } }
"""


async def _station(created_by: str) -> str:
    """Seed a public station carrying COMMENT; returns its uuid."""
    async with db_ctx() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=created_by, type="shelter", comment=COMMENT,
            source="user", visibility="public",
        )
        db.add(station)
        await db.flush()
        return str(station.uuid)


async def _actor(redis, grants) -> tuple[str, str]:
    """A user whose active identity holds exactly `grants`, and a token acting as it."""
    async with db_ctx() as db:
        user = User(name=f"comment_{uuid_mod.uuid4().hex[:8]}")
        role = Role(name=f"comment-{uuid_mod.uuid4().hex[:8]}", kind="platform")
        db.add_all([user, role])
        await db.flush()
        for perm, scope in grants:
            permission = await db.scalar(select(Permission).where(Permission.key == perm.value))
            if permission is None:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
            db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
        return str(user.uuid), await token_for(redis, user.uuid, role)


async def _read_comment(client, station_uuid: str, token: str | None = None) -> str | None:
    resp = await client.post(
        "/graphql",
        json={"query": STATION, "variables": {"uuid": station_uuid}},
        headers=auth_header(token) if token else None,
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]["station"]["comment"]


@pytest.mark.asyncio
async def test_anonymous_caller_reads_null(client, coordinator_auth):
    """The anonymous map gets the station, not the back office's note on it."""
    coord_uuid, _ = coordinator_auth
    station_uuid = await _station(coord_uuid)

    assert await _read_comment(client, station_uuid) is None


@pytest.mark.asyncio
async def test_anonymous_station_list_reads_null(client, coordinator_auth):
    """The list is how staging leaked it (8 of 25 stations), so it is pinned on its own."""
    coord_uuid, _ = coordinator_auth
    station_uuid = await _station(coord_uuid)

    resp = await client.post("/graphql", json={"query": STATIONS})
    body = resp.json()
    assert "errors" not in body, body
    items = {item["uuid"]: item for item in body["data"]["stations"]["items"]}
    assert items[station_uuid]["comment"] is None


@pytest.mark.asyncio
async def test_signed_in_user_reads_null_on_someone_elses_station(client, coordinator_auth, login_user_auth):
    """station.view_pii=own: signing in does not open another person's station."""
    coord_uuid, _ = coordinator_auth
    _, login_token = login_user_auth
    station_uuid = await _station(coord_uuid)

    assert await _read_comment(client, station_uuid, login_token) is None


@pytest.mark.asyncio
async def test_creator_reads_the_comment_on_their_own_station(client, login_user_auth):
    """The creator wrote it, and station-create reads it back from createStation's result."""
    login_uuid, login_token = login_user_auth
    station_uuid = await _station(login_uuid)

    assert await _read_comment(client, station_uuid, login_token) == COMMENT


@pytest.mark.asyncio
async def test_station_view_pii_alone_reads_the_comment(client, redis, coordinator_auth):
    """The key is view_pii: a data auditor holds it at `all` without editing anything."""
    coord_uuid, _ = coordinator_auth
    station_uuid = await _station(coord_uuid)
    _, token = await _actor(redis, [(Perm.STATION_VIEW_PII, "all")])

    assert await _read_comment(client, station_uuid, token) == COMMENT


@pytest.mark.asyncio
async def test_edit_and_review_without_view_pii_read_null(client, redis, coordinator_auth):
    """Neither station.edit nor station.review is the key, however wide."""
    coord_uuid, _ = coordinator_auth
    station_uuid = await _station(coord_uuid)
    _, token = await _actor(redis, [(Perm.STATION_EDIT, "all"), (Perm.STATION_REVIEW, "all")])

    assert await _read_comment(client, station_uuid, token) is None


@pytest.mark.asyncio
async def test_coordinator_reads_the_comment(client, redis, login_user_auth):
    """A view_pii=all holder reads it on a station somebody else created."""
    login_uuid, _ = login_user_auth
    station_uuid = await _station(login_uuid)
    _, coord_token = await _create_user_with_role(redis, "Field Coordinator")

    assert await _read_comment(client, station_uuid, coord_token) == COMMENT
