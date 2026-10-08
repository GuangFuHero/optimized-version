"""Unit tests for seed_rbac idempotent-bootstrap behavior (feature 009, ADR-055)."""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
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

# Oversight by design: `data_auditor` writes nothing but reviews (ticket.review, ADR-312), so it
# is a documented exception rather than a gap. Recorded here so the exception has to be renewed
# deliberately if the role ever changes.
_OVERSIGHT_ONLY_ROLES = {"data_auditor"}

# The other way round: capabilities that only make sense for someone with no back-office
# identity yet. Applying to become staff (Spec/019) is refused to anyone who already is, so a
# team role or super_admin holding it would show a grant in the matrix that can never succeed.
_CITIZEN_ONLY_PERMS = {Perm.ROLE_REQUEST_ADD}


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
    baseline = set(_grants_of("user")) - _CITIZEN_ONLY_PERMS
    for role_name in ("super_admin", "admin", "member"):
        assert role_name not in _OVERSIGHT_ONLY_ROLES
        missing = baseline - set(_grants_of(role_name))
        assert not missing, f"{role_name} is missing citizen capabilities: {missing}"


# --- Role requests (Spec/019): who may apply, who decides -------------------------------------


def test_a_citizen_can_apply_for_a_backoffice_role():
    """Registration grants `user`, and the 申請成為後台人員 entry exists for exactly that account."""
    assert _grants_of("user")[Perm.ROLE_REQUEST_ADD] == "all"


def test_only_super_admin_reviews_role_requests():
    """Every option on the application form names the super admin as its reviewer."""
    from scripts.seed_rbac import ROLES_DATA

    holders = {
        role["name"]: role["permissions"][Perm.ROLE_REQUEST_REVIEW]
        for role in ROLES_DATA
        if Perm.ROLE_REQUEST_REVIEW in role["permissions"]
    }
    assert holders == {"super_admin": "all"}


def test_team_roles_reach_stations_by_team_not_zone():
    """ADR-285: a team governs the stations assigned to it; `zone` no longer means anything there.

    Exact dicts rather than "no zone anywhere", so a capability quietly dropped from a role
    fails here too.
    """
    def station_grants(role_name: str) -> dict[str, str]:
        return {
            perm.value: scope
            for perm, scope in _grants_of(role_name).items()
            if perm.value.startswith("station.") and scope not in ("all", "own")
        }

    assert station_grants("admin") == {
        "station.view_pii": "team",
        "station.view_history": "team",
        "station.edit": "team",
        "station.delete": "team",
        "station.review": "team",
        "station.export": "team",
    }
    assert station_grants("member") == {
        "station.view_pii": "team",
        "station.view_history": "team",
        "station.edit": "team",
    }


def test_station_assign_goes_to_super_admin_and_every_team_role():
    """ADR-285 decision 4: gov-only, fenced at runtime like work_zone.assign.

    Gov members assign too (Carol, 2026-09-24): a district commander is a gov member. The
    shared `admin`/`member` roles hand it to ngo teams as well; `require_gov_team` turns them
    away.
    """
    from app.core.permissions import Perm
    from scripts.seed_rbac import ROLES_DATA

    holders = {
        spec["name"]: spec["permissions"][Perm.STATION_ASSIGN]
        for spec in ROLES_DATA
        if Perm.STATION_ASSIGN in spec["permissions"]
    }
    assert holders == {"super_admin": "all", "admin": "all", "member": "all"}


def test_every_role_sees_who_to_call():
    """ADR-286: a requester's contact details, and the two triage answers, to anyone signed in.

    Volunteers could not reach the person they were going to help. Every role holds it at `all`,
    not only `user`: one identity is active at a time (ADR-097), and a team identity must not
    see less than a citizen. Guests stay masked — view_pii is not a public capability.
    """
    from app.core.permissions import Perm
    from scripts.seed_rbac import ROLES_DATA

    scopes = {spec["name"]: spec["permissions"].get(Perm.TICKET_VIEW_PII) for spec in ROLES_DATA}
    assert scopes == dict.fromkeys(("user", "data_auditor", "super_admin", "admin", "member"), "all")


def test_who_claimed_a_need_stays_with_the_requester_and_coordinators():
    """ADR-286: a need's claimant list follows ticket.view_history, which keeps the old tiering.

    With contact details open, a requester's name ties their account to a person; were the
    claimant list open as well, anyone signed in could follow a volunteer from need to need.
    """
    from app.core.permissions import Perm
    from scripts.seed_rbac import ROLES_DATA

    scopes = {spec["name"]: spec["permissions"].get(Perm.TICKET_VIEW_HISTORY) for spec in ROLES_DATA}
    assert scopes == {
        "user": "own", "data_auditor": "all", "super_admin": "all", "admin": "zone", "member": "zone",
    }


def test_reviewing_tickets_and_needs_is_the_back_offices():
    """ADR-312: a citizen cannot review even their own; members review their zone, auditors all."""
    from app.core.permissions import Perm
    from scripts.seed_rbac import ROLES_DATA

    scopes = {spec["name"]: spec["permissions"].get(Perm.TICKET_REVIEW) for spec in ROLES_DATA}
    assert scopes == {
        "user": None, "data_auditor": "all", "super_admin": "all", "admin": "zone", "member": "zone",
    }
