"""Repositories for Team, WorkZone, and TeamZoneAssign (RBAC v1 §2B, Phase 4/T119)."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.team import Team, TeamZoneAssign, WorkZone


class TeamRepository(GenericRepository[Team]):
    """Repository for Team CRUD."""

    def __init__(self):
        """Initialize with Team as the managed model."""
        super().__init__(Team)


class WorkZoneRepository(GenericRepository[WorkZone]):
    """Repository for WorkZone CRUD (pure, ADR-015 — orchestration lives in the use-case)."""

    def __init__(self):
        """Initialize with WorkZone as the managed model."""
        super().__init__(WorkZone)

    async def list_all(self, db: AsyncSession, *, skip: int = 0, limit: int = 50) -> list[WorkZone]:
        """List work zones ordered by newest first."""
        query = select(self.model).order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        return (await db.execute(query)).scalars().all()

    async def count_all(self, db: AsyncSession) -> int:
        """Count all work zones."""
        return await db.scalar(select(func.count()).select_from(self.model)) or 0


class TeamZoneAssignRepository(GenericRepository[TeamZoneAssign]):
    """Repository for the team<->work_zone assignment junction table."""

    def __init__(self):
        """Initialize with TeamZoneAssign as the managed model."""
        super().__init__(TeamZoneAssign)

    async def get_assignment(
        self, db: AsyncSession, *, team_uuid: str, zone_uuid: str
    ) -> TeamZoneAssign | None:
        """Return the assignment row linking `team_uuid` and `zone_uuid`, if any."""
        query = select(self.model).where(
            self.model.team_uuid == team_uuid, self.model.zone_uuid == zone_uuid
        )
        return (await db.execute(query)).scalar_one_or_none()


team_repository = TeamRepository()
work_zone_repository = WorkZoneRepository()
team_zone_assign_repository = TeamZoneAssignRepository()
