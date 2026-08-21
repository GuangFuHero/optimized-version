"""GraphQL schema definition — composes Query and Mutation types from sub-modules."""

import strawberry
from fastapi import HTTPException
from strawberry.extensions import MaskErrors

from app.graphql.announcements.mutations import AnnouncementMutation
from app.graphql.announcements.queries import AnnouncementQuery
from app.graphql.config.mutations import PropertyConfigMutation
from app.graphql.config.queries import PropertyConfigQuery
from app.graphql.geo.mutations import GeoMutation, StationPropertyMutation
from app.graphql.geo.queries import GeoQuery
from app.graphql.suggestions.mutations import SuggestionMutation
from app.graphql.suggestions.queries import SuggestionQuery
from app.graphql.tickets.mutations import RequestMutation, TicketTaskMutation
from app.graphql.tickets.queries import RequestQuery, TicketTaskQuery
from app.graphql.work_zone.mutations import WorkZoneMutation
from app.graphql.work_zone.queries import WorkZoneQuery

# Ruff sorts `graphql` into the first-party block (it collides with this package's own
# name, app.graphql). Moving it up beside fastapi reads better but fails I001 in CI.
from graphql import GraphQLError


@strawberry.type
class Query(GeoQuery, RequestQuery, TicketTaskQuery, PropertyConfigQuery, AnnouncementQuery, SuggestionQuery, WorkZoneQuery):  # noqa: E501
    """Root query type composing all domain query mixins."""


@strawberry.type
class Mutation(GeoMutation, StationPropertyMutation, RequestMutation, TicketTaskMutation, PropertyConfigMutation, AnnouncementMutation, SuggestionMutation, WorkZoneMutation):  # noqa: E501
    """Root mutation type composing all domain mutation mixins."""


def _should_mask(error: GraphQLError) -> bool:
    """Allow-list the errors this API raises deliberately; replace every other message.

    Without this, an unhandled driver error reaches the client verbatim, and asyncpg quotes
    the whole failing statement: a value too long for a `varchar(n)` handed the table layout
    and every column name to any authenticated caller. Length-checking each short column in
    its service closes one hole at a time (`normalize_contact_fields`, `normalize_photo_url`);
    this closes the class, because the underlying cause is that a Strawberry input `str`
    carries no length constraint at all while its pydantic counterpart carries `max_length`.

    Allow-listed, so their messages are contract:

    - `ValueError` — the service layer's entire domain-error vocabulary (ADR-013/014). The
      named exceptions (`AdminNotFoundError`, `RbacConflictError`, ...) all subclass it.
    - `HTTPException` — "Permission Denied." / "Not Found." from authz.py and context.py.
    - `original_error is None` — graphql-core's own input coercion ("not a valid value").
      Raised before any resolver runs, so there is nothing server-side in it to leak.

    **Anything else must be a ValueError to reach the client.** A new custom exception class
    that does not subclass it will silently become "Unexpected error.".

    Masking does not cost debuggability: strawberry runs `Schema.process_errors` *before*
    extensions rewrite the result (see the comment in strawberry/schema/schema.py, in
    `_execute`), so `StrawberryLogger` still logs the original with `exc_info` attached.
    """
    original = error.original_error
    if original is None:
        return False
    return not isinstance(original, ValueError | HTTPException)


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    extensions=[MaskErrors(should_mask_error=_should_mask)],
)
