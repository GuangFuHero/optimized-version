"""A citizen asks for help from the public site: one ticket and its needs, filed at once.

Service-level (root conftest): the rules live in `create_help_request`, so that is where they
are observed. The prototype's form requires at least one need (正典 TM-FEAT-004 AC-01), and a
half-filed request — a ticket with some of its needs missing — is the failure this function
exists to rule out.
"""

import os
import uuid as uuidlib

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.photo import Photo
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


async def _photos_of(db, ticket_uuid) -> list[Photo]:
    """In the order the ticket's photo loader reads them (`loaders.py`)."""
    rows = await db.execute(
        select(Photo).where(Photo.ref_uuid == ticket_uuid).order_by(Photo.created_at, Photo.uuid)
    )
    return list(rows.scalars().all())


async def _photos_stored(db) -> int:
    return await db.scalar(select(func.count()).select_from(Photo))


def _links(count: int) -> list[str]:
    return [f"https://duk.tw/scene{n}.jpg" for n in range(1, count + 1)]


@pytest.mark.asyncio
async def test_a_request_keeps_its_photo_links_in_the_order_given(db):
    """Links only, never files (TM-IMG-101): each is a photo of the ticket, filed by the citizen.

    Filed in one transaction the photos share one `now()`, and the loader breaks the tie on
    uuid — random, as it was for the needs. Five links, so passing by luck is 1 in 120.
    """
    citizen = await _citizen(db)
    citizen_uuid = str(citizen.uuid)
    links = _links(5)

    ticket = await create_help_request(db, actor=citizen, **_request(photo_urls=links))

    photos = await _photos_of(db, ticket.uuid)
    assert [p.url for p in photos] == links
    assert {(p.ref_type, str(p.created_by)) for p in photos} == {("geometry", citizen_uuid)}


@pytest.mark.asyncio
async def test_a_photo_link_is_stored_as_checked(db):
    """Stripped as `normalize_photo_url` returns it, and a repeated link kept (TM-IMG-125)."""
    citizen = await _citizen(db)

    ticket = await create_help_request(
        db,
        actor=citizen,
        **_request(photo_urls=["  https://duk.tw/a.jpg ", "https://duk.tw/a.jpg"]),
    )

    assert [p.url for p in await _photos_of(db, ticket.uuid)] == [
        "https://duk.tw/a.jpg",
        "https://duk.tw/a.jpg",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("photo_urls", [None, []], ids=["left-out", "empty"])
async def test_a_request_without_photos_is_filed_as_before(db, photo_urls):
    """Photos are optional (「現場照片（選填）」)."""
    citizen = await _citizen(db)

    await create_help_request(db, actor=citizen, **_request(photo_urls=photo_urls))

    assert await _tickets_filed(db) == 1
    assert await _photos_stored(db) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("bad_link", "message"),
    [
        ("http://duk.tw/a.jpg", "^Photo url must be an https:// URL with a host$"),
        ("   ", "^Photo url is required$"),
        ("https://duk.tw/" + "a" * 500, "^Photo url must be at most 500 characters$"),
    ],
    ids=["http", "blank", "too-long"],
)
async def test_one_bad_photo_link_refuses_the_whole_request(db, bad_link, message):
    """Checked before anything is written: no ticket, no needs, not the good link before it."""
    citizen = await _citizen(db)

    with pytest.raises(ValueError, match=message):
        await create_help_request(
            db, actor=citizen, **_request(photo_urls=["https://duk.tw/good.jpg", bad_link])
        )

    assert await _tickets_filed(db) == 0
    assert await _photos_stored(db) == 0


@pytest.mark.asyncio
async def test_more_than_ten_photo_links_are_refused(db):
    """Ten at most, the site's own limit (the prototype's TK_PHOTO_MAX)."""
    citizen = await _citizen(db)

    with pytest.raises(ValueError, match="^At most 10 photos are allowed$"):
        await create_help_request(db, actor=citizen, **_request(photo_urls=_links(11)))

    assert await _tickets_filed(db) == 0


@pytest.mark.asyncio
async def test_ten_photo_links_are_allowed(db):
    """The limit itself still files."""
    citizen = await _citizen(db)

    ticket = await create_help_request(db, actor=citizen, **_request(photo_urls=_links(10)))

    assert len(await _photos_of(db, ticket.uuid)) == 10
