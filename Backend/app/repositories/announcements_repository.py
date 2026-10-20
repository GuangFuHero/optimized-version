"""Repository for site-wide announcements, including display-order maintenance."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.infrastructure.repository.base import GenericRepository
from app.models.announcement import Announcement
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService


class AnnouncementRepository(GenericRepository[Announcement]):
    """Repository for announcements and their display ordering.

    Ordering invariant: ``display_order IS NOT NULL`` iff ``active AND delete_at IS NULL``.
    Live rows form a contiguous ``1..N`` sequence ordered top-to-bottom. Every order-mutating
    method goes through ``_live_for_update`` and commits once, so concurrent admin actions
    serialize and order uniqueness holds without a DB constraint.
    """

    def __init__(self):
        """Initialize with Announcement as the managed model."""
        super().__init__(Announcement)

    async def list_announcements(
        self, db: AsyncSession, *, status: str, placement: str = "all"
    ) -> list[Announcement]:
        """List non-deleted announcements placed on `placement` or "all", active ones by order.

        placement="all" returns every row. status is "active", "draft", or "all", which appends
        inactive rows and drafts after the active ones, newest first.
        """
        query = select(self.model).where(self.model.delete_at.is_(None))
        if placement != "all":
            query = query.where(self.model.placement.in_((placement, "all")))
        if status == "active":
            query = query.where(self.model.active.is_(True)).order_by(self.model.display_order.asc())
        else:
            if status == "draft":
                query = query.where(self.model.published_at.is_(None))
            query = query.order_by(
                self.model.display_order.asc().nulls_last(),
                self.model.created_at.desc(),
            )
        result = await db.execute(query)
        return result.scalars().all()

    async def _live_for_update(self, db: AsyncSession) -> list[Announcement]:
        """Take the ordering lock, then load all live (active, non-deleted) rows FOR UPDATE, by position.

        Row locks alone miss a row another call activates meanwhile, so two activations could take
        the same order; the lock, held until commit, makes the select see every committed change.
        """
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('announcements.display_order'))"))
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

    async def _notify_published(self, db: AsyncSession, ann: Announcement, actor_uuid: Any) -> None:
        """Notify that an announcement went live; any not on the public page reach view_admin holders only.

        Reads check the identity a session acts as, which a notification can't, so only reads show the text.
        """
        if ann.placement in ("public_page", "all"):
            title = "📢 全站重要公告"
            body = ann.content[:80] + ("..." if len(ann.content) > 80 else "")
            recipients = await NotificationRecipientResolver.resolve_all_active(db)
        else:
            title, body = "📢 管理平台公告", "管理平台有一則新公告。"
            recipients = await NotificationRecipientResolver.resolve_permission(db, Perm.ANN_VIEW_ADMIN.value)
        await NotificationService.dispatch(
            db,
            event_type="announcement_published",
            title=title,
            body=body,
            priority="medium",
            actor_uuid=actor_uuid,
            ref_type="announcement",
            ref_uuid=ann.uuid,
            explicit_recipients=recipients,
        )

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

    async def _lock_target(
        self, db: AsyncSession, uuid: Any
    ) -> tuple[Announcement | None, list[Announcement]]:
        """Lock the live rows, then re-read the target under its own lock so two calls can't both act.

        The live rows go first, as in ``move``, so every caller takes the locks in the same order.
        """
        live = await self._live_for_update(db)
        return await self.get_by_uuid_active(db, uuid, for_update=True), live

    async def set_active(
        self, db: AsyncSession, *, uuid: Any, active: bool, actor_uuid: Any
    ) -> Announcement | None:
        """Activate (append at end, publishing a draft) or deactivate (null order + close gap).

        Returns the updated announcement, or None if not found / already soft-deleted.
        """
        target, live = await self._lock_target(db, uuid)
        if target is None:
            return None
        if active and not target.active:
            target.display_order = (live[-1].display_order + 1) if live else 1
            target.active = True
            target.published_at = datetime.now(UTC)
            target.updated_by = actor_uuid
            await db.commit()
            await db.refresh(target)

            await self._notify_published(db, target, actor_uuid=actor_uuid)
            await db.refresh(target)

        elif not active and target.active:
            self._remove_from_order(live, target)
            target.active = False
            target.updated_by = actor_uuid
            await db.commit()
            await db.refresh(target)
        return target

    async def soft_delete_announcement(self, db: AsyncSession, *, uuid: Any) -> bool:
        """Soft-delete an announcement, null its order, and close the gap.

        Returns True if a non-deleted announcement was found and removed, else False.
        """
        target, live = await self._lock_target(db, uuid)
        if target is None:
            return False
        if target.active:
            self._remove_from_order(live, target)
        target.active = False
        target.delete_at = datetime.now(UTC)
        await db.commit()
        return True


announcement_repository = AnnouncementRepository()
