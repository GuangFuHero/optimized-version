"""Minimal admin REST API: list users, assign roles, manage team members (ADR-013/022, T117).

Read-only listing is gated declaratively at the route (checkpoint 1 only, like Phase 2's
config queries — `user.view` carries no per-row scope in the current seed). The three
write endpoints stay thin (ADR-014): they only parse input and call an admin service
function, which performs both RBAC checkpoints itself via `require_scope` — mirroring how
GraphQL mutations call the service layer, just over REST instead.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.repositories.auth_repository import user_repository
from app.schemas.admin import (
    AdminUserListItem,
    AssignRoleRequest,
    AssignRoleResponse,
    CreateTeamRequest,
    TeamMemberRequest,
    TeamMemberResponse,
    TeamResponse,
)
from app.services import admin as admin_service
from app.services.admin import AdminConflictError, AdminNotFoundError

router = APIRouter()


async def _role_names_by_user(db: AsyncSession, user_uuids: list[str]) -> dict[str, dict[str, str]]:
    """Map each user_uuid to {"platform": role_name, "team": role_name} (whichever exist)."""
    if not user_uuids:
        return {}
    rows = (
        await db.execute(
            select(UserRoleAssign.user_uuid, Role.name, Role.kind)
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .where(UserRoleAssign.user_uuid.in_(user_uuids))
        )
    ).all()
    result: dict[str, dict[str, str]] = {}
    for user_uuid, role_name, kind in rows:
        result.setdefault(str(user_uuid), {})[kind] = role_name
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
    """List users with their current platform/team role names (checkpoint 1 only)."""
    users = await user_repository.get_multi(db, skip=skip, limit=limit)
    roles_by_user = await _role_names_by_user(db, [str(u.uuid) for u in users])
    return [
        AdminUserListItem(
            uuid=u.uuid,
            name=u.name,
            team_uuid=u.team_uuid,
            platform_role=roles_by_user.get(str(u.uuid), {}).get("platform"),
            team_role=roles_by_user.get(str(u.uuid), {}).get("team"),
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
    """Grant a user a platform or team role, replacing any existing role of the same kind."""
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
        db, actor=current_user, name=body.name, type_=body.type
    )
    return TeamResponse(uuid=team.uuid, name=team.name, type=team.type, status=team.status)


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
        TeamResponse(uuid=t.uuid, name=t.name, type=t.type, status=t.status) for t in teams
    ]


@router.post("/teams/{team_uuid}/members", response_model=TeamMemberResponse)
async def add_team_member(
    team_uuid: UUID,
    body: TeamMemberRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Add a user to a team, optionally granting a team-kind role in the same call."""
    try:
        user = await admin_service.add_team_member(
            db, actor=current_user, team_uuid=str(team_uuid),
            user_uuid=str(body.user_uuid), team_role_name=body.team_role_name,
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except AdminConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    return TeamMemberResponse(uuid=user.uuid, team_uuid=user.team_uuid)


@router.delete("/teams/{team_uuid}/members/{user_uuid}", response_model=TeamMemberResponse)
async def remove_team_member(
    team_uuid: UUID,
    user_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Remove a user from a team, clearing any team-kind role grant they held."""
    try:
        user = await admin_service.remove_team_member(
            db, actor=current_user, team_uuid=str(team_uuid), user_uuid=str(user_uuid)
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    return TeamMemberResponse(uuid=user.uuid, team_uuid=user.team_uuid)
