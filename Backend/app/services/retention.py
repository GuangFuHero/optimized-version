"""Data retention and soft-delete cleanup for notifications (PRD Section 9 / Q4 resolution)."""

from sqlalchemy import and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.models.notification import Notification


async def cleanup_expired_notifications(db: AsyncSession) -> int:
    """Soft-delete expired notifications based on the 30-day read / 90-day created retention policy.

    1. 已讀且 read_at 超過 30 天 ➔ 設定 delete_at = now()
    2. 建立超過 90 天 (無論讀否) ➔ 設定 delete_at = now()
    """
    stmt = (
        update(Notification)
        .where(
            Notification.delete_at.is_(None),
            or_(
                and_(
                    Notification.read.is_(True),
                    Notification.read_at < func.now() - func.cast("30 days", func.INTERVAL),
                ),
                Notification.created_at < func.now() - func.cast("90 days", func.INTERVAL),
            ),
        )
        .values(delete_at=func.now())
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount
