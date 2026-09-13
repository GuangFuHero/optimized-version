"""HTTP surface of the bulk endpoints (feature 015, ADR-114).

The services are covered directly elsewhere; what only shows up here is the transport: the
attachment headers, multipart handling, the mapping form field, and which failures become a
400 rather than a 500.
"""

import base64
import io
import json
import os

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.tabular import write_csv
from app.models.auth import User
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.services.bulk_import import MAX_ROWS
from tests.conftest import auth_headers_for

BASE = "/api/v1/bulk"
HEADERS = ("name", "type", "latitude", "longitude", "county", "city")


# A bare `create_access_token(sub=...)` no longer works here: feature 010 wants an `act`
# claim naming the identity (without one the caller resolves to zero grants) and feature 014
# wants a live session behind the token. `auth_headers_for` mints the shape production does.


def _row(name: str) -> dict:
    return {
        "name": name, "type": "shelter", "latitude": "25.0", "longitude": "121.5",
        "county": "花蓮縣", "city": "光復鄉",
    }


def _upload(rows, filename="stations.csv") -> dict:
    return {"file": (filename, io.BytesIO(write_csv(HEADERS, rows)), "text/csv")}


async def _user_with(db, redis, name: str, *perms) -> dict:
    """Create a user holding `perms` at `all` scope; return its Authorization headers.

    One role carrying every permission, not one role each: only the active identity's grants
    count since feature 010, so a user wearing five single-permission roles would hold
    whichever one the token names and none of the others.

    With no `perms` the user gets no role at all, and the token carries no identity — which
    is exactly what the 403 tests want to exercise.
    """
    user = User(name=name)
    db.add(user)
    await db.flush()
    role = None
    if perms:
        role = Role(name=f"{name}-bulk-tests", kind="platform")
        db.add(role)
        await db.flush()
        for perm in perms:
            permission = (
                await db.execute(select(Permission).where(Permission.key == perm.value))
            ).scalar_one_or_none()
            if permission is None:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
            db.add(RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid,
                              team_uuid=None, role_kind="platform"))
    uuid = str(user.uuid)
    headers = await auth_headers_for(redis, uuid, role)
    await db.commit()
    return headers


async def _importer(db_session, redis) -> dict:
    db_session.add(StationPropertyConfig(
        station_type="shelter", property_name="capacity_total",
        data_type="Integer", enum_options=None,
    ))
    return await _user_with(
        db_session, redis, "HttpImporter",
        Perm.STATION_EXPORT, Perm.STATION_IMPORT, Perm.STATION_ADD,
        Perm.STATION_EDIT, Perm.STATION_CONTRIBUTE,
    )


# --- export ---


@pytest.mark.asyncio
async def test_export_streams_a_named_csv_attachment(client, db_session, redis):
    """The browser must offer a file, not render it."""
    headers = await _importer(db_session, redis)

    resp = await client.get(f"{BASE}/stations/export?station_type=shelter", headers=headers)

    assert resp.status_code == 200
    assert resp.headers["content-disposition"] == (
        "attachment; filename=\"stations-shelter.csv\"; filename*=UTF-8''stations-shelter.csv"
    )
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.content.startswith(b"\xef\xbb\xbf")


@pytest.mark.asyncio
async def test_export_can_stream_xlsx(client, db_session, redis):
    """The XLSX variant streams a real spreadsheet container."""
    headers = await _importer(db_session, redis)

    resp = await client.get(
        f"{BASE}/stations/export?station_type=shelter&format=xlsx", headers=headers
    )

    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    assert resp.content[:2] == b"PK"  # a zip container, which .xlsx is


@pytest.mark.asyncio
async def test_an_unsupported_export_format_is_a_400_not_a_500(client, db_session, redis):
    """Asking for a format we do not ship is a user mistake, not a server fault."""
    headers = await _importer(db_session, redis)

    resp = await client.get(
        f"{BASE}/stations/export?station_type=shelter&format=json", headers=headers
    )

    assert resp.status_code == 400
    assert "csv" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_export_without_the_capability_is_403(client, db_session, redis):
    """The endpoint refuses before producing a single row."""
    headers = await _user_with(db_session, redis, "NoOne")

    resp = await client.get(f"{BASE}/stations/export?station_type=shelter", headers=headers)

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_ticket_export_is_wired_up_too(client, db_session, redis):
    """Both entity types are reachable, with their own filename."""
    db_session.add(TaskPropertyConfig(
        task_type="rescue", property_name="people_count", data_type="Integer", enum_options=None,
    ))  # ADR-214: the type has to be one the project knows about
    headers = await _user_with(db_session, redis, "TicketExporter", Perm.TICKET_EXPORT)

    resp = await client.get(f"{BASE}/tickets/export?task_type=rescue", headers=headers)

    assert resp.status_code == 200
    assert 'filename="tickets-rescue.csv"' in resp.headers["content-disposition"]


# --- the type in the file name (ADR-214) ---


@pytest.mark.asyncio
async def test_an_unknown_station_type_is_a_400(client, db_session, redis):
    """The type is interpolated into a response header, so it is checked before it gets there."""
    headers = await _importer(db_session, redis)

    resp = await client.get(
        f'{BASE}/stations/export?station_type=x"; filename="evil.html', headers=headers
    )

    assert resp.status_code == 400
    assert "filename" not in resp.headers.get("content-disposition", "")


