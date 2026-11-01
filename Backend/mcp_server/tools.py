"""Generic read tools over the backend's own GraphQL and REST endpoints, called in process.

The agent reads the live schema and route list, so new backend reads need no change here, and each
call runs as the session's identity.
"""

import asyncio
from typing import Any
from uuid import UUID

import httpx
from fastapi import FastAPI
from fastapi.dependencies.utils import get_flat_dependant
from fastapi.routing import APIRoute
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_access_token, get_http_request
from graphql import (
    FieldNode,
    FragmentDefinitionNode,
    FragmentSpreadNode,
    GraphQLError,
    GraphQLObjectType,
    GraphQLSchema,
    InlineFragmentNode,
    OperationDefinitionNode,
    OperationType,
    parse,
    print_schema,
    print_type,
)
from starlette.routing import Match

from app.core import security
from app.core.request_auth import MCP_IN_PROCESS, resolve_client_ip
from app.graphql.schema import schema as app_schema
from app.repositories.session_repository import SessionRepository

# The only lists to maintain: root query fields and REST path prefixes the MCP never reaches.
DENIED_ROOT_FIELDS = frozenset({"normalizeAddress", "reverseGeocode"})
EXCLUDED_REST_PREFIXES = (
    "/api/v1/auth",
    "/api/v1/admin",
    "/api/v1/bulk",
    "/api/v1/map",
    "/api/v1/rbac-test",
    "/api/v1/invites",
    "/api/v1/mcp",
)

# Refused before parsing; `/graphql` itself then limits depth to 10, aliases to 10 and tokens to 1000.
MAX_DOCUMENT_CHARS = 20_000
CALL_TIMEOUT_SECONDS = 30


def _live_schema() -> GraphQLSchema:
    return app_schema._schema


def query_side_schema() -> GraphQLSchema:
    """The query half of the live schema, without the denied root fields or mutations."""
    query = _live_schema().query_type
    fields = {name: field for name, field in query.fields.items() if name not in DENIED_ROOT_FIELDS}
    return GraphQLSchema(query=GraphQLObjectType(query.name, fields, description=query.description))


def _root_fields(selection_set, fragments: dict, seen: frozenset = frozenset()) -> set[str]:
    names = set()
    for node in selection_set.selections:
        if isinstance(node, FieldNode):
            names.add(node.name.value)
        elif isinstance(node, InlineFragmentNode):
            names |= _root_fields(node.selection_set, fragments, seen)
        elif isinstance(node, FragmentSpreadNode) and node.name.value not in seen:
            fragment = fragments.get(node.name.value)
            if fragment:
                names |= _root_fields(fragment.selection_set, fragments, seen | {node.name.value})
    return names


def check_read_only_query(document: str) -> None:
    """Refuse a document that is not purely queries, reaches a denied root field, or is too long."""
    if len(document) > MAX_DOCUMENT_CHARS:
        raise ToolError(f"The query is longer than {MAX_DOCUMENT_CHARS} characters.")
    try:
        parsed = parse(document)
    except GraphQLError as err:
        raise ToolError(f"Invalid GraphQL: {err.message}") from err
    fragments = {d.name.value: d for d in parsed.definitions if isinstance(d, FragmentDefinitionNode)}
    operations = [d for d in parsed.definitions if isinstance(d, OperationDefinitionNode)]
    if not operations:
        raise ToolError("The document has no operation.")
    for operation in operations:
        if operation.operation != OperationType.QUERY:
            raise ToolError(f"Only queries are allowed, not a {operation.operation.value}.")
        denied = _root_fields(operation.selection_set, fragments) & DENIED_ROOT_FIELDS
        if denied:
            raise ToolError(f"Not available through MCP: {', '.join(sorted(denied))}.")


def readable_routes(app: FastAPI) -> list[APIRoute]:
    """Every GET route under /api/v1 outside the excluded prefixes, as the app has them right now."""
    return [
        route
        for route in app.routes
        if isinstance(route, APIRoute)
        and "GET" in route.methods
        and route.path.startswith("/api/v1/")
        and not any(route.path == p or route.path.startswith(p + "/") for p in EXCLUDED_REST_PREFIXES)
    ]


def _describe_route(route: APIRoute) -> dict:
    dependant = get_flat_dependant(route.dependant)

    def params(fields) -> list[dict]:
        return [
            {"name": f.alias, "type": str(f.field_info.annotation), "required": f.field_info.is_required()}
            for f in fields
        ]

    doc = (route.description or "").strip().splitlines()
    return {
        "path": route.path,
        "summary": route.summary or (doc[0] if doc else route.name),
        "path_params": params(dependant.path_params),
        "query_params": params(dependant.query_params),
    }


