"""Bulk import/export capability keys and seed grants (feature 015, ADR-110/111).

The grant matrix lives in `scripts/seed_rbac.py`. These tests assert it directly, and then
prove one role's grants actually resolve through the real DB-backed engine — a matrix that
is only consistent with itself would otherwise pass.
"""

import os
import pathlib

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.services.authz import require_scope
from scripts.seed_rbac import ROLES_DATA

BULK_PERMS = (Perm.STATION_EXPORT, Perm.STATION_IMPORT, Perm.TICKET_EXPORT, Perm.TICKET_IMPORT)

# ADR-111. Absent from a role's dict means "not granted at all" — deliberately not "none",
# so a missing key and an explicit no-op scope can never be confused.
EXPECTED_GRANTS = {
    "user": {},
    "data_auditor": {Perm.STATION_EXPORT: "all", Perm.TICKET_EXPORT: "all"},
    "super_admin": dict.fromkeys(BULK_PERMS, "all"),
    "admin": {
        Perm.STATION_EXPORT: "zone",
        Perm.STATION_IMPORT: "all",
        Perm.TICKET_EXPORT: "zone",
        Perm.TICKET_IMPORT: "all",
    },
    "member": {},
}


async def _assign_seed_role(db, user: User, role_name: str) -> None:
    """Build `role_name` in the DB straight from ROLES_DATA and assign it to `user`.

    Deliberately seeds from the real matrix rather than hand-written grants: the point is to
    catch a wrong scope in `seed_rbac.py`, and a hand-written fixture would just restate it.
    """
    spec = next(r for r in ROLES_DATA if r["name"] == role_name)
    role = Role(name=spec["name"], kind=spec["kind"])
    db.add(role)
    await db.flush()

    for perm, scope in spec["permissions"].items():
        result = await db.execute(select(Permission).where(Permission.key == perm.value))
        permission = result.scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(
            RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
            )
        )
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()


# --- capability catalog ---


def test_bulk_capability_keys_follow_the_naming_convention():
    """The three new keys are `<capability>.<action>`, matching the rest of the catalog."""
    assert Perm.STATION_EXPORT.value == "station.export"
    assert Perm.STATION_IMPORT.value == "station.import"
    assert Perm.TICKET_IMPORT.value == "ticket.import"
    assert Perm.TICKET_EXPORT.value == "ticket.export"  # pre-existing, wired up by this feature


def test_bulk_perms_are_never_public():
    """No bulk capability is reachable by an anonymous caller (ADR-025/027)."""
    assert not (set(BULK_PERMS) & PUBLIC_PERMS)


# --- seed matrix (ADR-111) ---


@pytest.mark.parametrize("role_name", sorted(EXPECTED_GRANTS))
def test_seed_matrix_matches_adr_111(role_name):
    """Each role's bulk grants are exactly what ADR-111 specifies — no more, no less."""
    spec = next(r for r in ROLES_DATA if r["name"] == role_name)
    actual = {p: scope for p, scope in spec["permissions"].items() if p in BULK_PERMS}
    assert actual == EXPECTED_GRANTS[role_name]


def test_ticket_export_is_no_longer_an_unwired_shell():
    """`ticket.export` existed with zero grants before this feature; it must now be granted."""
    holders = [r["name"] for r in ROLES_DATA if Perm.TICKET_EXPORT in r["permissions"]]
    assert holders, "ticket.export is still granted to nobody"


def test_import_is_never_granted_without_the_matching_write_capability():
    """ADR-110: holding import alone is a dead grant — every importer can also add/edit."""
    for spec in ROLES_DATA:
        perms = spec["permissions"]
        if Perm.STATION_IMPORT in perms:
            assert Perm.STATION_ADD in perms and Perm.STATION_EDIT in perms, spec["name"]
        if Perm.TICKET_IMPORT in perms:
            assert Perm.TICKET_ADD in perms and Perm.TICKET_EDIT in perms, spec["name"]


# --- the matrix actually resolving through the engine ---


@pytest.mark.asyncio
async def test_team_admin_exports_within_its_zone_but_imports_platform_wide(db):
    """Team admin: export is zone-scoped, import is `all` (ADR-111)."""
    actor = User(name="TeamAdmin")
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, "admin")

    assert await resolve_scope(actor, Perm.STATION_EXPORT, db) == Scope.ZONE
    assert await resolve_scope(actor, Perm.TICKET_EXPORT, db) == Scope.ZONE
    assert await resolve_scope(actor, Perm.STATION_IMPORT, db) == Scope.ALL
    assert await resolve_scope(actor, Perm.TICKET_IMPORT, db) == Scope.ALL


@pytest.mark.asyncio
async def test_data_auditor_exports_everything_but_cannot_import(db):
    """data_auditor is oversight-only: full export reach, no write path at all."""
    actor = User(name="Auditor")
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, "data_auditor")

    assert await resolve_scope(actor, Perm.STATION_EXPORT, db) == Scope.ALL
    assert await resolve_scope(actor, Perm.TICKET_EXPORT, db) == Scope.ALL
    for perm in (Perm.STATION_IMPORT, Perm.TICKET_IMPORT):
        with pytest.raises(HTTPException) as exc:
            await require_scope(actor, perm, db)
        assert exc.value.status_code == 403


@pytest.mark.parametrize("role_name", ["member", "user"])
@pytest.mark.asyncio
async def test_field_workers_and_citizens_hold_no_bulk_capability(db, role_name):
    """Batch operations have a far larger blast radius than single rows — not for them."""
    actor = User(name=role_name)
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, role_name)

    for perm in BULK_PERMS:
        with pytest.raises(HTTPException) as exc:
            await require_scope(actor, perm, db)
        assert exc.value.status_code == 403, perm


# --- documentation ---


def test_matrix_doc_lists_the_bulk_capabilities():
    """RBAC_RESOURCE_ROLE_MATRIX.md must name every capability seed_rbac.py grants."""
    matrix = pathlib.Path(__file__).resolve().parents[1] / "RBAC_RESOURCE_ROLE_MATRIX.md"
    text = matrix.read_text(encoding="utf-8")

    missing = [p.value for p in BULK_PERMS if p.value not in text]

    assert not missing, f"granted in seed_rbac.py but absent from the matrix: {missing}"
