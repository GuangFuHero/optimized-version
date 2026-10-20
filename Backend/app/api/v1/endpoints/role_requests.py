"""Back-office review of role requests: list the applications, approve or turn one down (Spec/019).

Mounted under /admin like the rest of the back office. Since Spec 026 a team admin reviews the
member requests for their own team (ADR-354), so the gate is in the service, which filters the
list and refuses decisions outside the caller's reach; the endpoints stay thin (ADR-014).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.schemas.role_request import (
    RoleRequestDecision,
    RoleRequestKind,
    RoleRequestResponse,
    RoleRequestReviewItem,
    RoleRequestStatus,
)
from app.services import role_request as role_request_service
from app.services.role_request import RoleRequestConflictError, RoleRequestNotFoundError

router = APIRouter()


@router.get("/role-requests", response_model=list[RoleRequestReviewItem])
async def list_role_requests(
    status_filter: RoleRequestStatus | None = Query(None, alias="status"),
    kind: RoleRequestKind | None = None,
    team_uuid: UUID | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Applications oldest first, so whoever applied first is reviewed first.

    A super admin sees every one; a team admin the member requests for their team.
    """
    entries = await role_request_service.list_for_review(
        db, actor=current_user, status=status_filter, kind=kind, team_uuid=team_uuid, skip=skip, limit=limit
    )
    return [
        RoleRequestReviewItem(
            **RoleRequestResponse.from_request(entry.request).model_dump(),
            applicant_uuid=entry.request.created_by,
            applicant_name=entry.applicant_name,
            team_name=entry.team_name,
        )
        for entry in entries
    ]


def _refusal(err: ValueError) -> HTTPException:
    """The status a decision's refusal answers with (Spec/019): 404, 409, else 422."""
    if isinstance(err, RoleRequestNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(err, RoleRequestConflictError):
        code = status.HTTP_409_CONFLICT
    else:
        code = status.HTTP_422_UNPROCESSABLE_ENTITY
    return HTTPException(status_code=code, detail=str(err))


@router.post("/role-requests/{request_uuid}/approve", response_model=RoleRequestResponse)
async def approve_role_request(
    request_uuid: UUID,
    body: RoleRequestDecision,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Grant a pending data auditor application; government and NGO ones are refused for now."""
    try:
        request = await role_request_service.approve(
            db, actor=current_user, request_uuid=request_uuid, note=body.note
        )
    except ValueError as err:
        raise _refusal(err) from err
    return RoleRequestResponse.from_request(request)


@router.post("/role-requests/{request_uuid}/reject", response_model=RoleRequestResponse)
async def reject_role_request(
    request_uuid: UUID,
    body: RoleRequestDecision,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Turn a pending application down. The note is required: it is the reason the applicant reads."""
    try:
        request = await role_request_service.reject(
            db, actor=current_user, request_uuid=request_uuid, note=body.note
        )
    except ValueError as err:
        raise _refusal(err) from err
    return RoleRequestResponse.from_request(request)
