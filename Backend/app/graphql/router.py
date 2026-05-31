"""GraphQL router — builds the Strawberry GraphQLRouter for mounting in main.py."""

from strawberry.fastapi import GraphQLRouter

from app.graphql.context import get_context
from app.graphql.schema import schema

graphql_router = GraphQLRouter(schema, context_getter=get_context)
