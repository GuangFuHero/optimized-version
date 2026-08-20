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
from app.repositories.auth_repository import user_repository
from app.repositories.session_repository import SessionRepository
from app.schemas.admin import (
    AdminUserListItem,
    AssignRoleRequest,
    AssignRoleResponse,
    CreateTeamRequest,
    ProjectSettingsResponse,
    ProjectSettingsUpdate,
    TeamMemberRequest,
    TeamMemberResponse,
    TeamResponse,
)
from app.services import admin as admin_service
from app.services import project_settings as project_settings_service
from app.services.admin import AdminConflictError, AdminNotFoundError
from app.services.project_settings import ProjectSettingsValidationError

logger = logging.getLogger(__name__)

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


def _decode(value) -> str:
    """Redis runs in bytes mode (decode_responses=False); normalize a member to str."""
    return value.decode() if isinstance(value, bytes) else value


async def _session_counts(redis, user_uuids: list[str]) -> dict[str, int | None]:
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

        owners = [
            (index, _decode(sid))
            for index, members in enumerate(member_sets)
            for sid in members
        ]
        pipe = redis.pipeline()
        for _index, sid in owners:
            pipe.exists(SessionRepository.SESSION + sid)
        alive_flags = await pipe.execute()

        counts = [0] * len(user_uuids)
        for (index, _sid), alive in zip(owners, alive_flags, strict=True):
            if alive:
                counts[index] += 1
        return dict(zip(user_uuids, counts, strict=True))
    except Exception:  # noqa: BLE001 — any Redis failure degrades, never fails the listing
        logger.warning("Redis unavailable; omitting active_session_count", exc_info=True)
        return dict.fromkeys(user_uuids, None)


@router.get(
    "/users",
    response_model=list[AdminUserListItem],
    dependencies=[security.has_permission(Perm.USER_VIEW)],
)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
):
    """List users with their roles, last login/activity and live session count (checkpoint 1)."""
    users = await user_repository.get_multi(db, skip=skip, limit=limit)
    user_uuids = [str(u.uuid) for u in users]
    roles_by_user = await _role_names_by_user(db, user_uuids)
    sessions_by_user = await _session_counts(redis, user_uuids)
    return [
        AdminUserListItem(
            uuid=u.uuid,
            name=u.name,
            team_uuid=u.team_uuid,
            platform_role=roles_by_user.get(str(u.uuid), {}).get("platform"),
            team_role=roles_by_user.get(str(u.uuid), {}).get("team"),
            last_login_at=u.last_login_at,
            last_activity_at=u.last_activity_at,
            active_session_count=sessions_by_user.get(str(u.uuid)),
        )
        for u in users
    ]


def _project_settings_response(settings) -> ProjectSettingsResponse:
    """Render the settings row, or the empty shape while the deployment is unconfigured."""
    if settings is None:
        return ProjectSettingsResponse()
    return ProjectSettingsResponse(
        uuid=settings.uuid, name=settings.name,
        disaster_types=list(settings.disaster_types or []), started_at=settings.started_at,
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
        settings = await project_settings_service.update_project_settings(
            db, actor=current_user, values=values
        )
    except ProjectSettingsValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)
        ) from err
    return _project_settings_response(settings)


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
