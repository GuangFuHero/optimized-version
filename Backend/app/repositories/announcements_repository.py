"""Repository for site-wide announcements, including display-order maintenance."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.announcement import Announcement
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService


class AnnouncementRepository(GenericRepository[Announcement]):
    """Repository for announcements and their display ordering.

    Ordering invariant: ``display_order IS NOT NULL`` iff ``active AND delete_at IS NULL``.
    Live rows form a contiguous ``1..N`` sequence ordered top-to-bottom. Every order-mutating
    method first loads the live rows ``FOR UPDATE`` and commits once, so concurrent admin
    actions serialize and order uniqueness holds without a DB constraint.
    """

    def __init__(self):
        """Initialize with Announcement as the managed model."""
        super().__init__(Announcement)

    async def list_announcements(self, db: AsyncSession, *, only_active: bool) -> list[Announcement]:
        """List non-deleted announcements.

        only_active=True  → active rows ordered by display_order ASC.
        only_active=False → all non-deleted rows: active first (by display_order),
                            then inactive by created_at DESC.
        """
        query = select(self.model).where(self.model.delete_at.is_(None))
        if only_active:
            query = query.where(self.model.active.is_(True)).order_by(self.model.display_order.asc())
        else:
            query = query.order_by(
                self.model.display_order.asc().nulls_last(),
                self.model.created_at.desc(),
            )
        result = await db.execute(query)
        return result.scalars().all()

    async def _live_for_update(self, db: AsyncSession) -> list[Announcement]:
        """Load all live (active, non-deleted) rows locked FOR UPDATE, ordered by position."""
        result = await db.execute(
            select(self.model)
            .where(self.model.active.is_(True), self.model.delete_at.is_(None))
            .order_by(self.model.display_order.asc())
            .with_for_update()
        )
        return list(result.scalars().all())

    def _remove_from_order(self, live: list[Announcement], target: Announcement) -> None:
        """Null target's order and slide the rows below it up by one (close the gap).

        ``live`` must be the FOR UPDATE-locked live set containing target.
        """
        removed = target.display_order
        target.display_order = None
        if removed is None:
            return
        for a in live:
            if a.display_order is not None and a.display_order > removed:
                a.display_order -= 1

    async def create_at_end(self, db: AsyncSession, *, content: str, created_by: str) -> Announcement:
        """Create an active announcement appended at the bottom (largest order)."""
        live = await self._live_for_update(db)
        next_order = (live[-1].display_order + 1) if live else 1
        obj = self.model(content=content, created_by=created_by, active=True, display_order=next_order)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)

        # 觸發 announcement_published 通知 (全站廣播)
        recipients = await NotificationRecipientResolver.resolve_all_active(db)
        summary = content[:80] + ("..." if len(content) > 80 else "")
        await NotificationService.dispatch(
            db,
            event_type="announcement_published",
            title="📢 全站重要公告",
            body=summary,
            priority="medium",
            actor_uuid=created_by,
            ref_type="announcement",
            ref_uuid=obj.uuid,
            explicit_recipients=recipients,
        )
        await db.refresh(obj)

        return obj

    async def move(self, db: AsyncSession, *, uuid: Any, up: bool) -> Announcement | None:
        """Swap an active announcement with its adjacent live neighbor.

        Returns the moved announcement (refreshed). Returns None if the UUID is not a live
        (active, non-deleted) announcement. Returns the row unchanged when it is already at
        the top (up) or bottom (down) edge.
        """
        live = await self._live_for_update(db)
        idx = next((i for i, a in enumerate(live) if str(a.uuid) == str(uuid)), None)
        if idx is None:
            return None
        swap_idx = idx - 1 if up else idx + 1
        if swap_idx < 0 or swap_idx >= len(live):
            return live[idx]  # already at the edge — no-op
        a, b = live[idx], live[swap_idx]
        a.display_order, b.display_order = b.display_order, a.display_order
        await db.commit()
        await db.refresh(a)
        return a

    async def set_active(
        self, db: AsyncSession, *, uuid: Any, active: bool, actor_uuid: Any = None
    ) -> Announcement | None:
        """Activate (append at end) or deactivate (null order + close gap) an announcement.

        Returns the updated announcement, or None if not found / already soft-deleted.
        """
        target = await self.get_by_uuid_active(db, uuid)
        if target is None:
            return None
        if active and not target.active:
            live = await self._live_for_update(db)
            target.display_order = (live[-1].display_order + 1) if live else 1
            target.active = True
            await db.commit()
            await db.refresh(target)

            # 觸發 announcement_published 通知
            recipients = await NotificationRecipientResolver.resolve_all_active(db)
            summary = target.content[:80] + ("..." if len(target.content) > 80 else "")
            await NotificationService.dispatch(
                db,
                event_type="announcement_published",
                title="📢 全站重要公告",
                body=summary,
                priority="medium",
                actor_uuid=actor_uuid or target.created_by,
                ref_type="announcement",
                ref_uuid=target.uuid,
                explicit_recipients=recipients,
            )
            await db.refresh(target)

        elif not active and target.active:
            live = await self._live_for_update(db)
            self._remove_from_order(live, target)
            target.active = False
            await db.commit()
            await db.refresh(target)
        return target

    async def soft_delete_announcement(self, db: AsyncSession, *, uuid: Any) -> bool:
        """Soft-delete an announcement, null its order, and close the gap.

        Returns True if a non-deleted announcement was found and removed, else False.
        """
        target = await self.get_by_uuid_active(db, uuid)
        if target is None:
            return False
        if target.active:
            live = await self._live_for_update(db)
            self._remove_from_order(live, target)
        target.active = False
        target.delete_at = datetime.now(UTC)
        await db.commit()
        return True


announcement_repository = AnnouncementRepository()
