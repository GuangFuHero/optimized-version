"""Read-only RBAC admin REST endpoints (feature 009, Phase 1).

Every route is gated by `rbac.view` (super_admin only) via the router-level dependency —
checkpoint 1 only; reads carry no per-row scope.
"""

from fastapi import APIRouter

from app.core import security
from app.core.permissions import Perm
from app.schemas.rbac_admin import CapabilityCatalogResponse
from app.services import rbac_admin as rbac_admin_service

router = APIRouter(dependencies=[security.has_permission(Perm.RBAC_VIEW)])


@router.get("/rbac/capabilities", response_model=CapabilityCatalogResponse)
async def get_capabilities():
    """Capability catalog + scope values for the frontend's dropdowns (read-only)."""
    return rbac_admin_service.list_capabilities()
