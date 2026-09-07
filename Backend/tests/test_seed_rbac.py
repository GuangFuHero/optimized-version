"""Unit tests for seed_rbac idempotent-bootstrap behavior (feature 009, ADR-055)."""

import pytest
from sqlalchemy import select

from app.models.rbac import Permission, Role, RolePermissionAssign
from scripts.seed_rbac import ensure_role_grant


async def _role_and_perm(db) -> tuple[Role, Permission]:
    role = Role(name="seed_role", kind="platform")
    perm = Permission(key="ticket.edit")
    db.add(role)
    db.add(perm)
    await db.flush()
    return role, perm


@pytest.mark.asyncio
async def test_ensure_role_grant_inserts_when_absent(db_session):
    """A missing grant is inserted at the requested scope."""
    role, perm = await _role_and_perm(db_session)

    created = await ensure_role_grant(db_session, role=role, permission=perm, scope="own")
    await db_session.flush()

    assert created is True
    grant = (
        await db_session.execute(
            select(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role.uuid,
                RolePermissionAssign.permission_uuid == perm.uuid,
            )
        )
    ).scalar_one()
    assert grant.scope == "own"


@pytest.mark.asyncio
async def test_ensure_role_grant_never_overwrites_existing(db_session):
    """An existing grant's scope is left untouched (runtime edit survives re-seed)."""
    role, perm = await _role_and_perm(db_session)
    db_session.add(
        RolePermissionAssign(role_uuid=role.uuid, permission_uuid=perm.uuid, scope="all")
    )
    await db_session.flush()

    created = await ensure_role_grant(db_session, role=role, permission=perm, scope="own")
    await db_session.flush()

    assert created is False
    grant = (
        await db_session.execute(
            select(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role.uuid,
                RolePermissionAssign.permission_uuid == perm.uuid,
            )
        )
    ).scalar_one()
    assert grant.scope == "all"  # runtime edit preserved; seed did NOT overwrite


# --- ADR-097: every actionable identity must stand on its own -----------------------------

# Oversight-only by design: `data_auditor` holds no write capabilities at all, so it is a
# documented exception rather than a gap. Recorded here so the exception has to be renewed
# deliberately if the role ever changes.
_OVERSIGHT_ONLY_ROLES = {"data_auditor"}


def _grants_of(role_name: str) -> dict:
    """The seeded capability->scope map for one role."""
    from scripts.seed_rbac import ROLES_DATA

    return next(role["permissions"] for role in ROLES_DATA if role["name"] == role_name)


def test_every_actionable_role_covers_the_citizen_baseline():
    """Switching to a team identity must not lose abilities every citizen already has.

    Under the old union model, a team role inherited the platform `user` role's grants
    because both were always active. Identity switching keeps only one alive, so any
    capability a team role does not grant itself is one its holder silently loses on
    switching — which is how station.contribute went missing (ADR-097).
    """
    baseline = set(_grants_of("user"))
    for role_name in ("super_admin", "admin", "member"):
        assert role_name not in _OVERSIGHT_ONLY_ROLES
        missing = baseline - set(_grants_of(role_name))
        assert not missing, f"{role_name} is missing citizen capabilities: {missing}"
