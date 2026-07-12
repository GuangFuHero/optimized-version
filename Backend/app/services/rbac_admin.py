"""Read-only RBAC admin surface (feature 009, Phase 1).

Reads only — no RBAC checkpoints here; the router gates every route on `rbac.view`
(checkpoint 1, super_admin only). Missing role/user raises RbacNotFoundError → 404.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.repositories.auth_repository import role_repository
from app.schemas.rbac_admin import (
    CapabilityCatalogResponse,
    CapabilityInfo,
    MatrixResponse,
    RoleGrants,
)


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


async def get_matrix(db: AsyncSession) -> MatrixResponse:
    """All roles with their capability->scope grants (the display grid)."""
    roles = await role_repository.list_all(db)
    grants_by_role: dict[str, dict[str, str]] = {}
    for role_uuid, key, scope in await role_repository.get_grants(db):
        grants_by_role.setdefault(role_uuid, {})[key] = scope
    return MatrixResponse(
        roles=[
            RoleGrants(
                uuid=role.uuid, name=role.name, kind=role.kind,
                grants=grants_by_role.get(str(role.uuid), {}),
            )
            for role in roles
        ]
    )
