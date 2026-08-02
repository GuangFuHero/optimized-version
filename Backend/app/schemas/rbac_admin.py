"""Pydantic schemas for the RBAC admin read surface (feature 009, Phase 1)."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.core.rbac_scopes import Scope

_RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class SetGrantRequest(BaseModel):
    """Upsert body for a single matrix cell; `scope` is validated against the Scope enum."""

    scope: Scope


class CreateRoleRequest(BaseModel):
    """Create-role body; kind is fixed to platform|team, name is trimmed and 1..50 chars."""

    name: _RoleName
    kind: Literal["platform", "team"]


class RenameRoleRequest(BaseModel):
    """Rename-role body (name only; kind is immutable)."""

    name: _RoleName


class CapabilityInfo(BaseModel):
    """One capability key, split for display.

    `public` = in PUBLIC_PERMS. `team_gov_only` (ADR-064) = held by a team-kind role it only
    takes effect on gov-type teams (work_zone.py `_require_gov_zone_authority`), so the matrix
    grant alone overstates what an ngo admin can do; the frontend shows a "gov teams only" note.
    """

    key: str
    resource: str
    action: str
    public: bool
    team_gov_only: bool = False


class CapabilityCatalogResponse(BaseModel):
    """The full capability catalog + allowed scope values (read-only, ADR-057)."""

    scopes: list[str]
    capabilities: list[CapabilityInfo]


class RoleGrants(BaseModel):
    """A role and its capability->scope grants."""

    uuid: UUID
    name: str
    kind: str
    grants: dict[str, str]


class MatrixResponse(BaseModel):
    """The whole role × capability × scope grid."""

    roles: list[RoleGrants]


class RoleRef(BaseModel):
    """A role a user holds."""

    uuid: UUID
    name: str
    kind: str


class UserPermissionsResponse(BaseModel):
    """A user's roles, direct grants, and resolved effective permissions."""

    user_uuid: UUID
    roles: list[RoleRef]
    direct_grants: dict[str, str]
    effective: dict[str, str]
