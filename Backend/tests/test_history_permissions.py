"""Timeline capability keys and seed grants (feature 016, ADR-127/128).

The grant matrix lives in `scripts/seed_rbac.py`. These tests assert it directly, then
prove it resolves through the real DB-backed engine — a matrix that is only consistent
with itself would otherwise pass.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from scripts.seed_rbac import ROLES_DATA
from sqlalchemy import select

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from tests.conftest import acting_as

HISTORY_PERMS = (Perm.TICKET_VIEW_HISTORY, Perm.STATION_VIEW_HISTORY)

# ADR-128. Absent from a role's dict means "not granted at all" — deliberately not "none",
# so a missing key and an explicit no-op scope can never be confused.
EXPECTED_GRANTS = {
    "user": dict.fromkeys(HISTORY_PERMS, "own"),
    "data_auditor": dict.fromkeys(HISTORY_PERMS, "all"),
    "super_admin": dict.fromkeys(HISTORY_PERMS, "all"),
    # ADR-285: stations are governed by the team they are assigned to, tickets by zone.
    "admin": {Perm.TICKET_VIEW_HISTORY: "zone", Perm.STATION_VIEW_HISTORY: "team"},
    "member": {Perm.TICKET_VIEW_HISTORY: "zone", Perm.STATION_VIEW_HISTORY: "team"},
}


async def _assign_seed_role(db, user: User, role_name: str, *, team_type: str = "gov") -> None:
    """Build `role_name` in the DB straight from ROLES_DATA and assign it to `user`.

    A team-kind role gets a fresh team of `team_type`: the type matters since ADR-285, which
    widens a gov team's station `team` scope to `all`.

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

    # A team-kind role must carry a team and a platform-kind one must not (ADR-073's CHECK).
    team = None
    if spec["kind"] == "team":
        team = Team(name=f"team-for-{role_name}", type=team_type)
        db.add(team)
        await db.flush()
    db.add(UserRoleAssign(
        user_uuid=user.uuid, role_uuid=role.uuid,
        team_uuid=team.uuid if team is not None else None, role_kind=spec["kind"],
    ))
    # Without an active identity `get_user_permissions` returns {} — the fail-closed default
    # since feature 010, and not what these tests are exercising.
    acting_as(user, role, team)
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
    """ADR-128: each timeline tiers exactly like its own resource's view_pii, by design.

    Asserted as a relationship rather than as two independent tables so that moving
    view_pii without reconsidering the timeline fails here instead of drifting silently.
    """
    perms = next(r for r in ROLES_DATA if r["name"] == role_name)["permissions"]
    assert perms[Perm.TICKET_VIEW_HISTORY] == perms[Perm.TICKET_VIEW_PII]
    assert perms[Perm.STATION_VIEW_HISTORY] == perms[Perm.STATION_VIEW_PII]


def test_team_roles_never_get_team_scope_on_a_ticket_timeline():
    """ADR-128/ADR-049: `team` can never match a ticket.

    Tickets carry no team_uuid, so in_scope()'s TEAM branch resolves to False for every one.
    Granting `team` here would look like an authorization and behave like a denial. Stations
    are the exception since ADR-285 — they carry the team they are assigned to.
    """
    for spec in ROLES_DATA:
        assert spec["permissions"].get(Perm.TICKET_VIEW_HISTORY) != "team", spec["name"]


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
async def test_team_member_resolves_tickets_to_zone_and_stations_to_team(db):
    """A field worker reads tickets in its work zone and the stations its team runs (ADR-285).

    An ngo team on purpose: a gov team's station `team` scope widens to `all`.
    """
    actor = User(name="FieldWorker")
    db.add(actor)
    await db.flush()
    await _assign_seed_role(db, actor, "member", team_type="ngo")

    assert await resolve_scope(actor, Perm.TICKET_VIEW_HISTORY, db) == Scope.ZONE
    assert await resolve_scope(actor, Perm.STATION_VIEW_HISTORY, db) == Scope.TEAM


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


# --- five-tier visibility (ADR-130/141/142/284) ---

import uuid as uuidlib  # noqa: E402
from datetime import UTC, datetime  # noqa: E402

from app.models.audit import AuditLog  # noqa: E402
from app.models.request import Tickets  # noqa: E402
from app.services.history import (  # noqa: E402
    STATION,
    TICKET,
    Visibility,
    build_events,
    render_events,
    resolve_actors,
    resolve_visibility,
)

