"""Which audit columns a history timeline may expose, and to whom (ADR-129/130/143/144).

The audit trigger stores `to_jsonb(NEW)` — the *whole row*, minus `password_hash`
(app/db/triggers.py). That blob is this feature's raw material, so without a filter the
endpoint would be publishing table schemas: feature 011's `search_text` is already sitting
in the payload of every ticket edit, and nobody decided it should be readable.

So the list is a whitelist, not a blacklist (ADR-129). A column nobody classified does not
appear; forgetting costs a missing field rather than a leak, and `test_history_fields.py`
turns that forgetting into a red build rather than a silent gap (ADR-144).

Deliberately NOT built on `bulk_columns.py` (ADR-144): that module classifies columns by
whether they can be *written*, this one by how much authority reading them takes, and the
two sets genuinely differ (it carries latitude/longitude and timestamps, it lacks the
review columns and four of the tables here).

Keyed by (entity, table), not by table alone, because two tables are shared by tickets and
stations while meaning entirely different things (ADR-142, revised): a ticket's address is
the requester's home and its coordinate points at their door, whereas a station's address
is a public shelter's location that the map already shows to everyone. Gating both the same
way would either expose a home address or hide a shelter's.
"""

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

from app.graphql.masking import mask_email, mask_name, mask_phone
from app.models.geo import BaseGeometry, Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import StationProperty
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask


class Tier(StrEnum):
    """How much authority a field's value requires (ADR-130)."""

    PUBLIC = "public"  # any caller who got past *.view_history
    PII = "pii"  # ticket.view_pii AND in scope, else masked or withheld
    DETAIL = "detail"  # ticket.view_detail AND in scope, else withheld (ADR-281/284)
    AUDIT = "audit"  # audit.view


@dataclass(frozen=True)
class FieldSpec:
    """One classified column.

    `mask` applies only to PII: it renders an out-of-scope value as a partial reveal rather
    than dropping it, which reads as "get authorized to see this" instead of "no data". A
    locked field with `mask=None` is withheld entirely — that is the honest outcome for values
    no masking function exists for (the triage answers on PII; an address fragment, a
    coordinate or free text on DETAIL), since inventing one would fabricate plausible-looking
    data.
    """

    tier: Tier
    mask: Callable[[str | None], str | None] | None = None


def _public() -> FieldSpec:
    return FieldSpec(Tier.PUBLIC)


def _pii(mask: Callable[[str | None], str | None] | None = None) -> FieldSpec:
    return FieldSpec(Tier.PII, mask)


def _detail() -> FieldSpec:
    return FieldSpec(Tier.DETAIL)


def _audit() -> FieldSpec:
    return FieldSpec(Tier.AUDIT)


# Which tables each entity's timeline reads. base_geometries and secondary_locations
# appear under both — that is the point of the compound key.
ENTITY_TABLES: dict[str, tuple[str, ...]] = {
    "ticket": (
        "base_geometries", "tickets", "ticket_tasks",
        "task_properties", "task_assignments", "secondary_locations",
    ),
    "station": ("base_geometries", "stations", "station_properties", "secondary_locations"),
}

# The model defining each table's real columns. The guard test walks these, so adding a
# table without classifying its columns fails the build.
HISTORY_MODELS = {
    "base_geometries": BaseGeometry,
    "tickets": Tickets,
    "stations": Station,
    "ticket_tasks": TicketTask,
    "task_properties": TaskProperty,
    "task_assignments": TaskAssignment,
    "station_properties": StationProperty,
    "secondary_locations": SecondaryLocation,
}

_ADDRESS_COLUMNS = (
    "county", "city", "lane", "alley", "no", "floor", "room",
    "pole_id", "pole_type", "pole_note",
    # Feature 018 (ADR-249) added these five to the same table, so they follow whatever tier
    # the entity gives the rest of its address — detail on a ticket, public on a station.
    "building_section", "space_description", "victim_space", "access_status", "landmark_note",
)

_TICKET_FIELDS = {
    "title": _public(),
    "description": _detail(),
    "status": _public(),
    "priority": _public(),
    "task_type": _public(),
    "visibility": _public(),
    "verification_status": _public(),
    "disaster_types": _public(),
    # Feature 018: the reporter's own triage answers, gated exactly like their phone number
    # because `TicketType` withholds them without `ticket.view_pii` (ADR-254). No mask — a
    # tri-state has no shape to redact, so the PII tier simply hides it.
    "person_trapped_reported": _pii(),
    "immediate_danger_reported": _pii(),
    "contact_name": _pii(mask_name),
    "contact_email": _pii(mask_email),
    "contact_phone": _pii(mask_phone),
    "review_note": _audit(),
}

