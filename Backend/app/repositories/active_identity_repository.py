"""Lookups over the RBAC identities a user may act as (feature 010, ADR-068/069).

Named `active_identity` throughout to keep it distinct from `auth_repository`'s
`identity_repository`, which is about LOGIN identities (password / google / line). The two
words mean different things in this codebase: one is how you prove who you are, the other
is which role you are currently exercising.
"""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.identity import ActiveIdentity, decode_act
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.services.auth_account import DEFAULT_PLATFORM_ROLE


def _select_identities():
    """Base query joining a grant row to its role and (optional) team names."""
    return (
        select(
            UserRoleAssign.role_uuid,
            UserRoleAssign.team_uuid,
            Role.name,
            Team.name,
            Role.kind,
        )
        .join(Role, Role.uuid == UserRoleAssign.role_uuid)
        .outerjoin(Team, Team.uuid == UserRoleAssign.team_uuid)
        # A soft-deleted team takes its identity with it; the platform identity has no team
        # to check, hence the OR rather than a plain filter.
        .where(or_(UserRoleAssign.team_uuid.is_(None), Team.delete_at.is_(None)))
    )


def _to_identity(row) -> ActiveIdentity:
    role_uuid, team_uuid, role_name, team_name, _kind = row
    return ActiveIdentity(
        role_uuid=str(role_uuid),
        team_uuid=str(team_uuid) if team_uuid else None,
        role_name=role_name,
        team_name=team_name,
    )


class ActiveIdentityRepository:
    """Reads the identities a user may act as."""

    async def list_for_user(self, db: AsyncSession, user_uuid: str) -> list[ActiveIdentity]:
        """Every identity the user can switch to, platform first."""
        rows = (
            await db.execute(
                _select_identities()
                .where(UserRoleAssign.user_uuid == user_uuid)
                .order_by(UserRoleAssign.team_uuid.is_not(None), Role.name)
            )
        ).all()
        return [_to_identity(r) for r in rows]

    async def resolve(
        self, db: AsyncSession, user_uuid: str, act: str | None
    ) -> ActiveIdentity | None:
        """Resolve an `act` claim, or None when it names nothing the user still holds.

        None is the signal for ADR-096's fail-closed behaviour: the request and the refresh
        are both refused, so a revoked identity cannot keep working until its token expires.
        """
        parsed = decode_act(act)
        if parsed is None:
            return None
        role_uuid, team_uuid = parsed
        row = (
            await db.execute(
                _select_identities().where(
                    UserRoleAssign.user_uuid == user_uuid,
                    UserRoleAssign.role_uuid == role_uuid,
                    UserRoleAssign.team_uuid.is_not_distinct_from(team_uuid),
                )
            )
        ).first()
        return _to_identity(row) if row else None

    async def default_for_user(self, db: AsyncSession, user_uuid: str) -> ActiveIdentity | None:
        """The identity a fresh login lands on: `user` if held, else a platform identity (ADR-069).

        An account may hold more than one platform grant since Spec/019: an approved data
        auditor keeps `user` beside `data_auditor` (ADR-288), and migration 15370be54155 gave
        `user` to every account, super admins included. Whoever holds `user` starts on it
        (ADR-290) — the least of what they hold — and the back office switches to anything
        more on purpose. After that, `ORDER BY` names and uuids so the answer is stable between
        reads rather than whichever row the partial unique index happened to return first.

        Returns None only for an account holding no platform grant at all. ADR-185 makes that
        unreachable through the API by refusing to unassign a platform role; this stays
        fail-closed rather than falling back to a team identity, because landing someone on a
        team identity they did not choose is the silent downgrade ADR-096 rejected.
        """
        row = (
            await db.execute(
                _select_identities()
                .where(
                    UserRoleAssign.user_uuid == user_uuid,
                    UserRoleAssign.team_uuid.is_(None),
                )
                # False sorts first: the `user` grant, if there is one, then the rest by name.
                .order_by(Role.name != DEFAULT_PLATFORM_ROLE, Role.name, UserRoleAssign.role_uuid)
            )
        ).first()
        return _to_identity(row) if row else None

    async def site_identity(self, db: AsyncSession, user_uuid: str) -> ActiveIdentity | None:
        """The `user` grant a request from the site acts as (ADR-289), or None if not held.

        None leaves the caller on the token's identity (ADR-289 decision 2): the site only ever picks a grant
        the caller holds, and never hands one out.
        """
        row = (
            await db.execute(
                _select_identities().where(
                    UserRoleAssign.user_uuid == user_uuid,
                    UserRoleAssign.team_uuid.is_(None),
                    Role.name == DEFAULT_PLATFORM_ROLE,
                )
            )
        ).first()
        return _to_identity(row) if row else None


active_identity_repository = ActiveIdentityRepository()
