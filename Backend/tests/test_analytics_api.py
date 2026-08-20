"""HTTP-level tests for the /api/v1/analytics chart endpoints.

The PR #32 review found both handlers effectively uncovered — the live sweep in its test
plan exercised them but left no regression net, and H1a/H2 both sat inside the uncovered
ranges. These go over real HTTP through the `client` fixture so the assertions are the
status codes a caller actually sees, not what a service function returns.
"""

import pytest

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign

TICKETS_URL = "/api/v1/analytics/tickets/chart"
STATIONS_URL = "/api/v1/analytics/stations/chart"
CATALOG_URL = "/api/v1/analytics/catalog"


async def _user_with_perms(db, *perms: Perm, scope: str = "all") -> dict:
    """Create a user holding exactly `perms` and return its bearer auth header.

    Direct model inserts, matching tests/test_admin_api.py — note the default `user` role
    seeded by seed_rbac.py holds ticket.view, so a test asserting 403 needs a bare role
    like this rather than the platform default.
    """
    role = Role(name=f"role_{'_'.join(p.name for p in perms) or 'bare'}", kind="platform")
    db.add(role)
    await db.flush()
    for perm in perms:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        db.add(
            RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
            )
        )
    user = User(name="analytics tester")
    db.add(user)
    await db.flush()
    # Read the uuid before committing: the db_session fixture uses expire_on_commit=True,
    # so touching an attribute afterwards would trigger a lazy refresh outside the
    # greenlet and raise MissingGreenlet.
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return {"Authorization": f"Bearer {create_access_token(data={'sub': user_uuid})}"}


@pytest.mark.asyncio
async def test_chart_requires_authentication(client):
    """These are REST endpoints, so PUBLIC_PERMS doesn't apply — no token means 401."""
    res = await client.get(TICKETS_URL, params={"y": "total_tickets"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_chart_requires_the_domain_permission(client, db_session):
    """A user without ticket.view is refused, and station.view doesn't substitute."""
    headers = await _user_with_perms(db_session, Perm.STATION_VIEW)
    res = await client.get(TICKETS_URL, params={"y": "total_tickets"}, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_ticket_chart_renders(client, db_session):
    """Baseline: the default request returns a partial Plotly div."""
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["html"].startswith("<div")


@pytest.mark.asyncio
async def test_category_line_chart_renders_with_null_task_type(client, db_session):
    """H1a over HTTP: this combination used to 500 whenever a ticket had a NULL task_type.

    No ticket rows are needed to prove the endpoint is wired safely, but the paired
    service-level test (test_ticket_analytics) covers the populated case.
    """
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "total_tickets", "x": "category", "chart_type": "line"},
        headers=headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("tz", ["", "/etc/passwd", "..", "Nope/Nope"])
async def test_invalid_timezone_is_a_400(client, db_session, tz):
    """Every malformed or unknown timezone is a 400.

    H2: ZoneInfo raises ValueError for malformed keys and ZoneInfoNotFoundError for
    unknown ones. Only the latter was caught, so `?tz=` (an easy frontend accident) 500'd.
    """
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL, params={"y": "total_tickets", "tz": tz}, headers=headers
    )
    assert res.status_code == 400
    assert "timezone" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_valid_timezone_is_accepted(client, db_session):
    """Control for the above — a real IANA name still works."""
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL, params={"y": "total_tickets", "tz": "Asia/Taipei"}, headers=headers
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_duplicate_count_requires_a_date_range(client, db_session):
    """H3: unbounded this is an O(n^2) self-join, so the dates are mandatory."""
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"y": "duplicate_count"}, headers=headers)
    assert res.status_code == 400
    assert "start_date" in res.json()["detail"]

    res = await client.get(
        TICKETS_URL,
        params={"y": "duplicate_count", "start_date": "2026-08-01", "end_date": "2026-08-31"},
        headers=headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_unsupported_chart_type_is_rejected(client, db_session):
    """chart_type stays strictly validated, unlike x."""
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "net_backlog_change", "chart_type": "pie"},
        headers=headers,
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_inapplicable_x_is_ignored_not_rejected(client, db_session):
    """The documented asymmetry: a meaningless `x` still renders."""
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "task_completion_distribution", "x": "date"},
        headers=headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_invalid_layout_overrides_is_a_400(client, db_session):
    """layout_overrides is JSON-decoded, and a bad payload is a client error."""
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "total_tickets", "layout_overrides": "not json"},
        headers=headers,
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_station_chart_renders(client, db_session):
    """The station handler shares _render_domain, so cover its permission + happy path."""
    headers = await _user_with_perms(db_session, Perm.STATION_VIEW)
    res = await client.get(STATIONS_URL, params={"y": "station_status_count"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["html"].startswith("<div")


@pytest.mark.asyncio
async def test_catalog_needs_no_domain_permission(client, db_session):
    """The catalog is static API metadata, so a station-only role can read it.

    It used to be gated on ticket.view while returning both domains, which locked such a
    role out of the station dropdowns it is allowed to chart.
    """
    headers = await _user_with_perms(db_session, Perm.STATION_VIEW)
    res = await client.get(CATALOG_URL, headers=headers)
    assert res.status_code == 200

    body = res.json()
    assert set(body) == {"tickets", "stations"}
    assert len(body["tickets"]) == 10
    assert len(body["stations"]) == 3
    # requires_date_range is what lets the frontend enforce H3's rule up front.
    assert body["tickets"]["duplicate_count"]["requires_date_range"] is True
    assert body["tickets"]["total_tickets"]["requires_date_range"] is False
    assert body["tickets"]["total_tickets"]["allowed_x"] == ["category", "date", "none"]


@pytest.mark.asyncio
async def test_catalog_still_requires_authentication(client):
    """Loosened to any authenticated caller — not to anonymous ones."""
    res = await client.get(CATALOG_URL)
    assert res.status_code == 401
