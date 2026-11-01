"""HTTP-level tests for the /api/v1/analytics chart, data and value endpoints.

The PR #32 review found both handlers effectively uncovered — the live sweep in its test
plan exercised them but left no regression net, and H1a/H2 both sat inside the uncovered
ranges. These go over real HTTP through the `client` fixture so the assertions are the
status codes a caller actually sees, not what a service function returns.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from geoalchemy2.shape import from_shape
from plotly.offline import get_plotlyjs_version
from shapely.geometry import Point

from app.api.v1.endpoints.analytics import _in_catalog_unit
from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import DuplicatePair
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TaskAssignment, TicketTask
from app.schemas.analytics import TicketTaskType, TicketYMetric
from app.services import chart_render
from app.services.analytics_common import MAX_TREND_DAYS
from app.services.ticket import TASK_TYPES
from tests.conftest import auth_headers_for

TICKETS_URL = "/api/v1/analytics/tickets/chart"
STATIONS_URL = "/api/v1/analytics/stations/chart"
TICKETS_DATA_URL = "/api/v1/analytics/tickets/data"
STATIONS_DATA_URL = "/api/v1/analytics/stations/data"
TICKETS_VALUE_URL = "/api/v1/analytics/tickets/value"
STATIONS_VALUE_URL = "/api/v1/analytics/stations/value"
CATALOG_URL = "/api/v1/analytics/catalog"
# The plotly.js the admin dashboard draws figures with: `plotly.js-dist-min` in
# Frontend/libs/modules/package.json.
FRONTEND_PLOTLYJS_VERSION = "4.1.1"


async def _user_with_perms(db, redis, *perms: Perm, scope: str = "all") -> dict:
    """Create a user holding exactly `perms` and return its bearer auth header.

    Thin wrapper over `_seeded_user` for the majority of tests, which don't need the uuid.
    """
    _, headers = await _seeded_user(db, redis, *perms, scope=scope)
    return headers


async def _seeded_user(db, redis, *perms: Perm, scope: str = "all") -> tuple[str, dict]:
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
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    user = User(name="analytics tester")
    db.add(user)
    await db.flush()
    # Read the uuid before committing: the db_session fixture uses expire_on_commit=True,
    # so touching an attribute afterwards would trigger a lazy refresh outside the
    # greenlet and raise MissingGreenlet.
    user_uuid = str(user.uuid)
    role_uuid = str(role.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    # A bare create_access_token no longer authenticates: the token has to name the identity
    # it acts as (feature 010) and be backed by a live session (feature 014). auth_headers_for
    # mints the same shape production does.
    #
    # `role_uuid` is read before the commit and handed over as a stand-in, because
    # expire_on_commit=True expires `role` and token_for only reads its uuid — touching the
    # real object here would raise MissingGreenlet under async.
    headers = await auth_headers_for(redis, user_uuid, SimpleNamespace(uuid=role_uuid))
    return user_uuid, headers


@pytest.mark.asyncio
async def test_chart_requires_authentication(client):
    """These are REST endpoints, so PUBLIC_PERMS doesn't apply — no token means 401."""
    res = await client.get(TICKETS_URL, params={"tz": "UTC", "y": "total_tickets"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_chart_requires_the_domain_permission(client, db_session, redis):
    """A user without ticket.view is refused, and station.view doesn't substitute."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(TICKETS_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_ticket_chart_renders(client, db_session, redis):
    """Baseline: the default request returns Plotly figure JSON, with no HTML to inject."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"data", "layout", "config"}
    assert body["data"][0]["type"] == "bar"
    assert "<" not in res.text


@pytest.mark.asyncio
async def test_category_line_chart_renders_with_null_task_type(client, db_session, redis):
    """H1a over HTTP: this combination used to 500 whenever a ticket had a NULL task_type.

    No ticket rows are needed to prove the endpoint is wired safely, but the paired
    service-level test (test_ticket_analytics) covers the populated case.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"tz": "UTC", "y": "total_tickets", "x": "category", "chart_type": "line"},
        headers=headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("tz", ["", "/etc/passwd", "..", "Nope/Nope"])
async def test_invalid_timezone_is_a_400(client, db_session, tz, redis):
    """Every malformed or unknown timezone is a 400.

    H2: ZoneInfo raises ValueError for malformed keys and ZoneInfoNotFoundError for
    unknown ones. Only the latter was caught, so `?tz=` (an easy frontend accident) 500'd.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"y": "total_tickets", "tz": tz}, headers=headers)
    assert res.status_code == 400
    assert "timezone" in res.json()["detail"].lower()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("url", "y", "perm"),
    [
        (url, y, perm)
        for url, y, perm in (
            (TICKETS_URL, "total_tickets", Perm.TICKET_VIEW),
            (TICKETS_DATA_URL, "total_tickets", Perm.TICKET_VIEW),
            (TICKETS_VALUE_URL, "total_tickets", Perm.TICKET_VIEW),
            (STATIONS_URL, "station_count", Perm.STATION_VIEW),
            (STATIONS_DATA_URL, "station_count", Perm.STATION_VIEW),
            (STATIONS_VALUE_URL, "station_count", Perm.STATION_VIEW),
        )
    ],
)
async def test_a_missing_timezone_is_a_422_not_utc(client, db_session, redis, url, y, perm):
    """`tz` has no default: leaving it out must not quietly bucket days in UTC."""
    headers = await _user_with_perms(db_session, redis, perm)
    res = await client.get(url, params={"y": y}, headers=headers)
    assert res.status_code == 422
    assert "tz" in str(res.json()["detail"])


@pytest.mark.asyncio
async def test_valid_timezone_is_accepted(client, db_session, redis):
    """Control for the above — a real IANA name still works."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"y": "total_tickets", "tz": "Asia/Taipei"}, headers=headers)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_duplicate_count_needs_no_date_range(client, db_session, redis):
    """It reads the AI review's cards instead of self-joining tickets, so an open range is fine."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    for url in (TICKETS_URL, TICKETS_DATA_URL, TICKETS_VALUE_URL):
        res = await client.get(url, params={"tz": "UTC", "y": "duplicate_count"}, headers=headers)
        assert res.status_code == 200
    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": "duplicate_count"}, headers=headers)
    assert res.json() == {"value": 0}


@pytest.mark.asyncio
async def test_unsupported_chart_type_is_rejected(client, db_session, redis):
    """chart_type stays strictly validated, unlike x."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"tz": "UTC", "y": "net_backlog_change", "chart_type": "pie"},
        headers=headers,
    )
    assert res.status_code == 400


_METRICS_WITH_AN_UNALLOWED_X = [
    (domain, y, x)
    for domain, catalog in chart_render.CATALOG.items()
    for y, spec in catalog.items()
    for x in ("date", "category")
    if x not in spec["allowed_x"]
]


@pytest.mark.asyncio
@pytest.mark.parametrize(("domain", "y", "x"), _METRICS_WITH_AN_UNALLOWED_X)
@pytest.mark.parametrize("endpoint", ["chart", "data"])
async def test_an_x_the_metric_does_not_allow_is_a_422(client, db_session, redis, domain, y, x, endpoint):
    """Every metric, both endpoints: an `x` outside the catalog's allowed_x is refused, in zh-TW."""
    perm = Perm.TICKET_VIEW if domain == "tickets" else Perm.STATION_VIEW
    headers = await _user_with_perms(db_session, redis, perm)
    res = await client.get(
        f"/api/v1/analytics/{domain}/{endpoint}", params={"tz": "UTC", "y": y, "x": x}, headers=headers
    )
    assert res.status_code == 422
    assert f"x={x}" in res.json()["detail"]
    assert chart_render.CATALOG[domain][y]["label"] in res.json()["detail"]


@pytest.mark.asyncio
async def test_the_x_refusal_names_what_the_metric_does_allow(client, db_session, redis):
    """The message lists the usable `x` values, and says an omitted one works where it does."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_DATA_URL, params={"tz": "UTC", "y": "volunteers_needed", "x": "date"}, headers=headers
    )
    assert res.json()["detail"] == "「志工需求人數」不支援 x=date；可用的 x：category，或不帶 x"
    res = await client.get(
        TICKETS_DATA_URL,
        params={"tz": "UTC", "y": "task_completion_distribution", "x": "date"},
        headers=headers,
    )
    assert res.json()["detail"] == "「子任務完成比例」不支援 x=date；此指標的分組是固定的，請不帶 x"


@pytest.mark.asyncio
async def test_an_omitted_x_and_a_pie_of_a_date_trend_still_render(client, db_session, redis):
    """Only a given `x` is refused: none on a forced-shape metric uses its grouping.

    `x=date` with a pie draws the aggregate, because a trend has no pie form.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    forced = await client.get(
        TICKETS_DATA_URL, params={"tz": "UTC", "y": "net_backlog_change"}, headers=headers
    )
    assert (forced.status_code, forced.json()["x"]) == (200, "date")
    pie = await client.get(
        TICKETS_URL,
        params={"tz": "UTC", "y": "total_tickets", "x": "date", "chart_type": "pie"},
        headers=headers,
    )
    assert pie.status_code == 200
    assert pie.json()["data"][0]["type"] == "pie"


@pytest.mark.asyncio
async def test_unparseable_layout_overrides_is_a_400(client, db_session, redis):
    """layout_overrides arrives as a JSON string, so undecodable text is a client error."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"tz": "UTC", "y": "total_tickets", "layout_overrides": "not json"},
        headers=headers,
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_station_chart_renders(client, db_session, redis):
    """The station handler shares _render_domain; no rows to group is an empty pie, not a 總計 slice."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(STATIONS_URL, params={"tz": "UTC", "y": "station_status_count"}, headers=headers)
    assert res.status_code == 200
    pie = res.json()["data"][0]
    assert (pie["type"], pie["labels"], pie["values"]) == ("pie", [], [])


@pytest.mark.asyncio
async def test_catalog_needs_no_domain_permission(client, db_session, redis):
    """The catalog is static API metadata, so a station-only role can read it.

    It used to be gated on ticket.view while returning both domains, which locked such a
    role out of the station dropdowns it is allowed to chart.
    """
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(CATALOG_URL, headers=headers)
    assert res.status_code == 200

    body = res.json()
    assert set(body) == {"tickets", "stations", "filters", "default_style"}
    # Named rather than counted, so adding a metric doesn't fail this test for no reason —
    # but a metric silently disappearing from the frontend's dropdowns still does.
    assert set(body["tickets"]) == {
        "total_tickets",
        "ongoing_tickets",
        "unassigned_tickets",
        "completed_tickets",
        "canceled_tickets",
        "completion_rate",
        "age_distribution",
        "time_to_completion",
        "net_backlog_change",
        "task_completion_distribution",
        "duplicate_count",
        "volunteers_needed",
        "volunteers_matched",
        "volunteer_gap",
    }
    assert set(body["stations"]) == {
        "station_count",
        "station_status_count",
        "station_freshness_trend",
        "operating_station_count",
    }
    # Only the volunteer trend is capped, so the frontend can clamp its date picker rather than
    # wait for a 400; no metric refuses an open range any more.
    assert body["tickets"]["volunteer_gap"]["max_range_days"] == MAX_TREND_DAYS
    assert body["tickets"]["total_tickets"]["max_range_days"] is None
    assert all(not spec["requires_date_range"] for spec in {**body["tickets"], **body["stations"]}.values())
    assert body["tickets"]["total_tickets"]["allowed_x"] == ["category", "date", "none"]
    # station_status_count is grouping-only: ungrouped it would just repeat station_count.
    assert body["stations"]["station_status_count"]["allowed_x"] == ["category"]
    # The glossary the dashboard shows comes from here, not from a frontend copy.
    assert body["tickets"]["total_tickets"]["label"] == "任務單總數"
    assert body["tickets"]["total_tickets"]["unit"] == "件"
    assert body["tickets"]["completion_rate"]["unit"] == "%"
    assert all(spec["description"] for spec in {**body["tickets"], **body["stations"]}.values())
    # The new labels and what the descriptions promise: the dashboard's default range, running
    # totals up to today, and where the duplicate count comes from.
    assert body["tickets"]["duplicate_count"]["label"] == "疑似重複的單"
    assert "AI 重複審核" in body["tickets"]["duplicate_count"]["description"]
    assert "近 30 天" in body["tickets"]["total_tickets"]["description"]
    assert "近 30 天" in body["stations"]["station_count"]["description"]
    for y, label in (
        ("volunteers_needed", "志工需求人數"),
        ("volunteers_matched", "已媒合志工人數"),
        ("volunteer_gap", "志工缺口"),
    ):
        assert (body["tickets"][y]["label"], body["tickets"][y]["unit"]) == (label, "人")
        assert "截至查詢期間最後一天" in body["tickets"][y]["description"]
    assert body["tickets"]["volunteer_gap"]["allowed_x"] == ["category", "date", "none"]
    assert body["tickets"]["volunteers_needed"]["allowed_x"] == ["category", "none"]
    # The gap trend is daily whatever x_granularity says, and the catalog says so; the rest do both.
    assert body["tickets"]["volunteer_gap"]["allowed_x_granularities"] == ["day"]
    assert body["tickets"]["total_tickets"]["allowed_x_granularities"] == ["day", "week"]
    assert "依異動紀錄還原" in body["tickets"]["volunteer_gap"]["description"]
    operating = body["stations"]["operating_station_count"]
    assert (operating["label"], operating["unit"]) == ("營運中站點數", "站")
    assert "不受日期影響" in operating["description"]
    # default_style is what the chart endpoints use when `style` is omitted.
    assert body["default_style"]["palette"][0] == "#E3791E"
    assert body["default_style"]["legend"] == "bottom"


@pytest.mark.asyncio
async def test_catalog_still_requires_authentication(client):
    """Loosened to any authenticated caller — not to anonymous ones."""
    res = await client.get(CATALOG_URL)
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_volunteer_gap_trend_rejects_a_range_wider_than_the_cap(client, db_session, redis):
    """A day-by-day trend runs once per day, and no statement_timeout or rate limit is deployed."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_DATA_URL,
        params={
            "tz": "UTC",
            "y": "volunteer_gap",
            "x": "date",
            "start_date": "1900-01-01",
            "end_date": "2999-12-31",
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert f"{MAX_TREND_DAYS} days" in res.json()["detail"]
    # A total reads one instant, so the span between the dates costs nothing.
    res = await client.get(
        TICKETS_VALUE_URL,
        params={"tz": "UTC", "y": "volunteer_gap", "start_date": "1900-01-01", "end_date": "2999-12-31"},
        headers=headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_station_status_count_always_groups_by_status(client, db_session, redis):
    """This metric only means something grouped, so the catalog forces x=category.

    A bare request used to render a single "overall" slice repeating station_count — a 100%
    pie conveying nothing. It should be one slice per status despite naming no `x`.
    """
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.STATION_VIEW)
    for operational_status in ("active", "temporarily_closed", "permanently_closed"):
        db_session.add(
            Station(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=user_uuid,
                level=1,
                source="user",
                visibility="public",
                type="shelter",
                operational_status=operational_status,
            )
        )
    await db_session.commit()

    res = await client.get(STATIONS_URL, params={"tz": "UTC", "y": "station_status_count"}, headers=headers)
    assert res.status_code == 200
    pie = res.json()["data"][0]
    # Labels are the zh-TW display names, not the raw operational_status values.
    assert pie["labels"] == ["營運中", "暫停營運", "永久關閉"]
    assert pie["values"] == [1, 1, 1]


@pytest.mark.asyncio
async def test_ticket_chart_counts_only_tickets_in_the_callers_scope(client, db_session, redis):
    """An `own`-scoped ticket.view grant must narrow the aggregate, not just permit it.

    The permission check passes either way; what matters is whether the resolved scope
    reaches the query. Without it the numbers leak even though no ticket row does.
    """
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    stranger_uuid = str(stranger.uuid)

    for owner in (user_uuid, stranger_uuid, stranger_uuid):
        db_session.add(
            Tickets(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=owner,
                title="t",
                contact_name="c",
                status="pending",
                priority="high",
                task_type="rescue",
            )
        )
    await db_session.commit()

    res = await client.get(TICKETS_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    # One ticket of the three is theirs; the chart must plot 1, not 3.
    assert res.json()["data"][0]["y"] == [1]


@pytest.mark.asyncio
async def test_unknown_layout_overrides_key_is_a_400(client, db_session, redis):
    """Valid JSON, but not a key Plotly accepts — still the caller's mistake, so still 400.

    Rejected by Plotly deep inside rendering rather than by our own parsing, which is why
    render_chart re-raises it as AnalyticsInputError.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"tz": "UTC", "y": "total_tickets", "layout_overrides": '{"no_such_layout_key": 1}'},
        headers=headers,
    )
    assert res.status_code == 400
    assert "layout_overrides" in res.json()["detail"]