FULL = Visibility(pii=True, detail=True, audit=True)
NONE = Visibility(pii=False, detail=False, audit=False)


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


def test_view_detail_does_not_unmask_contact_details():
    """ADR-281 kept contact on `ticket.view_pii`: "where" and "who to call" are two lines.

    Every role that can open a timeline holds view_detail at `all` today, so collapsing the
    two tiers would compile and pass everything else while unmasking every phone number.
    """
    rows = [_audit_row("tickets", "UPDATE",
                       old={"contact_phone": "0912345678"},
                       new={"contact_phone": "0987654321"})]

    changes = _fields(_render(rows, Visibility(pii=False, detail=True)))

    assert changes["contact_phone"]["after"] == "09*****321"


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


def test_a_ticket_address_follows_view_detail_not_view_pii():
    """ADR-284: the timeline gates the address on the capability the single-row query uses.

    ADR-281 moved `secondaryLocation` from `ticket.view_pii` to `ticket.view_detail`; the
    timeline kept the old gate, so the two disagreed in both directions.
    """
    rows = [_audit_row("secondary_locations", "UPDATE",
                       old={"no": "12"}, new={"no": "34"})]

    pii_only = _fields(_render(rows, Visibility(pii=True, detail=False)))["no"]
    detail_only = _fields(_render(rows, Visibility(pii=False, detail=True)))["no"]

    assert pii_only == {"field": "no", "before": None, "after": None, "changed": True}
    assert detail_only["before"] == "12" and detail_only["after"] == "34"


@pytest.mark.parametrize(
    ("table", "field"),
    [
        ("tickets", "description"),
        ("ticket_tasks", "task_description"),
        ("ticket_tasks", "progress_note"),
        ("task_properties", "comment"),
    ],
)
def test_free_text_is_withheld_without_view_detail(table, field):
    """ADR-284: the free text ADR-281 withholds from the single-row query.

    Requesters write house numbers into descriptions; hiding the point and the address while
    the timeline still printed the text would be the "等於沒擋" ADR-281 exists to close.
    """
    rows = [_audit_row(table, "UPDATE",
                       old={field: "中正路 12 號二樓"}, new={field: "中正路 34 號二樓"})]

    withheld = _fields(_render(rows, Visibility(pii=True, detail=False)))[field]
    revealed = _fields(_render(rows, Visibility(pii=False, detail=True)))[field]

    assert withheld == {"field": field, "before": None, "after": None, "changed": True}
    assert revealed["after"] == "中正路 34 號二樓"


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


def test_a_tickets_geometry_move_follows_view_detail_not_view_pii():
    """A relocated help request points at somebody's home; a relocated shelter does not.

    ADR-284: the exact point is `ticket.view_detail` material (ADR-281), so the fact that it
    moved is too — view_pii alone no longer reveals it, and no longer needs to.
    """
    rows = [_audit_row("base_geometries", "UPDATE",
                       old={"geometry": "AA"}, new={"geometry": "BB"})]

    assert "geometry" not in _fields(_render(rows, Visibility(pii=True, detail=False)))
    assert "geometry" in _fields(_render(rows, Visibility(pii=False, detail=True)))


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

    mine = await resolve_visibility(db, actor=owner, resource=ticket, entity=TICKET)
    theirs = await resolve_visibility(db, actor=stranger, resource=ticket, entity=TICKET)

    assert mine.pii is True and mine.audit is False
    assert theirs.pii is False and theirs.audit is False


@pytest.mark.asyncio
async def test_view_detail_at_own_unlocks_detail_on_the_callers_ticket_only(db):
    """ADR-281 made view_detail narrowable without code, so checkpoint 2 must really run.

    The seed grants it at `all` to every role, which would hide a missing in_scope call.
    """
    owner = User(name="Detail owner")
    stranger = User(name="Detail stranger")
    db.add_all([owner, stranger])
    await db.flush()
    await _grant(db, owner, Perm.TICKET_VIEW_DETAIL, "own")
    await _grant(db, stranger, Perm.TICKET_VIEW_DETAIL, "own")
    ticket = await _ticket_owned_by(db, owner)

    mine = await resolve_visibility(db, actor=owner, resource=ticket, entity=TICKET)
    theirs = await resolve_visibility(db, actor=stranger, resource=ticket, entity=TICKET)

    assert mine.detail is True
    assert theirs.detail is False


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

    visibility = await resolve_visibility(db, actor=auditor, resource=ticket, entity=TICKET)

    assert visibility.pii is True and visibility.audit is True


