"""Admin write actions (assign role / add & remove team member).

Same flat-service style as station.py (T117). Raises AdminNotFoundError / AdminConflictError
(both ValueError subclasses) so the REST endpoint can map them to 404 / 409 respectively
instead of a blanket 400 (ADR-032).
"""

from types import SimpleNamespace

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, scope_filter
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.repositories.auth_repository import role_repository, user_repository
from app.repositories.team_repository import team_repository
from app.services.authz import require_scope
from app.services.notification_service import NotificationService

SUPER_ADMIN_ROLE_NAME = "super_admin"


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

    if new_role.kind == "team" and not target.team_uuid:
        raise AdminConflictError("User must belong to a team before receiving a team role")

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

    assignment = UserRoleAssign(user_uuid=target.uuid, role_uuid=new_role.uuid)
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
    if target.team_uuid and str(target.team_uuid) != str(team.uuid):
        raise AdminConflictError("User already belongs to a different team")

    target.team_uuid = team.uuid

    if team_role_name:
        role = await role_repository.get_by_name(db, team_role_name)
        if role is None or role.kind != "team":
            raise AdminNotFoundError(f"Team role '{team_role_name}' not found")
        await db.execute(
            delete(UserRoleAssign).where(
                UserRoleAssign.user_uuid == target.uuid,
                UserRoleAssign.role_uuid.in_(select(Role.uuid).where(Role.kind == "team")),
            )
        )
        db.add(UserRoleAssign(user_uuid=target.uuid, role_uuid=role.uuid))

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
    if target is None or str(target.team_uuid) != str(team.uuid):
        raise AdminNotFoundError("User is not a member of this team")

    target.team_uuid = None
    await db.execute(
        delete(UserRoleAssign).where(
            UserRoleAssign.user_uuid == target.uuid,
            UserRoleAssign.role_uuid.in_(select(Role.uuid).where(Role.kind == "team")),
        )
    )
    await db.commit()
    await db.refresh(target)
    return target


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
