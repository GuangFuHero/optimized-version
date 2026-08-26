"""Unit tests for the notification data retention policy service."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.retention import cleanup_expired_notifications


@pytest.mark.asyncio
async def test_cleanup_expired_notifications_executes_successfully():
    """Verify cleanup_expired_notifications executes update query and commits transaction."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 5
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()

    affected_rows = await cleanup_expired_notifications(mock_db)

    assert affected_rows == 5
    mock_db.execute.assert_called_once()
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_retention_boundaries_against_real_db(db):
    """Pin the 30-day-read / 90-day-created boundaries against a real database.

    The mock test above proves the function issues *an* UPDATE and commits; it would pass
    just as happily if the cutoffs were `days=3` and `days=9`. Those two numbers are the
    entire content of the Q4 decision, so they need a test that actually reads rows back.
    Each row below sits deliberately close to a boundary — a one-day drift in either
    direction flips an assertion.
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.models.auth import User
    from app.models.notification import Notification

    recipient = User(name="保留測試收件人")
    db.add(recipient)
    await db.flush()
    rec_id = recipient.uuid

    now = datetime.now(UTC)

    def notif(label: str, *, read: bool, read_at=None, created_at=None, delete_at=None):
        return Notification(
            recipient_uuid=rec_id,
            type="resource_station_updated",
            priority="medium",
            title=label,
            body=label,
            read=read,
            read_at=read_at,
            created_at=created_at or now,
            delete_at=delete_at,
        )

    rows = {
        # Read 31 days ago → past the 30-day read cutoff.
        "read_31d": notif("read_31d", read=True, read_at=now - timedelta(days=31)),
        # Read 29 days ago → inside the window, must survive.
        "read_29d": notif("read_29d", read=True, read_at=now - timedelta(days=29)),
        # Never read but created 91 days ago → past the 90-day absolute cutoff.
        "created_91d": notif("created_91d", read=False, created_at=now - timedelta(days=91)),
        # Never read, created 89 days ago → must survive.
        "created_89d": notif("created_89d", read=False, created_at=now - timedelta(days=89)),
        # Unread and old-ish but inside both windows.
        "fresh_unread": notif("fresh_unread", read=False),
        # Already soft-deleted → must not be touched or re-counted.
        "already_deleted": notif(
            "already_deleted",
            read=True,
            read_at=now - timedelta(days=60),
            delete_at=now - timedelta(days=1),
        ),
    }
    db.add_all(list(rows.values()))
    await db.flush()
    ids = {label: obj.uuid for label, obj in rows.items()}
    await db.commit()

    cleaned = await cleanup_expired_notifications(db)
    assert cleaned == 2, "Exactly read_31d and created_91d are expired"

    result = await db.execute(select(Notification).where(Notification.recipient_uuid == rec_id))
    by_id = {n.uuid: n for n in result.scalars().all()}

    assert by_id[ids["read_31d"]].delete_at is not None, "read >30d must be soft-deleted"
    assert by_id[ids["created_91d"]].delete_at is not None, "created >90d must be soft-deleted"

    assert by_id[ids["read_29d"]].delete_at is None, "read 29d ago is still inside the window"
    assert by_id[ids["created_89d"]].delete_at is None, "created 89d ago is still inside the window"
    assert by_id[ids["fresh_unread"]].delete_at is None, "fresh unread must survive"

    # An already-deleted row keeps its original timestamp — the cleanup must skip it, not
    # restamp it, or every run would report the same rows as freshly cleaned.
    assert by_id[ids["already_deleted"]].delete_at < now, "already-deleted rows must be left alone"


@pytest.mark.asyncio
async def test_retention_is_idempotent(db):
    """A second run immediately after the first must clean nothing."""
    from datetime import UTC, datetime, timedelta

    from app.models.auth import User
    from app.models.notification import Notification

    recipient = User(name="冪等測試收件人")
    db.add(recipient)
    await db.flush()
    now = datetime.now(UTC)
    db.add(
        Notification(
            recipient_uuid=recipient.uuid,
            type="zone_assigned",
            priority="urgent",
            title="old",
            body="old",
            read=True,
            read_at=now - timedelta(days=45),
        )
    )
    await db.commit()

    assert await cleanup_expired_notifications(db) == 1
    assert await cleanup_expired_notifications(db) == 0, "Second run must be a no-op"
