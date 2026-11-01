"""A read-only MCP server inside the backend, signed in through the backend's own accounts and sessions."""

from fastapi import FastAPI
from fastmcp import FastMCP
from fastmcp.experimental.transforms.code_mode import CodeMode
from starlette.routing import Route

from mcp_server.oauth import BackendOAuthProvider, consent_router
from mcp_server.tools import register_tools

MCP_PATH = "/mcp"


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
        app.router.routes.append(Route(path, endpoint=mcp_app, include_in_schema=False))
    return mcp_app
