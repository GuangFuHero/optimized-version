"""HTTP-level tests for the /api/v1/analytics chart endpoints.

The PR #32 review found both handlers effectively uncovered — the live sweep in its test
plan exercised them but left no regression net, and H1a/H2 both sat inside the uncovered
ranges. These go over real HTTP through the `client` fixture so the assertions are the
status codes a caller actually sees, not what a service function returns.
"""

import json
import re

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.services import chart_render

TICKETS_URL = "/api/v1/analytics/tickets/chart"
STATIONS_URL = "/api/v1/analytics/stations/chart"
CATALOG_URL = "/api/v1/analytics/catalog"


async def _user_with_perms(db, *perms: Perm, scope: str = "all") -> dict:
    """Create a user holding exactly `perms` and return its bearer auth header.

    Thin wrapper over `_seeded_user` for the majority of tests, which don't need the uuid.
    """
    _, headers = await _seeded_user(db, *perms, scope=scope)
    return headers


async def _seeded_user(db, *perms: Perm, scope: str = "all") -> tuple[str, dict]:
    """Create a user holding exactly `perms`; return its uuid and bearer auth header.

    Direct model inserts, matching tests/test_admin_api.py — the default `user` role from
    seed_rbac.py holds ticket.view, so a 403 test needs a bare role like this. The uuid
    lets a test seed rows *owned by* this user, the only way to exercise a narrow scope.
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
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': user_uuid})}"}
    return user_uuid, headers


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
async def test_unparseable_layout_overrides_is_a_400(client, db_session):
    """layout_overrides arrives as a JSON string, so undecodable text is a client error."""
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
    # Named rather than counted, so adding a metric doesn't fail this test for no reason —
    # but a metric silently disappearing from the frontend's dropdowns still does.
    assert set(body["tickets"]) == {
        "total_tickets", "ongoing_tickets", "unassigned_tickets", "completed_tickets",
        "canceled_tickets", "completion_rate", "age_distribution", "time_to_completion",
        "net_backlog_change", "task_completion_distribution", "duplicate_count",
    }
    assert set(body["stations"]) == {
        "station_count", "station_status_count", "station_freshness_trend",
    }
    # These two fields are how the frontend keeps duplicate_count's cost under control
    # without waiting for a 400 — see chart_render.CATALOG.
    assert body["tickets"]["duplicate_count"]["requires_date_range"] is True
    assert body["tickets"]["duplicate_count"]["max_range_days"] == 120
    assert body["tickets"]["total_tickets"]["requires_date_range"] is False
    assert body["tickets"]["total_tickets"]["max_range_days"] is None
    assert body["tickets"]["total_tickets"]["allowed_x"] == ["category", "date", "none"]
    # station_status_count is grouping-only: ungrouped it would just repeat station_count.
    assert body["stations"]["station_status_count"]["allowed_x"] == ["category"]


@pytest.mark.asyncio
async def test_catalog_still_requires_authentication(client):
    """Loosened to any authenticated caller — not to anonymous ones."""
    res = await client.get(CATALOG_URL)
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_duplicate_count_rejects_a_range_wider_than_the_cap(client, db_session):
    """Supplying the dates isn't enough — the span between them is what costs.

    This is a self-join, and no statement_timeout or rate limit is deployed, so the cap is
    all that stops one request holding a connection for as long as it likes.
    """
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "duplicate_count", "start_date": "1900-01-01", "end_date": "2999-12-31"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "120 days" in res.json()["detail"]


@pytest.mark.asyncio
async def test_station_status_count_always_groups_by_status(client, db_session):
    """This metric only means something grouped, so the catalog forces x=category.

    A bare request used to render a single "overall" slice repeating station_count — a 100%
    pie conveying nothing. It should be one slice per status despite naming no `x`.
    """
    user_uuid, headers = await _seeded_user(db_session, Perm.STATION_VIEW)
    for operational_status in ("active", "temporarily_closed", "permanently_closed"):
        db_session.add(
            Station(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=user_uuid, level=1, source="user", visibility="public",
                type="shelter", operational_status=operational_status,
            )
        )
    await db_session.commit()

    res = await client.get(STATIONS_URL, params={"y": "station_status_count"}, headers=headers)
    assert res.status_code == 200
    html = res.json()["html"]
    # Compared as a set: GROUP BY makes no promise about row order.
    labels = set(json.loads(re.search(r'"labels":(\[[^]]*\])', html).group(1)))
    assert labels == {"active", "temporarily_closed", "permanently_closed"}
    assert '"values":[1,1,1]' in html


@pytest.mark.asyncio
async def test_ticket_chart_counts_only_tickets_in_the_callers_scope(client, db_session):
    """An `own`-scoped ticket.view grant must narrow the aggregate, not just permit it.

    The permission check passes either way; what matters is whether the resolved scope
    reaches the query. Without it the numbers leak even though no ticket row does.
    """
    user_uuid, headers = await _seeded_user(db_session, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    stranger_uuid = str(stranger.uuid)

    for owner in (user_uuid, stranger_uuid, stranger_uuid):
        db_session.add(
            Tickets(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=owner,
                title="t", contact_name="c", status="pending", priority="high",
                task_type="rescue", visibility="public",
            )
        )
    await db_session.commit()

    res = await client.get(TICKETS_URL, params={"y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    # One ticket of the three is theirs; the chart must plot 1, not 3.
    assert '"y":[1]' in res.json()["html"]


@pytest.mark.asyncio
async def test_unknown_layout_overrides_key_is_a_400(client, db_session):
    """Valid JSON, but not a key Plotly accepts — still the caller's mistake, so still 400.

    Rejected by Plotly deep inside rendering rather than by our own parsing, which is why
    render_chart re-raises it as AnalyticsInputError.
    """
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "total_tickets", "layout_overrides": '{"no_such_layout_key": 1}'},
        headers=headers,
    )
    assert res.status_code == 400
    assert "layout_overrides" in res.json()["detail"]


@pytest.mark.asyncio
async def test_a_render_bug_is_not_reported_as_a_client_error(client, db_session, monkeypatch):
    """A fault in our own code must surface as a server error, not a 400.

    The handler used to wrap the whole query-and-render chain in `except ValueError`, so an
    internal failure came back as the caller's mistake with the raw message attached.
    """
    def _boom(*args, **kwargs):
        raise ValueError("internal render bug")

    monkeypatch.setattr(chart_render, "render_chart", _boom)
    headers = await _user_with_perms(db_session, Perm.TICKET_VIEW)
    # The test transport re-raises unhandled app exceptions, so the raise *is* the pass.
    with pytest.raises(ValueError, match="internal render bug"):
        await client.get(TICKETS_URL, params={"y": "total_tickets"}, headers=headers)
