"""Timeline capability keys and seed grants (feature 016, ADR-127/128).

The grant matrix lives in `scripts/seed_rbac.py`. These tests assert it directly, then
prove it resolves through the real DB-backed engine — a matrix that is only consistent
with itself would otherwise pass.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import select

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from scripts.seed_rbac import ROLES_DATA

HISTORY_PERMS = (Perm.TICKET_VIEW_HISTORY, Perm.STATION_VIEW_HISTORY)

# ADR-128. Absent from a role's dict means "not granted at all" — deliberately not "none",
# so a missing key and an explicit no-op scope can never be confused.
EXPECTED_GRANTS = {
    "user": dict.fromkeys(HISTORY_PERMS, "own"),
    "data_auditor": dict.fromkeys(HISTORY_PERMS, "all"),
    "super_admin": dict.fromkeys(HISTORY_PERMS, "all"),
    "admin": dict.fromkeys(HISTORY_PERMS, "zone"),
    "member": dict.fromkeys(HISTORY_PERMS, "zone"),
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


def test_history_capability_keys_follow_the_naming_convention():
    """Both keys are `<capability>.<action>`, matching the rest of the catalog."""
    assert Perm.TICKET_VIEW_HISTORY.value == "ticket.view_history"
    assert Perm.STATION_VIEW_HISTORY.value == "station.view_history"


def test_history_is_never_public():
    """ADR-127: a Guest gets no timeline, even though ticket.view itself is public.

    Sharing ticket.view would have been the cheap option; it would also have put staff
    names and review timings in front of anonymous visitors.
    """
    assert not (set(HISTORY_PERMS) & PUBLIC_PERMS)


# --- seed matrix (ADR-128) ---


@pytest.mark.parametrize("role_name", sorted(EXPECTED_GRANTS))
def test_seed_matrix_matches_adr_128(role_name):
    """Each role's timeline grants are exactly what ADR-128 specifies — no more, no less."""
    spec = next(r for r in ROLES_DATA if r["name"] == role_name)
    actual = {p: scope for p, scope in spec["permissions"].items() if p in HISTORY_PERMS}
    assert actual == EXPECTED_GRANTS[role_name]


@pytest.mark.parametrize("role_name", sorted(EXPECTED_GRANTS))
def test_history_scope_mirrors_view_pii(role_name):
    """ADR-128: the timeline tiers exactly like ticket.view_pii, by design.

    Asserted as a relationship rather than as two independent tables so that moving
    view_pii without reconsidering the timeline fails here instead of drifting silently.
    """
    perms = next(r for r in ROLES_DATA if r["name"] == role_name)["permissions"]
    assert perms[Perm.TICKET_VIEW_HISTORY] == perms[Perm.TICKET_VIEW_PII]
    assert perms[Perm.STATION_VIEW_HISTORY] == perms[Perm.TICKET_VIEW_PII]


def test_team_roles_never_get_team_scope_on_a_geo_resource():
    """ADR-128/ADR-049: `team` can never match a ticket or a station.

    base_geometries carries no team_uuid, so in_scope()'s TEAM branch resolves to False for
    every geo resource. Granting `team` here would look like an authorization and behave
    like a denial.
    """
    for spec in ROLES_DATA:
        for perm in HISTORY_PERMS:
            assert spec["permissions"].get(perm) != "team", f"{spec['name']}/{perm}"


def test_audit_view_is_no_longer_an_unwired_shell():
    """`audit.view` had zero enforcement before this feature; it now gates tiers 3 and 4."""
    holders = [r["name"] for r in ROLES_DATA if Perm.AUDIT_VIEW in r["permissions"]]
    assert holders == ["data_auditor", "super_admin"]


def test_raw_tier_holders_can_already_see_everything_anyway():
    """ADR-130: the RAW tier widens nobody's reach.

    It is only unlocked by audit.view, and both holders already read all data and all PII —
    so RAW adds internal columns, not access to records they could not otherwise see.
    """
    for spec in ROLES_DATA:
        if Perm.AUDIT_VIEW in spec["permissions"]:
            perms = spec["permissions"]
            assert perms[Perm.TICKET_VIEW_PII] == "all", spec["name"]
            assert perms[Perm.TICKET_VIEW] == "all", spec["name"]
            assert perms[Perm.STATION_VIEW] == "all", spec["name"]


# --- the matrix actually resolving through the engine ---


@pytest.mark.asyncio
async def test_requester_resolves_to_own(db):
    """A plain citizen follows their own ticket's history and nobody else's (ADR-128)."""
    actor = User(name="Requester")
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, "user")

    assert await resolve_scope(actor, Perm.TICKET_VIEW_HISTORY, db) == Scope.OWN
    assert await resolve_scope(actor, Perm.STATION_VIEW_HISTORY, db) == Scope.OWN


@pytest.mark.asyncio
async def test_team_member_resolves_to_zone(db):
    """A field worker reads the timeline of resources inside its team's work zone."""
    actor = User(name="FieldWorker")
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, "member")

    assert await resolve_scope(actor, Perm.TICKET_VIEW_HISTORY, db) == Scope.ZONE
    assert await resolve_scope(actor, Perm.STATION_VIEW_HISTORY, db) == Scope.ZONE


@pytest.mark.asyncio
async def test_auditor_resolves_to_all_and_unlocks_the_raw_tier(db):
    """data_auditor reads every timeline, and holds the audit.view that opens RAW."""
    actor = User(name="Auditor")
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, "data_auditor")

    assert await resolve_scope(actor, Perm.TICKET_VIEW_HISTORY, db) == Scope.ALL
    assert await resolve_scope(actor, Perm.STATION_VIEW_HISTORY, db) == Scope.ALL
    assert await resolve_scope(actor, Perm.AUDIT_VIEW, db) == Scope.ALL


@pytest.mark.asyncio
async def test_a_user_without_the_grant_gets_nothing(db):
    """No grant means Scope.NONE — the endpoint turns that into a 403 (ADR-127)."""
    actor = User(name="Nobody")
    db.add(actor)
    await db.flush()

    assert await resolve_scope(actor, Perm.TICKET_VIEW_HISTORY, db) == Scope.NONE
    assert await resolve_scope(actor, Perm.STATION_VIEW_HISTORY, db) == Scope.NONE
