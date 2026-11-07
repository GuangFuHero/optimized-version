"""A read-only MCP server inside the backend, signed in through the backend's own accounts and sessions."""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastmcp import FastMCP
from fastmcp.experimental.transforms.code_mode import CodeMode
from starlette.requests import Request
from starlette.routing import Route

from app.api.v1.endpoints.auth.deps import build_rate_limit_key, consume_rate_limit
from app.core.request_auth import resolve_client_ip
from mcp_server.oauth import MCP_PATH, BackendOAuthProvider, consent_router
from mcp_server.tools import register_tools

# Per-IP allowances, (times, seconds), on the unauthenticated routes that write to Redis, by the MCP app's
# own path.
RATE_LIMITS = {"/register": (10, 3600), "/authorize": (30, 600)}
_SERVER_METADATA = "/.well-known/oauth-authorization-server"


def public_path(path: str) -> str:
    """Where the backend serves the MCP app's route `path`: every path the MCP serves is under MCP_PATH.

    The OAuth routes move under it, and the authorization server's metadata goes where RFC 8414 puts it for
    the issuer `{MCP_BASE_URL}/mcp`. The endpoint and the resource metadata are there already.
    """
    if path == MCP_PATH or path.startswith("/.well-known/oauth-protected-resource"):
        return path
    if path == _SERVER_METADATA:
        return _SERVER_METADATA + MCP_PATH
    return MCP_PATH + path


class _At:
    """The MCP app, sent a request as if it had arrived at the app's own `path`.

    A class rather than a function, because Starlette routes to a plain function as a request handler.
    """

    def __init__(self, app, path: str):
        """Pass requests on to `app` at `path`."""
        self.app, self.path = app, path

    async def __call__(self, scope, receive, send):
        """Rewrite the request's path, then pass it on."""
        await self.app({**scope, "path": self.path, "raw_path": self.path.encode()}, receive, send)


class _RateLimited:
    """The MCP app, answering 429 on `path` once a caller has used its allowance.

    A class rather than a function, because Starlette routes to a plain function as a request handler.
    """

    def __init__(self, app, path: str, times: int, seconds: int):
        """Wrap `app` for `path` with an allowance of `times` per `seconds`."""
        self.app, self.path, self.times, self.seconds = app, path, times, seconds

    async def __call__(self, scope, receive, send):
        """Count the request against the caller's allowance, then pass it on or refuse it."""
        request = Request(scope)
        key = build_rate_limit_key(self.times, self.seconds, resolve_client_ip(request), f"mcp{self.path}")
        if await consume_rate_limit(request.app.state.redis, key, self.times, self.seconds):
            await self.app(scope, receive, send)
            return
        response = JSONResponse(
            {"error": "rate_limited", "error_description": "Too many requests; try again later."},
            status_code=429,
            headers={"Retry-After": str(self.seconds)},
        )
        await response(scope, receive, send)


def build_server(app: FastAPI) -> FastMCP:
    """The MCP server whose tools call `app`'s endpoints, behind CodeMode."""
    server = FastMCP(
        "救災平台",
        instructions=(
            "Read-only access to the disaster relief platform as the signed-in user. `graphql_schema` and "
            "`rest_routes` describe what can be read; `graphql_query` and `rest_get` read it. "
            "`rest_get('/api/v1/users/me')` lists the identities you can act as and `switch_identity` picks "
            "one; every read then runs with that identity's permissions and masking."
        ),
        auth=BackendOAuthProvider(lambda: app.state.redis),
        transforms=[CodeMode()],
    )
    register_tools(server, app)
    return server


def public_routes(mcp_app) -> list[Route]:
    """A route per path of `mcp_app`, at its public path, so every other path keeps the API's own 404."""
    routes = []
    for path in {route.path for route in mcp_app.routes}:
        endpoint = mcp_app if public_path(path) == path else _At(mcp_app, path)
        if path in RATE_LIMITS:
            endpoint = _RateLimited(endpoint, path, *RATE_LIMITS[path])
        routes.append(Route(public_path(path), endpoint=endpoint, include_in_schema=False))
    return routes


def mount(app: FastAPI):
    """Serve the MCP endpoint and its OAuth routes from `app`; return the MCP app for its lifespan."""
    mcp_app = build_server(app).http_app(path=MCP_PATH, stateless_http=True)
    app.include_router(consent_router, prefix="/api/v1/mcp", tags=["MCP"])
    app.router.routes.extend(public_routes(mcp_app))
    return mcp_app
