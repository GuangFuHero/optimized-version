"""Exporting the audit log as CSV (ADR-414): super admins only, the read API's filters, newest first."""

import csv
import io
import json

import pytest

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import UserRoleAssign
from app.services import audit_log as audit_log_service
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import auth_headers_for
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


async def _reader(db, redis, name: str, *perms: Perm) -> dict:
    """Headers for a platform account holding `perms` at `all`."""
    role = await _role(db, name, "platform", [(perm, "all") for perm in perms])
    user = User(name=name)
    db.add(user)
    await db.flush()
    ids = (user.uuid, role.uuid)  # read before the commit expires them
    db.add(UserRoleAssign(user_uuid=ids[0], role_uuid=ids[1]))
    await db.commit()
    return await auth_headers_for(redis, *ids)


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

    response = await client.get(URL, headers=headers)

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith("attachment;")
    table = _table(response)
    assert table[0] == HEADER
    assert [row[1] for row in table[1:]] == ["users", "teams"]
    assert json.loads(table[1][HEADER.index("new_values")]) == {"name": "小明"}
    assert table[1][HEADER.index("client_ip")] == "203.0.113.7"


@pytest.mark.asyncio
async def test_the_filters_of_the_read_api_apply(client, db_session, redis):
    """`table`, `from`, `to`, `actor_uuid` and `row_id` narrow the file as they narrow the page."""
    db_session.add_all([_row("teams", new={"name": "甲隊"}), _row("users", new={"name": "小明"})])
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await client.get(URL, params={"table": "teams"}, headers=headers)

    assert [row[1] for row in _table(response)[1:]] == ["teams"]


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

    response = await client.get(URL, headers=headers)

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

    response = await client.get(URL, headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_more_rows_than_the_cap_asks_for_a_narrower_range(client, db_session, redis, monkeypatch):
    """Over the cap the file is refused rather than cut short, so nobody mistakes a part for the whole."""
    monkeypatch.setattr(audit_log_service, "MAX_EXPORT_ROWS", 2)
    db_session.add_all([_row("teams", new={"n": i}, ago=i) for i in range(3)])
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await client.get(URL, headers=headers)

    assert response.status_code == 422
    assert "2" in response.json()["detail"]


@pytest.mark.asyncio
async def test_exactly_the_cap_is_still_a_file(client, db_session, redis, monkeypatch):
    """The cap is inclusive."""
    monkeypatch.setattr(audit_log_service, "MAX_EXPORT_ROWS", 2)
    db_session.add_all([_row("teams", new={"n": i}, ago=i) for i in range(2)])
    headers = await _reader(db_session, redis, "boss", Perm.AUDIT_VIEW, Perm.AUDIT_EXPORT)

    response = await client.get(URL, headers=headers)

    assert response.status_code == 200
    assert len(_table(response)) == 3


def test_the_seed_gives_audit_export_to_super_admin_only():
    """No other role, the data auditor included, holds it."""
    holders = {role["name"] for role in ROLES_DATA if Perm.AUDIT_EXPORT in role["permissions"]}
    assert holders == {"super_admin"}
