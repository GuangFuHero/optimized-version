"""Station-update suggestion write actions (create / review).

Same flat-service style as station.py. The review path applies the change to the target
and marks the suggestion reviewed in ONE commit (ADR-043 — the pre-refactor resolver did
these as two separate commits, which could leave the target changed but the suggestion
stuck 'pending').
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.suggestions.fields import VALID_TARGET_TYPES, coerce_and_validate
from app.models.auth import User
from app.models.station_property import StationUpdateSuggestion
from app.repositories.geo_repository import (
    station_property_repository,
    station_repository,
    station_suggestion_repository,
)
from app.services.authz import require_scope
from app.services.station import (
    OPERATIONAL_PROPERTY_NAMES,
    _property_scope_target,
    notify_operational_status_change,
)

# Maps a suggestion's target_type to the repository that owns that table.
_TARGET_REPOS = {
    "station": station_repository,
    "station_property": station_property_repository,
}


async def create_station_suggestion(
    db: AsyncSession,
    *,
    actor: User,
    target_type: str,
    target_uuid: str,
    field_name: str,
    new_value: str,
    comment: str | None,
) -> StationUpdateSuggestion:
    """Propose a change to a station/station-property field (gated by station.view).

    Verifies the target exists and the field/value are valid for the target type. Starts
    in 'pending' until an admin reviews it.
    """
    await require_scope(actor, Perm.STATION_VIEW, db)

    if target_type not in VALID_TARGET_TYPES:
        raise ValueError(f"Unknown target_type '{target_type}'")
    target = await _TARGET_REPOS[target_type].get_by_uuid_active(db, target_uuid)
    if not target:
        raise ValueError(f"{target_type} not found")

    value = coerce_and_validate(target_type, field_name, new_value)

    return await station_suggestion_repository.create(
        db,
        obj_in={
            "target_type": target_type,
            "target_uuid": target_uuid,
            "field_name": field_name,
            "new_value": str(value),
            "comment": comment,
            "status": "pending",
            "created_by": str(actor.uuid),
        },
    )


async def review_station_suggestion(
    db: AsyncSession, *, actor: User, uuid: str, approve: bool, review_note: str | None = None
) -> StationUpdateSuggestion:
    """Approve (apply the change) or reject a pending suggestion (requires station.review).

    Scope-checked against the target. A station_property has no geometry of its own, so it
    borrows its parent station's location via `_property_scope_target` (ADR-052) — the same
    adaptor `update_station_property` uses — so a `zone`-scoped reviewer reaches property
    suggestions inside its WorkZone instead of always 404ing. Applying the value and marking
    the suggestion reviewed happen in ONE commit (ADR-043).
    """
    suggestion = await station_suggestion_repository.get_by_uuid_active(db, uuid)
    if not suggestion:
        raise ValueError("Suggestion not found")
    if suggestion.status != "pending":
        raise ValueError(f"Suggestion already {suggestion.status}")

    repo = _TARGET_REPOS.get(suggestion.target_type)
    target = await repo.get_by_uuid_active(db, suggestion.target_uuid) if repo else None
    if not target:
        raise ValueError("Target no longer exists")
    scope_target = (
        await _property_scope_target(db, target) if suggestion.target_type == "station_property" else target
    )
    await require_scope(actor, Perm.STATION_REVIEW, db, resource=scope_target)

    # An approved suggestion is the only way to change a Boolean/Enum operational value:
    # those live in station_properties.comment and UpdateStationPropertyInput cannot write
    # it. Without this the four comment-backed names in OPERATIONAL_PROPERTY_NAMES would
    # change silently and Gov would never hear about it.
    operational_change: tuple[str, str] | None = None
    if approve:
        value = coerce_and_validate(suggestion.target_type, suggestion.field_name, suggestion.new_value)
        previous = getattr(target, suggestion.field_name, None)
        setattr(target, suggestion.field_name, value)
        if (
            suggestion.target_type == "station_property"
            and value != previous
            and target.property_name in OPERATIONAL_PROPERTY_NAMES
            and target.status != "rejected"
        ):
            # Read after setattr on purpose: property_name is itself suggestable, so this
            # picks up the name the row now carries.
            operational_change = (str(target.station_uuid), target.property_name)

    suggestion.status = "approved" if approve else "rejected"
    actor_uid = actor.uuid
    suggestion.reviewed_by = str(actor_uid)
    suggestion.review_note = review_note

    await db.commit()
    await db.refresh(suggestion)

    if operational_change:
        station_uuid, property_name = operational_change
        await notify_operational_status_change(
            db, station_uuid=station_uuid, property_name=property_name, actor_uuid=actor_uid
        )
        await db.refresh(suggestion)

    return suggestion
