"""Exporting the audit log as CSV (ADR-414): super admins only, the read API's filters, newest first.

A POST, because each export is recorded (ADR-417): a write, so a browser's request needs one of our
pages (ADR-327).
"""

import csv
import io
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core import auth_cookies
from app.core.config import settings
from app.core.permissions import Perm
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.rbac import UserRoleAssign
from app.services import audit_log as audit_log_service
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import auth_headers_for
from tests.cookies import cookie_header
from tests.test_audit_log_api import _role, _row

URL = "/api/v1/admin/audit-logs/export"
HEADER = [
    "created_at",
    "table_name",
    "action",
    "row_id",
    "actor_uuid",
    "actor_name",
    "client_ip",
    "context",
    "old_values",
    "new_values",
]


async def _reader(db, redis, name: str, *perms: Perm, scope: str = "all") -> dict:
    """Headers for a platform account holding `perms` at `scope`."""
    role = await _role(db, name, "platform", [(perm, scope) for perm in perms])
    user = User(name=name)
    db.add(user)
    await db.flush()
    ids = (user.uuid, role.uuid)  # read before the commit expires them
    db.add(UserRoleAssign(user_uuid=ids[0], role_uuid=ids[1]))
    await db.commit()
    return await auth_headers_for(redis, *ids)


async def _export(client, headers: dict, **filters):
    """POST an export with `filters` as the JSON body."""
    return await client.post(URL, json=filters, headers=headers)


def _table(response) -> list[list[str]]:
    text = response.content.decode("utf-8")
    assert text.startswith("﻿"), "Excel needs the BOM to read CJK text"
    return list(csv.reader(io.StringIO(text[1:])))


@pytest.mark.asyncio
async def test_a_super_admin_downloads_the_log_newest_first(client, db_session, redis):
    """A CSV attachment: one header row, then one row per change, newest first."""
    db_session.add_all(
        [_row("teams", new={"name": "甲隊"}, ago=2), _row("users", new={"name": "小明"}, ago=1)]
    )
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers)

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith("attachment;")
    table = _table(response)
    assert table[0] == HEADER
    assert [row[1] for row in table[1:]] == ["users", "teams"]
    assert json.loads(table[1][HEADER.index("new_values")]) == {"name": "小明"}
    assert table[1][HEADER.index("client_ip")] == "203.0.113.7"


_ACTOR = uuid.uuid4()
_ROW_ID = uuid.uuid4()
_NOW = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)


def _dated(name: str, minutes: int, *, table="teams", row_id=None, actor=None):
    row = _row(table, new={"name": name}, row_id=row_id)
    row.created_at = _NOW + timedelta(minutes=minutes)
    row.user_uuid = actor
    return row


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("filters", "expected"),
    [
        ({"table": "teams"}, ["c", "b", "a"]),
        ({"row_id": str(_ROW_ID)}, ["b"]),
        ({"actor_uuid": str(_ACTOR)}, ["c"]),
        # `from` is inclusive, `to` exclusive, as on the list.
        ({"from": (_NOW + timedelta(minutes=1)).isoformat()}, ["c", "b"]),
        ({"to": (_NOW + timedelta(minutes=1)).isoformat()}, ["a", "u"]),
    ],
    ids=["table", "row_id", "actor_uuid", "from", "to"],
)
async def test_the_filters_of_the_read_api_apply(client, db_session, redis, filters, expected):
    """`table`, `from`, `to`, `actor_uuid` and `row_id` narrow the file as they narrow the page."""
    actor = User(uuid=_ACTOR, name="actor")
    db_session.add(actor)
    await db_session.flush()
    db_session.add_all(
        [
            _dated("a", 0),
            _dated("b", 1, row_id=_ROW_ID),
            _dated("c", 2, actor=_ACTOR),
            _dated("u", -10, table="users"),
        ]
    )
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers, **filters)

    assert response.status_code == 200, response.text
    names = [json.loads(row[HEADER.index("new_values")])["name"] for row in _table(response)[1:]]
    assert names == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"table_name": "teams"}, {"user_uuid": str(uuid.uuid4())}])
async def test_an_unknown_field_is_refused_not_ignored(client, db_session, redis, body):
    """ADR-428: a misspelled filter would otherwise export the whole log as if unfiltered."""
    db_session.add(_row("users", new={"name": "小明"}))
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers, **body)

    assert response.status_code == 422
    assert await _exports(db_session) == []


