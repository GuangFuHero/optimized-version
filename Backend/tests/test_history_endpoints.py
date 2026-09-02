"""HTTP surface of the timeline endpoints (feature 016, ADR-138/139).

The service is covered directly in test_history_service.py; what only shows up here is the
transport — the envelope, paging bounds, and which failures become a 403 rather than a 404.
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets

BASE = "/api/v1/history"


def _auth(user_uuid: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user_uuid)})}"}


async def _user_with(db, name: str, *perms, scope: str = "all") -> str:
    """Create a user holding `perms` at `scope`, and return its uuid as a string.

    A string rather than the object on purpose: the session commits with
    expire_on_commit=True (same as production), so touching `.uuid` afterwards would try to
    lazily reload the row and raise MissingGreenlet. Returning the value sidesteps that
    without a fixture that hides the behaviour.
    """
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
        db.add(RolePermissionAssign(
            role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
        ))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return str(user.uuid)


async def _ticket(db, owner_uuid: str, title="需要飲用水") -> str:
    """Create a ticket owned by `owner_uuid` and return its uuid as a string."""
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=owner_uuid,
        title=title, contact_name="王小姐", status="pending", priority="high",
    )
    db.add(ticket)
    await db.flush()
    return str(ticket.uuid)


def _audit(row_id, *, table="tickets", action="UPDATE", old=None, new=None, minute=0):
    return AuditLog(
        uuid=uuidlib.uuid4(), table_name=table, action=action, row_id=row_id,
        old_values=old, new_values=new,
        created_at=datetime(2026, 8, 21, 9, minute, tzinfo=UTC),
    )


# --- the happy path ---


@pytest.mark.asyncio
async def test_a_ticket_timeline_comes_back_in_the_standard_envelope(client, db_session):
    """Success / data / meta — the same shape as every other endpoint."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    db_session.add(_audit(ticket, old={"status": "pending"},
                          new={"status": "in_progress"}))
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(owner))

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["meta"] == {"total": 1, "truncated": False, "limit": 50, "offset": 0}
    assert body["data"][0]["event_type"] == "UPDATED"
    assert body["data"][0]["changes"][0]["field"] == "status"


@pytest.mark.asyncio
async def test_a_station_timeline_uses_its_own_capability(client, db_session):
    """station.view_history, not ticket.view_history — holding one is not holding the other."""
    owner = await _user_with(db_session, "Keeper", Perm.STATION_VIEW_HISTORY)
    station = Station(
        uuid=uuidlib.uuid4(), property_name="station", created_by=owner,
        name="光復國小避難所", type="shelter",
    )
    db_session.add(station)
    await db_session.flush()
    station_uuid = str(station.uuid)
    db_session.add(_audit(station_uuid, table="stations",
                          old={"op_hour": "0800-1700"}, new={"op_hour": "24h"}))
    await db_session.commit()

    resp = await client.get(f"{BASE}/stations/{station_uuid}", headers=_auth(owner))

    assert resp.status_code == 200
    assert resp.json()["data"][0]["changes"][0]["after"] == "24h"


@pytest.mark.asyncio
async def test_an_empty_timeline_is_not_an_error(client, db_session):
    """A resource created before the triggers existed simply has no history."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(owner))

    assert resp.status_code == 200
    assert resp.json()["data"] == []
    assert resp.json()["meta"]["total"] == 0


# --- authorization (ADR-023/127) ---


@pytest.mark.asyncio
async def test_without_the_capability_it_is_a_403(client, db_session):
    """Checkpoint 1: no grant at all."""
    nobody = await _user_with(db_session, "Nobody", Perm.TICKET_VIEW)
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(nobody))

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_someone_elses_ticket_is_a_403_under_own_scope(client, db_session):
    """ADR-023: an ownership mismatch is a 403 — it leaks no boundary information."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    stranger = await _user_with(
        db_session, "Stranger", Perm.TICKET_VIEW_HISTORY, scope="own"
    )
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(stranger))

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_out_of_zone_is_a_404_not_a_403(client, db_session):
    """A team-boundary mismatch is a 404, not a 403.

    ADR-023: a 403 would confirm the resource exists on the other side of that boundary.
    """
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    outsider = await _user_with(
        db_session, "Outsider", Perm.TICKET_VIEW_HISTORY, scope="zone"
    )
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(outsider))

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_an_unknown_uuid_is_a_404(client, db_session):
    """A resource that never existed, as opposed to one hidden by scope."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{uuidlib.uuid4()}", headers=_auth(owner))

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_a_ticket_uuid_is_not_a_station(client, db_session):
    """Both live in base_geometries; asking for the wrong kind must not resolve."""
    owner = await _user_with(
        db_session, "Owner", Perm.TICKET_VIEW_HISTORY, Perm.STATION_VIEW_HISTORY
    )
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(f"{BASE}/stations/{ticket}", headers=_auth(owner))

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_anonymous_callers_are_rejected(client, db_session):
    """Guest holds neither capability (ADR-127)."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}")

    assert resp.status_code in (401, 403)