@pytest.mark.asyncio
async def test_an_anonymous_caller_unlocks_nothing(db):
    """Guest never reaches the endpoint at all, but the helper must not assume that."""
    owner = User(name="Owner")
    db.add(owner)
    await db.flush()
    ticket = await _ticket_owned_by(db, owner)

    visibility = await resolve_visibility(db, actor=None, resource=ticket, entity=TICKET)

    assert visibility == Visibility(pii=False, detail=False, audit=False)


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


# --- PII uses the entity's own capability (ADR-197) -------------------------------------


async def _station_owned_by(db, owner):
    from app.models.geo import Station

    station = Station(
        uuid=uuidlib.uuid4(), property_name="station", created_by=str(owner.uuid),
        name="光復國小避難所", type="shelter", contact_name="王小姐",
    )
    db.add(station)
    await db.flush()
    return station


async def _grant(db, user: User, perm: Perm, scope: str) -> None:
    """Add one capability at one scope to `user`'s single identity.

    Reuses the identity when the caller grants a second capability: since feature 010 only
    the active identity's grants count, so two roles would leave the actor holding whichever
    one is active and none of the others.
    """
    identity_role = f"history-tests-{user.name}"
    role = (
        await db.execute(select(Role).where(Role.name == identity_role))
    ).scalars().first()
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalars().first() or Permission(key=perm.value)
    db.add(permission)
    if role is None:
        role = Role(name=identity_role, kind="platform")
        db.add(role)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid,
                              team_uuid=None, role_kind="platform"))
        acting_as(user, role)
    await db.flush()
    db.add(RolePermissionAssign(
        role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
    ))
    await db.flush()


@pytest.mark.asyncio
async def test_a_stations_pii_is_gated_on_station_view_pii(db):
    """Not on `ticket.view_pii` (ADR-197).

    `app/graphql/geo/types.py` gates a station's contact columns on STATION_VIEW_PII, and
    `history_fields.py` classifies them PII citing that same capability. Resolving the ticket
    key here made the timeline disagree with the single-row read on the same three columns.
    """
    holder = User(name="Station PII holder")
    db.add(holder)
    await db.flush()
    await _grant(db, holder, Perm.STATION_VIEW_PII, "all")
    station = await _station_owned_by(db, holder)

    visibility = await resolve_visibility(db, actor=holder, resource=station, entity=STATION)

    assert visibility.pii is True


@pytest.mark.asyncio
async def test_ticket_view_pii_does_not_unlock_a_stations_pii(db):
    """The other direction of the same swap — today both got the opposite."""
    holder = User(name="Ticket PII holder")
    db.add(holder)
    await db.flush()
    await _grant(db, holder, Perm.TICKET_VIEW_PII, "all")
    station = await _station_owned_by(db, holder)

    visibility = await resolve_visibility(db, actor=holder, resource=station, entity=STATION)

    assert visibility.pii is False


# --- the audit tier is Scope.ALL only (ADR-198) -----------------------------------------


@pytest.mark.parametrize("scope", ["own", "team", "gov", "ngo", "zone"])
@pytest.mark.asyncio
async def test_a_narrower_audit_view_does_not_unlock_the_audit_tier(db, scope):
    """`audit.view=zone` must not be identical to `audit.view=all` (ADR-198).

    There is no checkpoint 2 to narrow the tier against, so without the range condition every
    grant behaved as `all`. The seed only grants it at `all`, but `SetGrantRequest.scope`
    takes the bare enum, so the seed is not the guarantee.
    """
    holder = User(name=f"Auditor {scope}")
    db.add(holder)
    await db.flush()
    await _grant(db, holder, Perm.AUDIT_VIEW, scope)
    owner = User(name="Owner")
    db.add(owner)
    await db.flush()
    ticket = await _ticket_owned_by(db, owner)

    visibility = await resolve_visibility(db, actor=holder, resource=ticket, entity=TICKET)

    assert visibility.audit is False


@pytest.mark.asyncio
async def test_audit_view_at_all_still_unlocks_the_audit_tier(db):
    """The check must not break the case it sits in front of."""
    holder = User(name="Auditor all")
    db.add(holder)
    await db.flush()
    await _grant(db, holder, Perm.AUDIT_VIEW, "all")
    owner = User(name="Owner")
    db.add(owner)
    await db.flush()
    ticket = await _ticket_owned_by(db, owner)

    visibility = await resolve_visibility(db, actor=holder, resource=ticket, entity=TICKET)

    assert visibility.audit is True
