"""「我的任務 › 我建立的」: the tickets the caller filed (spec Q16/Q17, note/help-request-spec.md).

Service-level (root conftest). Sign-in is all it takes — every row is the caller's own ticket.
Newest first and unpaged: one person files few. Every status is listed, since following a ticket
to completion is what the list is for; a deleted ticket is gone (team decision 2026-09-28).
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime, timedelta

os.environ["ENV"] = "testing"

import pytest

from app.models.auth import User
from app.models.request import Tickets
from app.services import ticket as ticket_service

MORNING = datetime(2026, 9, 30, 8, 0, tzinfo=UTC)


async def _person(db, name: str = "求助者") -> User:
    person = User(name=name)
    db.add(person)
    await db.flush()
    return person


async def _ticket(
    db, requester: User, title: str, *, status: str = "pending", filed_at: datetime = MORNING,
    deleted: bool = False,
) -> str:
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(requester.uuid), title=title,
        contact_name="王阿嬤", status=status, priority="medium", created_at=filed_at,
        delete_at=datetime.now(UTC) if deleted else None,
    )
    db.add(ticket)
    await db.flush()
    return str(ticket.uuid)


async def _mine(db, actor: User) -> list[str]:
    return [ticket.title for ticket in await ticket_service.list_my_tickets(db, actor=actor)]


@pytest.mark.asyncio
async def test_only_the_callers_own_tickets_are_listed(db):
    """Someone else's ticket is theirs to follow, not the caller's."""
    requester, neighbour = await _person(db), await _person(db, "鄰居")
    await _ticket(db, requester, "一樓積泥")
    await _ticket(db, neighbour, "屋頂破洞")

    assert await _mine(db, requester) == ["一樓積泥"]


@pytest.mark.asyncio
async def test_the_newest_ticket_comes_first(db):
    """Filed out of order on purpose, so insertion order cannot pass for the rule."""
    requester = await _person(db)
    await _ticket(db, requester, "中午", filed_at=MORNING + timedelta(hours=4))
    await _ticket(db, requester, "早上", filed_at=MORNING)
    await _ticket(db, requester, "晚上", filed_at=MORNING + timedelta(hours=12))

    assert await _mine(db, requester) == ["晚上", "中午", "早上"]


@pytest.mark.asyncio
async def test_every_status_is_listed(db):
    """A ticket that is being handled or is done is still one to follow."""
    requester = await _person(db)
    for hour, status in enumerate(("pending", "in_progress", "completed")):
        await _ticket(db, requester, status, status=status, filed_at=MORNING + timedelta(hours=hour))

    assert await _mine(db, requester) == ["completed", "in_progress", "pending"]


@pytest.mark.asyncio
async def test_a_deleted_ticket_is_not_listed(db):
    """Deleted is gone, from the requester's own list as well."""
    requester = await _person(db)
    await _ticket(db, requester, "一樓積泥")
    await _ticket(db, requester, "已刪除", status="cancelled", deleted=True)

    assert await _mine(db, requester) == ["一樓積泥"]
