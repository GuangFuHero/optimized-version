"""Data retention and soft-delete cleanup for notifications (PRD Section 9 / Q4 resolution)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def cleanup_expired_notifications(db: AsyncSession) -> int:
    """Soft-delete expired notifications based on the 30-day read / 90-day created retention policy.

    1. 已讀且 read_at 超過 30 天 ➔ 設定 delete_at = now()
    2. 建立超過 90 天 (無論讀否) ➔ 設定 delete_at = now()
    """
    now = datetime.now(UTC)
    read_cutoff = now - timedelta(days=30)
    created_cutoff = now - timedelta(days=90)

    stmt = (
        update(Notification)
        .where(
            Notification.delete_at.is_(None),
            or_(
                and_(
                    Notification.read.is_(True),
                    Notification.read_at < read_cutoff,
                ),
                Notification.created_at < created_cutoff,
            ),
        )
        .values(delete_at=now)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount
