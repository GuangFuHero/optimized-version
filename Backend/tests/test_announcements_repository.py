"""Tests for AnnouncementRepository: one live announcement per page, and publishing replaces it.

Uses the function-scoped `db` fixture (tests/conftest.py), which drops/creates a fresh
schema per test against the dedicated PostgreSQL test DB — so assertions can rely on seeing
every live announcement.

The fixture's session uses expire_on_commit=True, so an ORM instance returned by one call
is expired by the next commit. Tests therefore capture UUIDs eagerly and re-read state via
list/get immediately before asserting, mirroring how a resolver reads the freshly-returned
object within a single request.
"""

import asyncio
import uuid as uuid_mod

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement
from app.models.auth import User
from app.models.notification import Notification
from app.repositories.announcements_repository import announcement_repository as repo


async def _user(db) -> str:
    """Create a user (for the created_by FK) and return its UUID string."""
    u = User(name="admin")
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return str(u.uuid)


async def _draft(db, uid: str, content: str, placement: str = "all", uuid: str | None = None) -> str:
    """Create a draft announcement and return its UUID string (captured while fresh)."""
    obj_in = {"content": content, "placement": placement, "created_by": uid, "updated_by": uid}
    if uuid is not None:
        obj_in["uuid"] = uuid_mod.UUID(uuid)
    a = await repo.create(db, obj_in=obj_in)
    return str(a.uuid)


async def _create(db, uid: str, content: str, placement: str = "all") -> str:
    """Create an announcement and publish it, returning its UUID string."""
    ua = await _draft(db, uid, content, placement)
    await repo.set_active(db, uuid=ua, active=True, actor_uuid=uid)
    return ua


async def _live(db) -> set[str]:
    """The content of every live announcement, whatever its placement."""
    return {i.content for i in await repo.list_announcements(db, status="active")}


@pytest.mark.asyncio
async def test_publishing_replaces_the_live_one_on_its_placement(db):
    """With A on the site and B on the admin page, a new site announcement replaces A and leaves B."""
    uid = await _user(db)
    publisher = await _user(db)
    ua = await _create(db, uid, "a", "public_page")
    await _create(db, uid, "b", "admin_page")
    uc = await _draft(db, uid, "c", "public_page")
    await repo.set_active(db, uuid=uc, active=True, actor_uuid=publisher)
    assert await _live(db) == {"b", "c"}
    replaced = await repo.get_by_uuid_active(db, ua)
    assert replaced.active is False and str(replaced.updated_by) == publisher


@pytest.mark.asyncio
async def test_publishing_to_both_pages_replaces_each_page_s_live_one(db):
    """With A on the site and B on the admin page, an announcement on both replaces A and B."""
    uid = await _user(db)
    await _create(db, uid, "a", "public_page")
    await _create(db, uid, "b", "admin_page")
    await _create(db, uid, "c", "all")
    assert await _live(db) == {"c"}


@pytest.mark.asyncio
async def test_publishing_to_one_page_takes_down_an_announcement_on_both(db):
    """With C on both pages, a new admin-page announcement replaces C, so the site is left empty."""
    uid = await _user(db)
    await _create(db, uid, "c", "all")
    await _create(db, uid, "d", "admin_page")
    assert await _live(db) == {"d"}
    assert await repo.list_announcements(db, status="active", placement="public_page") == []


_LOW, _HIGH = "00000000-0000-4000-8000-000000000001", "ffffffff-ffff-4fff-bfff-ffffffffffff"


@pytest.mark.asyncio
@pytest.mark.parametrize(("live_uuid", "new_uuid"), [(_LOW, _HIGH), (_HIGH, _LOW)])
async def test_publishing_replaces_whichever_row_sorts_first(db, live_uuid, new_uuid):
    """Replacing works whether the new announcement's row sorts before or after the one it replaces."""
    uid = await _user(db)
    await repo.set_active(db, uuid=await _draft(db, uid, "a", uuid=live_uuid), active=True, actor_uuid=uid)
    await repo.set_active(db, uuid=await _draft(db, uid, "b", uuid=new_uuid), active=True, actor_uuid=uid)
    assert await _live(db) == {"b"}


@pytest.mark.asyncio
async def test_republishing_a_taken_down_one_replaces_the_live_one(db):
    """Putting an earlier announcement back up replaces whatever is live on its page."""
    uid = await _user(db)
    ua = await _create(db, uid, "a", "public_page")
    await _create(db, uid, "b", "public_page")
    await repo.set_active(db, uuid=ua, active=True, actor_uuid=uid)
    assert await _live(db) == {"a"}


@pytest.mark.asyncio
async def test_moving_a_live_one_onto_a_page_replaces_the_one_live_there(db):
    """Moving A from the site to both pages takes down B on the admin page, as publishing A there would."""
    uid = await _user(db)
    ua = await _create(db, uid, "a", "public_page")
    await _create(db, uid, "b", "admin_page")
    await repo.edit(db, uuid=ua, content="a!", placement="all", actor_uuid=uid, check_live=_allow)
    assert await _live(db) == {"a!"}


