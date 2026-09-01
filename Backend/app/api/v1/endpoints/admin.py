"""Minimal admin REST API: list users, assign roles, manage team members (ADR-013/022, T117).

Read-only listing is gated declaratively at the route (checkpoint 1 only, like Phase 2's
config queries — `user.view` carries no per-row scope in the current seed). The three
write endpoints stay thin (ADR-014): they only parse input and call an admin service
function, which performs both RBAC checkpoints itself via `require_scope` — mirroring how
GraphQL mutations call the service layer, just over REST instead.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.redis import get_redis
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.repositories.auth_repository import user_repository
from app.schemas.admin import (
    AdminUserListItem,
    AssignRoleRequest,
    AssignRoleResponse,
    CreateTeamRequest,
    IdentitySummary,
    TeamMemberRequest,
    TeamMemberResponse,
    TeamResponse,
)
from app.services import admin as admin_service
from app.services.admin import AdminConflictError, AdminNotFoundError

logger = logging.getLogger(__name__)

router = APIRouter()


async def _identities_by_user(
    db: AsyncSession, user_uuids: list[str]
) -> dict[str, list[IdentitySummary]]:
    """Map each user_uuid to every identity they hold (ADR-073)."""
    if not user_uuids:
        return {}
    rows = (
        await db.execute(
            select(
                UserRoleAssign.user_uuid, UserRoleAssign.role_uuid, Role.name,
                UserRoleAssign.team_uuid, Team.name,
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
            IdentitySummary(
                role_uuid=role_uuid, role=role_name, team_uuid=team_uuid, team=team_name
            )
        )
    return result


@router.get(
    "/users",
    response_model=list[AdminUserListItem],
    dependencies=[security.has_permission(Perm.USER_VIEW)],
)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(security.get_db),
):
    """List users with every identity they hold (checkpoint 1 only)."""
    users = await user_repository.get_multi(db, skip=skip, limit=limit)
    identities = await _identities_by_user(db, [str(u.uuid) for u in users])
    return [
        AdminUserListItem(
            uuid=u.uuid,
            name=u.name,
            platform_role=next(
                (i.role for i in identities.get(str(u.uuid), []) if i.team_uuid is None), None
            ),
            identities=identities.get(str(u.uuid), []),
        )
        for u in users
    ]


@router.post("/users/{user_uuid}/role", response_model=AssignRoleResponse)
async def assign_role(
    user_uuid: UUID,
    body: AssignRoleRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Grant a user a PLATFORM role, replacing the one they hold.

    Team roles go through POST /teams/{team_uuid}/members, where the team is unambiguous —
    granting a team role IS joining that team (ADR-072).
    """
    try:
        assignment = await admin_service.assign_role(
            db, actor=current_user, user_uuid=str(user_uuid), role_name=body.role_name
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except AdminConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    return AssignRoleResponse(user_uuid=assignment.user_uuid, role_uuid=assignment.role_uuid)


@router.post(
    "/users/{user_uuid}/revoke-sessions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="強制登出使用者的所有 session",
    responses={
        403: {"description": "Permission Denied / target is a super_admin"},
        404: {"description": "User not found"},
        409: {"description": "Cannot revoke your own sessions"},
        503: {"description": "Session store is unavailable"},
    },
)
async def revoke_user_sessions(
    user_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
    current_user: User = Depends(security.get_current_user),
):
    """Sign a user out of every device; their access tokens stop working immediately.

    Returns 204 with no body on purpose. How many sessions were ended tells the caller how
    many devices the target has online, which is not theirs to know and not something they
    need — it goes to the log instead (ADR-103).

    The persisted trail is the audit row the service writes (ADR-191); this log line is an
    operational echo of it, and names the actor for the same reason the row does.
    """
    # Read off the actor BEFORE the call: the service commits (it writes the audit row), and
    # the session is expire_on_commit, so touching `current_user.uuid` afterwards would
    # trigger a lazy reload from inside a sync logging call and raise MissingGreenlet.
    actor_uuid = str(current_user.uuid)
    try:
        revoked = await admin_service.revoke_user_sessions(
            db, redis, actor=current_user, user_uuid=str(user_uuid)
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except AdminConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    logger.info("user %s revoked %d session(s) for user %s", actor_uuid, revoked, user_uuid)


@router.post(
    "/teams",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    summary="建立 team",
    responses={403: {"description": "Permission Denied"}},
)
async def create_team(
    body: CreateTeamRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Create a gov/ngo team (super_admin only, via team.edit)."""
    team = await admin_service.create_team(
        db, actor=current_user, name=body.name, type_=body.type, tax_id=body.tax_id
    )
    return TeamResponse(
        uuid=team.uuid, name=team.name, type=team.type, status=team.status, tax_id=team.tax_id
    )


@router.get(
    "/teams",
    response_model=list[TeamResponse],
    summary="列出 team",
    responses={403: {"description": "Permission Denied"}},
)
async def list_teams(
    scope: Scope = security.has_permission(Perm.TEAM_VIEW),
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
):
    """List teams filtered by the caller's team.view scope (all / own team / none)."""
    teams = await admin_service.list_teams(db, actor=current_user, scope=scope)
    return [
        TeamResponse(uuid=t.uuid, name=t.name, type=t.type, status=t.status, tax_id=t.tax_id)
        for t in teams
    ]


@router.post("/teams/{team_uuid}/members", response_model=TeamMemberResponse)
async def add_team_member(
    team_uuid: UUID,
    body: TeamMemberRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Add a user to a team by granting them a role in it (defaults to `member`).

    A user may belong to several teams at once; this replaces only the role they held in
    THIS team (ADR-072/073).
    """
    try:
        user = await admin_service.add_team_member(
            db, actor=current_user, team_uuid=str(team_uuid),
            user_uuid=str(body.user_uuid), team_role_name=body.team_role_name,
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except AdminConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    return TeamMemberResponse(uuid=user.uuid, team_uuid=team_uuid)


@router.delete("/teams/{team_uuid}/members/{user_uuid}", response_model=TeamMemberResponse)
async def remove_team_member(
    team_uuid: UUID,
    user_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Remove a user from a team by revoking every grant scoped to it (ADR-072)."""
    try:
        user = await admin_service.remove_team_member(
            db, actor=current_user, team_uuid=str(team_uuid), user_uuid=str(user_uuid)
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    # None: they are out of this team now. A user may still belong to others — GET /admin/users
    # lists every identity they hold.
    return TeamMemberResponse(uuid=user.uuid, team_uuid=None)
