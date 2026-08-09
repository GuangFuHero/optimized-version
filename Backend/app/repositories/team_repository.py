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

    async def list_active(self, db: AsyncSession, *, extra_filters=()) -> list[Team]:
        """List non-deleted teams, newest first, honoring RBAC scope_filter conditions."""
        query = (
            select(Team)
            .where(Team.delete_at.is_(None), *extra_filters)
            .order_by(Team.created_at.desc())
        )
        return (await db.execute(query)).scalars().all()


class WorkZoneRepository(GenericRepository[WorkZone]):
    """Repository for WorkZone CRUD (pure, ADR-015 — orchestration lives in the use-case)."""

    def __init__(self):
        """Initialize with WorkZone as the managed model."""
        super().__init__(WorkZone)

    async def list_all(self, db: AsyncSession, *, skip: int = 0, limit: int = 50) -> list[WorkZone]:
        """List non-deleted work zones, newest first."""
        query = (
            select(self.model)
            .where(self.model.delete_at.is_(None))
            .order_by(self.model.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return (await db.execute(query)).scalars().all()

    async def count_all(self, db: AsyncSession) -> int:
        """Count non-deleted work zones."""
        query = select(func.count()).select_from(self.model).where(self.model.delete_at.is_(None))
        return await db.scalar(query) or 0

    async def list_by_team(
        self, db: AsyncSession, *, team_uuid: str, skip: int = 0, limit: int = 50
    ) -> list[WorkZone]:
        """List the non-deleted work zones assigned to `team_uuid`, newest first."""
        query = (
            select(self.model)
            .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == self.model.uuid)
            .where(TeamZoneAssign.team_uuid == team_uuid, self.model.delete_at.is_(None))
            .order_by(self.model.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return (await db.execute(query)).scalars().all()

    async def count_by_team(self, db: AsyncSession, *, team_uuid: str) -> int:
        """Count the non-deleted work zones assigned to `team_uuid`."""
        query = (
            select(func.count())
            .select_from(self.model)
            .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == self.model.uuid)
            .where(TeamZoneAssign.team_uuid == team_uuid, self.model.delete_at.is_(None))
        )
        return await db.scalar(query) or 0


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

    async def teams_by_zones(
        self, db: AsyncSession, zone_uuids: list[str]
    ) -> list[tuple[str, Team]]:
        """Return (zone_uuid, Team) pairs for `zone_uuids`, excluding soft-deleted teams.

        Batched for the GraphQL DataLoader: one IN-query for every zone in a page, instead of
        one query per zone.
        """
        query = (
            select(TeamZoneAssign.zone_uuid, Team)
            .join(Team, Team.uuid == TeamZoneAssign.team_uuid)
            .where(TeamZoneAssign.zone_uuid.in_(zone_uuids), Team.delete_at.is_(None))
        )
        return [(str(zone_uuid), team) for zone_uuid, team in (await db.execute(query)).all()]


team_repository = TeamRepository()
work_zone_repository = WorkZoneRepository()
team_zone_assign_repository = TeamZoneAssignRepository()
