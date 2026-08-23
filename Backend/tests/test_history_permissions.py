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
    # Reused when present: roles.name is unique, and a test that gives two actors different
    # roles would otherwise collide on the second one.
    role = (
        await db.execute(select(Role).where(Role.name == spec["name"]))
    ).scalars().first()

    if role is None:
        role = Role(name=spec["name"], kind=spec["kind"])
        db.add(role)
        await db.flush()
        for perm, scope in spec["permissions"].items():
            result = await db.execute(
                select(Permission).where(Permission.key == perm.value)
            )
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


# --- four-tier visibility (ADR-130/141/142) ---

import uuid as uuidlib  # noqa: E402
from datetime import UTC, datetime  # noqa: E402

from app.models.audit import AuditLog  # noqa: E402
from app.models.request import Tickets  # noqa: E402
from app.services.history import (  # noqa: E402
    TICKET,
    Visibility,
    build_events,
    render_events,
    resolve_actors,
    resolve_visibility,
)

FULL = Visibility(pii=True, audit=True)
NONE = Visibility(pii=False, audit=False)


def _audit_row(table, action, *, old=None, new=None, row_id=None, user=None):
    return AuditLog(
        uuid=uuidlib.uuid4(), table_name=table, action=action,
        row_id=row_id or uuidlib.uuid4(), old_values=old, new_values=new,
        user_uuid=user, created_at=datetime(2026, 8, 21, 9, 12, tzinfo=UTC),
    )


def _render(rows, visibility, entity=TICKET, names=None):
    return render_events(
        build_events(rows), entity=entity, names=names or {}, visibility=visibility
    )


def _fields(rendered):
    return {c["field"]: c for c in rendered[0]["changes"]}


def test_public_fields_need_no_extra_authority():
    """Passing *.view_history is enough for the business columns."""
    rows = [_audit_row("tickets", "UPDATE",
                       old={"status": "pending"}, new={"status": "in_progress"})]

    changes = _fields(_render(rows, NONE))

    assert changes["status"]["before"] == "pending"
    assert changes["status"]["after"] == "in_progress"


def test_contact_details_are_masked_without_view_pii():
    """Masked, not dropped: a masked value reads as "get authorized", not "no data"."""
    rows = [_audit_row("tickets", "UPDATE",
                       old={"contact_phone": "0912345678", "contact_name": "王小明"},
                       new={"contact_phone": "0987654321", "contact_name": "王大明"})]

    changes = _fields(_render(rows, NONE))

    assert changes["contact_phone"]["before"] == "09*****678"
    assert changes["contact_phone"]["after"] == "09*****321"
    assert changes["contact_name"]["after"] == "王◯◯"


def test_contact_details_are_raw_with_view_pii():
    """In scope, the timeline shows exactly what the single-row query would show."""
    rows = [_audit_row("tickets", "UPDATE",
                       old={"contact_phone": "0912345678"},
                       new={"contact_phone": "0987654321"})]

    changes = _fields(_render(rows, FULL))

    assert changes["contact_phone"]["after"] == "0987654321"


def test_a_ticket_address_is_withheld_rather_than_half_revealed():
    """ADR-142: no masker exists, and half an address would be fabricated location data."""
    rows = [_audit_row("secondary_locations", "UPDATE",
                       old={"county": "花蓮縣", "no": "12"},
                       new={"county": "花蓮縣", "no": "34"})]

    withheld = _fields(_render(rows, NONE))["no"]
    revealed = _fields(_render(rows, FULL))["no"]

    assert withheld == {"field": "no", "before": None, "after": None, "changed": True}
    assert revealed["before"] == "12" and revealed["after"] == "34"


def test_a_station_address_needs_no_authority_at_all():
    """The same table under a station: a shelter's location is already on the public map."""
    rows = [_audit_row("secondary_locations", "UPDATE",
                       old={"no": "12"}, new={"no": "34"})]

    changes = _fields(_render(rows, NONE, entity="station"))

    assert changes["no"]["before"] == "12" and changes["no"]["after"] == "34"


def test_geometry_never_carries_a_coordinate_even_at_the_top_tier():
    """ADR-141: WKB is unreadable and a decoded coordinate is location data."""
    rows = [_audit_row("base_geometries", "UPDATE",
                       old={"geometry": "0101000020E6100000AA"},
                       new={"geometry": "0101000020E6100000BB"})]

    changes = _fields(_render(rows, FULL, entity="station"))

    assert changes["geometry"] == {
        "field": "geometry", "before": None, "after": None, "changed": True,
    }


def test_a_tickets_geometry_move_is_hidden_without_view_pii():
    """A relocated help request points at somebody's home; a relocated shelter does not."""
    rows = [_audit_row("base_geometries", "UPDATE",
                       old={"geometry": "AA"}, new={"geometry": "BB"})]

    assert "geometry" not in _fields(_render(rows, NONE))
    assert "geometry" in _fields(_render(rows, FULL))


def test_review_columns_require_audit_view():
    """Internal review notes are oversight material, not part of the public timeline."""
    rows = [_audit_row("ticket_tasks", "UPDATE",
                       old={"status": "pending", "review_note": "電話打不通，疑似詐騙"},
                       new={"status": "rejected", "review_note": "已確認為誤報"})]

    without = _fields(_render(rows, Visibility(pii=True, audit=False)))
    with_audit = _fields(_render(rows, FULL))

    assert "review_note" not in without
    assert "status" in without, "the public column must survive the audit filter"
    assert with_audit["review_note"]["after"] == "已確認為誤報"


