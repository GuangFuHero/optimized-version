"""GraphQL schema definition — composes Query and Mutation types from sub-modules."""

import strawberry

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


@strawberry.type
class Query(GeoQuery, RequestQuery, TicketTaskQuery, PropertyConfigQuery, AnnouncementQuery, SuggestionQuery, WorkZoneQuery):  # noqa: E501
    """Root query type composing all domain query mixins."""


@strawberry.type
class Mutation(GeoMutation, StationPropertyMutation, RequestMutation, TicketTaskMutation, PropertyConfigMutation, AnnouncementMutation, SuggestionMutation, WorkZoneMutation):  # noqa: E501
    """Root mutation type composing all domain mutation mixins."""


schema = strawberry.Schema(query=Query, mutation=Mutation)
