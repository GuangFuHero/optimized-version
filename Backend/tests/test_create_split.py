"""`create_ticket` / `create_station` split into validate → insert → commit (Spec 020, ADR-299).

The two-phase create needs to validate before running dedup and to insert without committing,
so the ticket, its pair card and its audit row land in one transaction. Batch import keeps
calling `create_*` unchanged, so these also pin that `create_*` still behaves — and is called —
exactly as before.
"""

import inspect
import os

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.notification_service import NotificationService
from tests.conftest import acting_as, seed_disaster_types

pytestmark = pytest.mark.asyncio

POINT = {"type": "Point", "coordinates": [121.5601, 23.6701]}
ADDRESS = {"location_type": "address", "county": "花蓮縣", "city": "光復鄉"}

# The parameter lists batch import (and the GraphQL resolvers) call with, before the split.
CREATE_TICKET_PARAMS = [
    "db", "actor", "geometry", "title", "description", "contact_name", "contact_email",
    "contact_phone", "priority", "task_type", "visibility", "disaster_types",
    "person_trapped_reported", "immediate_danger_reported", "secondary_location",
]  # fmt: skip
CREATE_STATION_PARAMS = [
    "db", "actor", "geometry", "type", "name", "description", "op_hour", "level", "comment",
    "source", "visibility", "contact_name", "contact_email", "contact_phone",
    "operational_status", "secondary_location",
]  # fmt: skip


async def _actor(db, *perms: Perm) -> User:
    """A user acting as one platform role holding `perms` at scope `all`."""
    user = User(name=f"split-{'-'.join(p.value for p in perms) or 'none'}")
    db.add(user)
    role = Role(name=f"role-{user.name}", kind="platform")
    db.add(role)
    await db.flush()
    for perm in perms:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, role_kind="platform"))
    acting_as(user, role)  # before the commit expires `role`
    seed_disaster_types(db)
    await db.commit()
    await db.refresh(user)
    return user


def _ticket_fields(**overrides) -> dict:
    fields = {
        "geometry": POINT,
        "title": "民生街三段淹水需要抽水機",
        "description": "一樓積水",
        "contact_name": "  王小明  ",
        "contact_email": None,
        "contact_phone": " 0912345678 ",
        "priority": "high",
        "task_type": "rescue",
        "visibility": "public",
        "disaster_types": ["flood"],
        "secondary_location": ADDRESS,
    }
    return fields | overrides


def _station_fields(**overrides) -> dict:
    fields = {
        "geometry": POINT,
        "type": "shelter",
        "name": "光復國小臨時收容所",
        "description": "可收容 200 人",
        "op_hour": "24h",
        "level": 1,
        "comment": None,
        "source": "manual",
        "visibility": "public",
        "contact_name": "  李主任  ",
        "contact_phone": "0912345678",
        "secondary_location": ADDRESS,
    }
    return fields | overrides


