"""Minimal admin REST API: list users, assign roles, manage team members (ADR-013/022, T117).

Read-only listing is gated declaratively at the route (checkpoint 1 only, like Phase 2's
config queries — `user.view` carries no per-row scope in the current seed). The three
write endpoints stay thin (ADR-014): they only parse input and call an admin service
function, which performs both RBAC checkpoints itself via `require_scope` — mirroring how
GraphQL mutations call the service layer, just over REST instead.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.redis import get_redis
from app.models.auth import User
from app.schemas.admin import (
    AdminUserListItem,
    AssignRoleRequest,
    AssignRoleResponse,
    CreateTeamRequest,
    MapView,
    PlatformKey,
    ProjectSettingsResponse,
    ProjectSettingsUpdate,
    TeamMemberItem,
    TeamMemberRequest,
    TeamMemberResponse,
    TeamResponse,
    TeamStatusRequest,
    UpdateTeamRequest,
    UserSearch,
)
from app.services import admin as admin_service
from app.services import project_settings as project_settings_service
from app.services.admin import AdminConflictError, AdminNotFoundError, AdminValidationError
from app.services.project_settings import ProjectSettingsValidationError
from app.services.user_directory import PlatformUserDirectory, TeamMemberDirectory
from app.services.user_directory import TeamNotFoundError as UserDirectoryTeamNotFoundError

logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/users",
    response_model=list[AdminUserListItem],
    dependencies=[security.has_permission(Perm.USER_VIEW)],
)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    # A NUL reaches Postgres, which refuses it: a 422 here, not a 500 there (ADR-432).
    q: str | None = Query(
        None,
        max_length=100,
        pattern=r"^[^\x00]*$",
        description="Part of the nickname; full and half width match",
    ),
    platform_role: PlatformKey | None = Query(
        None,
        description="First that applies: super_admin, data_auditor, gov (in a gov team), "
        "ngo (in a team, none gov), user (no team, no other platform role)",
    ),
    team_uuid: UUID | None = Query(None, description="Only those holding a role in this team"),
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
    current_user: User = Depends(security.get_current_user),
):
    """List users with every identity they hold, plus last login/activity and live sessions.

    Feature 010 replaced the single platform/team role pair with the full identity list
    (ADR-073); feature 013 added the activity columns and the session count (ADR-093/094).
    Both land in the same row. Built by PlatformUserDirectory (Spec/026). `q`, `platform_role`
    and `team_uuid` narrow it and combine (ADR-412, ADR-432).
    """
    search = UserSearch(q=q, platform_role=platform_role, team_uuid=team_uuid)
    return await PlatformUserDirectory(db, current_user, redis, search).list(skip=skip, limit=limit)


@router.get(
    "/teams/{team_uuid}/members",
    response_model=list[TeamMemberItem],
    summary="列出 team 成員",
    responses={403: {"description": "Permission Denied"}, 404: {"description": "Team not found"}},
)
async def list_team_members(
    team_uuid: UUID,
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """One team's members and their role in it (Spec/026). team.member.view covering the team.

    Another team answers 404, so its existence is not given away (ADR-023).
    """
    try:
        return await TeamMemberDirectory(db, current_user, team_uuid).list(skip=skip, limit=limit)
    except UserDirectoryTeamNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


def _project_settings_response(settings, warnings: tuple[str, ...] = ()) -> ProjectSettingsResponse:
    """Render the settings row, or the empty shape while the deployment is unconfigured."""
    if settings is None:
        return ProjectSettingsResponse()
    return ProjectSettingsResponse(
        uuid=settings.uuid,
        name=settings.name,
        short_name=settings.short_name,
        disaster_types=list(settings.disaster_types or []),
        started_at=settings.started_at,
        map_view=(
            MapView(lat=settings.map_center_lat, lng=settings.map_center_lng, zoom=settings.map_zoom)
            if settings.map_zoom is not None
            else None
        ),
        warnings=list(warnings),
    )


@router.get(
    "/project-settings",
    response_model=ProjectSettingsResponse,
    summary="讀取專案（災害）設定",
    responses={403: {"description": "Permission Denied"}},
)
async def get_project_settings(
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Return what disaster this deployment is responding to (ADR-090)."""
    settings = await project_settings_service.get_project_settings(db, actor=current_user)
    return _project_settings_response(settings)


