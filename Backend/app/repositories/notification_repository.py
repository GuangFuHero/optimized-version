"""Repository for Notification CRUD, unread counting, and bulk read updates."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.notification import Notification


class NotificationRepository(GenericRepository[Notification]):
    """Repository for querying, filtering, and updating in-app notifications."""

    def __init__(self):
        """Initialize with Notification as the managed ORM model."""
        super().__init__(Notification)

    async def list_for_recipient(
        self,
        db: AsyncSession,
        *,
        recipient_uuid: Any,
        skip: int = 0,
        limit: int = 20,
        unread_only: bool = False,
    ) -> list[Notification]:
        """List notifications for a specific user ordered by created_at DESC."""
        conditions = [
            self.model.recipient_uuid == recipient_uuid,
            self.model.delete_at.is_(None),
        ]
        if unread_only:
            conditions.append(self.model.read.is_(False))

        query = (
            select(self.model)
            .where(and_(*conditions))
            .order_by(self.model.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return list(result.scalars().all())

    async def count_for_recipient(
        self,
        db: AsyncSession,
        *,
        recipient_uuid: Any,
        unread_only: bool = False,
    ) -> int:
        """Count notifications for a recipient."""
        conditions = [
            self.model.recipient_uuid == recipient_uuid,
            self.model.delete_at.is_(None),
        ]
        if unread_only:
            conditions.append(self.model.read.is_(False))

        query = select(func.count()).select_from(self.model).where(and_(*conditions))
        return await db.scalar(query) or 0

    async def get_unread_summary(
        self,
        db: AsyncSession,
        *,
        recipient_uuid: Any,
    ) -> tuple[int, bool]:
        """Return (unread_count, has_urgent) in a single optimized aggregate query."""
        query = select(
            func.count(self.model.uuid),
            func.bool_or(self.model.priority == "urgent"),
        ).where(
            self.model.recipient_uuid == recipient_uuid,
            self.model.read.is_(False),
            self.model.delete_at.is_(None),
        )
        result = await db.execute(query)
        row = result.one()
        count = row[0] or 0
        has_urgent = bool(row[1]) if row[1] is not None else False
        return count, has_urgent

    async def mark_as_read(
        self,
        db: AsyncSession,
        *,
        uuid: Any,
        recipient_uuid: Any,
    ) -> Notification | None:
        """Mark a single notification as read, strictly validating recipient ownership."""
        notification = await self.get_by_uuid_active(db, uuid)
        if not notification or str(notification.recipient_uuid) != str(recipient_uuid):
            return None

        if not notification.read:
            notification.read = True
            notification.read_at = datetime.now(UTC)
            await db.flush()
        return notification

    async def mark_all_as_read(
        self,
        db: AsyncSession,
        *,
        recipient_uuid: Any,
    ) -> int:
        """Mark all unread notifications for a recipient as read."""
        now = datetime.now(UTC)
        stmt = (
            update(self.model)
            .where(
                self.model.recipient_uuid == recipient_uuid,
                self.model.read.is_(False),
                self.model.delete_at.is_(None),
            )
            .values(read=True, read_at=now)
        )
        result = await db.execute(stmt)
        await db.flush()
        return result.rowcount


notification_repository = NotificationRepository()