async def _rows(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


# --- tickets ---------------------------------------------------------------------------


async def test_validate_ticket_writes_nothing(db):
    """A validated ticket is a value, not a row."""
    actor = await _actor(db, Perm.TICKET_ADD)
    fields = await ticket_service.validate_ticket(db, actor=actor, **_ticket_fields())
    assert fields.values["contact_name"] == "王小明"  # normalized, ready to insert
    assert fields.values["disaster_types"] == ["flood"]
    assert fields.point == POINT
    assert fields.secondary_location == ADDRESS
    assert await _rows(db, Tickets) == 0
    assert await _rows(db, SecondaryLocation) == 0


@pytest.mark.parametrize(
    ("perms", "overrides", "error"),
    [
        ((), {}, HTTPException),  # no ticket.add
        ((Perm.TICKET_ADD,), {"geometry": {"type": "Polygon", "coordinates": []}}, ValueError),
        ((Perm.TICKET_ADD,), {"disaster_types": ["meteor"]}, ValueError),
        ((Perm.TICKET_ADD,), {"contact_phone": "9" * 51}, ValueError),
        ((Perm.TICKET_ADD,), {"contact_name": "   "}, ValueError),
    ],
    ids=["no-permission", "not-a-point", "unknown-disaster", "phone-too-long", "blank-name"],
)
async def test_validate_ticket_rejects_before_any_write(db, perms, overrides, error):
    """Every validation failure happens before anything is written."""
    actor = await _actor(db, *perms)
    with pytest.raises(error):
        await ticket_service.validate_ticket(db, actor=actor, **_ticket_fields(**overrides))
    await db.rollback()
    assert await _rows(db, Tickets) == 0


async def test_insert_ticket_leaves_the_commit_to_the_caller(db):
    """insert_ticket flushes (the uuid exists) but a rollback leaves no ticket and no address."""
    actor = await _actor(db, Perm.TICKET_ADD)
    fields = await ticket_service.validate_ticket(db, actor=actor, **_ticket_fields())
    ticket = await ticket_service.insert_ticket(db, actor=actor, fields=fields)
    assert ticket.uuid is not None
    await db.rollback()
    assert await _rows(db, Tickets) == 0
    assert await _rows(db, SecondaryLocation) == 0


async def test_create_ticket_behaves_as_before(db):
    """Same row as before the split: normalized contacts, pending, address written, committed."""
    actor = await _actor(db, Perm.TICKET_ADD)
    actor_uuid = str(actor.uuid)
    ticket = await ticket_service.create_ticket(db, actor=actor, **_ticket_fields())
    ticket_uuid = ticket.uuid  # a rollback expires every loaded object
    await db.rollback()  # proves it was committed, not merely flushed
    stored = (await db.execute(select(Tickets).where(Tickets.uuid == ticket_uuid))).scalar_one()
    assert (stored.contact_name, stored.contact_phone) == ("王小明", "0912345678")
    assert (stored.status, stored.property_name, str(stored.created_by)) == ("pending", "request", actor_uuid)
    assert stored.disaster_types == ["flood"]
    address = (await db.execute(select(SecondaryLocation))).scalar_one()
    assert (str(address.geometry_uuid), address.county) == (str(stored.uuid), "花蓮縣")


async def test_create_ticket_keeps_its_signature():
    """Batch import calls create_ticket by these keyword names (ADR-299)."""
    assert list(inspect.signature(ticket_service.create_ticket).parameters) == CREATE_TICKET_PARAMS


# --- stations --------------------------------------------------------------------------


async def test_validate_station_writes_nothing(db):
    """A validated station is a value, not a row."""
    actor = await _actor(db, Perm.STATION_ADD)
    fields = await station_service.validate_station(db, actor=actor, **_station_fields())
    assert fields.values["contact_name"] == "李主任"
    assert fields.values["name"] == "光復國小臨時收容所"
    assert fields.point == POINT
    assert await _rows(db, Station) == 0


@pytest.mark.parametrize(
    ("perms", "overrides", "error"),
    [
        ((), {}, HTTPException),
        ((Perm.STATION_ADD,), {"geometry": {"type": "Point", "coordinates": [500, 500]}}, ValueError),
        ((Perm.STATION_ADD,), {"contact_email": "x" * 101}, ValueError),
    ],
    ids=["no-permission", "bad-coordinates", "email-too-long"],
)
async def test_validate_station_rejects_before_any_write(db, perms, overrides, error):
    """Every validation failure happens before anything is written."""
    actor = await _actor(db, *perms)
    with pytest.raises(error):
        await station_service.validate_station(db, actor=actor, **_station_fields(**overrides))
    await db.rollback()
    assert await _rows(db, Station) == 0


async def test_insert_station_leaves_the_commit_to_the_caller(db):
    """insert_station flushes but a rollback leaves no station and no address."""
    actor = await _actor(db, Perm.STATION_ADD)
    fields = await station_service.validate_station(db, actor=actor, **_station_fields())
    station = await station_service.insert_station(db, actor=actor, fields=fields)
    assert station.uuid is not None
    await db.rollback()
    assert await _rows(db, Station) == 0
    assert await _rows(db, SecondaryLocation) == 0


async def test_create_station_behaves_as_before_and_still_notifies(db, monkeypatch):
    """Same row as before, committed, and the resource_station_updated notice still goes out."""
    sent = []

    async def record(db_, **kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(NotificationService, "dispatch", record)
    actor = await _actor(db, Perm.STATION_ADD)
    station = await station_service.create_station(db, actor=actor, **_station_fields())
    station_uuid = station.uuid  # a rollback expires every loaded object
    await db.rollback()  # proves it was committed, not merely flushed
    stored = (await db.execute(select(Station).where(Station.uuid == station_uuid))).scalar_one()
    assert (stored.contact_name, stored.operational_status) == ("李主任", "active")
    assert stored.status_changed_at is not None
    assert await _rows(db, SecondaryLocation) == 1
    assert [n["event_type"] for n in sent] == ["resource_station_updated"]
    assert sent[0]["ref_uuid"] == stored.uuid


async def test_create_station_keeps_its_signature():
    """Batch import calls create_station by these keyword names (ADR-299)."""
    assert list(inspect.signature(station_service.create_station).parameters) == CREATE_STATION_PARAMS