@pytest.mark.asyncio
async def test_default_style_matches_the_dashboard_mock(client, db_session, redis):
    """With no `style`, the figure carries the ops dashboard's look and no modebar."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    layout, config = res.json()["layout"], res.json()["config"]
    assert layout["colorway"][0] == "#E3791E"
    assert layout["font"]["family"] == "Inter, Noto Sans TC, sans-serif"
    assert layout["legend"]["orientation"] == "h"
    assert layout["paper_bgcolor"] == "rgba(0,0,0,0)"
    assert config == {"displayModeBar": False, "responsive": True}


@pytest.mark.asyncio
async def test_style_param_overrides_the_defaults(client, db_session, redis):
    """A partial `style` replaces only the fields it names."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={
            "tz": "UTC",
            "y": "total_tickets",
            "style": json.dumps({"palette": ["#123456"], "legend": "none", "modebar": True}),
        },
        headers=headers,
    )
    assert res.status_code == 200
    layout = res.json()["layout"]
    assert layout["colorway"] == ["#123456"]
    assert layout["showlegend"] is False
    assert res.json()["config"]["displayModeBar"] is True
    assert layout["font"]["family"] == "Inter, Noto Sans TC, sans-serif"  # untouched default


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "style",
    [
        "not json",
        json.dumps({"no_such_field": 1}),
        json.dumps({"font_color": "red"}),
        json.dumps({"palette": []}),
    ],
)
async def test_bad_style_is_a_400(client, db_session, redis, style):
    """Undecodable, unknown-field, non-hex, or empty-palette styles are the caller's error."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL, params={"tz": "UTC", "y": "total_tickets", "style": style}, headers=headers
    )
    assert res.status_code == 400
    assert "style" in res.json()["detail"]


@pytest.mark.asyncio
async def test_completion_rate_axis_is_a_percentage(client, db_session, redis):
    """The metric's own axis rule survives the style layer: the rate is 0–1 but reads as %."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_URL, params={"tz": "UTC", "y": "completion_rate"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["layout"]["yaxis"]["tickformat"] == ".0%"


