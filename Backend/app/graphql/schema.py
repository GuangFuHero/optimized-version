"""GraphQL schema definition — composes Query and Mutation types from sub-modules."""

import strawberry

from app.graphql.mutations import (
    GeoMutation,
    PropertyConfigMutation,
    RequestMutation,
    StationPropertyMutation,
    TicketTaskMutation,
)
from app.graphql.queries import GeoQuery, PropertyConfigQuery, RequestQuery, TicketTaskQuery


@strawberry.type
class Query(GeoQuery, RequestQuery, TicketTaskQuery, PropertyConfigQuery):
    """Root query type composing all domain query mixins."""


@strawberry.type
class Mutation(GeoMutation, StationPropertyMutation, RequestMutation, TicketTaskMutation, PropertyConfigMutation):  # noqa: E501
    """Root mutation type composing all domain mutation mixins."""


schema = strawberry.Schema(query=Query, mutation=Mutation)
