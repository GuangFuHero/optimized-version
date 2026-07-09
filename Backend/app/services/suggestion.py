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

    Scope-checked against the target station (for a station_property target, against the
    property itself — StationProperty carries no team_uuid, so team/gov/ngo/zone can never
    match there; only own/all apply). Applying the value and marking the suggestion
    reviewed happen in ONE commit (ADR-043).
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
    await require_scope(actor, Perm.STATION_REVIEW, db, resource=target)

    if approve:
        value = coerce_and_validate(suggestion.target_type, suggestion.field_name, suggestion.new_value)
        setattr(target, suggestion.field_name, value)

    suggestion.status = "approved" if approve else "rejected"
    suggestion.reviewed_by = str(actor.uuid)
    suggestion.review_note = review_note

    await db.commit()
    await db.refresh(suggestion)
    return suggestion
