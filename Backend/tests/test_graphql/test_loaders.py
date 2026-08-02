"""Verify DataLoaders collapse nested-field N+1 into single batched queries."""

import re
import uuid as uuid_mod

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import event, select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.db.session import engine as app_engine
from app.models.auth import User
from app.models.photo import Photo
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.team import Team, TeamZoneAssign, WorkZone
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as _test_db_ctx


class _SelectCounter:
    """Count SELECT statements against a named table on the shared app engine."""

    def __init__(self, table: str):
        self.pattern = re.compile(rf"\bFROM\s+{table}\b", re.IGNORECASE)
        self.count = 0
        self._listener = None

    def _on_execute(self, conn, cursor, statement, params, context, executemany):
        if self.pattern.search(statement):
            self.count += 1

    def __enter__(self):
        self._listener = self._on_execute
        event.listen(app_engine.sync_engine, "before_cursor_execute", self._listener)
        return self

    def __exit__(self, *exc):
        event.remove(app_engine.sync_engine, "before_cursor_execute", self._listener)


@pytest.mark.asyncio
async def test_tickets_photos_uses_single_batched_query(client, coordinator_auth):
    """Asking for photos across N tickets must issue one SELECT against photos."""
    user_uuid, _ = coordinator_auth

    async with _test_db_ctx() as db:
        tickets: list[Tickets] = []
        for i in range(3):
            t = Tickets(
                geometry=from_shape(Point(121.5 + i * 0.001, 25.0), srid=4326),
                created_by=user_uuid,
                title=f"t{i}", description="d",
                contact_name="x", contact_email="x@x.x",
                status="pending", priority="medium",
                task_type="hr", visibility="public",
            )
            db.add(t)
            tickets.append(t)
        await db.flush()

        for t in tickets:
            for j in range(2):
                db.add(Photo(
                    ref_uuid=t.uuid, ref_type="ticket",
                    url=f"https://example/{t.uuid}/{j}.jpg",
                    created_by=user_uuid,
                ))
        await db.flush()

    with _SelectCounter("photos") as counter:
        resp = await client.post("/graphql", json={
            "query": "query { tickets { items { uuid photos { url } } } }"
        })

    assert resp.status_code == 200
    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["tickets"]["items"]
    assert sum(len(it["photos"]) for it in items) >= 6
    assert counter.count == 1, (
        f"expected 1 SELECT against photos, got {counter.count} (N+1 regression)"
    )


async def _make_gov_viewer() -> str:
    """Create a user holding a role granting work_zone.view at 'all', return its token.

    Mirrors ``test_work_zone.py``'s ``_make_gov_user``, trimmed to the single permission
    this test needs. Looks up an existing ``work_zone.view`` Permission row first: the
    shared test DB persists across test files in this suite, so blindly inserting one
    would collide with ``Permission.key``'s unique constraint if another file already
    created it.
    """
    async with _test_db_ctx() as db:
        role = Role(name=f"gov-viewer-{uuid_mod.uuid4().hex[:8]}", kind="platform")
        db.add(role)
        await db.flush()

        result = await db.execute(select(Permission).where(Permission.key == Perm.ZONE_VIEW.value))
        permission = result.scalar_one_or_none()
        if permission is None:
            permission = Permission(key=Perm.ZONE_VIEW.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))

        user = User(name=f"gov_viewer_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))

        return create_access_token(data={"sub": str(user.uuid)})


@pytest.mark.asyncio
async def test_assigned_teams_uses_single_batched_query(client):
    """Asking for assignedTeams across N work zones must issue one SELECT against team_zone_assign.

    ``teams_by_zone`` (app/graphql/loaders.py) backs ``WorkZoneType.assignedTeams`` and is
    supposed to collapse the per-zone lookup into a single
    ``team_zone_assign JOIN teams`` query for the whole page, instead of one query per zone.
    Counting SELECTs against ``team_zone_assign`` (rather than ``teams``) pins down the
    loader's own query specifically, since that table is only ever touched by this join.
    """
    gov_token = await _make_gov_viewer()

    async with _test_db_ctx() as db:
        assigner = User(name=f"assigner_{uuid_mod.uuid4().hex[:8]}")
        db.add(assigner)
        team = Team(name=f"Team {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add(team)
        await db.flush()
        assigner_uuid = str(assigner.uuid)
        team_uuid = str(team.uuid)

        zones: list[WorkZone] = []
        for i in range(3):
            polygon = Polygon([
                (121.0 + i, 24.0), (121.0 + i, 25.0),
                (122.0 + i, 25.0), (122.0 + i, 24.0), (121.0 + i, 24.0),
            ])
            zone = WorkZone(name=f"zone-{uuid_mod.uuid4().hex[:8]}", geometry=from_shape(polygon, srid=4326))
            db.add(zone)
            zones.append(zone)
        await db.flush()

        for zone in zones:
            db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=assigner_uuid))
        await db.flush()

        zone_uuids = {str(z.uuid) for z in zones}

    with _SelectCounter("team_zone_assign") as counter:
        resp = await client.post(
            "/graphql",
            json={"query": "query { workZones { items { uuid assignedTeams { uuid } } } }"},
            headers=auth_header(gov_token),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["workZones"]["items"]
    ours = {it["uuid"]: it for it in items if it["uuid"] in zone_uuids}
    assert len(ours) == len(zone_uuids), (ours, zone_uuids)
    for item in ours.values():
        assert {t["uuid"] for t in item["assignedTeams"]} == {team_uuid}
    assert counter.count == 1, (
        f"expected 1 SELECT against team_zone_assign, got {counter.count} (N+1 regression)"
    )
