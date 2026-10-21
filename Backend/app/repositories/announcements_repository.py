"""Repository for site-wide announcements: at most one live on each page, and publishing replaces it."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.infrastructure.repository.base import GenericRepository
from app.models.announcement import Announcement
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService


def _slots(placement: str) -> set[str]:
    """The pages an announcement on `placement` shows on; one outside the three is admin_page's."""
    if placement == "all":
        return {"public_page", "admin_page"}
    return {"public_page"} if placement == "public_page" else {"admin_page"}


class AnnouncementRepository(GenericRepository[Announcement]):
    """Repository for announcements, of which each page shows at most one (ADR-363).

    Putting one live takes down, in the same transaction, whatever is live on a page it shows on.
    Every call goes through ``_lock_live`` first, so two publishes serialize and the later one
    replaces the earlier. The model's unique indexes refuse a second live row on a page should
    anything skip the lock.
    """

    def __init__(self):
        """Initialize with Announcement as the managed model."""
        super().__init__(Announcement)

    async def list_announcements(
        self, db: AsyncSession, *, status: str, placement: str = "all"
    ) -> list[Announcement]:
        """List non-deleted announcements placed on `placement` or "all", live ones first, newest first.

        placement="all" returns every row. status is "active", "draft", or "all", which adds inactive
        rows and drafts.
        """
        query = select(self.model).where(self.model.delete_at.is_(None))
        if placement != "all":
            query = query.where(self.model.placement.in_((placement, "all")))
        if status == "active":
            query = query.where(self.model.active.is_(True))
        elif status == "draft":
            query = query.where(self.model.published_at.is_(None))
        query = query.order_by(self.model.active.desc(), self.model.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()

    async def _lock_live(self, db: AsyncSession) -> list[Announcement]:
        """Take the publishing lock, then load all live (active, non-deleted) rows FOR UPDATE.

        Row locks alone miss a row another call puts live meanwhile, so two publishes could each
        leave theirs live; the lock, held until commit, makes the select see every committed change.
        """
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('announcements.live'))"))
        result = await db.execute(
            select(self.model)
            .where(self.model.active.is_(True), self.model.delete_at.is_(None))
            .with_for_update()
        )
        return list(result.scalars().all())

    async def _take_down_overlapping(
        self,
        db: AsyncSession,
        live: list[Announcement],
        target: Announcement,
        placement: str,
        actor_uuid: Any,
    ) -> None:
        """Take down every live announcement but target that shows on a page `placement` shows on.

        ``live`` must be the set ``_lock_live`` loaded. Call it before target goes live on `placement`:
        the flush writes these first, since a flush orders a table's updates by primary key and target
        going live ahead of them would break the unique index.
        """
        for other in live:
            if other.uuid != target.uuid and _slots(other.placement) & _slots(placement):
                other.active = False
                other.updated_by = actor_uuid
        await db.flush()

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
        # Every recipient can read a notification's actor, so the publisher is left off it and skipped here.
        await NotificationService.dispatch(
            db,
            event_type="announcement_published",
            title=title,
            body=body,
            priority="medium",
            ref_type="announcement",
            ref_uuid=ann.uuid,
            explicit_recipients=[r for r in recipients if str(r) != str(actor_uuid)],
        )

    async def _lock_target(
        self, db: AsyncSession, uuid: Any
    ) -> tuple[Announcement | None, list[Announcement]]:
        """Lock the live rows, then re-read the target under its own lock so two calls can't both act.

        The live rows go first, so every caller takes the locks in the same order.
        """
        live = await self._lock_live(db)
        return await self.get_by_uuid_active(db, uuid, for_update=True), live

    async def set_active(
        self, db: AsyncSession, *, uuid: Any, active: bool, actor_uuid: Any
    ) -> Announcement | None:
        """Activate (publishing a draft, and replacing what is live on its pages) or deactivate.

        Returns the updated announcement, or None if not found / already soft-deleted.
        """
        target, live = await self._lock_target(db, uuid)
        if target is None:
            return None
        if active and not target.active:
            await self._take_down_overlapping(db, live, target, target.placement, actor_uuid)
            target.active = True
            target.published_at = datetime.now(UTC)
            target.published_by = target.updated_by = actor_uuid
            await db.commit()
            await db.refresh(target)

            await self._notify_published(db, target, actor_uuid=actor_uuid)
            await db.refresh(target)

        elif not active and target.active:
            target.active = False
            target.updated_by = actor_uuid
            await db.commit()
            await db.refresh(target)
        return target

    async def edit(
        self,
        db: AsyncSession,
        *,
        uuid: Any,
        content: str,
        placement: str | None,
        actor_uuid: Any,
        check_live: Callable[[], Awaitable[object]],
    ) -> Announcement | None:
        """Change an announcement's content and, unless None, its placement.

        A live one's change is public once saved, so ``check_live`` runs first for it, under the locks,
        which also catches a draft another call publishes meanwhile. A live one moved onto a page
        replaces what is live there, as publishing it would.

        Returns the updated announcement, or None if not found / already soft-deleted.
        """
        target, live = await self._lock_target(db, uuid)
        if target is None:
            return None
        if target.active:
            await check_live()
            if placement is not None:
                await self._take_down_overlapping(db, live, target, placement, actor_uuid)
        target.content = content
        if placement is not None:
            target.placement = placement
        target.updated_by = actor_uuid
        await db.commit()
        await db.refresh(target)
        return target

    async def soft_delete_announcement(self, db: AsyncSession, *, uuid: Any) -> bool:
        """Soft-delete an announcement, taking it down if it is live.

        Returns True if a non-deleted announcement was found and removed, else False.
        """
        target, _ = await self._lock_target(db, uuid)
        if target is None:
            return False
        target.active = False
        target.delete_at = datetime.now(UTC)
        await db.commit()
        return True


announcement_repository = AnnouncementRepository()