@pytest.mark.asyncio
async def test_category_axis_shows_display_names(client, db_session, redis):
    """Raw task_type keys become their zh-TW names on the axis; the series name is zh-TW too."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    db_session.add(
        Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            title="t",
            contact_name="c",
            status="pending",
            priority="high",
            task_type="rescue",
        )
    )
    await db_session.commit()

    res = await client.get(
        TICKETS_URL, params={"tz": "UTC", "y": "total_tickets", "x": "category"}, headers=headers
    )
    assert res.status_code == 200
    bar = res.json()["data"][0]
    assert bar["x"] == ["搜救"]
    assert bar["name"] == "任務單"
    assert "rescue" not in res.text


@pytest.mark.asyncio
@pytest.mark.parametrize(("chart_type", "key"), [("bar", "x"), ("pie", "labels")])
async def test_free_text_categories_render_as_literal_text(client, db_session, redis, chart_type, key):
    """Plotly.js renders tags in labels, so a station type can't smuggle a link onto the dashboard.

    /data is not a figure, so it keeps the raw type.
    """
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.STATION_VIEW)
    types = ['<a href="https://example.com">點此回報</a>', "<b>粗體</b>", "R&D", "物資站", None]
    for station_type in types:
        db_session.add(
            Station(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=user_uuid,
                level=1,
                source="user",
                visibility="public",
                type=station_type,
            )
        )
    await db_session.commit()

    params = {"tz": "UTC", "y": "station_count", "x": "category", "chart_type": chart_type}
    res = await client.get(STATIONS_URL, params=params, headers=headers)
    assert res.status_code == 200
    assert set(res.json()["data"][0][key]) == {
        '&lt;a href="https://example.com"&gt;點此回報&lt;/a&gt;',
        "&lt;b&gt;粗體&lt;/b&gt;",
        "R&amp;D",
        "物資站",
        "未分類",
    }
    data = (await client.get(STATIONS_DATA_URL, params=params, headers=headers)).json()
    assert set(data["x_values"]) == {*types[:-1], "未分類"}


def test_bundled_plotlyjs_matches_the_frontend():
    """The figure JSON is written for the plotly.js inside the Python plotly package."""
    assert get_plotlyjs_version() == FRONTEND_PLOTLYJS_VERSION, (
        f"plotly bundles plotly.js {get_plotlyjs_version()} but the frontend loads "
        f"{FRONTEND_PLOTLYJS_VERSION}. Move the plotly pin in pyproject.toml and the frontend's "
        "plotly.js-dist-min together, then update FRONTEND_PLOTLYJS_VERSION."
    )


@pytest.mark.asyncio
async def test_value_requires_authentication(client):
    """Same rule as the chart endpoints — a KPI number is not public data."""
    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": "total_tickets"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_value_requires_the_domain_permission(client, db_session, redis):
    """station.view doesn't substitute for ticket.view on the ticket number either."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_value_returns_the_aggregate_within_the_callers_scope(client, db_session, redis):
    """The KPI number, as a number — narrowed by scope exactly like the chart is."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    stranger_uuid = str(stranger.uuid)
    for owner in (user_uuid, stranger_uuid):
        db_session.add(
            Tickets(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=owner,
                title="t",
                contact_name="c",
                status="pending",
                priority="high",
                task_type="rescue",
            )
        )
    await db_session.commit()

    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    assert res.json() == {"value": 1}


@pytest.mark.asyncio
async def test_value_of_completion_rate_is_a_percentage(client, db_session, redis):
    """`/value` is in the catalog unit (`%`): 1 of 2 completed is 50.0, not the chart's 0.5.

    Empty data is 0, not a 500.
    """
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": "completion_rate"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["value"] == 0

    open_ticket, done_ticket = (
        Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            title="t",
            contact_name="c",
            status="pending",
            priority="high",
            task_type="rescue",
        )
        for _ in range(2)
    )
    done_ticket.status = "completed"
    db_session.add_all([open_ticket, done_ticket])
    await db_session.flush()
    task = TicketTask(
        ticket_uuid=done_ticket.uuid,
        task_type="rescue",
        task_name="task",
        source="user",
        created_by=user_uuid,
        status="fulfilled",
        completed_at=datetime.fromisoformat("2026-08-02T12:00:00+00:00"),
    )
    db_session.add(task)
    await db_session.flush()
    db_session.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=user_uuid, status="completed"))
    await db_session.commit()

    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": "completion_rate"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["value"] == 50.0


@pytest.mark.asyncio
async def test_station_value_renders(client, db_session, redis):
    """The station handler shares _value_domain; an empty table is 0, not a 500."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(STATIONS_VALUE_URL, params={"tz": "UTC", "y": "station_count"}, headers=headers)
    assert res.status_code == 200
    assert res.json() == {"value": 0}