def test_the_raw_payload_is_attached_only_for_audit_view():
    """The escape hatch for oversight — and invisible to everyone else."""
    rows = [_audit_row("tickets", "UPDATE",
                       old={"status": "a", "search_text": "舊"},
                       new={"status": "b", "search_text": "新"})]

    assert "raw" not in _render(rows, Visibility(pii=True, audit=False))[0]
    assert _render(rows, FULL)[0]["raw"][0]["new_values"]["search_text"] == "新"


def test_search_text_never_appears_as_a_field_change():
    """Unclassified columns are dropped even for audit holders.

    RAW remains the only way to reach them, and it is labelled as raw rather than presented
    as a curated field change.
    """
    rows = [_audit_row("tickets", "UPDATE",
                       old={"search_text": "舊"}, new={"search_text": "新"})]

    assert _fields(_render(rows, FULL)) == {}


def test_the_raw_payload_never_contains_a_password_hash():
    """The trigger strips it (app/db/triggers.py); this is the regression guard.

    RAW is the one path that forwards audit values without a whitelist, so if the trigger
    ever stopped redacting, this is where it would surface.
    """
    rows = [_audit_row("tickets", "UPDATE", old={"status": "a"}, new={"status": "b"})]

    payload = _render(rows, FULL)[0]["raw"]

    for side in payload:
        for values in side.values():
            assert "password_hash" not in (values or {})


def test_an_event_survives_even_when_every_change_is_filtered_away():
    """Hiding it would misrepresent the timeline as quieter than it actually was."""
    rows = [_audit_row("tickets", "UPDATE",
                       old={"review_note": "內部"}, new={"review_note": "內部二"})]

    rendered = _render(rows, NONE)

    assert len(rendered) == 1
    assert rendered[0]["changes"] == []
    assert rendered[0]["event_type"] == "UPDATED"


def test_an_assignee_is_rendered_as_a_name_not_a_uuid():
    """ADR-143's single kept foreign key would be useless raw."""
    assignee = uuidlib.uuid4()
    rows = [_audit_row("task_assignments", "INSERT",
                       new={"task_uuid": str(uuidlib.uuid4()), "actor_uuid": str(assignee)})]

    changes = _fields(_render(rows, FULL, names={str(assignee): ("張三", False)}))

    assert changes["actor_uuid"]["after"] == "張三"


# --- visibility resolved from a real actor ---


async def _ticket_owned_by(db, owner):
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(owner.uuid),
        title="需要飲用水", contact_name="王小姐", status="pending", priority="high",
    )
    db.add(ticket)
    await db.flush()
    return ticket


@pytest.mark.asyncio
async def test_a_requester_unlocks_pii_on_their_own_ticket_only(db):
    """view_pii is `own` for a plain user, and checkpoint 2 decides which ticket that is."""
    owner = User(name="Owner")
    stranger = User(name="Stranger")
    db.add_all([owner, stranger])
    await db.flush()
    await _assign_seed_role(db, owner, "user")
    await _assign_seed_role(db, stranger, "user")
    ticket = await _ticket_owned_by(db, owner)

    mine = await resolve_visibility(db, actor=owner, resource=ticket)
    theirs = await resolve_visibility(db, actor=stranger, resource=ticket)

    assert mine.pii is True and mine.audit is False
    assert theirs.pii is False and theirs.audit is False


@pytest.mark.asyncio
async def test_an_auditor_unlocks_both_pii_and_audit(db):
    """Which is why the RAW tier needs no special case for super_admin either."""
    auditor = User(name="Auditor")
    db.add(auditor)
    await db.flush()
    await _assign_seed_role(db, auditor, "data_auditor")
    owner = User(name="Owner")
    db.add(owner)
    await db.flush()
    ticket = await _ticket_owned_by(db, owner)

    visibility = await resolve_visibility(db, actor=auditor, resource=ticket)

    assert visibility.pii is True and visibility.audit is True


@pytest.mark.asyncio
async def test_an_anonymous_caller_unlocks_nothing(db):
    """Guest never reaches the endpoint at all, but the helper must not assume that."""
    owner = User(name="Owner")
    db.add(owner)
    await db.flush()
    ticket = await _ticket_owned_by(db, owner)

    visibility = await resolve_visibility(db, actor=None, resource=ticket)

    assert visibility == Visibility(pii=False, audit=False)


@pytest.mark.asyncio
async def test_actor_names_are_resolved_in_one_batch(db):
    """A lookup per event would reintroduce the N+1 the REST shape avoids."""
    somebody = User(name="李四")
    db.add(somebody)
    await db.flush()
    events = build_events([
        _audit_row("tickets", "UPDATE", new={"status": "a"}, user=somebody.uuid),
        _audit_row("tickets", "UPDATE", new={"status": "b"}, user=somebody.uuid),
    ])

    names = await resolve_actors(db, events)

    assert names[str(somebody.uuid)] == ("李四", False)


@pytest.mark.asyncio
async def test_a_removed_user_keeps_their_name_and_gains_a_flag(db):
    """ADR-136: removal is a delete_at, so the row — and the name — stay."""
    gone = User(name="離職者", delete_at=datetime.now(UTC))
    db.add(gone)
    await db.flush()
    events = build_events([
        _audit_row("tickets", "UPDATE", new={"status": "a"}, user=gone.uuid),
    ])

    names = await resolve_actors(db, events)
    rendered = render_events(events, entity=TICKET, names=names, visibility=NONE)

    assert rendered[0]["actor"] == {
        "uuid": str(gone.uuid), "name": "離職者", "kind": "user", "is_removed": True,
    }
