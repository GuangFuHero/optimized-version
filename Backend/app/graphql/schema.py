import strawberry

from app.graphql.queries import GeoQuery, RequestQuery
from app.graphql.mutations import GeoMutation, StationPropertyMutation, RequestMutation


@strawberry.type
class Query(GeoQuery, RequestQuery):
    pass


@strawberry.type
class Mutation(GeoMutation, StationPropertyMutation, RequestMutation):
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation)
