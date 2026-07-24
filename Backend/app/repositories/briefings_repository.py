"""Repositories for briefing templates and generated briefings.

Pure CRUD + list filters. The "seed a briefing from a template" business rule lives in
app/services/briefing.py, not here (ADR-AB-04) — this layer only reads and writes rows.
"""

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


briefing_template_repository = BriefingTemplateRepository()
briefing_repository = BriefingRepository()
