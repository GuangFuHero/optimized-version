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
    AUDIT = "audit"  # audit.view


@dataclass(frozen=True)
class FieldSpec:
    """One classified column.

    `mask` applies only to PII: it renders an out-of-scope value as a partial reveal rather
    than dropping it, which reads as "get authorized to see this" instead of "no data". A
    PII field with `mask=None` is withheld entirely when out of scope — that is the honest
    outcome for values no masking function exists for (an address fragment, a coordinate),
    since inventing one would fabricate plausible-looking location data.
    """

    tier: Tier
    mask: Callable[[str | None], str | None] | None = None


def _public() -> FieldSpec:
    return FieldSpec(Tier.PUBLIC)


def _pii(mask: Callable[[str | None], str | None] | None = None) -> FieldSpec:
    return FieldSpec(Tier.PII, mask)


def _audit() -> FieldSpec:
    return FieldSpec(Tier.AUDIT)


# Every table the timeline reads, and the model that defines its real columns. The guard
# test walks these, so adding a table here without classifying its columns fails the build.
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

FIELD_TIERS: dict[str, dict[str, FieldSpec]] = {
    "base_geometries": {
        # ADR-141: never rendered as a value. The service reports `changed: true` and stops
        # there — WKB is unreadable, and a ticket's precise coordinate is effectively the
        # requester's home address, which is why it sits at PII rather than PUBLIC.
        "geometry": _pii(),
    },
    "tickets": {
        "title": _public(),
        "description": _public(),
        "status": _public(),
        "priority": _public(),
        "task_type": _public(),
        "visibility": _public(),
        "verification_status": _public(),
        "disaster_type": _public(),
        "contact_name": _pii(mask_name),
        "contact_email": _pii(mask_email),
        "contact_phone": _pii(mask_phone),
        "review_note": _audit(),
    },
    "stations": {
        "type": _public(),
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
    },
    "ticket_tasks": {
        "task_type": _public(),
        "task_name": _public(),
        "task_description": _public(),
        "quantity": _public(),
        "status": _public(),
        "source": _public(),
        "progress_note": _public(),
        "visibility": _public(),
        "moderation_status": _audit(),
        "review_note": _audit(),
    },
    "task_properties": {
        "property_name": _public(),
        "property_value": _public(),
        "quantity": _public(),
        "status": _public(),
        "comment": _public(),
    },
    "task_assignments": {
        # The one foreign key that is kept: it *is* the event ("assigned to 張三"), and the
        # service resolves it to a display name rather than emitting a bare uuid.
        "actor_uuid": _public(),
        "role": _public(),
        "status": _public(),
    },
    "station_properties": {
        "property_type": _public(),
        "property_name": _public(),
        "quantity": _public(),
        "comment": _public(),
        "status": _public(),
    },
    "secondary_locations": {
        "location_type": _public(),
        # ADR-142: a full address is, if anything, more identifying than a phone number.
        # Note this makes the timeline *stricter* than the single-resource GraphQL query,
        # where `secondary_location` has no PII gate at all — deliberately, rather than
        # reproducing that gap here.
        "county": _pii(),
        "city": _pii(),
        "lane": _pii(),
        "alley": _pii(),
        "no": _pii(),
        "floor": _pii(),
        "room": _pii(),
        "pole_id": _pii(),
        "pole_type": _pii(),
        "pole_note": _pii(),
    },
}

# Reasons are mandatory: an exclusion without one is indistinguishable from an oversight
# the next time somebody reads this file (ADR-143).
_ID = "the resource's own identifier; the caller already knows what it is looking at"
_FK = "a foreign key — a bare uuid on screen is noise, and resolving it needs a join the "\
      "timeline deliberately does not do (ADR-143)"
_STAMP = "the event's own timestamp is reported as `at`; repeating it as a field change "\
         "would put the same value on every single event"
_SCORE = "dedup/scoring column with no writer anywhere in the codebase (ADR-113/143) — "\
         "whitelisting it would add a field that can never fire"

EXCLUDED: dict[str, dict[str, str]] = {
    "base_geometries": {
        "uuid": _ID,
        "created_by": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": "this is an event, not a field change — a NULL->value transition "
                     "becomes event_type DELETED (ADR-135)",
        "property_name": "the polymorphic discriminator ('request'/'station'); fixed for "
                         "the lifetime of the row, so it can never appear as a change",
    },
    "tickets": {"uuid": _ID},
    "stations": {
        "uuid": _ID,
        "child_station_uuid": _FK,
        "updated_by": _FK,
        "confidence_score": _SCORE,
        "is_duplicate": _SCORE,
        "dedup_group_id": _SCORE,
        "priority_score": _SCORE,
    },
    "ticket_tasks": {
        "uuid": _ID,
        "ticket_uuid": _FK,
        "route_uuid": _FK,
        "created_by": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": "no delete path exists for a task — there is no delete_ticket_task "
                     "mutation or service function (ADR-131)",
        "confidence_score": _SCORE,
        "is_duplicate": _SCORE,
        "dedup_group_id": _SCORE,
    },
    "task_properties": {
        "uuid": _ID,
        "task_uuid": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": _STAMP,
    },
    "task_assignments": {
        "uuid": _ID,
        "task_uuid": _FK,
        "assigned_at": _STAMP,
        "updated_at": _STAMP,
    },
    "station_properties": {
        "uuid": _ID,
        "station_uuid": _FK,
        "created_by": _FK,
        "created_at": _STAMP,
        "updated_at": _STAMP,
        "delete_at": _STAMP,
        "weightings": _SCORE,
    },
    "secondary_locations": {
        "uuid": _ID,
        "geometry_uuid": _FK,
        "pole_photo_uuid": _FK,
    },
}


def spec_for(table: str, column: str) -> FieldSpec | None:
    """The classification of `column`, or None when it must not be exposed at all.

    Unknown columns return None rather than raising: a row written before a column was
    dropped, or by a branch this deployment has not merged, should be quietly skipped
    rather than break the whole timeline.
    """
    return FIELD_TIERS.get(table, {}).get(column)
