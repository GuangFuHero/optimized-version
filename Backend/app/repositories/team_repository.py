"""Repositories for Team, TeamZone, and TeamZoneAssign (RBAC v1 §2B, Phase 4/T119)."""

from dataclasses import dataclass

from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.infrastructure.repository.base import GenericRepository
from app.models.auth import User, UserContact
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team, TeamZone, TeamZoneAssign
from app.repositories.geo_repository import AreaRepository


@dataclass(frozen=True)
class TeamAdminContact:
    """One admin of a team: real name (else the account name) and the account's verified phone and email."""

    name: str
    phone: str | None
    email: str | None


def joinable():
    """The condition for a team someone can join or be invited to: active and not deleted."""
    return and_(Team.delete_at.is_(None), Team.status == "active")


class TeamRepository(GenericRepository[Team]):
    """Repository for Team CRUD."""

    def __init__(self):
        """Initialize with Team as the managed model."""
        super().__init__(Team)

    async def list_active(self, db: AsyncSession, *, extra_filters=()) -> list[Team]:
        """List non-deleted teams, newest first, honoring RBAC scope_filter conditions."""
        query = select(Team).where(Team.delete_at.is_(None), *extra_filters).order_by(Team.created_at.desc())
        return (await db.execute(query)).scalars().all()

    async def lock_name(self, db: AsyncSession, name: str) -> None:
        """Take a transaction-scoped advisory lock on a team name, trimmed and ignoring case.

        Every path that creates or renames a team takes it before `name_taken`, so two of them
        claiming the same name at once serialize instead of both passing (ADR-352 point 3).
        """
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(lower(btrim(:name))))"), {"name": name})

    async def name_taken(self, db: AsyncSession, name: str, *, excluding=None) -> bool:
        """Whether a team not deleted has `name`, trimmed and ignoring case (Spec/026, ADR-352).

        `excluding` leaves one team out, for renaming it.
        """
        query = select(Team.uuid).where(
            Team.delete_at.is_(None), func.lower(func.btrim(Team.name)) == name.strip().lower()
        )
        if excluding is not None:
            query = query.where(Team.uuid != excluding)
        return (await db.scalar(query)) is not None

    async def list_joinable(self, db: AsyncSession, *, type_: str | None = None) -> list[Team]:
        """Teams someone can ask to join: active and not deleted, by name (Spec/026, ADR-352).

        No RBAC filter: it backs the 申請成為後台人員 picker, read by people in no team yet.
        Callers expose uuid, name and type, and each team's admins only to team admins and super admins
        (ADR-357 point 5).
        """
        query = select(Team).where(joinable())
        if type_ is not None:
            query = query.where(Team.type == type_)
        return (await db.execute(query.order_by(Team.name, Team.uuid))).scalars().all()

    async def admins_by_team(self, db: AsyncSession, team_uuids: list, *, role_name: str) -> dict:
        """Every holder of the team role `role_name` in each of `team_uuids`, with verified phone and email.

        One query for all teams. Keyed by team uuid, people by name; a team with none is missing, and deleted
        accounts are left out.
        """
        if not team_uuids:
            return {}
        phone, email = aliased(UserContact), aliased(UserContact)
        rows = await db.execute(
            select(UserRoleAssign.team_uuid, User.real_name, User.name, phone.value, email.value)
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .join(User, User.uuid == UserRoleAssign.user_uuid)
            .outerjoin(
                phone, and_(phone.user_uuid == User.uuid, phone.type == "phone", phone.verified.is_(True))
            )
            .outerjoin(
                email, and_(email.user_uuid == User.uuid, email.type == "email", email.verified.is_(True))
            )
            .where(
                UserRoleAssign.team_uuid.in_(team_uuids),
                Role.kind == "team",
                Role.name == role_name,
                User.delete_at.is_(None),
            )
            .order_by(UserRoleAssign.team_uuid, func.coalesce(User.real_name, User.name), User.uuid)
        )
        admins: dict = {}
        for team_uuid, real_name, name, phone_value, email_value in rows:
            admins.setdefault(team_uuid, []).append(
                TeamAdminContact(name=real_name or name, phone=phone_value, email=email_value)
            )
        return admins


class TeamZoneRepository(AreaRepository):
    """Repository for TeamZone; bbox listing comes from AreaRepository (ADR-015: no orchestration here)."""

    def __init__(self):
        """Initialize with TeamZone as the managed model."""
        super().__init__(TeamZone)

    async def list_by_team(
        self, db: AsyncSession, *, team_uuid: str, skip: int = 0, limit: int = 50
    ) -> list[TeamZone]:
        """List the non-deleted team zones assigned to `team_uuid`, newest first."""
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
        """Count the non-deleted team zones assigned to `team_uuid`."""
        query = (
            select(func.count())
            .select_from(self.model)
            .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == self.model.uuid)
            .where(TeamZoneAssign.team_uuid == team_uuid, self.model.delete_at.is_(None))
        )
        return await db.scalar(query) or 0


class TeamZoneAssignRepository(GenericRepository[TeamZoneAssign]):
    """Repository for the team<->team zone assignment junction table."""

    def __init__(self):
        """Initialize with TeamZoneAssign as the managed model."""
        super().__init__(TeamZoneAssign)

    async def get_assignment(
        self, db: AsyncSession, *, team_uuid: str, zone_uuid: str
    ) -> TeamZoneAssign | None:
        """Return the assignment row linking `team_uuid` and `zone_uuid`, if any."""
        query = select(self.model).where(self.model.team_uuid == team_uuid, self.model.zone_uuid == zone_uuid)
        return (await db.execute(query)).scalar_one_or_none()

    async def teams_by_zones(self, db: AsyncSession, zone_uuids: list[str]) -> list[tuple[str, Team]]:
        """Return (zone_uuid, Team) pairs for `zone_uuids`, excluding soft-deleted teams.

        Batched for the GraphQL DataLoader: one IN-query for every zone in a page, instead of
        one query per zone.

        Ordered by team name, ending on `uuid` so the order is total. The caller groups rows
        in arrival order, so this is where the per-zone order is decided.
        """
        query = (
            select(TeamZoneAssign.zone_uuid, Team)
            .join(Team, Team.uuid == TeamZoneAssign.team_uuid)
            .where(TeamZoneAssign.zone_uuid.in_(zone_uuids), Team.delete_at.is_(None))
            .order_by(Team.name, Team.uuid)
        )
        return [(str(zone_uuid), team) for zone_uuid, team in (await db.execute(query)).all()]


team_repository = TeamRepository()
team_zone_repository = TeamZoneRepository()
team_zone_assign_repository = TeamZoneAssignRepository()