_STATION_FIELDS = {
    "type": _public(),
    # Added to `stations` by b8f4d2a6e1c3, independently of the tickets columns of the same
    # name. PII on this side too — `station.view_pii` exists precisely because a station
    # carries a real person's contact details (RBAC_RESOURCE_ROLE_MATRIX.md).
    "contact_name": _pii(mask_name),
    "contact_email": _pii(mask_email),
    "contact_phone": _pii(mask_phone),
    # a1b2c3d4e5f6: active / temporarily_closed / permanently_closed. Public — the map shows
    # it, and "when did this shelter close" is the question a timeline exists to answer.
    "operational_status": _public(),
    "name": _public(),
    "description": _public(),
    "op_hour": _public(),
    "level": _public(),
    "comment": _public(),
    "source": _public(),
    "visibility": _public(),
    "verification_status": _public(),
    "is_temporary": _public(),
    "expires_at": _public(),
    "is_official": _public(),
    # ADR-285: the second foreign key kept, beside the assignee (ADR-143). "Handed from team A
    # to team B" is the event, and the service resolves it to the team's name. A team name is
    # not PII, and which organisation runs a station is public on the station itself.
    "team_uuid": _public(),
}

_TASK_FIELDS = {
    "task_type": _public(),
    "task_name": _public(),
    "task_description": _detail(),
    "quantity": _public(),
    "status": _public(),
    "source": _public(),
    "progress_note": _detail(),
    "visibility": _public(),
    "moderation_status": _audit(),
    "review_note": _audit(),
}

_TASK_PROPERTY_FIELDS = {
    "property_name": _public(),
    "property_value": _public(),
    "quantity": _public(),
    "status": _public(),
    "comment": _detail(),
}

_ASSIGNMENT_FIELDS = {
    # The one foreign key kept: it *is* the event ("assigned to 張三"), and the service
    # resolves it to a display name rather than emitting a bare uuid (ADR-143).
    "actor_uuid": _public(),
    "role": _public(),
    "status": _public(),
}

_STATION_PROPERTY_FIELDS = {
    "property_type": _public(),
    "property_name": _public(),
    "quantity": _public(),
    "comment": _public(),
    "status": _public(),
}

FIELD_TIERS: dict[tuple[str, str], dict[str, FieldSpec]] = {
    # ADR-141: geometry is never rendered as a value under either entity — WKB is
    # unreadable and a decoded coordinate is location data. The tier decides whether the
    # *fact* that it moved is visible at all: a relocated shelter is public knowledge, a
    # relocated help request points at somebody's home.
    ("ticket", "base_geometries"): {"geometry": _detail()},
    ("station", "base_geometries"): {"geometry": _public()},
    ("ticket", "tickets"): _TICKET_FIELDS,
    ("ticket", "ticket_tasks"): _TASK_FIELDS,
    ("ticket", "task_properties"): _TASK_PROPERTY_FIELDS,
    ("ticket", "task_assignments"): _ASSIGNMENT_FIELDS,
    # ADR-284: the requester's address, gated on `ticket.view_detail` like
    # `TicketType.secondaryLocation` (ADR-281) — the timeline must not be a second way in.
    # `location_type` stays public on purpose: it only says address vs. pole, which locates
    # nothing, and without it a row of withheld fields would not say what kind of place moved.
    ("ticket", "secondary_locations"): {
        "location_type": _public(),
        **{column: _detail() for column in _ADDRESS_COLUMNS},
    },
    ("station", "stations"): _STATION_FIELDS,
    ("station", "station_properties"): _STATION_PROPERTY_FIELDS,
    # A shelter's address is already on the public map; hiding its correction would protect
    # nothing and would make the timeline read as if the station had never been fixed.
    ("station", "secondary_locations"): {
        "location_type": _public(),
        **{column: _public() for column in _ADDRESS_COLUMNS},
    },
}

