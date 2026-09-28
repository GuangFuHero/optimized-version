"""A citizen asks for help from the public site: one ticket and its needs, filed at once.

Service-level (root conftest): the rules live in `create_help_request`, so that is where they
are observed (spec note/help-request-spec.md, D1). The prototype's form requires at least one
need (正典 TM-FEAT-004 AC-01), and a half-filed request — a ticket with some of its needs
missing — is the failure this function exists to rule out.
"""

import os
import uuid as uuidlib

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TicketTask
from app.services.ticket import create_help_request
from tests.conftest import acting_as

POINT = {"type": "Point", "coordinates": [121.4235, 23.6725]}


async def _citizen(db) -> User:
    """A signed-in citizen: the platform `user` role's `ticket.add: all` (seed_rbac.py)."""
    user = User(name="王阿嬤的鄰居")
    role = Role(name=f"user-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    permission = Permission(key=Perm.TICKET_ADD.value)
    db.add(permission)
    await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


def _request(**overrides) -> dict:
    """A valid request with one need; each test changes only what it is about."""
    return {
        "geometry": POINT,
        "title": "一樓客廳積泥需要幫忙清",
        "description": None,
        "contact_name": "王阿嬤",
        "contact_phone": None,
        "secondary_location": None,
        "tasks": [{"task_type": "hr", "task_name": "清淤人力", "task_description": None, "quantity": 3}],
        **overrides,
    }


async def _tickets_filed(db) -> int:
    return await db.scalar(select(func.count()).select_from(Tickets))


async def _needs_of(db, ticket_uuid) -> list[tuple]:
    rows = await db.execute(
        select(TicketTask.task_name, TicketTask.task_type, TicketTask.quantity, TicketTask.source)
        .where(TicketTask.ticket_uuid == str(ticket_uuid))
        .order_by(TicketTask.task_name)
    )
    return [tuple(row) for row in rows.all()]


async def _address_of(db, ticket_uuid) -> SecondaryLocation:
    return (
        await db.execute(select(SecondaryLocation).where(SecondaryLocation.geometry_uuid == str(ticket_uuid)))
    ).scalar_one()


@pytest.mark.asyncio
async def test_a_citizen_files_a_help_request_with_its_needs(db):
    """The ticket, its address and every need are stored, filed by the citizen."""
    citizen = await _citizen(db)
    citizen_uuid = str(citizen.uuid)

    ticket = await create_help_request(
        db,
        actor=citizen,
        geometry=POINT,
        title="一樓客廳積泥需要幫忙清",
        description="巷子窄，小貨車進不來。",
        contact_name="王阿嬤",
        contact_phone="0912345678",
        secondary_location={
            "location_type": "address",
            "landmark_note": "花蓮縣光復鄉中山路100號",
            "floor": "1",
            "room": "2",
        },
        tasks=[
            {"task_type": "hr", "task_name": "清淤人力", "task_description": None, "quantity": 3},
            {"task_type": "supply", "task_name": "送餐／物資", "task_description": None, "quantity": None},
        ],
    )

    # The ticket's own task_type is the first need's, as the admin form sets it
    # (ticket-create-drawer.tsx) — duplicate analytics skips tickets that have none.
    assert (
        ticket.title,
        ticket.description,
        ticket.contact_name,
        ticket.contact_phone,
        ticket.status,
        ticket.priority,
        ticket.visibility,
        ticket.task_type,
        str(ticket.created_by),
    ) == (
        "一樓客廳積泥需要幫忙清",
        "巷子窄，小貨車進不來。",
        "王阿嬤",
        "0912345678",
        "pending",
        "medium",
        "public",
        "hr",
        citizen_uuid,
    )
    address = await _address_of(db, ticket.uuid)
    assert (address.landmark_note, address.floor, address.room) == ("花蓮縣光復鄉中山路100號", "1", "2")
    assert await _needs_of(db, ticket.uuid) == [
        ("清淤人力", "hr", 3, "user"),
        ("送餐／物資", "supply", None, "user"),
    ]


@pytest.mark.asyncio
async def test_a_request_without_any_need_is_refused_and_nothing_is_filed(db):
    """At least one need (TM-FEAT-004 AC-01): a ticket nobody can claim anything on is noise."""
    citizen = await _citizen(db)

    with pytest.raises(ValueError, match="^At least one task is required$"):
        await create_help_request(db, actor=citizen, **_request(tasks=[]))

    assert await _tickets_filed(db) == 0


GOOD_NEED = {"task_type": "hr", "task_name": "清淤人力", "task_description": None, "quantity": 3}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("bad_need", "message"),
    [
        ({"task_type": "cooking", "task_name": "煮飯", "quantity": 2}, "^Unknown task type: cooking$"),
        ({"task_type": "hr", "task_name": "   ", "quantity": 2}, "^task_name is required$"),
        (
            {"task_type": "hr", "task_name": "搬運" * 101, "quantity": 2},
            "^task_name must be at most 200 characters$",
        ),
        ({"task_type": "hr", "task_name": "搬運", "quantity": 0}, "^quantity must be at least 1$"),
    ],
    ids=["unknown-type", "blank-name", "long-name", "zero-quantity"],
)
async def test_one_bad_need_refuses_the_whole_request(db, bad_need, message):
    """The good first need is not filed either: all of the request, or none of it."""
    citizen = await _citizen(db)

    with pytest.raises(ValueError, match=message):
        await create_help_request(
            db,
            actor=citizen,
            **_request(tasks=[GOOD_NEED, {"task_description": None, **bad_need}]),
        )

    assert await _tickets_filed(db) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("title", "message"),
    [("   ", "^title is required$"), ("清" * 201, "^title must be at most 200 characters$")],
    ids=["blank", "too-long"],
)
async def test_a_request_needs_a_title_that_fits(db, title, message):
    """Named here rather than left to the column, which the client sees as "Unexpected error."."""
    citizen = await _citizen(db)

    with pytest.raises(ValueError, match=message):
        await create_help_request(db, actor=citizen, **_request(title=title))

    assert await _tickets_filed(db) == 0


@pytest.mark.asyncio
async def test_someone_who_may_not_file_tickets_is_refused(db):
    """ticket.add, as for createTicket; nothing is filed."""
    user = User(name="沒有建單權限")
    role = Role(name=f"none-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()

    with pytest.raises(HTTPException) as refused:
        await create_help_request(db, actor=acting_as(user, role), **_request())

    assert refused.value.status_code == 403
    assert await _tickets_filed(db) == 0
