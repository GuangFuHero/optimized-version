"""Read-only RBAC admin REST endpoints (feature 009, Phase 1).

Every route is gated by `rbac.view` (super_admin only) via the router-level dependency —
checkpoint 1 only; reads carry no per-row scope.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.schemas.rbac_admin import CapabilityCatalogResponse, MatrixResponse, RoleGrants
from app.services import rbac_admin as rbac_admin_service
from app.services.rbac_admin import RbacNotFoundError

router = APIRouter(dependencies=[security.has_permission(Perm.RBAC_VIEW)])


@router.get("/rbac/capabilities", response_model=CapabilityCatalogResponse)
async def get_capabilities():
    """Capability catalog + scope values for the frontend's dropdowns (read-only)."""
    return rbac_admin_service.list_capabilities()


@router.get("/rbac/matrix", response_model=MatrixResponse)
async def get_matrix(db: AsyncSession = Depends(security.get_db)):
    """The full role × capability × scope grid."""
    return await rbac_admin_service.get_matrix(db)


@router.get("/rbac/roles/{role_uuid}", response_model=RoleGrants)
async def get_role(role_uuid: UUID, db: AsyncSession = Depends(security.get_db)):
    """One role and its grants."""
    try:
        return await rbac_admin_service.get_role(db, str(role_uuid))
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
