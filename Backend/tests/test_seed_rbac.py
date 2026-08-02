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