@pytest.mark.asyncio
@pytest.mark.parametrize("y", ["age_distribution", "net_backlog_change", "time_to_completion"])
async def test_value_rejects_a_metric_with_no_single_number(client, db_session, redis, y):
    """Forced-shape and multi-series metrics have no one number to return."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_VALUE_URL, params={"tz": "UTC", "y": y}, headers=headers)
    assert res.status_code == 400
    assert y in res.json()["detail"]


@pytest.mark.asyncio
async def test_value_keeps_the_metrics_own_input_rules(client, db_session, redis):
    """A bad timezone is a 400 on a volunteer total as on any other number."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(TICKETS_VALUE_URL, params={"y": "volunteer_gap", "tz": ""}, headers=headers)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_a_render_bug_is_not_reported_as_a_client_error(client, db_session, monkeypatch, redis):
    """A fault in our own code must surface as a server error, not a 400.

    The handler used to wrap the whole query-and-render chain in `except ValueError`, so an
    internal failure came back as the caller's mistake with the raw message attached.
    """

    def _boom(*args, **kwargs):
        raise ValueError("internal render bug")

    monkeypatch.setattr(chart_render, "render_chart", _boom)
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    # The test transport re-raises unhandled app exceptions, so the raise *is* the pass.
    with pytest.raises(ValueError, match="internal render bug"):
        await client.get(TICKETS_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)


@pytest.mark.asyncio
@pytest.mark.parametrize("url", [TICKETS_URL, STATIONS_URL])
async def test_out_of_range_end_date_is_a_400(client, db_session, url, redis):
    """`end_date=9999-12-31` used to 500 every metric in both domains.

    `local_bounds` builds its exclusive upper bound as `end_date + timedelta(days=1)`, which
    runs off the end of `datetime.date`. FastAPI binds the param as a bare date, so the
    OverflowError landed in a handler that catches only AnalyticsInputError.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW, Perm.STATION_VIEW)
    y = "total_tickets" if url == TICKETS_URL else "station_count"
    res = await client.get(url, params={"tz": "UTC", "y": y, "end_date": "9999-12-31"}, headers=headers)
    assert res.status_code == 400
    assert "end_date" in res.json()["detail"]


@pytest.mark.asyncio
async def test_out_of_range_start_date_is_a_400(client, db_session, redis):
    """The same defect on the lower bound, which the review missed.

    `datetime.combine(date(1, 1, 1), time.min, tzinfo=+08:06)` builds fine, so nothing failed
    in our code — asyncpg encodes a timestamptz via `.astimezone(utc)`, and that underflows.
    Only reachable under a positive UTC offset, hence the explicit tz.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"y": "total_tickets", "start_date": "0001-01-01", "tz": "Asia/Taipei"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "start_date" in res.json()["detail"]


@pytest.mark.asyncio
async def test_boundary_dates_are_accepted(client, db_session, redis):
    """Control for the two above — one day inside each limit still renders.

    Both bugs were off-by-one against the representable range, so a rejection test alone
    would pass just as well against a bound that is a day too tight.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={
            "y": "total_tickets",
            "start_date": "0001-01-02",
            "end_date": "9999-12-30",
            "tz": "Asia/Taipei",
        },
        headers=headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("param", ["width", "height"])
@pytest.mark.parametrize("value", [-1, 0, 9])
async def test_undersized_figure_is_rejected(client, db_session, param, value, redis):
    """Plotly's layout width/height have a minimum of 10; below it update_layout raises.

    The try/except in chart_render wraps layout_overrides only, so these two params reached
    plotly unguarded and 500'd. Now bounded at the framework edge, like the enum params.
    """
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL, params={"tz": "UTC", "y": "total_tickets", param: value}, headers=headers
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_minimum_figure_size_is_accepted(client, db_session, redis):
    """Control for the above — plotly's actual minimum is not rejected."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_URL,
        params={"tz": "UTC", "y": "total_tickets", "width": 10, "height": 10},
        headers=headers,
    )
    assert res.status_code == 200


