"""Capability-key catalog (ADR-012).

Single source of truth for permission keys — seed data and every RBAC check must use
these constants, never a raw string (Spec/008-rbac-authorization/decisions.md §3).

Naming: `<capability>.<action>`, derived from the Dashboard v1.0 spec's 11-module ×
Operation-Code matrix. Only modules that exist (or are the next thing being built) get a
key here — FILTER/REFRESH/RESET are frontend-only UI state, not permissions.
"""

from enum import StrEnum


class Perm(StrEnum):
    """A capability key. Every RBAC check (checkpoint 1) is keyed on one of these."""

    # Dashboard is a derived/aggregate view (ADR-049): its visibility is inherited from the
    # source modules (see tickets if you have ticket.view, etc.), so it holds no permission
    # of its own — no DASHBOARD_* keys here on purpose.

    # Ticket (PII split from the ticket itself: view != view_pii)
    TICKET_VIEW = "ticket.view"
    TICKET_VIEW_PII = "ticket.view_pii"
    # ADR-281: everything that places the reporter or tells their story in their own words —
    # the exact point, the street address, the free text, the photos, the review notes, who
    # filed it. Not a reuse of ticket.view (public, ADR-027) nor of ticket.view_pii (contact
    # details and triage answers, role-scoped): the seed grants this one to every role at
    # `all`, so today it reads "signed in", but it stays a scope an admin can narrow at
    # runtime. Without it the point comes back as the centre of an H3 cell (app/db/h3.py).
    TICKET_VIEW_DETAIL = "ticket.view_detail"
    # Feature 016 (ADR-127): the change timeline is its own capability, not a reuse of
    # audit.view — that key is auditor-only, while the requirement is that a requester can
    # follow their own ticket. Not a reuse of ticket.view either: that one is in
    # PUBLIC_PERMS, so sharing it would put staff names and review timings in front of
    # anonymous visitors. Scoped like view_pii, since it exposes the same order of detail.
    TICKET_VIEW_HISTORY = "ticket.view_history"
    TICKET_ADD = "ticket.add"
    TICKET_EDIT = "ticket.edit"
    TICKET_DELETE = "ticket.delete"
    TICKET_ASSIGN = "ticket.assign"
    TICKET_REVIEW = "ticket.review"
    TICKET_EXPORT = "ticket.export"  # registered since RBAC v1; first enforced by feature 015
    TICKET_IMPORT = "ticket.import"  # see the bulk note under Resource Station below

    # Resource Station
    STATION_VIEW = "station.view"
    STATION_VIEW_PII = "station.view_pii"
    # Feature 016 (ADR-127/128): same reasoning as ticket.view_history, and deliberately the
    # same scope tiering — a station's timeline names the people who edited it.
    STATION_VIEW_HISTORY = "station.view_history"
    STATION_ADD = "station.add"
    STATION_EDIT = "station.edit"
    STATION_DELETE = "station.delete"
    STATION_REVIEW = "station.review"
    # ADR-285: hand a station to the one team that runs it (or take it back). Gov-only, like
    # work_zone.assign — see GOV_TEAM_ONLY_PERMS.
    STATION_ASSIGN = "station.assign"
    # Undoing an applied suggestion merge is its own capability because team admins also hold
    # station.review, and revoke is meant for platform-wide reviewers only.
    STATION_REVOKE = "station.revoke"
    # Open crowd-sourcing: attach a property or submit a rating to ANY station (no ownership
    # check — deliberately capability-only, not scoped like station.edit=own). See station.py.
    STATION_CONTRIBUTE = "station.contribute"
    # Bulk export/import (feature 015, ADR-110). Import is deliberately NOT a reuse of
    # add/edit: one file can rewrite hundreds of rows, so the batch capability is separable
    # from the single-row one. It is not a replacement either — every imported row still
    # runs the *.add / *.edit checkpoints it would have run had it been typed in by hand,
    # so import alone is a dead grant (asserted in tests/test_bulk_permissions.py).
    STATION_EXPORT = "station.export"
    STATION_IMPORT = "station.import"

    # Interactive Map (tiles, closure areas — the map *overlay*, distinct from the Station entity)
    MAP_VIEW = "map.view"
    MAP_ADD = "map.add"
    MAP_EDIT = "map.edit"
    MAP_DELETE = "map.delete"

    # AI Duplicate Review
    AI_DUP_VIEW = "ai_duplicate.view"
    AI_DUP_REVIEW = "ai_duplicate.review"

    # User Management
    USER_VIEW = "user.view"
    USER_ADD = "user.add"
    USER_EDIT = "user.edit"
    USER_DELETE = "user.delete"

    # Team Management
    TEAM_VIEW = "team.view"
    TEAM_EDIT = "team.edit"
    TEAM_MEMBER_MANAGE = "team.member.manage"

    # Work Zone (gov-drawn disaster response boundaries — ADR-021, Phase 4/T119)
    ZONE_VIEW = "work_zone.view"
    ZONE_ADD = "work_zone.add"
    ZONE_EDIT = "work_zone.edit"
    ZONE_ASSIGN = "work_zone.assign"
    ZONE_DELETE = "work_zone.delete"

    # Dynamic Fields (station/task property config)
    FIELD_VIEW = "dynamic_field.view"
    FIELD_ADD = "dynamic_field.add"
    FIELD_EDIT = "dynamic_field.edit"
    FIELD_DELETE = "dynamic_field.delete"

    # Project Settings (the deployment's disaster name / types — feature 013, ADR-090)
    # Its own capability rather than a reuse of dynamic_field.edit: changing the disaster
    # types flips the visibility of a whole batch of fields at once, which is a much heavier
    # act than editing one field's definition.
    PROJECT_VIEW = "project.view"
    PROJECT_EDIT = "project.edit"

    # Emergency Announcement
    ANN_VIEW = "announcement.view"
    ANN_PUBLISH = "announcement.publish"
    ANN_EDIT = "announcement.edit"
    ANN_DELETE = "announcement.delete"

    # Pre-Departure Notice (行前通知) — briefing templates + generated briefings.
    # PREDEP_DELETE was added when the feature landed; the other three predate it as
    # ahead-of-feature placeholders (ADR-026 era). Shape mirrors ANN_* deliberately: both
    # are admin-authored content with a public read.
    PREDEP_VIEW = "pre_departure.view"
    PREDEP_PUBLISH = "pre_departure.publish"
    PREDEP_EDIT = "pre_departure.edit"
    PREDEP_DELETE = "pre_departure.delete"

    # Audit Log
    AUDIT_VIEW = "audit.view"

    # RBAC self-management (Super Admin only)
    RBAC_VIEW = "rbac.view"
    RBAC_ASSIGN = "rbac.assign"
    RBAC_EDIT = "rbac.edit"