@pytest.mark.asyncio
async def test_a_cjk_type_downloads_instead_of_500ing(client, db_session, redis):
    """Starlette encodes headers as latin-1; a raw CJK name there is a 500, not a download."""
    db_session.add(StationPropertyConfig(
        station_type="避難所", property_name="capacity_total",
        data_type="Integer", enum_options=None,
    ))
    headers = await _importer(db_session, redis)

    resp = await client.get(
        f"{BASE}/stations/export?station_type=避難所", headers=headers
    )

    assert resp.status_code == 200
    disposition = resp.headers["content-disposition"]
    assert "filename*=UTF-8''stations-%E9%81%BF%E9%9B%A3%E6%89%80.csv" in disposition
    assert disposition.count("filename=") == 1  # exactly one plain filename, no second value


# --- preview ---


@pytest.mark.asyncio
async def test_preview_returns_the_report_and_writes_nothing(client, db_session, redis):
    """The dry run answers with counts and a suggested mapping."""
    headers = await _importer(db_session, redis)

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=headers, files=_upload([_row("光復國小")]),
    )

    body = resp.json()
    assert resp.status_code == 200
    assert (body["row_count"], body["to_create"], body["to_update"]) == (1, 1, 0)
    assert body["suggested_mapping"]["name"] == "name"


@pytest.mark.asyncio
async def test_an_unreadable_file_is_a_400_not_a_500(client, db_session, redis):
    """A wrong extension is a user mistake, so it must not read as a server fault."""
    headers = await _importer(db_session, redis)

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=headers, files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
    )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_a_file_over_the_row_cap_is_a_400(client, db_session, redis):
    """The cap is enforced at the edge and says what it is (ADR-116)."""
    headers = await _importer(db_session, redis)

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=headers, files=_upload([_row(f"站 {n}") for n in range(MAX_ROWS + 1)]),
    )

    assert resp.status_code == 400
    assert str(MAX_ROWS) in resp.json()["detail"]


@pytest.mark.asyncio
async def test_preview_without_the_import_capability_is_403(client, db_session, redis):
    """Otherwise preview is a way to probe the database (ADR-110)."""
    headers = await _user_with(db_session, redis, "Probe")

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=headers, files=_upload([_row("光復國小")]),
    )

    assert resp.status_code == 403


# --- commit ---


@pytest.mark.asyncio
async def test_commit_writes_and_reports(client, db_session, redis):
    """A clean file lands and reports its batch id."""
    headers = await _importer(db_session, redis)

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=headers, files=_upload([_row("光復國小")]),
    )

    body = resp.json()
    assert resp.status_code == 200
    assert (body["created"], body["updated"], body["failed"]) == (1, 0, 0)
    assert body["batch_id"]
    assert body["error_report"] is None


@pytest.mark.asyncio
async def test_the_error_report_comes_back_inline_and_decodes(client, db_session, redis):
    """Stateless endpoints cannot hand out a download URL for it (ADR-114)."""
    headers = await _importer(db_session, redis)
    bad = {**_row("沒座標站"), "latitude": "", "longitude": ""}

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=headers, files=_upload([bad]),
    )

    report = resp.json()["error_report"]
    assert report["filename"] == "stations-errors.csv"
    assert "latitude" in base64.b64decode(report["content_base64"]).decode("utf-8-sig")


@pytest.mark.asyncio
async def test_a_confirmed_mapping_renames_the_file_s_headers(client, db_session, redis):
    """The second call carries the mapping the user approved in preview (ADR-114)."""
    headers = await _importer(db_session, redis)
    raw = write_csv(("站名", "type", "latitude", "longitude", "county", "city"), [
        {"站名": "光復國小", "type": "shelter", "latitude": "25.0",
         "longitude": "121.5", "county": "花蓮縣", "city": "光復鄉"},
    ])

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=headers,
        files={"file": ("stations.csv", io.BytesIO(raw), "text/csv")},
        data={"mapping": json.dumps({"站名": "name"})},
    )

    assert resp.json()["created"] == 1


@pytest.mark.asyncio
async def test_a_malformed_mapping_is_a_400(client, db_session, redis):
    """Bad JSON in the form field is the caller's mistake."""
    headers = await _importer(db_session, redis)

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=headers, files=_upload([_row("光復國小")]),
        data={"mapping": "not json"},
    )

    assert resp.status_code == 400
    assert "JSON" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_a_mapping_that_is_not_an_object_is_a_400(client, db_session, redis):
    """The mapping has to be an object of header pairs."""
    headers = await _importer(db_session, redis)

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=headers, files=_upload([_row("光復國小")]),
        data={"mapping": json.dumps(["name"])},
    )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ticket_preview_and_commit_are_wired_up(client, db_session, redis):
    """Both ticket endpoints work end to end over HTTP."""
    auth = await _user_with(
        db_session, redis, "TicketImporter",
        Perm.TICKET_IMPORT, Perm.TICKET_ADD, Perm.TICKET_EDIT,
    )
    columns = ("title", "contact_name", "contact_phone", "latitude", "longitude",
               "task_type", "task_name")
    raw = write_csv(columns, [{
        "title": "需要飲用水", "contact_name": "王小明", "contact_phone": "0912345678",
        "latitude": "25.0", "longitude": "121.5", "task_type": "rescue", "task_name": "送水",
    }])
    files = {"file": ("tickets.csv", io.BytesIO(raw), "text/csv")}

    preview = await client.post(
        f"{BASE}/tickets/import/preview?task_type=rescue", headers=auth, files=files
    )
    files = {"file": ("tickets.csv", io.BytesIO(raw), "text/csv")}
    commit = await client.post(
        f"{BASE}/tickets/import/commit?task_type=rescue", headers=auth, files=files
    )

    assert preview.json()["to_create"] == 1
    assert commit.json()["created"] == 1
