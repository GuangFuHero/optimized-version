"""Read-only RBAC admin surface (feature 009, Phase 1).

Reads only — no RBAC checkpoints here; the router gates every route on `rbac.view`
(checkpoint 1, super_admin only). Missing role/user raises RbacNotFoundError → 404.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import GOV_TEAM_ONLY_PERMS, PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.models.auth import User
from app.models.rbac import UserRoleAssign
from app.models.team import Team
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.auth_repository import (
    permission_repository,
    role_repository,
    user_repository,
)
from app.schemas.rbac_admin import (
    CapabilityCatalogResponse,
    CapabilityInfo,
    DirectGrant,
    IdentityPermissions,
    MatrixResponse,
    RoleGrants,
    UserPermissionsResponse,
)
from app.services.admin import SUPER_ADMIN_ROLE_NAME, _remaining_super_admins
from app.services.auth_account import DEFAULT_PLATFORM_ROLE
from app.services.authz import require_scope

# Capabilities super_admin must never lose, or it could lock itself out of RBAC management.
_SUPER_ADMIN_LOCKED_CAPS = {Perm.RBAC_EDIT, Perm.RBAC_ASSIGN}

# ADR-061: rbac.* is super_admin-only governance and cannot be delegated at runtime — no
# other role may hold it, and it can never become a per-user grant. Derived by prefix so a
# newly added rbac.* capability is covered without touching this guard.
_RBAC_GOVERNANCE_CAPS = frozenset(p for p in Perm if p.value.startswith("rbac."))

# Role names the code references directly; renaming/deleting them breaks flows (ADR-059):
# super_admin gates every RBAC guard; `user` is the default role new registrations get.
PROTECTED_ROLE_NAMES = {SUPER_ADMIN_ROLE_NAME, DEFAULT_PLATFORM_ROLE}


class RbacNotFoundError(ValueError):
    """Raised when a role/user referenced by a read endpoint does not exist."""


class RbacConflictError(ValueError):
    """A write would violate an RBAC invariant (e.g. stripping super_admin's rbac.edit)."""


def list_capabilities() -> CapabilityCatalogResponse:
    """Static capability catalog + scope enum for the frontend's dropdowns (ADR-057)."""
    capabilities = []
    for perm in Perm:
        resource, _, action = perm.value.partition(".")
        capabilities.append(
            CapabilityInfo(
                key=perm.value,
                resource=resource,
                action=action,
                public=perm in PUBLIC_PERMS,
                team_gov_only=perm in GOV_TEAM_ONLY_PERMS,
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


async def get_role(db: AsyncSession, role_uuid: str) -> RoleGrants:
    """One role and its grants; raises RbacNotFoundError if the role does not exist."""
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")
    grants = {key: scope for _, key, scope in await role_repository.get_grants(db, role_uuid=role_uuid)}
    return RoleGrants(uuid=role.uuid, name=role.name, kind=role.kind, grants=grants)


async def get_user_permissions_detail(db: AsyncSession, user_uuid: str) -> UserPermissionsResponse:
    """A user's identities, each with its own effective permissions, plus their direct grants.

    One identity, one answer (ADR-178). Resolving each separately costs one pair of queries
    per identity, which is what the admin view is for; nobody holds enough identities for
    that to matter.
    """
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise RbacNotFoundError("User not found")
    identities = await active_identity_repository.list_for_user(db, user_uuid)
    roles_by_uuid = {str(role.uuid): role for role in await user_repository.get_role_refs(db, user_uuid)}
    direct = await user_repository.get_direct_grants(db, user_uuid)

    reported = []
    for identity in identities:
        effective = await user_repository.get_user_permissions(db, user_uuid, identity=identity)
        role = roles_by_uuid.get(identity.role_uuid)
        reported.append(
            IdentityPermissions(
                role_uuid=identity.role_uuid,
                role=identity.role_name,
                kind=role.kind if role else ("platform" if identity.is_platform else "team"),
                team_uuid=identity.team_uuid,
                team=identity.team_name,
                effective={key: scope.value for key, scope in effective.items()},
            )
        )
    return UserPermissionsResponse(
        user_uuid=user.uuid,
        identities=reported,
        direct_grants=[
            DirectGrant(capability=key, scope=scope, team_uuid=team) for key, scope, team in direct
        ],
    )


async def set_role_permission(
    db: AsyncSession, *, actor: User, role_uuid: str, cap: Perm, scope: Scope
) -> RoleGrants:
    """Upsert one matrix cell (role→capability→scope). Checkpoint 1: rbac.edit, super_admin only.

    Guard (ADR-056): super_admin must not have rbac.edit/rbac.assign scoped down to `none`.
    """
    await require_scope(actor, Perm.RBAC_EDIT, db)

    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")

    # ADR-061: rbac.* stays super_admin-only — it cannot be delegated to any other role.
    if cap in _RBAC_GOVERNANCE_CAPS and role.name != SUPER_ADMIN_ROLE_NAME:
        raise RbacConflictError(
            f"{cap.value} is super_admin-only and cannot be granted to '{role.name}'"
        )

    if (
        role.name == SUPER_ADMIN_ROLE_NAME
        and cap in _SUPER_ADMIN_LOCKED_CAPS
        and scope == Scope.NONE
    ):
        raise RbacConflictError(f"Cannot remove {cap.value} from {SUPER_ADMIN_ROLE_NAME}")

    permission = await permission_repository.ensure_by_key(db, cap.value)
    await role_repository.upsert_grant(
        db, role_uuid=role_uuid, permission_uuid=str(permission.uuid), scope=scope.value
    )
    return await get_role(db, role_uuid)


async def revoke_role_permission(
    db: AsyncSession, *, actor: User, role_uuid: str, cap: Perm
) -> None:
    """Revoke one matrix cell. Checkpoint 1: rbac.edit, super_admin only. Idempotent.

    Guard (ADR-056): super_admin must not lose rbac.edit/rbac.assign.
    """
    await require_scope(actor, Perm.RBAC_EDIT, db)

    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")

    if role.name == SUPER_ADMIN_ROLE_NAME and cap in _SUPER_ADMIN_LOCKED_CAPS:
        raise RbacConflictError(f"Cannot remove {cap.value} from {SUPER_ADMIN_ROLE_NAME}")

    permission = await permission_repository.get_by_key(db, cap.value)
    if permission is None:
        return  # nothing registered → nothing to revoke (idempotent)
    await role_repository.delete_grant(
        db, role_uuid=role_uuid, permission_uuid=str(permission.uuid)
    )


async def _require_team(db: AsyncSession, team_uuid: str | None) -> None:
    """404 when `team_uuid` names a team that does not exist (ADR-186).

    The value arrives as a query parameter on an admin endpoint and goes straight into a
    FK column, so without this an unknown UUID surfaces as an unhandled
    ForeignKeyViolationError — a 500 for what is a caller mistake. Same bug class the `act`
    claim's uuid validation closed; this is the entry point that was missed. Matches how the
    user and capability lookups on the same endpoints already behave.
    """
    if team_uuid is None:
        return
    if await db.get(Team, team_uuid) is None:
        raise RbacNotFoundError("Team not found")


async def set_user_permission(
    db: AsyncSession,
    *,
    actor: User,
    user_uuid: str,
    cap: Perm,
    scope: Scope,
    team_uuid: str | None = None,
) -> UserPermissionsResponse:
    """Add/update one per-user additive grant. Checkpoint 1: rbac.assign, super_admin only."""
    await require_scope(actor, Perm.RBAC_ASSIGN, db)
    # ADR-061: rbac.* is role-bound governance; it is never handed out as a per-user grant.
    if cap in _RBAC_GOVERNANCE_CAPS:
        raise RbacConflictError(f"{cap.value} cannot be a per-user grant")
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise RbacNotFoundError("User not found")
    await _require_team(db, team_uuid)
    permission = await permission_repository.ensure_by_key(db, cap.value)
    await user_repository.upsert_grant(
        db,
        user_uuid=user_uuid,
        permission_uuid=str(permission.uuid),
        scope=scope.value,
        team_uuid=team_uuid,
    )
    return await get_user_permissions_detail(db, user_uuid)


async def revoke_user_permission(
    db: AsyncSession, *, actor: User, user_uuid: str, cap: Perm, team_uuid: str | None = None
) -> None:
    """Remove one per-user grant. Checkpoint 1: rbac.assign. Idempotent."""
    await require_scope(actor, Perm.RBAC_ASSIGN, db)
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise RbacNotFoundError("User not found")
    permission = await permission_repository.get_by_key(db, cap.value)
    if permission is None:
        return
    await user_repository.delete_grant(
        db, user_uuid=user_uuid, permission_uuid=str(permission.uuid), team_uuid=team_uuid
    )


async def create_role(db: AsyncSession, *, actor: User, name: str, kind: str) -> RoleGrants:
    """Create a new empty role. Checkpoint 1: rbac.edit. Reserved/duplicate name → 409."""
    await require_scope(actor, Perm.RBAC_EDIT, db)
    if name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"'{name}' is a reserved role name")
    if await role_repository.get_by_name(db, name) is not None:
        raise RbacConflictError(f"Role '{name}' already exists")
    try:
        role = await role_repository.create(db, obj_in={"name": name, "kind": kind})
    except IntegrityError as err:
        # ADR-060: name claimed in the window between the pre-check and our commit → 409, not 500.
        await db.rollback()
        raise RbacConflictError(f"Role '{name}' already exists") from err
    return RoleGrants(uuid=role.uuid, name=role.name, kind=role.kind, grants={})


async def rename_role(db: AsyncSession, *, actor: User, role_uuid: str, name: str) -> RoleGrants:
    """Rename a role. Checkpoint 1: rbac.edit. Protected role / protected or taken name → 409."""
    await require_scope(actor, Perm.RBAC_EDIT, db)
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")
    if role.name == name:
        return await get_role(db, role_uuid)  # no-op
    if role.name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"Cannot rename the '{role.name}' role")
    if name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"'{name}' is a reserved role name")
    if await role_repository.get_by_name(db, name) is not None:
        raise RbacConflictError(f"Role '{name}' already exists")
    try:
        await role_repository.update(db, db_obj=role, obj_in={"name": name})
    except IntegrityError as err:
        # ADR-060: target name claimed in the TOCTOU window → 409, not 500.
        await db.rollback()
        raise RbacConflictError(f"Role '{name}' already exists") from err
    return await get_role(db, role_uuid)


