"""Read-only RBAC admin surface (feature 009, Phase 1).

Reads only — no RBAC checkpoints here; the router gates every route on `rbac.view`
(checkpoint 1, super_admin only). Missing role/user raises RbacNotFoundError → 404.
"""

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.schemas.rbac_admin import CapabilityCatalogResponse, CapabilityInfo


class RbacNotFoundError(ValueError):
    """Raised when a role/user referenced by a read endpoint does not exist."""


def list_capabilities() -> CapabilityCatalogResponse:
    """Static capability catalog + scope enum for the frontend's dropdowns (ADR-057)."""
    capabilities = []
    for perm in Perm:
        resource, _, action = perm.value.partition(".")
        capabilities.append(
            CapabilityInfo(
                key=perm.value, resource=resource, action=action, public=perm in PUBLIC_PERMS
            )
        )
    return CapabilityCatalogResponse(
        scopes=[s.value for s in Scope], capabilities=capabilities
    )
