"""Service-level tests for the PR #32 review's M3 finding.

M2 (photo url validation) lived here too until the merge with main, which landed the same
check as `normalize_photo_url` with stricter rules — https-only, and the stripped url is
returned so the validated and stored strings cannot drift. Its end-to-end cases in
tests/test_graphql/test_station_photo.py cover strictly more than these did, so the
duplicate service-level block was dropped rather than kept in two places.

M3: `update_station` stamped `status_changed_at` whenever the key was *present* rather
than when the value *changed*, so a client PUTting the whole form back re-stamped it —
and station_analytics.get_station_freshness_trend reads exactly that column.

Service-level (not GraphQL), so this uses the root conftest.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.services.station import update_station


async def _grant(db, user: User, perm: Perm, scope: str, role_name: str) -> None:
    """Create a role granting `perm` at `scope` and assign it to `user`."""
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    role = Role(name=role_name, kind="platform")
    db.add(role)
    await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()


# --- M3: status_changed_at only moves on a real transition ---


async def _editor_and_station(db, *, operational_status: str = "temporarily_closed"):
    """A user holding station.edit=all plus a station they can edit."""
    user = User(name="Editor")
    db.add(user)
    await db.flush()
    await _grant(db, user, Perm.STATION_EDIT, "all", "station_editor")
    station = Station(
        geometry=from_shape(Point(121.5, 25.0), srid=4326),
        created_by=str(user.uuid), level=1, source="user", visibility="public",
        type="shelter", operational_status=operational_status,
    )
    db.add(station)
    await db.flush()
    return user, station


@pytest.mark.asyncio
async def test_update_station_does_not_restamp_an_unchanged_status(db):
    """Re-submitting the same operational_status leaves status_changed_at alone."""
    user, station = await _editor_and_station(db, operational_status="temporarily_closed")
    station.status_changed_at = None
    await db.flush()

    await update_station(
        db, actor=user, uuid=str(station.uuid),
        changes={"operational_status": "temporarily_closed", "name": "renamed"},
    )
    assert station.status_changed_at is None, "an unchanged status must not stamp"
    assert station.name == "renamed", "the rest of the update still applies"


@pytest.mark.asyncio
async def test_update_station_stamps_on_a_real_transition(db):
    """An actual status change does stamp — the fix must not disable the feature."""
    user, station = await _editor_and_station(db, operational_status="active")
    station.status_changed_at = None
    await db.flush()

    await update_station(
        db, actor=user, uuid=str(station.uuid),
        changes={"operational_status": "permanently_closed"},
    )
    assert station.status_changed_at is not None
    assert station.operational_status == "permanently_closed"


@pytest.mark.asyncio
async def test_update_station_without_status_key_does_not_stamp(db):
    """A write that doesn't mention operational_status leaves the stamp untouched."""
    user, station = await _editor_and_station(db)
    station.status_changed_at = None
    await db.flush()

    await update_station(db, actor=user, uuid=str(station.uuid), changes={"name": "x"})
    assert station.status_changed_at is None
