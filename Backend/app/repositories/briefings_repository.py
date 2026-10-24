"""Repositories for briefing templates and generated briefings."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.briefing import Briefing, BriefingTemplate


class BriefingTemplateRepository(GenericRepository[BriefingTemplate]):
    """Repository for reusable briefing templates."""

    def __init__(self):
        """Initialize with BriefingTemplate as the managed model."""
        super().__init__(BriefingTemplate)

    async def list_templates(
        self, db: AsyncSession, *, state: str | None = None, tag: str | None = None
    ) -> list[BriefingTemplate]:
        """List non-deleted templates, newest first.

        Optionally filter by ``state`` (equality) and ``tag`` (JSONB array containment).
        """
        query = select(self.model).where(self.model.delete_at.is_(None))
        if state is not None:
            query = query.where(self.model.state == state)
        if tag is not None:
            query = query.where(self.model.tags.contains([tag]))
        query = query.order_by(self.model.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())


class BriefingRepository(GenericRepository[Briefing]):
    """Repository for generated briefings."""

    def __init__(self):
        """Initialize with Briefing as the managed model."""
        super().__init__(Briefing)

    async def list_briefings(
        self,
        db: AsyncSession,
        *,
        status: str,
        state: str | None = None,
        tag: str | None = None,
    ) -> list[Briefing]:
        """List non-deleted briefings whose ``status`` is "published", "draft", or any ("all").

        Drafts come first, most recently edited first, then the rest newest published first.
        Optionally filter by ``state`` (equality) and ``tag`` (JSONB array containment).
        """
        query = select(self.model).where(self.model.delete_at.is_(None))
        if status != "all":
            query = query.where(self.model.status == status)
        if state is not None:
            query = query.where(self.model.state == state)
        if tag is not None:
            query = query.where(self.model.tags.contains([tag]))
        query = query.order_by(self.model.published_at.desc().nulls_first(), self.model.updated_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    async def generate_briefing(
        self,
        db: AsyncSession,
        *,
        created_by: str,
        template_uuid: Any | None = None,
        source_uuid: Any | None = None,
        content: str | None = None,
        tags: list | None = None,
        state: str | None = None,
    ) -> Briefing:
        """Create a draft briefing, seeded from a template, copied from another briefing, or ad-hoc.

        Omitted ``content``/``tags``/``state`` come from the seed, and copying a briefing keeps its
        template link too; with no seed the briefing is empty. Raises ValueError if both seeds are
        given or the one named is missing or soft-deleted, rather than silently producing an empty
        briefing or an FK violation surfacing as "Unexpected error."
        """
        if template_uuid is not None and source_uuid is not None:
            raise ValueError("Give a template or a source briefing, not both")
        seed: BriefingTemplate | Briefing | None = None
        if template_uuid is not None:
            seed = await briefing_template_repository.get_by_uuid_active(db, template_uuid)
            if seed is None:
                raise ValueError("Briefing template not found")
        if source_uuid is not None:
            seed = await self.get_by_uuid_active(db, source_uuid)
            if seed is None:
                raise ValueError("Briefing not found")
            template_uuid = seed.template_uuid

        if content is None:
            content = seed.content if seed else ""
        if tags is None:
            tags = list(seed.tags) if seed else []
        if state is None:
            state = seed.state if seed else "briefing"

        obj = self.model(
            template_uuid=template_uuid,
            content=content,
            tags=tags,
            state=state,
            created_by=created_by,
            updated_by=created_by,
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def publish(self, db: AsyncSession, *, uuid: Any, actor_uuid: str) -> Briefing:
        """Publish a draft as its state's live version, taking down the one live before it.

        The lock makes concurrent publishes take turns, so each sees the row the last one put live;
        the unique index refuses a second live row should anything skip it. Raises ValueError if
        the briefing is missing or no longer a draft.
        """
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('briefings.live'))"))
        target = await self.get_by_uuid_active(db, uuid, for_update=True)
        if target is None:
            raise ValueError("Briefing not found")
        if target.status != "draft":
            raise ValueError("Briefing is already published")
        live = await db.execute(
            select(self.model)
            .where(
                self.model.state == target.state,
                self.model.status == "published",
                self.model.delete_at.is_(None),
            )
            .with_for_update()
        )
        for row in live.scalars():
            row.status = "inactive"
            row.updated_by = actor_uuid
        # Written before the target goes live, or the unique index sees two live rows at once.
        await db.flush()
        target.status = "published"
        target.published_at = datetime.now(UTC)
        target.published_by = target.updated_by = actor_uuid
        await db.commit()
        await db.refresh(target)
        return target


briefing_template_repository = BriefingTemplateRepository()
briefing_repository = BriefingRepository()