def check_readable_path(app: FastAPI, path: str) -> None:
    """Refuse a path that is not one of `readable_routes`."""
    segments = path.split("/")
    if "?" in path or "#" in path or "." in segments or ".." in segments:
        raise ToolError("Give a plain path; put query parameters in `params`.")
    scope = {"type": "http", "path": path, "method": "GET"}
    if not any(route.matches(scope)[0] == Match.FULL for route in readable_routes(app)):
        raise ToolError(f"{path} is not a readable route; see `rest_routes`.")


class BackendCaller:
    """Calls the app's own endpoints with a token for the MCP session's current identity."""

    def __init__(self, app: FastAPI):
        """Bind to the FastAPI app whose endpoints the tools call."""
        self.app = app

    async def _in_process(self, scope, receive, send):
        # Marks the request as the MCP's own; only this transport can set ASGI scope state.
        scope = {**scope, "state": {**scope.get("state", {}), MCP_IN_PROCESS: True}}
        await self.app(scope, receive, send)

    async def _headers(self) -> dict[str, str]:
        access = get_access_token()
        sid = (access.claims or {}).get("sid") if access else None
        session = await SessionRepository(self.app.state.redis).get_session(sid) if sid else None
        if session is None:
            raise ToolError("This MCP session has ended; sign in again.")
        token = security.create_access_token(
            {"sub": session["user_uuid"]}, sid=sid, act=session.get("act"), mcp=True
        )
        return {
            "Authorization": f"Bearer {token}",
            "X-Forwarded-For": resolve_client_ip(get_http_request()),
        }

    async def request(self, method: str, path: str, **kwargs) -> Any:
        """Send one request to the app and return its JSON body, or raise its error for the agent."""
        transport = httpx.ASGITransport(app=self._in_process)
        try:
            async with (
                asyncio.timeout(CALL_TIMEOUT_SECONDS),
                httpx.AsyncClient(transport=transport, base_url="http://backend") as client,
            ):
                response = await client.request(method, path, headers=await self._headers(), **kwargs)
        except TimeoutError as err:
            raise ToolError(f"The call took longer than {CALL_TIMEOUT_SECONDS} seconds.") from err
        if response.status_code >= 400:
            raise ToolError(f"{response.status_code}: {response.text}")
        if not response.content:
            return None
        is_json = response.headers.get("content-type", "").startswith("application/json")
        return response.json() if is_json else response.text


def register_tools(server: FastMCP, app: FastAPI) -> None:
    """Add the generic read tools, plus the identity switch, to `server`."""
    caller = BackendCaller(app)
    read_only = {"readOnlyHint": True}

    @server.tool(annotations=read_only)
    async def graphql_schema(types: list[str] | None = None) -> str:
        """The live GraphQL schema (SDL), query side only; `types` limits it to those named types."""
        schema = query_side_schema()
        if not types:
            return print_schema(schema)
        unknown = [name for name in types if name not in schema.type_map]
        if unknown:
            raise ToolError(f"Unknown types: {', '.join(unknown)}")
        return "\n\n".join(print_type(schema.type_map[name]) for name in types)

    @server.tool(annotations=read_only)
    async def graphql_query(query: str, variables: dict[str, Any] | None = None) -> Any:
        """Run a GraphQL query (no mutations) as the current identity; returns `data` and any `errors`."""
        check_read_only_query(query)
        return await caller.request("POST", "/graphql", json={"query": query, "variables": variables or {}})

    @server.tool(annotations=read_only)
    async def rest_routes() -> list[dict]:
        """The REST GET routes `rest_get` can read, with their path and query parameters."""
        return [_describe_route(route) for route in readable_routes(app)]

    @server.tool(annotations=read_only)
    async def rest_get(path: str, params: dict[str, Any] | None = None) -> Any:
        """GET a route from `rest_routes` (path parameters filled in) as the current identity.

        `/api/v1/users/me` is the caller's profile, including `identities` to choose from.
        """
        check_readable_path(app, path)
        return await caller.request("GET", path, params=params)

    @server.tool(annotations={"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True})
    async def switch_identity(role_uuid: UUID, team_uuid: UUID | None = None) -> Any:
        """Act as another of the caller's identities (see `/api/v1/users/me`); later calls run as it."""
        body = {"role_uuid": str(role_uuid), "team_uuid": str(team_uuid) if team_uuid else None}
        answer = await caller.request("POST", "/api/v1/auth/switch-identity", json=body)
        return answer["identity"]
