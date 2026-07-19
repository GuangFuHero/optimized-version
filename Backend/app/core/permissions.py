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
    TICKET_ADD = "ticket.add"
    TICKET_EDIT = "ticket.edit"
    TICKET_DELETE = "ticket.delete"
    TICKET_ASSIGN = "ticket.assign"
    TICKET_REVIEW = "ticket.review"
    TICKET_EXPORT = "ticket.export"

    # Resource Station
    STATION_VIEW = "station.view"
    STATION_ADD = "station.add"
    STATION_EDIT = "station.edit"
    STATION_DELETE = "station.delete"
    STATION_REVIEW = "station.review"

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

    # Dynamic Fields (station/task property config)
    FIELD_VIEW = "dynamic_field.view"
    FIELD_ADD = "dynamic_field.add"
    FIELD_EDIT = "dynamic_field.edit"
    FIELD_DELETE = "dynamic_field.delete"

    # Emergency Announcement
    ANN_VIEW = "announcement.view"
    ANN_PUBLISH = "announcement.publish"
    ANN_EDIT = "announcement.edit"
    ANN_DELETE = "announcement.delete"

    # Pre-Departure Notice
    PREDEP_VIEW = "pre_departure.view"
    PREDEP_PUBLISH = "pre_departure.publish"
    PREDEP_EDIT = "pre_departure.edit"

    # Audit Log
    AUDIT_VIEW = "audit.view"

    # RBAC self-management (Super Admin only)
    RBAC_ASSIGN = "rbac.assign"
    RBAC_EDIT = "rbac.edit"


# ADR-025/027: capabilities an unauthenticated Guest may use, read-only. Guest is a
# program-level view (no DB row); anything not in this set is a 403 for an anonymous
# caller. station.view/ticket.view are public (disaster map + help-request board don't
# require login); ticket.view_pii is deliberately never in this set — PII always requires
# a real actor, checked separately per-field (ADR-029).
PUBLIC_PERMS = frozenset({Perm.MAP_VIEW, Perm.ANN_VIEW, Perm.STATION_VIEW, Perm.TICKET_VIEW})