@router.patch(
    "/project-settings",
    response_model=ProjectSettingsResponse,
    summary="更新專案（災害）設定",
    responses={403: {"description": "Permission Denied"}},
)
async def update_project_settings(
    body: ProjectSettingsUpdate,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Upsert the single settings row; changing disaster_types re-scopes the dynamic fields.

    `exclude_unset` gives real PATCH semantics: an omitted field keeps its stored value,
    while an explicit `"started_at": null` clears it. `name` / `disaster_types` are NOT NULL
    columns, so an explicit null there is dropped rather than written.
    """
    values = body.model_dump(exclude_unset=True)
    for not_nullable in ("name", "disaster_types"):
        if values.get(not_nullable) is None:
            values.pop(not_nullable, None)
    try:
        result = await project_settings_service.update_project_settings(db, actor=current_user, values=values)
    except ProjectSettingsValidationError as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
    return _project_settings_response(result.settings, result.warnings)


@router.post("/users/{user_uuid}/role", response_model=AssignRoleResponse)
async def assign_role(
    user_uuid: UUID,
    body: AssignRoleRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Grant a user a PLATFORM role, replacing the other one they hold; `user` always stays.

    Assigning `user` takes the other one away, which is how to demote (019/ADR-294). Team roles
    go through POST /teams/{team_uuid}/members, where the team is unambiguous —
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
    responses={403: {"description": "Permission Denied"}, 409: {"description": "Name already taken"}},
)
async def create_team(
    body: CreateTeamRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Create a gov/ngo team (super_admin only, via team.edit at `all`). Names are unique (ADR-352)."""
    try:
        team = await admin_service.create_team(
            db, actor=current_user, name=body.name, type_=body.type, tax_id=body.tax_id
        )
    except AdminConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    return TeamResponse.model_validate(team)


@router.patch(
    "/teams/{team_uuid}",
    response_model=TeamResponse,
    summary="編輯 team（名稱、統編、聯絡人）",
    responses={
        403: {"description": "Permission Denied"},
        404: {"description": "Team not found"},
        409: {"description": "Name already taken"},
    },
)
async def update_team(
    team_uuid: UUID,
    body: UpdateTeamRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Edit a team: a team admin their own, a super admin any (Spec/026, ADR-357)."""
    try:
        team = await admin_service.update_team(
            db, actor=current_user, team_uuid=str(team_uuid), changes=body.model_dump(exclude_unset=True)
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except AdminConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    except AdminValidationError as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
    return TeamResponse.model_validate(team)


@router.post(
    "/teams/{team_uuid}/status",
    response_model=TeamResponse,
    summary="停用／恢復 team",
    responses={
        403: {"description": "Permission Denied"},
        404: {"description": "Team not found"},
    },
)
async def set_team_status(
    team_uuid: UUID,
    body: TeamStatusRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Super admin only. Suspending switches the team's identities off; restoring brings them back."""
    try:
        team = await admin_service.set_team_status(
            db, actor=current_user, team_uuid=str(team_uuid), new_status=body.status
        )
    except AdminNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    return TeamResponse.model_validate(team)


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
    return [TeamResponse.model_validate(t) for t in teams]


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
            db,
            actor=current_user,
            team_uuid=str(team_uuid),
            user_uuid=str(body.user_uuid),
            team_role_name=body.team_role_name,
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
    except AdminConflictError as err:  # the team's only admin (Spec/026, ADR-356)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    # None: they are out of this team now. A user may still belong to others — GET /admin/users
    # lists every identity they hold.
    return TeamMemberResponse(uuid=user.uuid, team_uuid=None)
