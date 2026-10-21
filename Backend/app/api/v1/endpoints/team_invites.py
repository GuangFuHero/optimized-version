"""Team invite links over REST (Spec/026, ADR-353).

REST rather than GraphQL so "an expired link returns 404" is a real HTTP status (BE-038 step 1).
Two routers: the team admin's side under /admin, and the visitor's side under /invites, which
the site calls with `X-WG-Realm: site` so a visitor acts as their `user` grant (ADR-289).
Thin per ADR-014; the rules are in app/services/team_invite.py and app/services/role_request.py.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.schemas.team_invite import (
    InviteJoinRequest,
    InviteJoinResponse,
    InviteRequestRef,
    InviteResponse,
    InviteTeam,
    OpenedInviteResponse,
    PendingElsewhere,
)
from app.services import team_invite as team_invite_service
from app.services.role_request import RoleRequestConflictError, RoleRequestNotFoundError
from app.services.team_invite import InviteNotFoundError, TeamNotFoundError

admin_router = APIRouter()
router = APIRouter()

@admin_router.post(
    "/teams/{team_uuid}/invites",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="建立團隊邀請連結（24 小時）",
    responses={403: {"description": "Permission Denied"}, 404: {"description": "Team not found"}},
)
async def create_invite(
    team_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Issue a link anyone signed in can use, any number of times, for 24 hours."""
    try:
        invite = await team_invite_service.create_invite(db, actor=current_user, team_uuid=team_uuid)
    except TeamNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except ValueError as err:  # the team is not active: a link would 404 at once
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    return InviteResponse(**vars(invite))


@admin_router.get(
    "/teams/{team_uuid}/invites",
    response_model=list[InviteResponse],
    summary="列出團隊仍有效的邀請連結",
    responses={403: {"description": "Permission Denied"}, 404: {"description": "Team not found"}},
)
async def list_invites(
    team_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Links not yet expired, newest first."""
    try:
        invites = await team_invite_service.list_invites(db, actor=current_user, team_uuid=team_uuid)
    except TeamNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    return [InviteResponse(**vars(invite)) for invite in invites]


@router.get(
    "/{token}",
    response_model=OpenedInviteResponse,
    summary="打開邀請連結",
    responses={404: {"description": "Unknown, expired, or the team cannot be joined"}},
)
async def open_invite(
    token: str,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """The team behind the link, and the caller's pending request: for it, or for something else."""
    try:
        opened = await team_invite_service.open_invite(db, actor=current_user, token=token)
    except InviteNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    mine, other = opened.my_request, opened.pending_elsewhere
    return OpenedInviteResponse(
        team=InviteTeam(uuid=opened.team.uuid, name=opened.team.name, type=opened.team.type),
        expires_at=opened.expires_at,
        my_request=None if mine is None else InviteRequestRef(uuid=mine.uuid, created_at=mine.created_at),
        pending_elsewhere=None
        if other is None
        else PendingElsewhere(
            uuid=other.uuid,
            requested_role=other.requested_role,
            team_name=opened.pending_elsewhere_team_name,
            new_team_name=other.new_team_name,
            created_at=other.created_at,
        ),
    )


@router.post(
    "/{token}/requests",
    response_model=InviteJoinResponse,
    status_code=status.HTTP_201_CREATED,
    summary="透過邀請連結申請加入團隊",
    responses={
        404: {"description": "Unknown, expired, or the team cannot be joined"},
        409: {"description": "Already a member, or a request is pending"},
        422: {"description": "A field to fix"},
    },
)
async def request_to_join(
    token: str,
    body: InviteJoinRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """File a member request for the link's team; it waits in that team's and super admins' queues."""
    try:
        request = await team_invite_service.request_to_join(
            db, actor=current_user, token=token, name=body.name, reason=body.reason, email=body.email
        )
    except (InviteNotFoundError, RoleRequestNotFoundError) as err:
        # The team stopped being joinable between the link check and the submit: the link is dead.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found") from err
    except RoleRequestConflictError as err:  # already a member, or a request is pending
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    except ValueError as err:  # a field to fix
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
    return InviteJoinResponse(
        uuid=request.uuid,
        requested_role=request.requested_role,
        team_uuid=request.team_uuid,
        status=request.status,
        created_at=request.created_at,
    )
