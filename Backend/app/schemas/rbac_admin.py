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


class IdentityPermissions(BaseModel):
    """One identity a user holds, and what it can actually do (ADR-098)."""

    role_uuid: UUID
    role: str
    kind: str
    team_uuid: UUID | None
    team: str | None
    effective: dict[str, str]


class DirectGrant(BaseModel):
    """One per-user grant and the identity it binds to (NULL team = the platform identity)."""

    capability: str
    scope: str
    team_uuid: UUID | None


class UserPermissionsResponse(BaseModel):
    """A user's identities with each one's effective permissions, plus their direct grants.

    Effective permissions are reported per identity rather than as one merged set, because
    after ADR-068 a user only ever exercises one identity at a time — a single merged answer
    would describe a state the user is never actually in (ADR-098).
    """

    user_uuid: UUID
    identities: list[IdentityPermissions]
    direct_grants: list[DirectGrant]