async def delete_role(db: AsyncSession, *, actor: User, role_uuid: str) -> None:
    """Delete a role and its grants. Checkpoint 1: rbac.edit.

    Guards: protected role → 409; any remaining UserRoleAssign → 409 (reassign first, ADR-056).
    """
    await require_scope(actor, Perm.RBAC_EDIT, db)
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")
    if role.name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"Cannot delete the '{role.name}' role")
    if await role_repository.count_assignments(db, role_uuid) > 0:
        raise RbacConflictError("Role still has members; reassign them before deleting")
    await role_repository.delete_with_grants(db, role_uuid)


async def unassign_user_role(
    db: AsyncSession, *, actor: User, user_uuid: str, role_uuid: str, team_uuid: str | None = None
) -> None:
    """Remove one identity (role, optionally in a team) from a user. Checkpoint 1: rbac.assign.

    `team_uuid` names which identity to revoke: the same role held in two teams is two
    identities (ADR-073), and revoking has to say which. Omitting it means the platform
    identity, matching the old single-identity behaviour.

    Guard: refuses to drop the last super_admin (ADR-032/056). 404 if the user, the role,
    or the assignment itself does not exist.

    **A platform role cannot be unassigned at all** (ADR-185). A user holds at most one —
    every platform grant replaces the previous one (`admin_service.assign_role`, and
    `user_repository.assign_role` since ADR-184) — so removing it always leaves the account
    with no platform identity, which resolves to zero grants even while they still hold team
    roles. Spec/010 §7's "回去原有登入狀態" is reached by logging back in onto the platform
    identity, so an account without one cannot get there.

    Demotion is an `assign_role` to the lesser role, which replaces in one step. That is what
    the error points the caller at. Revoking a *team* identity is unaffected: it names its
    team, and losing it leaves the platform identity intact.
    """
    await require_scope(actor, Perm.RBAC_ASSIGN, db)
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")

    if team_uuid is None and role.kind == "platform":
        raise RbacConflictError(
            "A platform role cannot be removed, only replaced — assign the role you want the "
            "user to have instead (same-kind replacement). Removing it would leave the "
            "account with no platform identity and therefore no permissions at all."
        )

    assignment = (
        await db.execute(
            select(UserRoleAssign).where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.role_uuid == role_uuid,
                UserRoleAssign.team_uuid.is_not_distinct_from(team_uuid),
            )
        )
    ).scalars().first()
    if assignment is None:
        raise RbacNotFoundError("User is not assigned this role")

    if role.name == SUPER_ADMIN_ROLE_NAME:
        remaining = await _remaining_super_admins(db, role_uuid, excluding=user_uuid)
        if remaining == 0:
            raise RbacConflictError("Cannot remove the last super_admin")

    await user_repository.unassign_role(
        db, user_uuid=user_uuid, role_uuid=role_uuid, team_uuid=team_uuid
    )
