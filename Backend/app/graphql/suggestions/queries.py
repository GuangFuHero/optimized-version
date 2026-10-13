"""GraphQL queries for station update suggestions."""

import strawberry

from app.graphql.suggestions.fields import SUGGESTABLE_FIELDS, VALID_TARGET_TYPES
from app.graphql.suggestions.types import SuggestableFieldType


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
