"""Admin write actions (assign role / add & remove team member).

Same flat-service style as station.py (T117). Raises AdminNotFoundError / AdminConflictError
(both ValueError subclasses) so the REST endpoint can map them to 404 / 409 respectively
instead of a blanket 400 (ADR-032).
"""

import json
import logging
from types import SimpleNamespace

from fastapi import HTTPException, status
from redis.exceptions import RedisError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import request_client_ip, request_identity
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, scope_filter
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.rbac import Role, UserPermissionAssign, UserRoleAssign
from app.models.team import Team
from app.repositories.auth_repository import role_repository, user_repository
from app.repositories.session_repository import SessionRepository
from app.repositories.team_repository import team_repository
from app.services.authz import require_scope
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

SUPER_ADMIN_ROLE_NAME = "super_admin"
# Joining a team means being granted a role in it (ADR-072); `member` is the least-privileged
# one, so it is what an add-without-a-role means.
DEFAULT_TEAM_ROLE = "member"


class AdminNotFoundError(ValueError):
    """A referenced user, role, or team does not exist."""


class AdminConflictError(ValueError):
    """The requested change would violate a structural invariant (e.g. last super_admin)."""


async def _remaining_super_admins(db: AsyncSession, role_uuid: str, *, excluding: str) -> int:
    """Count other users still holding `role_uuid`, excluding `excluding` itself.

    Locks ALL current holders of the role FOR UPDATE (PR #24 [9]) so two concurrent demotions
    of the last two super_admins serialize on the same rows and can't both observe
    remaining == 1. Locking only the counted subset would let them lock disjoint rows and both
    pass, leaving zero super_admins (administrative lockout).
    """
    rows = (
        await db.execute(
            select(UserRoleAssign.user_uuid)
            .where(UserRoleAssign.role_uuid == role_uuid)
            .with_for_update()
        )
    ).all()
    # `user_uuid` deserializes to a uuid.UUID (the FK targets users.uuid, a UUID(as_uuid=True)
    # column — the Mapped[str] annotation notwithstanding), while `excluding` is a str, so the
    # comparison must normalize both sides. Comparing UUID != str is always True, which would
    # silently never exclude the actor and disable the last-super_admin guard (PR #24 [8]).
    return sum(1 for (user_uuid,) in rows if str(user_uuid) != excluding)


