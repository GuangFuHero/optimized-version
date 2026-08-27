"""GraphQL schema definition — composes Query and Mutation types from sub-modules."""

import logging

import strawberry
from fastapi import HTTPException
from strawberry.extensions import MaskErrors
from strawberry.utils.logging import StrawberryLogger

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

_logger = logging.getLogger("app.graphql")


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
    `_execute`), so a masked error is still logged with its original message and
    `exc_info` attached — see `_Schema.process_errors`, which logs exactly the errors this
    function masks at ERROR, and the allow-listed ones at INFO instead.
    """
    return not _is_expected(error)


def _is_expected(error: GraphQLError) -> bool:
    """True if `error` is one this API raises deliberately, rather than a server fault.

    The single place that decides "is this the caller's fault or ours". Both the masking
    extension and the logging below read it, so an error whose message is contract can
    never be logged as if it were a crash, and vice versa.
    """
    original = error.original_error
    if original is None:
        # graphql-core's own input coercion, raised before any resolver runs.
        return True
    return isinstance(original, ValueError | HTTPException)


class _Schema(strawberry.Schema):
    """Schema that logs expected errors as information, not as failures.

    Strawberry's default `process_errors` sends **every** error to
    `StrawberryLogger.error`, which logs at ERROR with `exc_info` set — a full traceback
    for a caller who typed a one-character search term, or who hit a query they are not
    allowed to see. `stations` / `tickets` are in PUBLIC_PERMS, so an anonymous caller
    reaches that path with no authentication and no rate limiter, and a user typing into
    a search box crosses the two-character boundary on essentially every query. The
    result is a log filling with tracebacks that no one can act on, which is how real
    faults get missed (ADR-160, superseding ADR-084).

    Bounding the database cost of a search (ADR-152) does not bound its log cost, and a
    front-end guard cannot: the endpoint is public and callable directly.

    Expected errors still appear in the log — at INFO, with the message and no traceback,
    which is what an operator wants for "someone sent a bad request". Everything else
    keeps ERROR with the traceback attached, so a genuine fault looks exactly as it did.
    """

    def process_errors(self, errors, execution_context=None) -> None:
        for error in errors:
            if _is_expected(error):
                _logger.info("%s", error.message)
            else:
                StrawberryLogger.error(error, execution_context)


schema = _Schema(
    query=Query,
    mutation=Mutation,
    extensions=[MaskErrors(should_mask_error=_should_mask)],
)