def _ticket(owner: str, task_type: str | None = "rescue") -> Tickets:
    return Tickets(
        geometry=from_shape(Point(121.5, 25.0), srid=4326),
        created_by=owner,
        title="t",
        contact_name="c",
        status="pending",
        priority="high",
        task_type=task_type,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("url", [TICKETS_DATA_URL, STATIONS_DATA_URL])
async def test_data_requires_authentication(client, url):
    """The series are the chart's numbers, so they are no more public than the chart."""
    res = await client.get(url, params={"tz": "UTC", "y": "total_tickets"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_data_requires_the_domain_permission(client, db_session, redis):
    """station.view doesn't substitute for ticket.view on the ticket series either."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_data_matches_what_the_chart_plots(client, db_session, redis):
    """Same query, same numbers: the data endpoint is the figure's series without the figure."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    db_session.add_all([_ticket(user_uuid, "rescue"), _ticket(user_uuid, "hr"), _ticket(user_uuid, None)])
    await db_session.commit()

    params = {"tz": "UTC", "y": "total_tickets", "x": "category"}
    data = (await client.get(TICKETS_DATA_URL, params=params, headers=headers)).json()
    bar = (await client.get(TICKETS_URL, params=params, headers=headers)).json()["data"][0]
    assert data == {
        "x": "category",
        "x_values": ["搜救", "人力", "未分類"],
        "series": [{"name": "任務單", "values": [1, 1, 1]}],
    }
    assert (bar["x"], bar["y"]) == (data["x_values"], data["series"][0]["values"])


@pytest.mark.asyncio
async def test_data_counts_only_tickets_in_the_callers_scope(client, db_session, redis):
    """An `own` grant narrows the series exactly as it narrows the chart."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    db_session.add_all([_ticket(user_uuid), _ticket(str(stranger.uuid))])
    await db_session.commit()

    res = await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    assert res.json() == {"x": None, "x_values": ["總計"], "series": [{"name": "任務單", "values": [1]}]}


@pytest.mark.asyncio
async def test_data_dates_are_chronological_iso_strings(client, db_session, redis):
    """Date buckets come back oldest first and local to `tz`, whatever order SQL grouped them in."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    # 16:30 UTC is already the next day in Taipei, so these land on 08-02 and 08-01 local.
    for created_at in ("2026-08-01T16:30:00+00:00", "2026-07-31T16:30:00+00:00"):
        ticket = _ticket(user_uuid)
        ticket.created_at = datetime.fromisoformat(created_at)
        db_session.add(ticket)
    await db_session.commit()

    res = await client.get(
        TICKETS_DATA_URL,
        params={"y": "total_tickets", "x": "date", "tz": "Asia/Taipei"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["x"] == "date"
    assert res.json()["x_values"] == ["2026-08-01T00:00:00", "2026-08-02T00:00:00"]


@pytest.mark.asyncio
async def test_data_completion_rate_is_a_percentage(client, db_session, redis):
    """Like `/value`, the series is in the catalog unit: 1 of 2 completed is 50.0, not 0.5."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    open_ticket, done_ticket = _ticket(user_uuid), _ticket(user_uuid)
    done_ticket.status = "completed"
    db_session.add_all([open_ticket, done_ticket])
    await db_session.flush()
    task = TicketTask(
        ticket_uuid=done_ticket.uuid,
        task_type="rescue",
        task_name="task",
        source="user",
        created_by=user_uuid,
        status="fulfilled",
        completed_at=datetime.fromisoformat("2026-08-02T12:00:00+00:00"),
    )
    db_session.add(task)
    await db_session.flush()
    db_session.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=user_uuid, status="completed"))
    await db_session.commit()

    res = await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "completion_rate"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["series"] == [{"name": "完成率", "values": [50.0]}]


@pytest.mark.asyncio
async def test_data_reports_the_grouping_it_applied(client, db_session, redis):
    """With no `x`, a metric that has a built-in grouping uses it, and `x` in the response says so."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_DATA_URL, params={"tz": "UTC", "y": "task_completion_distribution"}, headers=headers
    )
    assert res.status_code == 200
    assert res.json()["x"] == "completion"
    assert res.json()["x_values"] == ["已完成", "未完成"]

    res = await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "age_distribution"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["x"] == "age_bucket"

    res = await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "total_tickets"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["x"] is None

    res = await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "net_backlog_change"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["x"] == "date"
    assert [s["name"] for s in res.json()["series"]] == ["新增", "完成", "取消", "淨變化"]


@pytest.mark.asyncio
async def test_data_keeps_the_metrics_own_input_rules(client, db_session, redis):
    """An inverted trend range and a bad tz are 400s here as on the chart."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_DATA_URL,
        params={
            "tz": "UTC",
            "y": "volunteer_gap",
            "x": "date",
            "start_date": "2026-09-02",
            "end_date": "2026-09-01",
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert "end_date" in res.json()["detail"]

    res = await client.get(TICKETS_DATA_URL, params={"y": "total_tickets", "tz": ""}, headers=headers)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_station_data_renders(client, db_session, redis):
    """The station handler shares _data_domain; a grouping over no rows is empty, not a zero total."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(
        STATIONS_DATA_URL, params={"tz": "UTC", "y": "station_status_count"}, headers=headers
    )
    assert res.status_code == 200
    assert res.json() == {"x": "category", "x_values": [], "series": [{"name": "站點", "values": []}]}


@pytest.mark.parametrize(
    ("y", "plotted", "returned"),
    [
        (TicketYMetric.completion_rate, 0.07, 7.0),
        (TicketYMetric.completion_rate, 0.29, 29.0),
        (TicketYMetric.completion_rate, 0.57, 57.0),
        (TicketYMetric.total_tickets, 3, 3),
    ],
)
def test_catalog_unit_scaling_leaves_no_float_noise(y, plotted, returned):
    """A plain `* 100` turns 0.07 into 7.000000000000001; counts pass through untouched."""
    assert _in_catalog_unit("tickets", y, plotted) == returned
    assert type(_in_catalog_unit("tickets", y, plotted)) is type(returned)


@pytest.mark.asyncio
async def test_data_durations_are_days_as_numbers(client, db_session, redis):
    """Postgres hands the average back as a Decimal; the series carries it as a number of days."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    ticket = _ticket(user_uuid)
    db_session.add(ticket)
    await db_session.flush()
    task = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type="rescue",
        task_name="task",
        source="user",
        created_by=user_uuid,
        status="fulfilled",
    )
    task.created_at = datetime.fromisoformat("2026-08-01T00:00:00+00:00")
    task.completed_at = datetime.fromisoformat("2026-08-02T12:00:00+00:00")
    db_session.add(task)
    await db_session.commit()

    res = await client.get(
        TICKETS_DATA_URL, params={"tz": "UTC", "y": "time_to_completion", "x": "category"}, headers=headers
    )
    assert res.status_code == 200
    assert res.json() == {
        "x": "category",
        "x_values": ["搜救"],
        "series": [{"name": "平均（天）", "values": [1.5]}, {"name": "中位數（天）", "values": [1.5]}],
    }


# --- volunteers, filters and the catalog's filter values ---


async def _filed(db, owner, *, county=None, town=None, village=None, task_type="rescue", status="pending"):
    """A ticket with one need of `task_type` and no type of its own; an address when `county` is given."""
    ticket = _ticket(owner, None)
    ticket.status = status
    db.add(ticket)
    await db.flush()
    db.add(_need(ticket.uuid, owner, task_type))
    if county:
        db.add(
            SecondaryLocation(
                geometry_uuid=ticket.uuid, location_type="address", county=county, town=town, village=village
            )
        )
    await db.flush()
    return ticket


def _need(ticket_uuid, owner: str, task_type: str) -> TicketTask:
    return TicketTask(
        ticket_uuid=ticket_uuid,
        task_type=task_type,
        task_name="n",
        source="user",
        created_by=owner,
        status="pending",
    )


async def _total(client, headers, url=TICKETS_VALUE_URL, y="total_tickets", **filters) -> int:
    res = await client.get(url, params={"tz": "UTC", "y": y, **filters}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["value"]


@pytest.mark.asyncio
async def test_volunteer_metrics_over_value_data_and_chart(client, db_session, redis):
    """A need for 5 with 2 people on it: needed 5, matched 2, gap 3; x=date only applies to the gap."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    ticket = await _filed(db_session, user_uuid, task_type="hr")
    yesterday = datetime.now(UTC) - timedelta(days=1)
    need = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type="hr",
        task_name="task",
        source="user",
        created_by=user_uuid,
        status="pending",
        quantity=5,
        created_at=yesterday,
    )
    other = User(name="volunteer")
    db_session.add_all([need, other])
    await db_session.flush()
    db_session.add_all(
        [
            TaskAssignment(task_uuid=need.uuid, actor_uuid=actor, assigned_at=yesterday)
            for actor in (user_uuid, str(other.uuid))
        ]
    )
    await db_session.commit()

    assert await _total(client, headers, y="volunteers_needed") == 5
    assert await _total(client, headers, y="volunteers_matched") == 2
    assert await _total(client, headers, y="volunteer_gap") == 3

    by_type = (
        await client.get(
            TICKETS_DATA_URL, params={"tz": "UTC", "y": "volunteer_gap", "x": "category"}, headers=headers
        )
    ).json()
    assert (by_type["x_values"], by_type["series"]) == (["人力"], [{"name": "志工缺口", "values": [3]}])
    # The totals have no date form, so asking for one is refused rather than answered with the total.
    refused = await client.get(
        TICKETS_DATA_URL, params={"tz": "UTC", "y": "volunteers_needed", "x": "date"}, headers=headers
    )
    assert refused.status_code == 422

    today = datetime.now(UTC).date()
    trend = {
        "tz": "UTC",
        "y": "volunteer_gap",
        "x": "date",
        "start_date": str(today - timedelta(days=2)),
        "end_date": str(today),
    }
    data = (await client.get(TICKETS_DATA_URL, params=trend, headers=headers)).json()
    assert data["x"] == "date"
    assert data["series"] == [{"name": "志工缺口", "values": [0, 3, 3]}]
    # Only day is published for the gap trend; a week still gets the same daily points.
    weekly = (
        await client.get(TICKETS_DATA_URL, params={**trend, "x_granularity": "week"}, headers=headers)
    ).json()
    assert weekly == data
    figure = await client.get(TICKETS_URL, params={**trend, "chart_type": "line"}, headers=headers)
    assert figure.status_code == 200
    assert figure.json()["data"][0]["y"] == [0, 3, 3]


@pytest.mark.asyncio
async def test_ticket_filters_by_task_type_and_status(client, db_session, redis):
    """task_type and status each narrow the count, and combine."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    await _filed(db_session, user_uuid, task_type="rescue", status="pending")
    await _filed(db_session, user_uuid, task_type="supply", status="in_progress")
    await _filed(db_session, user_uuid, task_type="supply", status="completed")
    await db_session.commit()

    assert await _total(client, headers) == 3
    assert await _total(client, headers, task_type="supply") == 2
    assert await _total(client, headers, status="completed") == 1
    assert await _total(client, headers, task_type="supply", status="in_progress") == 1
    assert await _total(client, headers, task_type="medical") == 0
    assert await _total(client, headers, status="cancelled") == 0


@pytest.mark.asyncio
async def test_task_type_filter_reads_the_live_needs(client, db_session, redis):
    """A ticket matches a type through its live needs, once however many match; a deleted need never."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    two_needs = await _filed(db_session, user_uuid, task_type="supply")
    db_session.add(_need(two_needs.uuid, user_uuid, "supply"))
    deleted = await _filed(db_session, user_uuid, task_type="rescue")
    gone = _need(deleted.uuid, user_uuid, "medical")
    gone.delete_at = datetime.now(UTC)
    db_session.add(gone)
    await db_session.commit()

    assert await _total(client, headers, task_type="supply") == 1
    assert await _total(client, headers, task_type="medical") == 0
    assert await _total(client, headers, task_type="rescue") == 1


@pytest.mark.asyncio
async def test_include_deleted_counts_deleted_tickets_as_canceled_within_scope(client, db_session, redis):
    """A deleted ticket is in no bucket by default; with include_deleted it is canceled, in scope only."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    await _filed(db_session, user_uuid)
    for owner in (user_uuid, str(stranger.uuid)):
        ticket = await _filed(db_session, owner, status="cancelled")
        ticket.delete_at = datetime.now(UTC)
    await db_session.commit()

    assert await _total(client, headers) == 1
    assert await _total(client, headers, y="canceled_tickets") == 0
    assert await _total(client, headers, include_deleted="true") == 2
    assert await _total(client, headers, y="canceled_tickets", include_deleted="true") == 1
    assert await _total(client, headers, y="unassigned_tickets", include_deleted="true") == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("params", [{"task_type": "bogus"}, {"status": "bogus"}, {"status": "active"}])
async def test_ticket_filter_values_outside_the_vocabulary_are_rejected(client, db_session, redis, params):
    """An unknown task type or status is a 422, not a silent empty result."""
    headers = await _user_with_perms(db_session, redis, Perm.TICKET_VIEW)
    res = await client.get(
        TICKETS_VALUE_URL, params={"tz": "UTC", "y": "total_tickets", **params}, headers=headers
    )
    assert res.status_code == 422


def test_task_type_filter_lists_the_task_types_a_need_can_have():
    """The filter's enum is a second copy of the vocabulary; this catches the two drifting apart."""
    assert {t.value for t in TicketTaskType} == TASK_TYPES


@pytest.mark.asyncio
async def test_ticket_area_filters_by_city_town_or_village(client, db_session, redis):
    """Each part of the address narrows on its own, they combine, and only an address row counts."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大馬村")
    await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大進村")
    await _filed(db_session, user_uuid, county="花蓮縣", town="鳳林鎮", village="大馬村")
    pole = await _filed(db_session, user_uuid, county="宜蘭縣", town="冬山鄉", village="冬山村")
    await _filed(db_session, user_uuid)  # no address at all
    # A second address row of the first ticket must not count it twice; a pole row is not an address.
    db_session.add(
        SecondaryLocation(geometry_uuid=pole.uuid, location_type="pole", county="臺北市", town="中正區")
    )
    await db_session.commit()

    assert await _total(client, headers) == 5
    assert await _total(client, headers, county="花蓮縣") == 3
    assert await _total(client, headers, county="花蓮縣", town="光復鄉") == 2
    assert await _total(client, headers, town="光復鄉") == 2
    assert await _total(client, headers, village="大馬村") == 2  # the same name in two towns
    assert await _total(client, headers, town="光復鄉", village="大馬村") == 1
    assert await _total(client, headers, county="宜蘭縣") == 1
    assert await _total(client, headers, county="") == 5  # blank means no filter


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"county": "XYZ"},
        {"county": "臺北市"},  # only a pole row has it, and the catalog lists addresses
        {"county": "花蓮縣", "village": "冬山村"},  # both exist, never on the same address
        {"town": "XYZ"},
        {"village": "XYZ"},
        {"county": "花蓮縣", "town": "冬山鄉"},
    ],
)
@pytest.mark.parametrize("url", [TICKETS_VALUE_URL, TICKETS_DATA_URL, TICKETS_URL])
async def test_an_area_outside_the_catalog_is_a_422(client, db_session, redis, url, params):
    """Like an unknown status, an area the catalog does not list is refused on every ticket endpoint."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大馬村")
    pole = await _filed(db_session, user_uuid, county="宜蘭縣", town="冬山鄉", village="冬山村")
    db_session.add(SecondaryLocation(geometry_uuid=pole.uuid, location_type="pole", county="臺北市"))
    await db_session.commit()

    res = await client.get(url, params={"tz": "UTC", "y": "total_tickets", **params}, headers=headers)
    assert res.status_code == 422
    assert "找不到這個地區" in res.json()["detail"]


@pytest.mark.asyncio
async def test_the_area_check_accepts_exactly_what_the_catalog_lists(client, db_session, redis):
    """Every county, town and village the catalog names passes the filter; a deleted row's place does not."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大馬村")
    await _filed(db_session, user_uuid, county="花蓮縣", town="鳳林鎮")
    await _filed(db_session, user_uuid, county="宜蘭縣")
    await _filed(
        db_session, user_uuid, county="屏東縣", village="無鄉鎮村"
    )  # no town: the list omits the village
    gone = await _filed(db_session, user_uuid, county="臺北市", town="中正區")
    gone.delete_at = datetime.now(UTC)
    await db_session.commit()

    areas = (await client.get(CATALOG_URL, headers=headers)).json()["filters"]["tickets"]["areas"]
    for county in areas:
        assert await _total(client, headers, county=county["county"]) >= 0
        for town in county["towns"]:
            assert await _total(client, headers, county=county["county"], town=town["town"]) >= 0
            for village in town["villages"]:
                filters = {"county": county["county"], "town": town["town"], "village": village}
                assert await _total(client, headers, **filters) >= 0
    for params in ({"county": "臺北市"}, {"county": "屏東縣", "village": "無鄉鎮村"}):
        res = await client.get(
            TICKETS_VALUE_URL, params={"tz": "UTC", "y": "total_tickets", **params}, headers=headers
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_a_ticket_with_two_address_rows_is_counted_once(client, db_session, redis):
    """The address filter asks whether a matching row exists; it does not join."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    ticket = await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大馬村")
    db_session.add(
        SecondaryLocation(geometry_uuid=ticket.uuid, location_type="address", county="花蓮縣", town="光復鄉")
    )
    await db_session.commit()

    assert await _total(client, headers, county="花蓮縣") == 1