async def _allow() -> None:
    """A `check_live` that lets the caller change a live announcement."""


@pytest.mark.asyncio
async def test_live_ones_list_first_then_newest_first(db):
    """The full list starts with what is live, newest first, then everything else, newest first."""
    uid = await _user(db)
    await _create(db, uid, "a", "public_page")
    await _create(db, uid, "b", "admin_page")
    await _draft(db, uid, "c", "public_page")
    await _create(db, uid, "d", "public_page")
    items = await repo.list_announcements(db, status="all")
    assert [i.content for i in items] == ["d", "b", "c", "a"]


@pytest.mark.asyncio
async def test_draft_is_unlisted_until_published(db):
    """A draft lists only as a draft; publishing stamps who and when, and taking it down keeps both."""
    uid = await _user(db)
    publisher = await _user(db)
    ua = await _draft(db, uid, "a")
    draft = await repo.get_by_uuid_active(db, ua)
    assert draft.active is False and draft.published_at is None
    assert await repo.list_announcements(db, status="active") == []
    assert [str(i.uuid) for i in await repo.list_announcements(db, status="draft")] == [ua]

    await repo.set_active(db, uuid=ua, active=True, actor_uuid=publisher)
    live = await repo.get_by_uuid_active(db, ua)
    assert live.published_at is not None and str(live.published_by) == str(live.updated_by) == publisher
    assert await repo.list_announcements(db, status="draft") == []

    await repo.set_active(db, uuid=ua, active=False, actor_uuid=uid)
    down = await repo.get_by_uuid_active(db, ua)
    assert str(down.updated_by) == uid and str(down.published_by) == publisher


@pytest.mark.asyncio
async def test_publish_notification_leaves_out_the_publisher(db):
    """Everyone else is notified, and no notification records who published."""
    uid = await _user(db)
    reader = await _user(db)
    ua = await _draft(db, uid, "a")
    await repo.set_active(db, uuid=ua, active=True, actor_uuid=uid)
    rows = await db.execute(
        select(Notification.recipient_uuid, Notification.actor_uuid).where(
            Notification.ref_uuid == uuid_mod.UUID(ua)
        )
    )
    assert [(str(r), a) for r, a in rows] == [(reader, None)]


@pytest.mark.asyncio
async def test_deactivated_is_not_a_draft(db):
    """Taking an announcement down keeps it out of the draft list."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    await repo.set_active(db, uuid=ua, active=False, actor_uuid=uid)
    assert await repo.list_announcements(db, status="draft") == []
    assert [str(i.uuid) for i in await repo.list_announcements(db, status="all")] == [ua]


@pytest.mark.asyncio
async def test_delete_hides_the_row(db):
    """Soft-delete takes a live announcement down and removes it from every listing."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    assert await repo.soft_delete_announcement(db, uuid=ua) is True
    assert await _live(db) == set()
    assert await repo.list_announcements(db, status="all") == []


@pytest.mark.asyncio
async def test_delete_missing_returns_false(db):
    """Deleting an unknown UUID returns False."""
    assert await repo.soft_delete_announcement(db, uuid=uuid_mod.uuid4()) is False


@pytest.mark.asyncio
async def test_set_active_decides_on_a_fresh_read(db):
    """An activation that lost a race to another sees the row already live and changes nothing."""
    uid = await _user(db)
    await _create(db, uid, "live")
    ua = await _draft(db, uid, "draft")
    stale = await repo.get_by_uuid_active(db, ua)
    assert stale.active is False
    async with AsyncSession(db.bind) as other:
        await repo.set_active(other, uuid=ua, active=True, actor_uuid=uid)

    await repo.set_active(db, uuid=ua, active=True, actor_uuid=uid)
    assert await _live(db) == {"draft"}


@pytest.mark.asyncio
async def test_a_publish_waiting_on_another_replaces_it(db):
    """A publish that waits for another's lock sees the one that went live meanwhile, and replaces it."""
    uid = await _user(db)
    first = await _draft(db, uid, "first")
    second = await _draft(db, uid, "second")
    async with AsyncSession(db.bind) as holder, AsyncSession(db.bind) as waiter:
        await repo._lock_live(holder)
        waiting = asyncio.create_task(repo.set_active(waiter, uuid=second, active=True, actor_uuid=uid))
        await asyncio.sleep(0.3)
        row = await repo.get_by_uuid_active(holder, first, for_update=True)
        row.active = True
        await holder.commit()
        await waiting

    assert await _live(db) == {"second"}


@pytest.mark.asyncio
async def test_the_database_refuses_a_second_live_one_on_a_page(db):
    """Written past the repository, a second live announcement on a page is still refused."""
    uid = await _user(db)
    await _create(db, uid, "a", "all")
    for placement in ("public_page", "admin_page", "staff"):
        ub = await _draft(db, uid, "b", placement)
        with pytest.raises(IntegrityError):
            await db.execute(update(Announcement).where(Announcement.uuid == ub).values(active=True))
        await db.rollback()
