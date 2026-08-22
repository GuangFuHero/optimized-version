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
from app.core.security import create_access_token
from app.core.tabular import write_csv
from app.models.auth import User
from app.models.property_config import StationPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.services.bulk_import import MAX_ROWS

BASE = "/api/v1/bulk"
HEADERS = ("name", "type", "latitude", "longitude", "county", "city")


def _auth(user_uuid: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user_uuid)})}"}


def _row(name: str) -> dict:
    return {
        "name": name, "type": "shelter", "latitude": "25.0", "longitude": "121.5",
        "county": "花蓮縣", "city": "光復鄉",
    }


def _upload(rows, filename="stations.csv") -> dict:
    return {"file": (filename, io.BytesIO(write_csv(HEADERS, rows)), "text/csv")}


async def _user_with(db, name: str, *perms) -> str:
    """Create a user holding `perms` at `all` scope and return its uuid."""
    user = User(name=name)
    db.add(user)
    await db.flush()
    for perm in perms:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        role = Role(name=f"{name}-{perm.value}", kind="platform")
        db.add(role)
        await db.flush()
        db.add(
            RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all")
        )
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    uuid = str(user.uuid)
    await db.commit()
    return uuid


async def _importer(db_session) -> str:
    db_session.add(StationPropertyConfig(
        station_type="shelter", property_name="capacity_total",
        data_type="Integer", enum_options=None,
    ))
    return await _user_with(
        db_session, "HttpImporter",
        Perm.STATION_EXPORT, Perm.STATION_IMPORT, Perm.STATION_ADD,
        Perm.STATION_EDIT, Perm.STATION_CONTRIBUTE,
    )


# --- export ---


@pytest.mark.asyncio
async def test_export_streams_a_named_csv_attachment(client, db_session):
    """The browser must offer a file, not render it."""
    uuid = await _importer(db_session)

    resp = await client.get(f"{BASE}/stations/export?station_type=shelter", headers=_auth(uuid))

    assert resp.status_code == 200
    assert resp.headers["content-disposition"] == 'attachment; filename="stations-shelter.csv"'
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.content.startswith(b"\xef\xbb\xbf")


@pytest.mark.asyncio
async def test_export_can_stream_xlsx(client, db_session):
    """The XLSX variant streams a real spreadsheet container."""
    uuid = await _importer(db_session)

    resp = await client.get(
        f"{BASE}/stations/export?station_type=shelter&format=xlsx", headers=_auth(uuid)
    )

    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    assert resp.content[:2] == b"PK"  # a zip container, which .xlsx is


@pytest.mark.asyncio
async def test_an_unsupported_export_format_is_a_400_not_a_500(client, db_session):
    """Asking for a format we do not ship is a user mistake, not a server fault."""
    uuid = await _importer(db_session)

    resp = await client.get(
        f"{BASE}/stations/export?station_type=shelter&format=json", headers=_auth(uuid)
    )

    assert resp.status_code == 400
    assert "csv" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_export_without_the_capability_is_403(client, db_session):
    """The endpoint refuses before producing a single row."""
    uuid = await _user_with(db_session, "NoOne")

    resp = await client.get(f"{BASE}/stations/export?station_type=shelter", headers=_auth(uuid))

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_ticket_export_is_wired_up_too(client, db_session):
    """Both entity types are reachable, with their own filename."""
    uuid = await _user_with(db_session, "TicketExporter", Perm.TICKET_EXPORT)

    resp = await client.get(f"{BASE}/tickets/export?task_type=rescue", headers=_auth(uuid))

    assert resp.status_code == 200
    assert resp.headers["content-disposition"].endswith('tickets-rescue.csv"')


# --- preview ---


@pytest.mark.asyncio
async def test_preview_returns_the_report_and_writes_nothing(client, db_session):
    """The dry run answers with counts and a suggested mapping."""
    uuid = await _importer(db_session)

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=_auth(uuid), files=_upload([_row("光復國小")]),
    )

    body = resp.json()
    assert resp.status_code == 200
    assert (body["row_count"], body["to_create"], body["to_update"]) == (1, 1, 0)
    assert body["suggested_mapping"]["name"] == "name"