# --- paging (ADR-139) ---


@pytest.mark.asyncio
async def test_paging_slices_events_and_reports_the_full_total(client, db_session):
    """`total` counts merged events, not audit rows, so paging can be described honestly."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    for minute in range(5):
        db_session.add(_audit(ticket, old={"status": f"s{minute}"},
                              new={"status": f"s{minute + 1}"}, minute=minute))
    await db_session.commit()

    first = await client.get(
        f"{BASE}/tickets/{ticket}?limit=2&offset=0", headers=_auth(owner)
    )
    second = await client.get(
        f"{BASE}/tickets/{ticket}?limit=2&offset=2", headers=_auth(owner)
    )

    assert first.json()["meta"]["total"] == 5
    assert len(first.json()["data"]) == 2
    assert len(second.json()["data"]) == 2
    assert first.json()["data"][0]["at"] != second.json()["data"][0]["at"]


@pytest.mark.asyncio
async def test_an_offset_past_the_end_is_an_empty_page(client, db_session):
    """Running off the end is a valid request, not an error."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    db_session.add(_audit(ticket, new={"status": "a"}))
    await db_session.commit()

    resp = await client.get(
        f"{BASE}/tickets/{ticket}?offset=999", headers=_auth(owner)
    )

    assert resp.status_code == 200
    assert resp.json()["data"] == []
    assert resp.json()["meta"]["total"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["limit=0", "limit=201", "offset=-1"])
async def test_out_of_range_paging_is_rejected(client, db_session, query):
    """Bounds are enforced by the route signature, so a 422 rather than a silent clamp."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    await db_session.commit()

    resp = await client.get(
        f"{BASE}/tickets/{ticket}?{query}", headers=_auth(owner)
    )

    assert resp.status_code == 422


# --- tiers over HTTP ---


@pytest.mark.asyncio
async def test_contact_details_arrive_masked_without_view_pii(client, db_session):
    """The tier logic is unit-tested; this proves it is actually wired into the endpoint."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    db_session.add(_audit(ticket, old={"contact_phone": "0912345678"},
                          new={"contact_phone": "0987654321"}))
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(owner))

    change = resp.json()["data"][0]["changes"][0]
    assert change["after"] == "09*****321"


@pytest.mark.asyncio
async def test_the_raw_payload_is_absent_without_audit_view(client, db_session):
    """The escape hatch is invisible to callers who did not earn it."""
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW_HISTORY)
    ticket = await _ticket(db_session, owner)
    db_session.add(_audit(ticket, new={"status": "a"}))
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(owner))

    assert resp.json()["data"][0]["raw"] is None


@pytest.mark.asyncio
async def test_an_auditor_receives_the_raw_payload(client, db_session):
    """RAW reaches unclassified columns like search_text; `changes` still does not."""
    auditor = await _user_with(
        db_session, "Auditor", Perm.TICKET_VIEW_HISTORY, Perm.AUDIT_VIEW,
        Perm.TICKET_VIEW_PII,
    )
    owner = await _user_with(db_session, "Owner", Perm.TICKET_VIEW)
    ticket = await _ticket(db_session, owner)
    db_session.add(_audit(ticket, old={"status": "a", "search_text": "舊"},
                          new={"status": "b", "search_text": "新"}))
    await db_session.commit()

    resp = await client.get(f"{BASE}/tickets/{ticket}", headers=_auth(auditor))

    event = resp.json()["data"][0]
    assert event["raw"][0]["new_values"]["search_text"] == "新"
    assert [c["field"] for c in event["changes"]] == ["status"]
