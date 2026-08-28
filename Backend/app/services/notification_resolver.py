"""Resolution logic mapping notification event scopes to concrete recipient user UUIDs."""

import uuid as _uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.team import Team, TeamZoneAssign, WorkZone


def _to_uuid_str(val: Any) -> str | None:
    """Normalize a UUID or string value to a clean string representation."""
    if val is None:
        return None
    return str(val)


class NotificationRecipientResolver:
    """Resolves recipient user UUIDs based on RBAC v1, team membership, and domain context."""

    @staticmethod
    async def resolve_own(user_uuid: str | _uuid.UUID | None) -> list[str]:
        """Direct single-user recipient resolution."""
        uid_str = _to_uuid_str(user_uuid)
        return [uid_str] if uid_str else []

    @staticmethod
    async def resolve_team_admin(
        db: AsyncSession,
        team_uuid: str | _uuid.UUID,
    ) -> list[str]:
        """Resolve admins of a specific team (Team admins have Role.name == 'admin').

        Membership is the grant: a user belongs to a team by holding a team-kind role in it
        (ADR-072), so the team predicate sits on `user_role_assign`, not on `users` — the
        `users.team_uuid` column this used to read no longer exists. A user who admins two
        teams is resolved for each of them independently, which is the point of the feature.
        """
        team_uid_str = _to_uuid_str(team_uuid)
        if not team_uid_str:
            return []

        stmt = (
            select(User.uuid)
            .join(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .where(
                User.delete_at.is_(None),
                UserRoleAssign.team_uuid == team_uid_str,
                Role.name == "admin",
            )
        )
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]

    @staticmethod
    async def resolve_team(
        db: AsyncSession,
        team_uuid: str | _uuid.UUID,
    ) -> list[str]:
        """Resolve all active members belonging to a specific team.

        Membership is the grant (ADR-072). `distinct` because a user could hold more than one
        role in the same team over time; without it the same recipient would be dispatched to
        twice.
        """
        team_uid_str = _to_uuid_str(team_uuid)
        if not team_uid_str:
            return []

        stmt = (
            select(User.uuid)
            .join(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
            .where(
                User.delete_at.is_(None),
                UserRoleAssign.team_uuid == team_uid_str,
            )
            .distinct()
        )
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]

    @staticmethod
    async def resolve_gov_and_zone_ngo(
        db: AsyncSession,
        station_uuid: str | _uuid.UUID | None = None,
    ) -> list[str]:
        """Resolve all Gov staff plus NGO Admins whose assigned work zones contain the station (Q8)."""
        recipients: set[str] = set()

        # 1. 查詢所有 Gov 團隊成員 (Team.type == 'gov')
        gov_stmt = (
            select(User.uuid)
            .join(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
            .join(Team, Team.uuid == UserRoleAssign.team_uuid)
            .where(
                User.delete_at.is_(None),
                Team.delete_at.is_(None),
                Team.type == "gov",
            )
            .distinct()
        )
        gov_res = await db.execute(gov_stmt)
        recipients.update(str(uid) for uid in gov_res.scalars().all())

        # 2. 若指定站點 UUID，透過 PostGIS 空間查詢找出責任分區涵蓋該站點的 NGO Admin
        station_uid_str = _to_uuid_str(station_uuid)
        if station_uid_str:
            ngo_admin_stmt = (
                select(User.uuid)
                .join(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
                .join(Role, Role.uuid == UserRoleAssign.role_uuid)
                .join(Team, Team.uuid == UserRoleAssign.team_uuid)
                .join(TeamZoneAssign, TeamZoneAssign.team_uuid == Team.uuid)
                .join(WorkZone, WorkZone.uuid == TeamZoneAssign.zone_uuid)
                .join(Station, Station.uuid == station_uid_str)
                .where(
                    User.delete_at.is_(None),
                    Team.delete_at.is_(None),
                    WorkZone.delete_at.is_(None),
                    Station.delete_at.is_(None),
                    Team.type == "ngo",
                    Role.name == "admin",
                    func.ST_Contains(WorkZone.geometry, Station.geometry),
                )
            )
            ngo_res = await db.execute(ngo_admin_stmt)
            recipients.update(str(uid) for uid in ngo_res.scalars().all())

        return list(recipients)

    @staticmethod
    async def resolve_permission(
        db: AsyncSession,
        capability_key: str,
    ) -> list[str]:
        """Resolve users holding a given capability key via role assignment or direct user grant."""
        stmt = (
            select(User.uuid)
            .outerjoin(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
            .outerjoin(
                RolePermissionAssign,
                RolePermissionAssign.role_uuid == UserRoleAssign.role_uuid,
            )
            .outerjoin(
                UserPermissionAssign,
                UserPermissionAssign.user_uuid == User.uuid,
            )
            .join(
                Permission,
                (Permission.uuid == RolePermissionAssign.permission_uuid)
                | (Permission.uuid == UserPermissionAssign.permission_uuid),
            )
            .where(
                User.delete_at.is_(None),
                Permission.key == capability_key,
                (
                    (RolePermissionAssign.scope.is_not(None) & (RolePermissionAssign.scope != "none"))
                    | (UserPermissionAssign.scope.is_not(None) & (UserPermissionAssign.scope != "none"))
                ),
            )
            .distinct()
        )
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]

    @staticmethod
    async def resolve_all_active(db: AsyncSession) -> list[str]:
        """Resolve all active (non-deleted) users in the platform."""
        stmt = select(User.uuid).where(User.delete_at.is_(None))
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]
