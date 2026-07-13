"""Read-only RBAC admin REST endpoints (feature 009, Phase 1).

Every route is gated by `rbac.view` (super_admin only) via the router-level dependency —
checkpoint 1 only; reads carry no per-row scope.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.models.auth import User
from app.schemas.rbac_admin import (
    CapabilityCatalogResponse,
    MatrixResponse,
    RoleGrants,
    SetGrantRequest,
    UserPermissionsResponse,
)
from app.services import rbac_admin as rbac_admin_service
from app.services.rbac_admin import RbacConflictError, RbacNotFoundError

router = APIRouter()

# Reads require rbac.view (checkpoint 1, super_admin only). Writes are gated in the service
# layer by require_scope(RBAC_EDIT) instead, so they don't inherit the view requirement.
_view_gate = [security.has_permission(Perm.RBAC_VIEW)]


@router.get("/rbac/capabilities", response_model=CapabilityCatalogResponse, dependencies=_view_gate)
async def get_capabilities():
    """Capability catalog + scope values for the frontend's dropdowns (read-only)."""
    return rbac_admin_service.list_capabilities()


@router.get("/rbac/matrix", response_model=MatrixResponse, dependencies=_view_gate)
async def get_matrix(db: AsyncSession = Depends(security.get_db)):
    """The full role × capability × scope grid."""
    return await rbac_admin_service.get_matrix(db)


@router.get("/rbac/roles/{role_uuid}", response_model=RoleGrants, dependencies=_view_gate)
async def get_role(role_uuid: UUID, db: AsyncSession = Depends(security.get_db)):
    """One role and its grants."""
    try:
        return await rbac_admin_service.get_role(db, str(role_uuid))
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/users/{user_uuid}/permissions",
    response_model=UserPermissionsResponse,
    dependencies=_view_gate,
)
async def get_user_permissions(user_uuid: UUID, db: AsyncSession = Depends(security.get_db)):
    """A user's roles, direct grants, and resolved effective permissions."""
    try:
        return await rbac_admin_service.get_user_permissions_detail(db, str(user_uuid))
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/rbac/roles/{role_uuid}/permissions/{cap}", response_model=RoleGrants)
async def set_role_permission(
    role_uuid: UUID,
    cap: Perm,
    body: SetGrantRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Upsert one role×capability matrix cell (super_admin only, via rbac.edit)."""
    try:
        return await rbac_admin_service.set_role_permission(
            db, actor=current_user, role_uuid=str(role_uuid), cap=cap, scope=body.scope
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
