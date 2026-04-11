import strawberry
from app.graphql.queries import GeoQuery, RequestQuery, TicketTaskQuery, PropertyConfigQuery
from app.graphql.mutations import (
    GeoMutation, StationPropertyMutation, RequestMutation,
    TicketTaskMutation, PropertyConfigMutation,
)


@strawberry.type
class Query(GeoQuery, RequestQuery, TicketTaskQuery, PropertyConfigQuery):
    pass


@strawberry.type
class Mutation(GeoMutation, StationPropertyMutation, RequestMutation, TicketTaskMutation, PropertyConfigMutation):
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation)