# ADR-025/027: read-only capabilities the whole world holds — `check_permission` resolves
# these to Scope.ALL for every caller, authenticated or not, because the map, shelter list,
# help-request board and 公告/行前通知 are all readable without an account. `ticket.view_pii`
# is deliberately absent: PII always needs a real actor and is redacted per-field (ADR-029).
# So is `ticket.view_detail`: withholding it from the anonymous caller is its whole point
# (ADR-281).
PUBLIC_PERMS = frozenset(
    {Perm.MAP_VIEW, Perm.ANN_VIEW, Perm.STATION_VIEW, Perm.TICKET_VIEW, Perm.PREDEP_VIEW}
)

# ADR-064: capabilities that, for a team-kind holder, only take effect when the actor's team
# is gov-type. Checkpoint 1 (holding the grant) is not enough — work_zone.py's
# `_require_gov_zone_authority` (ADR-063 [6]) additionally requires a gov team, so an ngo
# admin holds these in the seed matrix but is blocked in practice. A platform holder
# (super_admin, no team) is unaffected. Surfaced in the capability catalog so the read/matrix
# display matches what is actually enforced (the role×capability matrix alone can't express a
# team.type condition). Keep this in lockstep with the `_require_gov_zone_authority` and
# `require_gov_team` call sites.
GOV_TEAM_ONLY_PERMS = frozenset(
    {Perm.ZONE_ADD, Perm.ZONE_EDIT, Perm.ZONE_ASSIGN, Perm.ZONE_DELETE, Perm.STATION_ASSIGN}
)

# ADR-285: capabilities whose `team` scope widens to `all` when the actor acts for a gov team —
# gov manages every station, whichever team it is assigned to and unassigned ones too, while an
# ngo's `team` scope stays its own stations. Applied in `resolve_scope` (checkpoint 1). Like
# GOV_TEAM_ONLY_PERMS it is a team.type condition the role×capability matrix can't express.
GOV_TEAM_WIDENED_PERMS = frozenset(
    {
        Perm.STATION_VIEW_PII,
        Perm.STATION_VIEW_HISTORY,
        Perm.STATION_EDIT,
        Perm.STATION_DELETE,
        Perm.STATION_REVIEW,
        Perm.STATION_EXPORT,
    }
)