@pytest.mark.asyncio
async def test_each_row_names_who_made_the_change(client, db_session, redis):
    """`actor_name` is the nickname, written so a spreadsheet cannot run it as a formula."""
    actor = User(name="=HYPERLINK(1)")
    db_session.add(actor)
    await db_session.flush()
    actor_uuid = actor.uuid
    row = _row("teams", new={"name": "甲隊"})
    row.user_uuid = actor_uuid
    db_session.add(row)
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers)

    line = _table(response)[1]
    assert line[HEADER.index("actor_uuid")] == str(actor_uuid)
    assert line[HEADER.index("actor_name")] == "'=HYPERLINK(1)"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "perms",
    [(Perm.AUDIT_VIEW,), (Perm.AUDIT_VIEW, Perm.ROLE_REQUEST_REVIEW), (Perm.TEAM_AUDIT_VIEW,)],
    ids=["data auditor", "reviewer without export", "team audit reader"],
)
async def test_only_audit_export_downloads(client, db_session, redis, perms):
    """Reading the log is not enough: the file is for super admins (ADR-414)."""
    headers = await _reader(db_session, redis, "reader", *perms)

    response = await _export(client, headers)

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["team", "zone", "own"])
async def test_audit_export_below_all_does_not_download(client, db_session, redis, scope):
    """The file is the whole platform's log, so only `all` opens it; a narrower grant is refused."""
    headers = await _reader(db_session, redis, "narrow", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT, scope=scope)

    response = await _export(client, headers)

    assert response.status_code == 403
    assert await _exports(db_session) == []


@pytest.mark.asyncio
async def test_more_rows_than_the_cap_asks_for_a_narrower_range(client, db_session, redis, monkeypatch):
    """Over the cap the file is refused rather than cut short, so nobody mistakes a part for the whole."""
    monkeypatch.setattr(audit_log_service, "MAX_EXPORT_ROWS", 2)
    db_session.add_all([_row("teams", new={"n": i}, ago=i) for i in range(3)])
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers)

    assert response.status_code == 422
    body = response.json()
    assert (body["code"], body["matched"], body["limit"]) == ("audit_export_too_large", 3, 2)


@pytest.mark.asyncio
async def test_exactly_the_cap_is_still_a_file(client, db_session, redis, monkeypatch):
    """The cap is inclusive."""
    monkeypatch.setattr(audit_log_service, "MAX_EXPORT_ROWS", 2)
    db_session.add_all([_row("teams", new={"n": i}, ago=i) for i in range(2)])
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers)

    assert response.status_code == 200
    assert len(_table(response)) == 3


def test_the_seed_gives_audit_export_to_super_admin_only():
    """No other role, the data auditor included, holds it."""
    holders = {role["name"] for role in ROLES_DATA if Perm.AUDIT_EXPORT in role["permissions"]}
    assert holders == {"super_admin"}


async def _exports(db) -> list[AuditLog]:
    db.expire_all()
    return list((await db.execute(select(AuditLog).where(AuditLog.action == "EXPORT"))).scalars())


@pytest.mark.asyncio
async def test_each_download_is_recorded(client, db_session, redis):
    """Who exported, with which filters and how many rows: the file leaves no other trace (ADR-417)."""
    db_session.add_all([_row("teams", new={"n": 1}), _row("users", new={"n": 2})])
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers, table="teams")

    assert response.status_code == 200
    [record] = await _exports(db_session)
    boss = await db_session.scalar(select(User.uuid).where(User.name == "boss"))
    assert (record.table_name, record.user_uuid) == ("audit_logs", boss)
    assert record.new_values == {
        "rows": 1,
        "matched": 1,
        "tz": "UTC",
        "filters": {"table": "teams", "row_id": None, "actor_uuid": None, "from": None, "to": None},
    }


@pytest.mark.asyncio
async def test_an_attempt_over_the_cap_is_recorded(client, db_session, redis, monkeypatch):
    """ADR-429: no file left, but an attempt to pull more of the log than one file allows is kept."""
    monkeypatch.setattr(audit_log_service, "MAX_EXPORT_ROWS", 1)
    db_session.add_all([_row("teams", new={"n": 1}), _row("teams", new={"n": 2})])
    boss = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, boss, table="teams", tz="Asia/Taipei")

    assert response.status_code == 422
    [record] = await _exports(db_session)
    boss_uuid = await db_session.scalar(select(User.uuid).where(User.name == "boss"))
    assert record.user_uuid == boss_uuid
    assert record.new_values == {
        "rows": 0,
        "matched": 2,
        "tz": "Asia/Taipei",
        "filters": {"table": "teams", "row_id": None, "actor_uuid": None, "from": None, "to": None},
    }