async def assign_role(db: AsyncSession, *, actor: User, user_uuid: str, role_name: str) -> UserRoleAssign:
    """Grant a user a platform/team role, replacing any existing role of the same kind (ADR-019).

    Refuses to demote the last super_admin (ADR-032). Checkpoint 1 only — rbac.assign is a
    super_admin-only capability granted at Scope.ALL.
    """
    await require_scope(actor, Perm.RBAC_ASSIGN, db)

    target = await user_repository.get_by_uuid(db, user_uuid)
    if target is None:
        raise AdminNotFoundError("User not found")

    new_role = await role_repository.get_by_name(db, role_name)
    if new_role is None:
        raise AdminNotFoundError(f"Role '{role_name}' not found")

    # Team roles are granted through /teams/{uuid}/members, where the team is unambiguous:
    # under feature 010 a team role IS the membership, so granting one without saying which
    # team is meaningless (ADR-072).
    if new_role.kind == "team":
        raise AdminConflictError(
            "Team roles are granted via POST /admin/teams/{team_uuid}/members"
        )

    existing = (
        await db.execute(
            select(UserRoleAssign, Role)
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .where(UserRoleAssign.user_uuid == target.uuid, Role.kind == new_role.kind)
        )
    ).all()

    already_assigned = next((row for row, role in existing if role.uuid == new_role.uuid), None)
    if already_assigned is not None:
        return already_assigned

    if new_role.kind == "platform":
        current_super_admin_role = next(
            (role for _, role in existing if role.name == SUPER_ADMIN_ROLE_NAME), None
        )
        if current_super_admin_role is not None:
            remaining = await _remaining_super_admins(
                db, current_super_admin_role.uuid, excluding=str(target.uuid)
            )
            if remaining == 0:
                raise AdminConflictError("Cannot remove the last super_admin")

    for row, _ in existing:
        await db.delete(row)
    await db.flush()

    assignment = UserRoleAssign(
        user_uuid=target.uuid, role_uuid=new_role.uuid, team_uuid=None, role_kind=new_role.kind
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


async def add_team_member(
    db: AsyncSession, *, actor: User, team_uuid: str, user_uuid: str, team_role_name: str | None = None
) -> User:
    """Add a user to a team, optionally granting a team-kind role (checkpoint 1 + 2).

    Checkpoint 2 targets the team via a bare team_uuid adaptor — a Team has no team_uuid
    column of its own; its own uuid IS the boundary being checked (ADR-045).
    """
    team = await db.get(Team, team_uuid)
    if team is None:
        raise AdminNotFoundError("Team not found")

    await require_scope(
        actor,
        Perm.TEAM_MEMBER_MANAGE,
        db,
        resource=SimpleNamespace(created_by=None, team_uuid=team.uuid, geometry=None),
    )

    target = await user_repository.get_by_uuid(db, user_uuid)
    if target is None:
        raise AdminNotFoundError("User not found")

    # Granting the team role IS joining the team (ADR-072): membership is no longer a
    # separate fact, so there is nothing to check about which other teams they belong to —
    # belonging to several is the point of the feature.
    role = await role_repository.get_by_name(db, team_role_name or DEFAULT_TEAM_ROLE)
    if role is None or role.kind != "team":
        raise AdminNotFoundError(f"Team role '{team_role_name or DEFAULT_TEAM_ROLE}' not found")

    # One role per team per user: replace whatever team role they held IN THIS TEAM, leaving
    # their roles in other teams alone.
    await db.execute(
        delete(UserRoleAssign).where(
            UserRoleAssign.user_uuid == target.uuid,
            UserRoleAssign.team_uuid == team.uuid,
        )
    )
    db.add(UserRoleAssign(
        user_uuid=target.uuid, role_uuid=role.uuid, team_uuid=team.uuid, role_kind="team"
    ))

    # Read every attribute we still need BEFORE committing: the session runs with
    # expire_on_commit=True (app/db/session.py), so `team` and `actor` are expired the
    # moment we commit, and touching them afterwards raises MissingGreenlet in async.
    team_name = team.name
    team_id = team.uuid
    actor_uid = actor.uuid

    await db.commit()
    await db.refresh(target)
    target_id = target.uuid

    # 觸發 team_member_added 通知 (High)
    await NotificationService.dispatch(
        db,
        event_type="team_member_added",
        title=f"歡迎加入團隊：{team_name}",
        body=f"您已成功加入團隊「{team_name}」{f'，擔任 {team_role_name}' if team_role_name else ''}。",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="team",
        ref_uuid=team_id,
        explicit_recipients=[str(target_id)],
    )
    # dispatch() commits, which expires `target` again — refresh so the caller can read it.
    await db.refresh(target)
    return target


async def remove_team_member(db: AsyncSession, *, actor: User, team_uuid: str, user_uuid: str) -> User:
    """Remove a user from a team, clearing any team-kind role grant (checkpoint 1 + 2)."""
    team = await db.get(Team, team_uuid)
    if team is None:
        raise AdminNotFoundError("Team not found")

    await require_scope(
        actor,
        Perm.TEAM_MEMBER_MANAGE,
        db,
        resource=SimpleNamespace(created_by=None, team_uuid=team.uuid, geometry=None),
    )

    target = await user_repository.get_by_uuid(db, user_uuid)
    if target is None:
        raise AdminNotFoundError("User is not a member of this team")
    held = (
        await db.execute(
            select(UserRoleAssign.uuid).where(
                UserRoleAssign.user_uuid == target.uuid,
                UserRoleAssign.team_uuid == team.uuid,
            )
        )
    ).first()
    if held is None:
        raise AdminNotFoundError("User is not a member of this team")

    # Leaving a team is revoking every grant scoped to it — that IS the membership now
    # (ADR-072). Grants in the user's other teams, and their platform grant, are untouched:
    # platform rows carry a NULL team_uuid, which never matches this predicate.
    #
    # Both grant tables, not just the roles (ADR-187). A direct grant bound to this team is
    # as much a permission in it as a role is, and leaving it behind meant re-adding the
    # person silently restored it — someone removed from a team and later re-added as a plain
    # member got their old team.member.manage back, with no one re-granting anything.
    await db.execute(
        delete(UserRoleAssign).where(
            UserRoleAssign.user_uuid == target.uuid,
            UserRoleAssign.team_uuid == team.uuid,
        )
    )
    await db.execute(
        delete(UserPermissionAssign).where(
            UserPermissionAssign.user_uuid == target.uuid,
            UserPermissionAssign.team_uuid == team.uuid,
        )
    )
    await db.commit()
    await db.refresh(target)
    return target


async def _holds_super_admin(db: AsyncSession, user_uuid: str) -> bool:
    """Whether `user_uuid` holds the super_admin role (in any team)."""
    return (
        await db.execute(
            select(UserRoleAssign.user_uuid)
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .where(
                UserRoleAssign.user_uuid == user_uuid,
                Role.name == SUPER_ADMIN_ROLE_NAME,
            )
            .limit(1)
        )
    ).first() is not None


def _record_session_revocation(db: AsyncSession, *, actor: User, target: User, revoked: int) -> None:
    """Write the audit row for a kick (ADR-191).

    Every other admin action leaves a trail because it mutates a table and the audit trigger
    fires. This one touches no table — the sessions live in Redis — so the row has to be
    written by hand or there is no record anywhere of WHO signed a user out. That is exactly
    the action a reader needs to reconstruct: ADR-181 requires `Scope.ALL` because the RBAC
    matrix is editable at runtime, and a grant change followed by a kick is the sequence that
    has to be answerable afterwards.

    Shaped like a trigger row on purpose (`table_name` = the table the target lives in,
    `row_id` = the target) so "what happened to this user" is one query, not two. `action`
    is REVOKE_SESSIONS rather than one of the three DML verbs because it is not a DML event
    and must not be counted as one.

    Actor, IP and identity snapshot come from the same request contextvars the trigger reads,
    so an explicit row and a triggered row attribute the same way.
    """
    identity = request_identity.get()
    db.add(
        AuditLog(
            table_name="users",
            action="REVOKE_SESSIONS",
            row_id=target.uuid,
            new_values={"revoked_sessions": revoked},
            user_uuid=actor.uuid,
            client_ip=request_client_ip.get(),
            context=json.loads(identity) if identity else None,
        )
    )


async def revoke_user_sessions(db: AsyncSession, redis, *, actor: User, user_uuid: str) -> int:
    """End every session the target holds; returns how many were revoked (ADR-103/181/191).

    Checkpoint 1 only, on `user.edit` at `Scope.ALL`. There is no meaningful checkpoint 2
    here: since feature 010 a user has no single team (membership is whichever teams their
    grants name), so there is no team on the target to scope against — which is exactly why
    the scope has to be checked here instead. Without it every narrower grant would behave
    as `all`, and the RBAC matrix is editable at runtime, so today's seed (`user.edit` on
    `super_admin` alone) is not a property this function can lean on (ADR-181).

    Two targets are refused outright (ADR-191): yourself, because signing yourself out is
    `/auth/logout-all` and routing it through an admin capability only makes the audit trail
    read as an administrative action against another account; and a super_admin, because
    holding `user.edit` at `all` would otherwise be enough to keep the platform's highest
    role permanently locked out of its own console.

    Idempotent by design — a target with nothing live still succeeds, because the caller is
    asking for the end state "this person has no live sessions", not for an event.
    """
    scope = await require_scope(actor, Perm.USER_EDIT, db)
    if scope != Scope.ALL:
        # Without a checkpoint 2 to narrow it, any grant would reach every user on the
        # platform — a `user.edit=own` role meant for "edit your own profile" would silently
        # also mean "sign anyone out" (ADR-181). The RBAC matrix is editable at runtime, so
        # the seed giving `user.edit` to super_admin alone is not something this endpoint
        # can rely on.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")

    target = await user_repository.get_by_uuid(db, user_uuid)
    if target is None:
        raise AdminNotFoundError("User not found")
    if str(target.uuid) == str(actor.uuid):
        raise AdminConflictError("Use /auth/logout-all to sign yourself out")
    if await _holds_super_admin(db, str(target.uuid)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot revoke a super_admin's sessions",
        )

    repo = SessionRepository(redis)
    try:
        members = await repo.redis.smembers(repo.USER_SESSIONS + str(target.uuid))
        await repo.revoke_all_for_user(str(target.uuid))
    except RedisError as err:
        # Every other Redis touch this feature adds fails closed with a handled response;
        # this one used to raise out of the endpoint as a 500 with a traceback, which tells
        # the caller nothing and leaves it ambiguous whether any sessions were revoked
        # (ADR-194). 503 says what is true: nothing was revoked, and it is worth retrying.
        logger.exception("could not revoke sessions for user %s: Redis is unreachable", user_uuid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Session store is unavailable; no sessions were revoked",
        ) from err

    revoked = len(members)
    _record_session_revocation(db, actor=actor, target=target, revoked=revoked)
    await db.commit()
    return revoked


async def create_team(
    db: AsyncSession, *, actor: User, name: str, type_: str, tax_id: str | None = None
) -> Team:
    """Create a gov/ngo team (checkpoint 1 only — team.edit, super_admin in seed, ADR-054)."""
    await require_scope(actor, Perm.TEAM_EDIT, db)
    return await team_repository.create(
        db, obj_in={"name": name, "type": type_, "tax_id": tax_id}
    )


async def list_teams(db: AsyncSession, *, actor: User, scope: Scope) -> list[Team]:
    """List teams within the caller's team.view scope (all / own team / none, ADR-053)."""
    filters = scope_filter(scope, actor=actor, model=Team)
    return await team_repository.list_active(db, extra_filters=filters)
