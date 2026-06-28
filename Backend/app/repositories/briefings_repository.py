"""Repositories for briefing templates and generated briefings."""

from typing import Any

from sqlalchemy import select
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
        self, db: AsyncSession, *, state: str | None = None, tag: str | None = None
    ) -> list[Briefing]:
        """List non-deleted briefings, newest first.

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

    async def generate_briefing(
        self,
        db: AsyncSession,
        *,
        created_by: str,
        template_uuid: Any | None = None,
        content: str | None = None,
        tags: list | None = None,
        state: str | None = None,
    ) -> Briefing:
        """Create a briefing, optionally seeded from a template.

        When ``content``/``tags``/``state`` are omitted and ``template_uuid`` refers to a live
        template, those values are copied from it. Returns the refreshed Briefing.
        """
        template: BriefingTemplate | None = None
        if template_uuid is not None:
            template = await briefing_template_repository.get_by_uuid_active(db, template_uuid)

        if content is None:
            content = template.content if template else ""
        if tags is None:
            tags = list(template.tags) if template else []
        if state is None:
            state = template.state if template else "briefing"

        obj = self.model(
            template_uuid=template_uuid,
            content=content,
            tags=tags,
            state=state,
            created_by=created_by,
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj


briefing_template_repository = BriefingTemplateRepository()
briefing_repository = BriefingRepository()
