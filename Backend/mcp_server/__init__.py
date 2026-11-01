"""A read-only MCP server inside the backend, signed in through the backend's own accounts and sessions."""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastmcp import FastMCP
from fastmcp.experimental.transforms.code_mode import CodeMode
from starlette.requests import Request
from starlette.routing import Route

from app.api.v1.endpoints.auth.deps import build_rate_limit_key, consume_rate_limit
from app.core.request_auth import resolve_client_ip
from mcp_server.oauth import BackendOAuthProvider, consent_router
from mcp_server.tools import register_tools

MCP_PATH = "/mcp"
# Per-IP allowances, (times, seconds), on the unauthenticated routes that write to Redis.
RATE_LIMITS = {"/register": (10, 3600), "/authorize": (30, 600)}


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


def mount(app: FastAPI):
    """Serve the MCP endpoint and its OAuth routes from `app`; return the MCP app for its lifespan.

    Each of the MCP app's paths is routed to it unchanged, so every other path keeps the API's own 404.
    """
    mcp_app = build_server(app).http_app(path=MCP_PATH, stateless_http=True)
    app.include_router(consent_router, prefix="/api/v1/mcp", tags=["MCP"])
    for path in {route.path for route in mcp_app.routes}:
        endpoint = _RateLimited(mcp_app, path, *RATE_LIMITS[path]) if path in RATE_LIMITS else mcp_app
        app.router.routes.append(Route(path, endpoint=endpoint, include_in_schema=False))
    return mcp_app