@pytest.mark.asyncio
async def test_filters_narrow_the_callers_scope_and_never_widen_it(client, db_session, redis):
    """Someone with `own` scope who filters on a place still sees only their own tickets there."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    await _filed(db_session, user_uuid, county="花蓮縣", task_type="supply")
    await _filed(db_session, str(stranger.uuid), county="花蓮縣", task_type="supply")
    await _filed(db_session, str(stranger.uuid), county="宜蘭縣", task_type="supply")
    await db_session.commit()

    assert await _total(client, headers, county="花蓮縣", task_type="supply") == 1
    assert await _total(client, headers, y="volunteers_needed", county="花蓮縣") == 0
    # 宜蘭縣 only has a stranger's ticket, so it is not in this caller's area list either.
    res = await client.get(
        TICKETS_VALUE_URL, params={"tz": "UTC", "y": "total_tickets", "county": "宜蘭縣"}, headers=headers
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_filters_apply_to_the_chart_and_data_endpoints_too(client, db_session, redis):
    """The filters ride on all three endpoints, not only /value."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    await _filed(db_session, user_uuid, county="花蓮縣")
    await _filed(db_session, user_uuid, county="宜蘭縣")
    await db_session.commit()

    params = {"tz": "UTC", "y": "total_tickets", "county": "花蓮縣"}
    chart = (await client.get(TICKETS_URL, params=params, headers=headers)).json()
    data = (await client.get(TICKETS_DATA_URL, params=params, headers=headers)).json()
    assert chart["data"][0]["y"] == [1]
    assert data["series"][0]["values"] == [1]


