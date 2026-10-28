"""Listing accounts for the back office (Spec/026): one base, one subclass per audience.

`UserDirectory` holds what every list shares — which accounts, in what order, and whether the
caller reads their confirmed real name. A subclass says who may read it (its own capability, so
each list can be granted on its own) and which accounts it covers:

- `PlatformUserDirectory`: every account, for `user.view` (成員與權限; `GET /admin/users`).
- `TeamMemberDirectory`: one team's members, for `team.member.view` covering that team
  (我的團隊 → 成員名單; `GET /admin/teams/{uuid}/members`).

A new audience (say, the people in a work zone) is another subclass, not another endpoint's
worth of copied queries.
"""

import logging
from abc import ABC, abstractmethod
from types import SimpleNamespace

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, active_team
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.repositories.session_repository import SessionRepository
from app.schemas.admin import AdminUserListItem, IdentitySummary, TeamMemberItem, UserSearch
from app.services.auth_account import DEFAULT_PLATFORM_ROLE
from app.services.authz import require_scope

logger = logging.getLogger(__name__)


class TeamNotFoundError(ValueError):
    """No such team. REST answers 404."""


class UserDirectory(ABC):
    """An ordered, paged list of accounts that one capability grants."""

    def __init__(self, db: AsyncSession, actor: User):
        """Bind the list to the request's session and caller."""
        self.db = db
        self.actor = actor

    @abstractmethod
    async def authorize(self) -> None:
        """Refuse a caller who may not read this list (403 / 404)."""

    def narrow(self, query):
        """Restrict `query` (over `User`) to the accounts this list covers. Default: all."""
        return query

    async def shows_real_name(self) -> bool:
        """Whether the caller reads `users.real_name` (ADR-355 point 5): reviewers by default.

        `role_request.review` rather than the list's capability: data auditors read the platform
        list too and are kept from applicants' details (ADR-287 point 7).
        """
        return await resolve_scope(self.actor, Perm.ROLE_REQUEST_REVIEW, self.db) != Scope.NONE

    async def accounts(self, *, skip: int, limit: int) -> list[User]:
        """The page of accounts, oldest first so pages stay stable."""
        await self.authorize()
        query = self.narrow(select(User)).order_by(User.created_at, User.uuid).offset(skip).limit(limit)
        return list((await self.db.execute(query)).scalars().all())


class PlatformUserDirectory(UserDirectory):
    """Every account, with every identity it holds and its live sessions (ADR-073, ADR-094)."""

    def __init__(self, db: AsyncSession, actor: User, redis, search: UserSearch | None = None):
        """Sessions are counted in Redis; `search` narrows the list (ADR-412)."""
        super().__init__(db, actor)
        self.redis = redis
        self.search = search or UserSearch()

    async def authorize(self) -> None:
        """user.view (super admin, data auditor in the seed)."""
        await require_scope(self.actor, Perm.USER_VIEW, self.db)

    def narrow(self, query):
        """Apply the search: `q` against the nickname only, never contact details (ADR-412)."""
        q = (self.search.q or "").strip()
        if q:
            query = query.where(User.name.icontains(q, autoescape=True))
        if self.search.platform_role:
            query = query.where(_holds_platform_role(self.search.platform_role))
            if self.search.platform_role == DEFAULT_PLATFORM_ROLE:
                # Everyone holds `user` (ADR-294), so it means what the list's column shows: nothing
                # besides it (`platform_role()` below, ADR-412).
                query = query.where(~_holds_platform_role(DEFAULT_PLATFORM_ROLE, other_than=True))
        if self.search.team_uuid is not None:
            query = query.where(
                exists().where(
                    UserRoleAssign.user_uuid == User.uuid, UserRoleAssign.team_uuid == self.search.team_uuid
                )
            )
        return query

    async def list(self, *, skip: int, limit: int) -> list[AdminUserListItem]:
        """The rows of 成員與權限."""
        users = await self.accounts(skip=skip, limit=limit)
        user_uuids = [str(u.uuid) for u in users]
        identities = await identities_by_user(self.db, user_uuids)
        sessions_by_user = await session_counts(self.redis, user_uuids)
        real_name = await self.shows_real_name()
        return [
            AdminUserListItem(
                uuid=u.uuid,
                name=u.name,
                real_name=u.real_name if real_name else None,
                platform_role=platform_role(identities.get(str(u.uuid), [])),
                identities=identities.get(str(u.uuid), []),
                created_at=u.created_at,
                last_login_at=u.last_login_at,
                last_activity_at=u.last_activity_at,
                active_session_count=sessions_by_user.get(str(u.uuid)),
            )
            for u in users
        ]


