"""Back-office review of role requests: list the applications, turn one down (Spec/019).

Mounted under /admin like the rest of the back office. The list is gated at the route by
role_request.review (checkpoint 1, like GET /admin/users); a decision stays thin (ADR-014)
and is gated in the service by `require_scope`, like the admin writes.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.models.auth import User
from app.schemas.role_request import (
    RoleRequestDecision,
    RoleRequestResponse,
    RoleRequestReviewItem,
    RoleRequestStatus,
)
from app.services import role_request as role_request_service
from app.services.role_request import RoleRequestConflictError, RoleRequestNotFoundError

router = APIRouter()


@router.get(
    "/role-requests",
    response_model=list[RoleRequestReviewItem],
    dependencies=[security.has_permission(Perm.ROLE_REQUEST_REVIEW)],
)
async def list_role_requests(
    status_filter: RoleRequestStatus | None = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(security.get_db),
):
    """Applications oldest first, so whoever applied first is reviewed first."""
    entries = await role_request_service.list_for_review(db, status=status_filter, skip=skip, limit=limit)
    return [
        RoleRequestReviewItem(
            **RoleRequestResponse.model_validate(entry.request).model_dump(),
            applicant_uuid=entry.request.created_by,
            applicant_name=entry.applicant_name,
        )
        for entry in entries
    ]


@router.post("/role-requests/{request_uuid}/reject", response_model=RoleRequestResponse)
async def reject_role_request(
    request_uuid: UUID,
    body: RoleRequestDecision,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Turn a pending application down. The applicant is told, with the note if there is one."""
    try:
        request = await role_request_service.reject(
            db, actor=current_user, request_uuid=request_uuid, note=body.note
        )
    except RoleRequestNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except RoleRequestConflictError as err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
    return request