@pytest.mark.asyncio
async def test_station_filters_and_the_operating_count(client, db_session, redis):
    """Stations filter by type, status and area; the operating count is the active ones, undated."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.STATION_VIEW)
    specs = [
        ("shelter", "active", "花蓮縣", "光復鄉", "大馬村"),
        ("shelter", "temporarily_closed", "花蓮縣", "光復鄉", "大進村"),
        ("water", "active", "宜蘭縣", "冬山鄉", "冬山村"),
        ("water", "permanently_closed", None, None, None),
    ]
    for kind, operational_status, county, town, village in specs:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            level=1,
            source="user",
            visibility="public",
            type=kind,
            operational_status=operational_status,
        )
        db_session.add(station)
        await db_session.flush()
        if county:
            db_session.add(
                SecondaryLocation(
                    geometry_uuid=station.uuid,
                    location_type="address",
                    county=county,
                    town=town,
                    village=village,
                )
            )
    await db_session.commit()

    async def total(y="station_count", **filters):
        return await _total(client, headers, url=STATIONS_VALUE_URL, y=y, **filters)

    assert await total() == 4
    assert await total(station_type="water") == 2
    assert await total(status="active") == 2
    assert await total(station_type="water", status="active") == 1
    assert await total(county="花蓮縣") == 2
    assert await total(village="冬山村") == 1
    res = await client.get(
        STATIONS_VALUE_URL, params={"tz": "UTC", "y": "station_count", "county": "XYZ"}, headers=headers
    )
    assert res.status_code == 422
    # Operating stations: active ones only, wherever and whenever they were made.
    old = {"start_date": "2001-01-01", "end_date": "2001-01-02"}
    assert await total(y="operating_station_count") == 2
    assert await total(y="operating_station_count", **old) == 2
    assert await total(y="operating_station_count", station_type="water") == 1
    # ...and a status filter that contradicts it leaves nothing.
    assert await total(y="operating_station_count", status="permanently_closed") == 0
    res = await client.get(
        STATIONS_URL, params={"tz": "UTC", "y": "operating_station_count", "x": "category"}, headers=headers
    )
    assert dict(zip(res.json()["data"][0]["x"], res.json()["data"][0]["y"], strict=True)) == {
        "收容所": 1,
        "加水": 1,
    }


@pytest.mark.asyncio
async def test_a_station_status_outside_the_vocabulary_is_rejected(client, db_session, redis):
    """A ticket status is not a station status: 422."""
    headers = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    res = await client.get(
        STATIONS_VALUE_URL, params={"tz": "UTC", "y": "station_count", "status": "pending"}, headers=headers
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_count_over_the_endpoints_counts_pending_cards(client, db_session, redis):
    """The number the dashboard shows: tickets named by a card waiting for review."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW)
    first, second = await _filed(db_session, user_uuid), await _filed(db_session, user_uuid)
    low, high = sorted((uuid.UUID(str(first.uuid)), uuid.UUID(str(second.uuid))), key=lambda u: u.int)
    db_session.add(
        DuplicatePair(
            entity_kind="ticket",
            low_uuid=low,
            high_uuid=high,
            method="fast_rule",
            engine_version="fast-v1",
            source_layer="fast",
            status="dup_ignored",
        )
    )
    await db_session.commit()

    assert await _total(client, headers, y="duplicate_count") == 2
    data = (
        await client.get(TICKETS_DATA_URL, params={"tz": "UTC", "y": "duplicate_count"}, headers=headers)
    ).json()
    assert data["series"] == [{"name": "疑似重複的單", "values": [2]}]
    assert (
        await _total(client, headers, y="duplicate_count", start_date="2001-01-01", end_date="2001-01-02")
        == 0
    )