class TeamMemberDirectory(UserDirectory):
    """One team's members and their role in it. Nothing about their other teams or sessions."""

    def __init__(self, db: AsyncSession, actor: User, team_uuid):
        """The team whose members are listed."""
        super().__init__(db, actor)
        self.team_uuid = team_uuid

    async def authorize(self) -> None:
        """team.member.view covering the team: another team is not found (ADR-023)."""
        team = await self.db.scalar(
            select(Team.uuid).where(Team.uuid == self.team_uuid, Team.delete_at.is_(None))
        )
        if team is None:
            raise TeamNotFoundError("Team not found")
        await require_scope(
            self.actor,
            Perm.TEAM_MEMBER_VIEW,
            self.db,
            resource=SimpleNamespace(created_by=None, team_uuid=team, geometry=None),
        )

    def narrow(self, query):
        """Accounts holding a grant in the team: that is membership (ADR-072)."""
        in_team = exists().where(
            UserRoleAssign.user_uuid == User.uuid, UserRoleAssign.team_uuid == self.team_uuid
        )
        return query.where(in_team)

    async def shows_real_name(self) -> bool:
        """Reviewers, and whoever manages this team's members (its admins, ADR-355 point 5)."""
        if await super().shows_real_name():
            return True
        manage = await resolve_scope(self.actor, Perm.TEAM_MEMBER_MANAGE, self.db)
        return manage == Scope.ALL or (
            manage != Scope.NONE and str(active_team(self.actor)) == str(self.team_uuid)
        )

    async def list(self, *, skip: int, limit: int) -> list[TeamMemberItem]:
        """The rows of 我的團隊 → 成員名單."""
        users = await self.accounts(skip=skip, limit=limit)
        roles = dict(
            (
                await self.db.execute(
                    select(UserRoleAssign.user_uuid, Role)
                    .join(Role, Role.uuid == UserRoleAssign.role_uuid)
                    .where(
                        UserRoleAssign.team_uuid == self.team_uuid,
                        UserRoleAssign.user_uuid.in_([u.uuid for u in users]),
                    )
                )
            ).all()
        )
        real_name = await self.shows_real_name()
        return [
            TeamMemberItem(
                uuid=u.uuid,
                name=u.name,
                real_name=u.real_name if real_name else None,
                role_uuid=roles[u.uuid].uuid,
                role=roles[u.uuid].name,
            )
            for u in users
        ]


async def identities_by_user(db: AsyncSession, user_uuids: list[str]) -> dict[str, list[IdentitySummary]]:
    """Map each user_uuid to every identity they hold (ADR-073)."""
    if not user_uuids:
        return {}
    rows = (
        await db.execute(
            select(
                UserRoleAssign.user_uuid,
                UserRoleAssign.role_uuid,
                Role.name,
                UserRoleAssign.team_uuid,
                Team.name,
            )
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .outerjoin(Team, Team.uuid == UserRoleAssign.team_uuid)
            .where(UserRoleAssign.user_uuid.in_(user_uuids))
            .order_by(UserRoleAssign.team_uuid.is_not(None), Role.name)
        )
    ).all()
    result: dict[str, list[IdentitySummary]] = {}
    for user_uuid, role_uuid, role_name, team_uuid, team_name in rows:
        result.setdefault(str(user_uuid), []).append(
            IdentitySummary(role_uuid=role_uuid, role=role_name, team_uuid=team_uuid, team=team_name)
        )
    return result


def _decode(value) -> str:
    """Redis runs in bytes mode (decode_responses=False); normalize a member to str."""
    return value.decode() if isinstance(value, bytes) else value


async def session_counts(redis, user_uuids: list[str]) -> dict[str, int | None]:
    """Map each user_uuid to their live Redis session count (ADR-094).

    Two pipelined round trips for the whole page, not one per user — the default page is 100.

    The `user_sessions:<uuid>` set is NOT self-cleaning: members are only removed by an
    explicit logout (`session_repository.py:110`), while a session that simply reached its
    TTL leaves its sid behind — and every login/rotation pushes the *set's* TTL forward, so
    the stale sid never ages out either. Counting set members alone would report phantom
    devices, and ADR-094 reads a high count as a credential-leak signal, so that would be a
    false alarm. Hence the second pass: only sids whose `session:<sid>` key still exists
    count.

    Redis being down must not take the user list down with it, so every count degrades to
    `None` (distinct from 0, which would read as "signed out everywhere").
    """
    if not user_uuids:
        return {}
    try:
        pipe = redis.pipeline()
        for user_uuid in user_uuids:
            pipe.smembers(SessionRepository.USER_SESSIONS + user_uuid)
        member_sets = await pipe.execute()

        owners = [(index, _decode(sid)) for index, members in enumerate(member_sets) for sid in members]
        pipe = redis.pipeline()
        for _index, sid in owners:
            pipe.exists(SessionRepository.SESSION + sid)
        alive_flags = await pipe.execute()
    except Exception:  # any Redis failure degrades, never fails the listing
        logger.warning("Redis unavailable; omitting active_session_count", exc_info=True)
        return dict.fromkeys(user_uuids, None)

    # Deliberately outside the `except` above: the `strict=True` zips below raise ValueError
    # on a length mismatch, which is a bug in this function, not an outage. Swallowed here it
    # would degrade every user's count to `null` and file the bug under "Redis unavailable",
    # pointing whoever investigates at a subsystem that is working fine.
    counts = [0] * len(user_uuids)
    for (index, _sid), alive in zip(owners, alive_flags, strict=True):
        if alive:
            counts[index] += 1
    return dict(zip(user_uuids, counts, strict=True))


def _holds_platform_role(role_name: str, *, other_than: bool = False):
    """EXISTS: the account holds the platform role `role_name` — or, `other_than`, one besides it."""
    named = Role.name != role_name if other_than else Role.name == role_name
    return (
        exists()
        .where(UserRoleAssign.user_uuid == User.uuid, UserRoleAssign.team_uuid.is_(None))
        .where(Role.uuid == UserRoleAssign.role_uuid, named)
    )


def platform_role(identities: list[IdentitySummary]) -> str | None:
    """The platform role a user list shows: the one besides `user` if there is one, else `user`.

    An account holds `user` plus at most one other platform role (019/ADR-294), and the other
    one is what sets back-office staff apart. Taking the first by name only worked while every
    other platform role happened to sort before `user`.
    """
    platform = [i.role for i in identities if i.team_uuid is None]
    others = [role for role in platform if role != DEFAULT_PLATFORM_ROLE]
    return (others or platform or [None])[0]
