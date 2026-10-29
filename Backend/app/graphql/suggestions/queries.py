"""GraphQL queries for station update suggestions."""

from datetime import datetime
from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope
from app.graphql.context import check_permission, require_authenticated
from app.graphql.geo.types import StationType
from app.graphql.suggestions.fields import SUGGESTABLE_FIELDS, VALID_TARGET_TYPES
from app.graphql.suggestions.types import SuggestableFieldType
from app.services import suggestion as suggestion_service

# The site reads one page of them; a person sends few, one per field of a station at a time.
MY_SUGGESTIONS_MAX_LIMIT = 100


@strawberry.type
class MyStationSuggestionType:
    """One suggestion the caller sent, as 我回報的站點 shows it (ADR-420).

    Who reviewed it and the review note are left out: the note is written for the review record.
    """

    uuid: UUID
    target_type: str = strawberry.field(description="'station' or 'station_property'")
    station: StationType | None = strawberry.field(
        description="The station it is about, or its property's; null once deleted or out of the caller's "
        "view, by the rules of `station`"
    )
    field_name: str
    previous_value: str | None = strawberry.field(
        description="The field's value when last sent, as text ('' for none); null for a suggestion sent "
        "before this was recorded"
    )
    new_value: str = strawberry.field(description="The value suggested, the latest if sent again")
    comment: str | None
    status: str = strawberry.field(description="'pending', 'approved', 'rejected', or 'revoked'")
    applied_value: str | None = strawberry.field(
        description="Approved or revoked: the value the reviewer wrote, which may differ from newValue. "
        "Otherwise null"
    )
    submitted_at: datetime = strawberry.field(description="When it was first sent")
    decided_at: datetime | None = strawberry.field(
        description="When it was approved or rejected, or for a revoked one when the approval was undone; "
        "null while pending"
    )


def _applied_value(item: suggestion_service.MySuggestion) -> str | None:
    """The value the deciding merge wrote for this row's field, as text.

    Only for a row the merge approved. A station's `comment` is left out: merges before ADR-332 could
    write that internal note, and the reviewer's text is not the submitter's to read.
    """
    row, merge = item.suggestion, item.merge
    if merge is None or row.status not in ("approved", "revoked"):
        return None
    if row.target_type == "station" and row.field_name == "comment":
        return None
    for change in merge.changes:
        if change["target_uuid"] == row.target_uuid and change["field_name"] == row.field_name:
            return None if change["after"] is None else str(change["after"])
    return None


def _decided_at(item: suggestion_service.MySuggestion) -> datetime | None:
    """When the row got its present status: the merge, or the revoke for a revoked row."""
    if item.merge is None:
        return None
    if item.suggestion.status == "revoked":
        return item.merge.revoked_at
    return item.merge.created_at


@strawberry.type
class SuggestionQuery:
    """GraphQL queries for the station-update suggestion workflow."""

    @strawberry.field
    def suggestable_fields(self, target_type: str) -> list[SuggestableFieldType]:
        """List the fields a user may suggest changes to for the given target type.

        Returns each field's data_type ('string'/'integer'/'enum') and enum_options so the
        frontend can render the matching input widget. Raises if target_type is unknown.
        """
        if target_type not in VALID_TARGET_TYPES:
            raise ValueError(f"Unknown target_type '{target_type}'")
        return [
            SuggestableFieldType(field_name=name, data_type=data_type, enum_options=opts)
            for name, data_type, opts in SUGGESTABLE_FIELDS[target_type]
        ]

    @strawberry.field
    async def my_station_suggestions(
        self, info: strawberry.types.Info, limit: int = MY_SUGGESTIONS_MAX_LIMIT
    ) -> list[MyStationSuggestionType]:
        """The suggestions the caller sent, latest activity first — the site's 我回報的站點 (ADR-420).

        Sign-in only, no capability: every row is the caller's own. A resubmit or a decision moves a
        row up. At most MY_SUGGESTIONS_MAX_LIMIT rows.
        """
        if not 1 <= limit <= MY_SUGGESTIONS_MAX_LIMIT:
            raise ValueError(f"limit must be between 1 and {MY_SUGGESTIONS_MAX_LIMIT}")
        actor = require_authenticated(info)
        db = info.context["db"]
        items = await suggestion_service.list_my_station_suggestions(db, actor=actor, limit=limit)

        # As `station` decides: station.view is public, so this is the scope check only.
        scope = await check_permission(info, Perm.STATION_VIEW)
        visible: dict[str, bool] = {}
        for item in items:
            station = item.station
            if station is not None and str(station.uuid) not in visible:
                visible[str(station.uuid)] = scope == Scope.ALL or await in_scope(
                    scope, actor=actor, resource=station, db=db
                )

        return [
            MyStationSuggestionType(
                uuid=item.suggestion.uuid,
                target_type=item.suggestion.target_type,
                station=(
                    StationType.from_model(item.station)
                    if item.station is not None and visible[str(item.station.uuid)]
                    else None
                ),
                field_name=item.suggestion.field_name,
                previous_value=item.suggestion.previous_value,
                new_value=item.suggestion.new_value,
                comment=item.suggestion.comment,
                status=item.suggestion.status,
                applied_value=_applied_value(item),
                submitted_at=item.suggestion.created_at,
                decided_at=_decided_at(item),
            )
            for item in items
        ]