def _option_values(options: list[dict]) -> list[str]:
    return [option["value"] for option in options]


@pytest.mark.asyncio
async def test_catalog_publishes_the_filter_values(client, db_session, redis):
    """The catalog lists each filter's values, with display names, from the live rows."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, Perm.STATION_VIEW)
    await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大馬村")
    await _filed(db_session, user_uuid, county="花蓮縣", town="光復鄉", village="大進村")
    await _filed(db_session, user_uuid, county="花蓮縣", town="鳳林鎮")
    await _filed(db_session, user_uuid, county="宜蘭縣")
    gone = await _filed(db_session, user_uuid, county="臺北市", town="中正區")
    gone.delete_at = datetime.now(UTC)
    for kind in ("shelter", "water", "water", None):
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            level=1,
            source="user",
            visibility="public",
            type=kind,
        )
        db_session.add(station)
        await db_session.flush()
        if kind == "water":
            db_session.add(
                SecondaryLocation(
                    geometry_uuid=station.uuid,
                    location_type="address",
                    county="南投縣",
                    town="埔里鎮",
                    village="南村",
                )
            )
    await db_session.commit()

    filters = (await client.get(CATALOG_URL, headers=headers)).json()["filters"]
    assert set(filters) == {"tickets", "stations"}
    tickets, stations = filters["tickets"], filters["stations"]
    assert tickets["types"] == [
        {"value": "rescue", "label": "搜救"},
        {"value": "supply", "label": "物資"},
        {"value": "medical", "label": "醫療"},
        {"value": "hr", "label": "人力"},
    ]
    assert tickets["statuses"] == [
        {"value": "pending", "label": "待處理"},
        {"value": "in_progress", "label": "進行中"},
        {"value": "completed", "label": "已完成"},
        {"value": "cancelled", "label": "已取消"},
    ]
    # Counties, towns and villages as they stand on live tickets, nested for cascading menus.
    assert tickets["areas"] == [
        {
            "county": "宜蘭縣",
            "towns": [],
        },
        {
            "county": "花蓮縣",
            "towns": [
                {"town": "光復鄉", "villages": ["大進村", "大馬村"]},
                {"town": "鳳林鎮", "villages": []},
            ],
        },
    ]
    assert stations["types"] == [
        {"value": "shelter", "label": "收容所"},
        {"value": "water", "label": "加水"},
    ]
    assert stations["statuses"] == [
        {"value": "active", "label": "營運中"},
        {"value": "temporarily_closed", "label": "暫停營運"},
        {"value": "permanently_closed", "label": "永久關閉"},
    ]
    assert stations["areas"] == [
        {"county": "南投縣", "towns": [{"town": "埔里鎮", "villages": ["南村"]}]},
    ]


@pytest.mark.asyncio
async def test_catalog_filter_values_come_only_from_what_the_caller_may_chart(client, db_session, redis):
    """Where tickets are filed is not for a caller who cannot chart tickets, nor beyond their own scope."""
    user_uuid, headers = await _seeded_user(db_session, redis, Perm.TICKET_VIEW, scope="own")
    stranger = User(name="somebody else")
    db_session.add(stranger)
    await db_session.flush()
    await _filed(db_session, user_uuid, county="花蓮縣")
    await _filed(db_session, str(stranger.uuid), county="宜蘭縣")
    await db_session.commit()

    filters = (await client.get(CATALOG_URL, headers=headers)).json()["filters"]
    assert [area["county"] for area in filters["tickets"]["areas"]] == ["花蓮縣"]
    # No station.view: none of the station values, though the fixed vocabularies are public.
    assert filters["stations"]["areas"] == [] and filters["stations"]["types"] == []

    station_only = await _user_with_perms(db_session, redis, Perm.STATION_VIEW)
    filters = (await client.get(CATALOG_URL, headers=station_only)).json()["filters"]
    assert filters["tickets"]["areas"] == []
    assert _option_values(filters["tickets"]["types"]) == ["rescue", "supply", "medical", "hr"]