@pytest.mark.asyncio
async def test_an_unreadable_file_is_a_400_not_a_500(client, db_session):
    """A wrong extension is a user mistake, so it must not read as a server fault."""
    uuid = await _importer(db_session)

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=_auth(uuid), files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
    )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_a_file_over_the_row_cap_is_a_400(client, db_session):
    """The cap is enforced at the edge and says what it is (ADR-116)."""
    uuid = await _importer(db_session)

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=_auth(uuid), files=_upload([_row(f"站 {n}") for n in range(MAX_ROWS + 1)]),
    )

    assert resp.status_code == 400
    assert str(MAX_ROWS) in resp.json()["detail"]


@pytest.mark.asyncio
async def test_preview_without_the_import_capability_is_403(client, db_session):
    """Otherwise preview is a way to probe the database (ADR-110)."""
    uuid = await _user_with(db_session, "Probe")

    resp = await client.post(
        f"{BASE}/stations/import/preview?station_type=shelter",
        headers=_auth(uuid), files=_upload([_row("光復國小")]),
    )

    assert resp.status_code == 403


# --- commit ---


@pytest.mark.asyncio
async def test_commit_writes_and_reports(client, db_session):
    """A clean file lands and reports its batch id."""
    uuid = await _importer(db_session)

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=_auth(uuid), files=_upload([_row("光復國小")]),
    )

    body = resp.json()
    assert resp.status_code == 200
    assert (body["created"], body["updated"], body["failed"]) == (1, 0, 0)
    assert body["batch_id"]
    assert body["error_report"] is None


@pytest.mark.asyncio
async def test_the_error_report_comes_back_inline_and_decodes(client, db_session):
    """Stateless endpoints cannot hand out a download URL for it (ADR-114)."""
    uuid = await _importer(db_session)
    bad = {**_row("沒座標站"), "latitude": "", "longitude": ""}

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=_auth(uuid), files=_upload([bad]),
    )

    report = resp.json()["error_report"]
    assert report["filename"] == "stations-errors.csv"
    assert "latitude" in base64.b64decode(report["content_base64"]).decode("utf-8-sig")


@pytest.mark.asyncio
async def test_a_confirmed_mapping_renames_the_file_s_headers(client, db_session):
    """The second call carries the mapping the user approved in preview (ADR-114)."""
    uuid = await _importer(db_session)
    raw = write_csv(("站名", "type", "latitude", "longitude", "county", "city"), [
        {"站名": "光復國小", "type": "shelter", "latitude": "25.0",
         "longitude": "121.5", "county": "花蓮縣", "city": "光復鄉"},
    ])

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=_auth(uuid),
        files={"file": ("stations.csv", io.BytesIO(raw), "text/csv")},
        data={"mapping": json.dumps({"站名": "name"})},
    )

    assert resp.json()["created"] == 1


@pytest.mark.asyncio
async def test_a_malformed_mapping_is_a_400(client, db_session):
    """Bad JSON in the form field is the caller's mistake."""
    uuid = await _importer(db_session)

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=_auth(uuid), files=_upload([_row("光復國小")]),
        data={"mapping": "not json"},
    )

    assert resp.status_code == 400
    assert "JSON" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_a_mapping_that_is_not_an_object_is_a_400(client, db_session):
    """The mapping has to be an object of header pairs."""
    uuid = await _importer(db_session)

    resp = await client.post(
        f"{BASE}/stations/import/commit?station_type=shelter",
        headers=_auth(uuid), files=_upload([_row("光復國小")]),
        data={"mapping": json.dumps(["name"])},
    )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ticket_preview_and_commit_are_wired_up(client, db_session):
    """Both ticket endpoints work end to end over HTTP."""
    uuid = await _user_with(
        db_session, "TicketImporter",
        Perm.TICKET_IMPORT, Perm.TICKET_ADD, Perm.TICKET_EDIT,
    )
    headers = ("title", "contact_name", "contact_phone", "latitude", "longitude",
               "task_type", "task_name")
    raw = write_csv(headers, [{
        "title": "需要飲用水", "contact_name": "王小明", "contact_phone": "0912345678",
        "latitude": "25.0", "longitude": "121.5", "task_type": "rescue", "task_name": "送水",
    }])
    files = {"file": ("tickets.csv", io.BytesIO(raw), "text/csv")}

    preview = await client.post(
        f"{BASE}/tickets/import/preview?task_type=rescue", headers=_auth(uuid), files=files
    )
    files = {"file": ("tickets.csv", io.BytesIO(raw), "text/csv")}
    commit = await client.post(
        f"{BASE}/tickets/import/commit?task_type=rescue", headers=_auth(uuid), files=files
    )

    assert preview.json()["to_create"] == 1
    assert commit.json()["created"] == 1