# Reasons are mandatory: an exclusion without one is indistinguishable from an oversight
# the next time somebody reads this file (ADR-143).
_ID = "the resource's own identifier; the caller already knows what it is looking at"
_FK = (
    "a foreign key — a bare uuid on screen is noise, and resolving it needs a join the "
    "timeline deliberately does not do (ADR-143)"
)
_STAMP = (
    "the event's own timestamp is reported as `at`; repeating it as a field change would "
    "put the same value on every single event"
)
_SCORE = (
    "dedup/scoring column with no writer anywhere in the codebase (ADR-113/143) — "
    "whitelisting it would add a field that can never fire"
)
_DERIVED_STAMP = (
    "stamped by the service when another field changes, so the timeline already reports both "
    "the change and its time — see the entry for the column it tracks"
)
_DISCRIMINATOR = (
    "the polymorphic discriminator ('request'/'station'); fixed for the lifetime of the "
    "row, so it can never appear as a change"
)
_SOFT_DELETE = (
    "this is an event, not a field change — a NULL->value transition becomes event_type "
    "DELETED (ADR-135)"
)

_GENERATED = (
    "a PostgreSQL generated column (feature 011), derived entirely from columns this table "
    "already classifies — and derived ACROSS tiers: `tickets.search_text` concatenates "
    "`title` and `description`, so showing it at any single tier would leak whichever of its "
    "inputs sits above that tier. It also changes on every edit to those inputs, which the "
    "timeline already reports (ADR-243)"
)

_GEOMETRY_EXCLUSIONS = {
    "uuid": _ID,
    "created_by": _FK,
    "created_at": _STAMP,
    "updated_at": _STAMP,
    "delete_at": _SOFT_DELETE,
    "property_name": _DISCRIMINATOR,
}

_ADDRESS_EXCLUSIONS = {
    "uuid": _ID, "geometry_uuid": _FK, "pole_photo_uuid": _FK,
    "search_text": _GENERATED,
}

EXCLUDED: dict[tuple[str, str], dict[str, str]] = {
    ("ticket", "base_geometries"): _GEOMETRY_EXCLUSIONS,
    ("station", "base_geometries"): _GEOMETRY_EXCLUSIONS,
    ("ticket", "tickets"): {"uuid": _ID, "search_text": _GENERATED},
    ("station", "stations"): {
        "uuid": _ID,
        "search_text": _GENERATED,
        "status_changed_at": _DERIVED_STAMP,
        "child_station_uuid": _FK,
        "updated_by": _FK,
        "is_duplicate": _SCORE,
        "dedup_group_id": _SCORE,
    },
    ("ticket", "ticket_tasks"): {
        "uuid": _ID,
        "search_text": _GENERATED,
        # a1b2c3d4e5f6, both stamped by the status transition that sets them.
        "completed_at": _DERIVED_STAMP,
        "canceled_at": _DERIVED_STAMP,
        "ticket_uuid": _FK,
        "route_uuid": _FK,
        "created_by": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": (
            "no delete path exists for a task — there is no delete_ticket_task mutation or "
            "service function (ADR-131)"
        ),
        "is_duplicate": _SCORE,
        "dedup_group_id": _SCORE,
    },
    ("ticket", "task_properties"): {
        "uuid": _ID,
        "search_text": _GENERATED,
        "task_uuid": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": _SOFT_DELETE,
    },
    ("ticket", "task_assignments"): {
        "uuid": _ID,
        "task_uuid": _FK,
        "assigned_at": _STAMP,
        "updated_at": _STAMP,
    },
    ("station", "station_properties"): {
        "uuid": _ID,
        "search_text": _GENERATED,
        "station_uuid": _FK,
        "created_by": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": _SOFT_DELETE,
        "weightings": _SCORE,
    },
    ("ticket", "secondary_locations"): _ADDRESS_EXCLUSIONS,
    ("station", "secondary_locations"): _ADDRESS_EXCLUSIONS,
}


def spec_for(entity: str, table: str, column: str) -> FieldSpec | None:
    """The classification of `column`, or None when it must not be exposed at all.

    Takes the entity because the same table means different things under each one — see
    secondary_locations and base_geometries above.

    Unknown columns return None rather than raising: a row written before a column was
    dropped, or by a branch this deployment has not merged, should be quietly skipped
    rather than break the whole timeline.
    """
    return FIELD_TIERS.get((entity, table), {}).get(column)