@pytest.mark.asyncio
async def test_a_forbidden_download_records_nothing(client, db_session, redis):
    """A 403 is someone who may not export at all: no attempt at the log is recorded for them."""
    db_session.add(_row("teams", new={"n": 1}))
    auditor = await _reader(db_session, redis, "auditor", Perm.AUDIT_VIEW)

    assert (await _export(client, auditor)).status_code == 403
    assert await _exports(db_session) == []


@pytest.mark.asyncio
async def test_times_are_utc_unless_a_zone_is_asked_for(client, db_session, redis, monkeypatch):
    """ADR-430: `tz` writes `created_at` and the file name in that zone, still with its offset."""
    row = _row("teams", new={"n": 1})
    row.created_at = datetime(2026, 10, 29, 16, 30, tzinfo=UTC)
    db_session.add(row)
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    utc = await _export(client, headers)
    taipei = await _export(client, headers, tz="Asia/Taipei")

    column = HEADER.index("created_at")
    assert _table(utc)[1][column] == "2026-10-29T16:30:00+00:00"
    assert _table(taipei)[1][column] == "2026-10-30T00:30:00+08:00"
    now_taipei = datetime.now(UTC) + timedelta(hours=8)
    name = taipei.headers["content-disposition"].split('filename="audit-logs-', 1)[1]
    stamp = datetime.strptime(name[:15], "%Y%m%d-%H%M%S").replace(tzinfo=UTC)
    assert abs((now_taipei - stamp).total_seconds()) < 120


@pytest.mark.asyncio
@pytest.mark.parametrize("tz", ["Mars/Olympus", "", "../etc/passwd", "+08:00"])
async def test_an_unknown_zone_is_refused(client, db_session, redis, tz):
    """Only IANA names; anything else is a 422 before the log is read."""
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers, tz=tz)

    assert response.status_code == 422
    assert await _exports(db_session) == []


@pytest.mark.asyncio
async def test_a_get_is_not_an_export(client, db_session, redis):
    """Only POST: a link another site shows cannot make an export happen (ADR-414)."""
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await client.get(URL, headers=headers)

    assert response.status_code == 405
    assert await _exports(db_session) == []


@pytest.mark.asyncio
async def test_a_browser_export_must_come_from_one_of_our_pages(client, db_session, redis, monkeypatch):
    """Signed in by cookie, the POST is a write: no allowed Origin, no export (ADR-327)."""
    monkeypatch.setattr(settings, "AUTH_ALLOWED_ORIGINS", "https://admin.site.test")
    bearer = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)
    cookie = cookie_header(**{auth_cookies.access_cookie_name(): bearer["Authorization"].split(" ", 1)[1]})

    elsewhere = await client.post(URL, json={}, headers={**cookie, "Origin": "https://evil.test"})
    ours = await client.post(URL, json={}, headers={**cookie, "Origin": "https://admin.site.test"})

    assert (elsewhere.status_code, elsewhere.json()["code"]) == (403, "origin_not_allowed")
    assert ours.status_code == 200, ours.text


_APPLICATION = {"team_uuid": None, "applicant_phone": "+886912345678", "reason": "想加入"}


@pytest.mark.asyncio
async def test_without_role_request_review_applicant_details_are_masked(client, db_session, redis):
    """As on screen (ADR-359 point 5): an export grant alone does not reveal what applicants sent."""
    db_session.add(_row("role_requests", new=_APPLICATION))
    headers = await _reader(db_session, redis, "exporter", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await _export(client, headers)

    new = json.loads(_table(response)[1][HEADER.index("new_values")])
    assert (new["applicant_phone"], new["reason"]) == ("[redacted]", "[redacted]")


@pytest.mark.asyncio
async def test_with_role_request_review_applicant_details_are_shown(client, db_session, redis):
    """The super admin, who reviews applications, reads them as sent."""
    db_session.add(_row("role_requests", new=_APPLICATION))
    headers = await _reader(
        db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT, Perm.ROLE_REQUEST_REVIEW
    )

    response = await _export(client, headers)

    new = json.loads(_table(response)[1][HEADER.index("new_values")])
    assert new["applicant_phone"] == "+886912345678"


@pytest.mark.asyncio
async def test_an_invite_link_token_is_never_in_the_file(client, db_session, redis):
    """ADR-431: a token stays usable for 24 hours, and this file is made to be carried away."""
    db_session.add(_row("team_invites", new={"token": "live-token", "team_uuid": None}))
    headers = await _reader(
        db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT, Perm.ROLE_REQUEST_REVIEW
    )

    response = await _export(client, headers)

    assert "live-token" not in response.content.decode("utf-8")
    new = json.loads(_table(response)[1][HEADER.index("new_values")])
    assert new == {"token": "[redacted]", "team_uuid": None}
