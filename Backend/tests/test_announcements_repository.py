"""Tests for AnnouncementRepository ordering invariant and gap maintenance.

Uses the function-scoped `db` fixture (tests/conftest.py), which drops/creates a fresh
schema per test against the dedicated PostgreSQL test DB — so display_order assertions
can rely on the global contiguous 1..N sequence.

The fixture's session uses expire_on_commit=True, so an ORM instance returned by one call
is expired by the next commit. Tests therefore capture UUIDs eagerly and re-read state via
list/get immediately before asserting, mirroring how a resolver reads the freshly-returned
object within a single request.
"""

import uuid as uuid_mod

import pytest

from app.models.auth import User
from app.repositories.announcements_repository import announcement_repository as repo


async def _user(db) -> str:
    """Create a user (for the created_by FK) and return its UUID string."""
    u = User(name="admin")
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return str(u.uuid)


async def _create(db, uid: str, content: str) -> str:
    """Create an announcement and return its UUID string (captured while fresh)."""
    a = await repo.create_at_end(db, content=content, created_by=uid)
    return str(a.uuid)


@pytest.mark.asyncio
async def test_create_appends_contiguous_and_active(db):
    """Each create appends at the bottom with the next order and is active."""
    uid = await _user(db)
    await _create(db, uid, "a")
    await _create(db, uid, "b")
    await _create(db, uid, "c")
    items = await repo.list_announcements(db, only_active=True)
    assert [i.content for i in items] == ["a", "b", "c"]
    assert [i.display_order for i in items] == [1, 2, 3]
    assert all(i.active for i in items)


@pytest.mark.asyncio
async def test_move_up_swaps_with_neighbor(db):
    """Moving an item up swaps order with the item directly above it."""
    uid = await _user(db)
    await _create(db, uid, "a")
    ub = await _create(db, uid, "b")
    moved = await repo.move(db, uuid=ub, up=True)
    assert moved.display_order == 1
    items = await repo.list_announcements(db, only_active=True)
    assert [i.content for i in items] == ["b", "a"]
    assert [i.display_order for i in items] == [1, 2]


@pytest.mark.asyncio
async def test_move_at_top_edge_is_noop(db):
    """Moving the top item up leaves order unchanged."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    await _create(db, uid, "b")
    moved = await repo.move(db, uuid=ua, up=True)
    assert moved.display_order == 1
    items = await repo.list_announcements(db, only_active=True)
    assert [i.content for i in items] == ["a", "b"]


@pytest.mark.asyncio
async def test_move_inactive_returns_none(db):
    """Moving a non-live announcement returns None."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    await repo.set_active(db, uuid=ua, active=False)
    assert await repo.move(db, uuid=ua, up=True) is None


@pytest.mark.asyncio
async def test_deactivate_nulls_order_and_closes_gap(db):
    """Deactivating nulls the order and slides the rows below it up by one."""
    uid = await _user(db)
    await _create(db, uid, "a")
    ub = await _create(db, uid, "b")
    await _create(db, uid, "c")
    res = await repo.set_active(db, uuid=ub, active=False)
    assert res.active is False
    assert res.display_order is None
    items = await repo.list_announcements(db, only_active=True)
    assert [i.content for i in items] == ["a", "c"]
    assert [i.display_order for i in items] == [1, 2]


@pytest.mark.asyncio
async def test_reactivate_appends_at_end(db):
    """Reactivating re-assigns the largest order (create path)."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    await _create(db, uid, "b")
    await repo.set_active(db, uuid=ua, active=False)  # a out; b becomes order 1
    res = await repo.set_active(db, uuid=ua, active=True)  # a back at the end
    assert res.display_order == 2
    items = await repo.list_announcements(db, only_active=True)
    assert [i.content for i in items] == ["b", "a"]
    assert [i.display_order for i in items] == [1, 2]


@pytest.mark.asyncio
async def test_delete_closes_gap_and_hides_row(db):
    """Soft-delete closes the gap and removes the row from all non-deleted listings."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    await _create(db, uid, "b")
    await _create(db, uid, "c")
    assert await repo.soft_delete_announcement(db, uuid=ua) is True
    active = await repo.list_announcements(db, only_active=True)
    assert [i.content for i in active] == ["b", "c"]
    assert [i.display_order for i in active] == [1, 2]
    all_rows = await repo.list_announcements(db, only_active=False)
    assert all(str(r.uuid) != ua for r in all_rows)  # soft-deleted excluded


@pytest.mark.asyncio
async def test_delete_missing_returns_false(db):
    """Deleting an unknown UUID returns False."""
    assert await repo.soft_delete_announcement(db, uuid=uuid_mod.uuid4()) is False


@pytest.mark.asyncio
async def test_invariant_order_iff_active_and_not_deleted(db):
    """display_order is non-null exactly when the row is active and not deleted."""
    uid = await _user(db)
    ua = await _create(db, uid, "a")
    got = await repo.get_by_uuid_active(db, ua)
    assert got.active is True and got.display_order is not None
    await repo.set_active(db, uuid=ua, active=False)
    fetched = await repo.get_by_uuid_active(db, ua)
    assert fetched.active is False and fetched.display_order is None
