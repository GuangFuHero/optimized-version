"""The MCP server: OAuth onto backend sessions, generic read-only tools, identity choice and sign-out."""

import asyncio
import base64
import hashlib
import json
import secrets
import uuid as uuid_mod
from contextlib import asynccontextmanager
from urllib.parse import parse_qs, urlsplit

import pytest
from fastmcp import Client, FastMCP
from graphql import GraphQLField, GraphQLString
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import select, text
from starlette.applications import Starlette

import mcp_server
from app.core.auth_cookies import access_cookie_name
from app.core.config import Settings, settings
from app.core.identity import encode_act
from app.core.permissions import Perm
from app.core.security import _decode_access_payload, create_access_token
from app.graphql.schema import schema as app_schema
from app.main import app
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.repositories.session_repository import SessionRepository
from mcp_server import SharedSandbox, build_server, public_routes
from mcp_server.oauth import BackendOAuthProvider
from mcp_server.tools import BackendCaller, register_tools
from tests.conftest import ensure_role, token_for
from tests.test_graphql import conftest as gql
from tests.test_graphql.conftest import _create_user_with_grants, auth_header

pytestmark = pytest.mark.asyncio

SITE = "http://localhost:3000"
BASE = "http://localhost:8000"


async def everyone_may_use_mcp() -> None:
    """Grant every role now in the database `mcp.use`, and all but `user` `mcp.unlimited_use`."""
    async with gql.test_db() as db:
        await db.execute(
            text(
                "INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'mcp.use'), "
                "(gen_random_uuid(), 'mcp.unlimited_use') ON CONFLICT DO NOTHING"
            )
        )
        await db.execute(
            text(
                "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
                "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
                "WHERE p.key = 'mcp.use' OR (p.key = 'mcp.unlimited_use' AND r.name <> 'user') "
                "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
            )
        )


@asynccontextmanager
async def mcp_http():
    """A fresh MCP app (its session manager runs once per instance) at its public paths; it calls `app`."""
    await everyone_may_use_mcp()
    mcp_app = build_server(app).http_app(path="/mcp", stateless_http=True)
    public = Starlette(routes=public_routes(mcp_app))
    public.state.redis = app.state.redis
    async with (
        mcp_app.router.lifespan_context(mcp_app),
        AsyncClient(transport=ASGITransport(app=public), base_url=BASE) as http,
    ):
        yield http


async def rpc(http, token, method, params):
    """One JSON-RPC request to /mcp; returns the parsed message."""
    response = await http.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        },
    )
    assert response.status_code == 200, response.text
    data = [line[5:] for line in response.text.splitlines() if line.startswith("data:")]
    return json.loads(data[-1] if data else response.text)


async def call(http, token, tool, args=None):
    """Call a generic tool through CodeMode's `execute`; returns (result, error text)."""
    code = f"return await call_tool({tool!r}, {json.dumps(args or {})})"
    code = code.replace("true", "True").replace("false", "False").replace("null", "None")
    message = await rpc(http, token, "tools/call", {"name": "execute", "arguments": {"code": code}})
    result = message["result"]
    if result.get("isError"):
        return None, result["content"][0]["text"]
    structured = result.get("structuredContent")
    if structured is not None:
        return structured.get("result", structured), None
    return json.loads(result["content"][0]["text"]), None


async def mcp_token(redis, user_uuid, role_uuid, team_uuid=None, client_id="test-client") -> str:
    """An access token for a live MCP session acting as the given identity."""
    act = encode_act(str(role_uuid), str(team_uuid) if team_uuid else None)
    sid, _ = await SessionRepository(redis).create_session(
        str(user_uuid), "mcp", act=act, mcp_client=client_id
    )
    return create_access_token(data={"sub": str(user_uuid)}, sid=sid, act=act, mcp=True)


async def _role_uuid(name: str) -> str:
    async with gql.test_db() as db:
        return str(await db.scalar(select(Role.uuid).where(Role.name == name)))


async def _two_identity_user() -> tuple[str, str, str]:
    """A user holding `Login User` and a role that may read every ticket's history."""
    async with gql.test_db() as db:
        history = Role(name=f"history-{uuid_mod.uuid4().hex[:8]}", kind="platform")
        db.add(history)
        await db.flush()
        perm = await db.scalar(select(Permission).where(Permission.key == Perm.TICKET_VIEW_HISTORY.value))
        if perm is None:
            perm = Permission(key=Perm.TICKET_VIEW_HISTORY.value)
            db.add(perm)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=history.uuid, permission_uuid=perm.uuid, scope="all"))
        user = User(name=f"two-{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        login_role = await db.scalar(select(Role.uuid).where(Role.name == "Login User"))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=login_role))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=history.uuid))
        return str(user.uuid), str(login_role), str(history.uuid)


# --- tool list and read-only enforcement -------------------------------------------------------


async def test_registered_tools_are_the_generic_read_set():
    """Only the generic reads and the identity switch exist; nothing maps to a write."""
    server = FastMCP("t")
    register_tools(server, app)
    async with Client(server) as client:
        names = {tool.name for tool in await client.list_tools()}
    assert names == {"graphql_schema", "graphql_query", "rest_routes", "rest_get", "switch_identity"}


async def test_codemode_exposes_only_its_meta_tools(client, redis, login_user_auth):
    """Behind CodeMode the client sees discovery and `execute`, not the tools themselves."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        message = await rpc(http, token, "tools/list", {})
    assert {tool["name"] for tool in message["result"]["tools"]} == {"search", "get_schema", "execute"}


@pytest.mark.parametrize(
    ("query", "refusal"),
    [
        ("mutation { x }", "Only queries"),
        ("subscription { x }", "Only queries"),
        ('{ normalizeAddress(address: "a") { formattedAddress } }', "normalizeAddress"),
        (
            "query { ...F } fragment F on Query { reverseGeocode(lat: 1, lng: 1) { formattedAddress } }",
            "reverseGeocode",
        ),
        ("{ currentDisaster { name } }" + " " * 20_001, "longer"),
    ],
)
async def test_graphql_query_refuses_what_is_not_a_plain_read(client, redis, login_user_auth, query, refusal):
    """Writes, the denied address lookups and oversized documents never reach /graphql."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        _, error = await call(http, token, "graphql_query", {"query": query})
    assert refusal in error


async def test_graphql_query_keeps_the_endpoints_own_limits(client, redis, login_user_auth):
    """The endpoint's own limits (here, at most 10 aliases) apply, and its error reaches the agent."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    many = "{ " + " ".join(f"a{i}: currentDisaster {{ name }}" for i in range(11)) + " }"
    async with mcp_http() as http:
        result, error = await call(http, token, "graphql_query", {"query": many})
    assert error is None and "alias" in str(result["errors"]).lower()


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/admin/users",
        "/api/v1/auth/salt/a@b.c",
        "/api/v1/bulk/templates",
        "/api/v1/rbac-test/public",
        "/api/v1/users/me?x=1",
        "/api/v1/history/tickets/../../users/me",
    ],
)
async def test_rest_get_refuses_excluded_and_unknown_paths(client, redis, login_user_auth, path):
    """Excluded prefixes and anything that is not a plain readable route are refused."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        result, error = await call(http, token, "rest_get", {"path": path})
    assert result is None and error


async def test_schema_and_routes_exclude_what_mcp_does_not_serve(client, redis, login_user_auth):
    """The schema has no mutations or denied fields; the route list has no excluded prefix."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        sdl, _ = await call(http, token, "graphql_schema")
        routes, _ = await call(http, token, "rest_routes")
    assert "type Mutation" not in sdl and "normalizeAddress" not in sdl and "tickets(" in sdl
    paths = {route["path"] for route in routes}
    assert "/api/v1/users/me" in paths and "/api/v1/history/tickets/{uuid}" in paths
    assert not any(
        p.startswith(("/api/v1/auth", "/api/v1/admin", "/api/v1/bulk", "/api/v1/map")) for p in paths
    )


# --- new backend reads appear with no MCP change -------------------------------------------------


async def test_a_new_query_field_and_get_route_need_no_mcp_change(client, redis, login_user_auth):
    """A field and a route registered only here are listed and readable through the generic tools."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    fields = app_schema._schema.query_type.fields
    fields["mcpProbe"] = GraphQLField(GraphQLString, resolve=lambda *_: "probe-ok")

    @app.get("/api/v1/mcp-probe-route/{item}")
    async def probe(item: str, size: int = 1):
        return {"item": item, "size": size}

    try:
        async with mcp_http() as http:
            sdl, _ = await call(http, token, "graphql_schema", {"types": ["Query"]})
            data, _ = await call(http, token, "graphql_query", {"query": "{ mcpProbe }"})
            routes, _ = await call(http, token, "rest_routes")
            got, _ = await call(
                http, token, "rest_get", {"path": "/api/v1/mcp-probe-route/x", "params": {"size": 3}}
            )
    finally:
        del fields["mcpProbe"]
        app.router.routes.pop()
    assert "mcpProbe" in sdl
    assert data == {"data": {"mcpProbe": "probe-ok"}}
    probe_route = next(r for r in routes if r["path"] == "/api/v1/mcp-probe-route/{item}")
    assert [p["name"] for p in probe_route["query_params"]] == ["size"]
    assert got == {"item": "x", "size": 3}


# --- same data as the endpoints, as the chosen identity ----------------------------------------


async def test_graphql_read_matches_the_endpoint_and_stays_masked(
    client, redis, login_user_auth, sample_ticket
):
    """The tool returns what /graphql returns for the same identity, guest-masked contact included."""
    user_uuid, endpoint_token = login_user_auth
    query = f'{{ ticket(uuid: "{sample_ticket}") {{ title contactEmail contactName }} }}'
    direct = (
        await client.post("/graphql", json={"query": query}, headers=auth_header(endpoint_token))
    ).json()
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        through_mcp, _ = await call(http, token, "graphql_query", {"query": query})
    assert through_mcp == direct
    assert direct["data"]["ticket"]["contactEmail"] != "test@test.com"


async def test_rest_read_matches_the_endpoint(client, redis, login_user_auth):
    """`rest_get` returns the endpoint's own body."""
    user_uuid, endpoint_token = login_user_auth
    direct = (
        await client.get("/api/v1/notifications/unread-count", headers=auth_header(endpoint_token))
    ).json()
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        through_mcp, _ = await call(http, token, "rest_get", {"path": "/api/v1/notifications/unread-count"})
    assert through_mcp == direct


async def test_switching_identity_changes_what_reads_return(client, redis, sample_ticket):
    """History is refused as `Login User`; after switching to the history role it is served."""
    user_uuid, login_role, history_role = await _two_identity_user()
    token = await mcp_token(redis, user_uuid, login_role)
    path = f"/api/v1/history/tickets/{sample_ticket}"
    async with mcp_http() as http:
        me, _ = await call(http, token, "rest_get", {"path": "/api/v1/users/me"})
        _, refused = await call(http, token, "rest_get", {"path": path})
        switched, _ = await call(http, token, "switch_identity", {"role_uuid": history_role})
        served, error = await call(http, token, "rest_get", {"path": path})
    assert {i["role_uuid"] for i in me["identities"]} == {login_role, history_role}
    assert "403" in refused
    assert switched["role_uuid"] == history_role
    assert error is None and served["success"] is True


# --- OAuth -------------------------------------------------------------------------------------


async def test_oauth_metadata_and_unauthenticated_challenge(client):
    """/mcp without a token names the resource metadata, which leads to the issuer's, all under /mcp."""
    response = await client.post("/mcp", json={})
    assert response.status_code == 401
    challenge = response.headers["www-authenticate"]
    assert f'resource_metadata="{BASE}/.well-known/oauth-protected-resource/mcp"' in challenge
    resource = (await client.get("/.well-known/oauth-protected-resource/mcp")).json()
    assert resource["resource"] == f"{BASE}/mcp"
    assert [s.rstrip("/") for s in resource["authorization_servers"]] == [f"{BASE}/mcp"]
    server = (await client.get("/.well-known/oauth-authorization-server/mcp")).json()
    assert server["issuer"].rstrip("/") == f"{BASE}/mcp"
    assert {k: server[k] for k in ("authorization_endpoint", "token_endpoint", "registration_endpoint")} == {
        "authorization_endpoint": f"{BASE}/mcp/authorize",
        "token_endpoint": f"{BASE}/mcp/token",
        "registration_endpoint": f"{BASE}/mcp/register",
    }
    assert server["revocation_endpoint"] == f"{BASE}/mcp/revoke"
    assert "code_challenge_methods_supported" in server


@pytest.mark.parametrize(
    "path",
    ["/register", "/authorize", "/token", "/revoke", "/.well-known/oauth-authorization-server"],
)
async def test_no_mcp_path_is_served_at_the_root(client, path):
    """The root paths stay free for the site, which shares the hostname: `/register` is its sign-up page."""
    assert (await client.get(path)).status_code == 404
    assert (await client.post(path)).status_code == 404


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


async def _authorize_through_consent(client, redis, user_uuid, role_uuid):
    """Register, authorize, sign the browser in, allow; returns (client_id, code, verifier, redirect)."""
    redirect = "http://127.0.0.1:9999/callback"
    async with mcp_http() as http:
        reg = (
            await http.post(
                "/mcp/register",
                json={
                    "redirect_uris": [redirect],
                    "client_name": "pytest",
                    "token_endpoint_auth_method": "none",
                },
            )
        ).json()
        verifier, challenge = _pkce()
        authorize = await http.get(
            "/mcp/authorize",
            params={
                "response_type": "code",
                "client_id": reg["client_id"],
                "redirect_uri": redirect,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "st",
            },
        )
    consent = urlsplit(authorize.headers["location"])
    assert f"{consent.scheme}://{consent.netloc}" == SITE
    consent_path = f"{consent.path}?{consent.query}"
    guest = await client.get(consent_path)
    assert guest.status_code == 302 and "/login?callbackUrl=" in guest.headers["location"]
    browser_token = await token_for(redis, user_uuid, role_uuid)
    cookies = {access_cookie_name(): browser_token}
    await everyone_may_use_mcp()
    page = await client.get(consent_path, cookies=cookies)
    assert page.status_code == 200 and "pytest" in page.text
    txn = parse_qs(consent.query)["txn"][0]
    no_origin = await client.post(
        "/api/v1/mcp/consent", data={"txn": txn, "decision": "allow"}, cookies=cookies
    )
    assert no_origin.status_code == 403
    allowed = await client.post(
        "/api/v1/mcp/consent",
        data={"txn": txn, "decision": "allow"},
        cookies=cookies,
        headers={"Origin": SITE},
    )
    assert allowed.status_code == 303
    query = parse_qs(urlsplit(allowed.headers["location"]).query)
    assert query["state"] == ["st"]
    return reg["client_id"], query["code"][0], verifier, redirect, browser_token


async def test_oauth_code_pkce_token_and_refresh_open_a_backend_mcp_session(client, redis, login_user_auth):
    """The whole flow ends in a backend session marked as MCP; refresh rotates through the backend."""
    user_uuid, _ = login_user_auth
    role = await _role_uuid("Login User")
    client_id, code, verifier, redirect, _ = await _authorize_through_consent(client, redis, user_uuid, role)
    async with mcp_http() as http:
        bad = await http.post(
            "/mcp/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect,
                "client_id": client_id,
                "code_verifier": "wrong" * 10,
            },
        )
        tokens = (
            await http.post(
                "/mcp/token",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect,
                    "client_id": client_id,
                    "code_verifier": verifier,
                },
            )
        ).json()
        reused = await http.post(
            "/mcp/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        )
        me, _ = await call(http, tokens["access_token"], "rest_get", {"path": "/api/v1/users/me"})
        refreshed = (
            await http.post(
                "/mcp/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": client_id,
                    "refresh_token": tokens["refresh_token"],
                },
            )
        ).json()
        replay = await http.post(
            "/mcp/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": tokens["refresh_token"] + "x",
            },
        )
        after, error = await call(http, refreshed["access_token"], "rest_get", {"path": "/api/v1/users/me"})
    assert [r.json()["error"] for r in (bad, reused, replay)] == ["invalid_grant"] * 3
    assert me["uuid"] == user_uuid and after["uuid"] == user_uuid and error is None
    assert _decode_access_payload(tokens["access_token"])["mcp"] is True
    assert _decode_access_payload(refreshed["access_token"])["mcp"] is True
    sessions = [
        await SessionRepository(redis).get_session(m.decode())
        for m in await redis.smembers(f"user_sessions:{user_uuid}")
    ]
    assert any(s and s.get("mcp_client") == client_id for s in sessions)


async def test_a_plain_web_token_is_not_an_mcp_token(client, redis, login_user_auth):
    """Only sessions opened for an MCP client are accepted at /mcp."""
    _, web_token = login_user_auth
    async with mcp_http() as http:
        response = await http.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers={"Authorization": f"Bearer {web_token}", "Accept": "application/json, text/event-stream"},
        )
    assert response.status_code == 401


# --- sign-out reaches MCP sessions -------------------------------------------------------------


async def _mcp_refused(token) -> bool:
    async with mcp_http() as http:
        response = await http.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json, text/event-stream"},
        )
    return response.status_code == 401


async def test_web_sign_out_ends_mcp_sessions_but_not_other_devices(client, redis, login_user_auth):
    """Signing the browser out ends every MCP session of the account; its other devices stay signed in."""
    user_uuid, other_device = login_user_auth
    role = await _role_uuid("Login User")
    token = await mcp_token(redis, user_uuid, role)
    browser = await token_for(redis, user_uuid, role)
    assert not await _mcp_refused(token)
    signed_out = await client.delete(
        "/api/v1/auth/session", cookies={access_cookie_name(): browser}, headers={"Origin": SITE}
    )
    assert signed_out.status_code == 204
    assert await _mcp_refused(token)
    assert (await client.get("/api/v1/users/me", headers=auth_header(other_device))).status_code == 200


async def test_logout_all_ends_mcp_sessions(client, redis, login_user_auth):
    """`logout-all` revokes MCP sessions with the rest."""
    user_uuid, web_token = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    assert (await client.post("/api/v1/auth/logout-all", headers=auth_header(web_token))).status_code == 204
    assert await _mcp_refused(token)


async def test_admin_revoke_sessions_ends_mcp_sessions(client, redis, login_user_auth):
    """An administrator's revoke-sessions revokes MCP sessions with the rest."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    _, admin_token = await _create_user_with_grants(redis, ((Perm.USER_EDIT, "all"),))
    revoked = await client.post(
        f"/api/v1/admin/users/{user_uuid}/revoke-sessions", headers=auth_header(admin_token)
    )
    assert revoked.status_code == 204
    assert await _mcp_refused(token)


# --- MCP tokens only read, outside the MCP too ------------------------------------------------


async def _coordinator_mcp_token(redis, user_uuid) -> str:
    return await mcp_token(redis, user_uuid, await _role_uuid("Field Coordinator"))


def _refused(response) -> bool:
    return response.status_code == 403 and response.json()["code"] == "mcp_read_only"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("PATCH", "/api/v1/users/me", {"name": "renamed"}),
        ("PATCH", "/api/v1/notifications/read-all", None),
        ("POST", "/api/v1/auth/logout-all", None),
        ("POST", "/api/v1/auth/switch-identity", {"role_uuid": str(uuid_mod.uuid4())}),
        ("DELETE", "/api/v1/auth/contacts/email", None),
    ],
)
async def test_an_mcp_token_cannot_write_through_rest(client, redis, login_user_auth, method, path, body):
    """Every non-GET REST call with an MCP token is refused before the endpoint runs."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    response = await client.request(method, path, json=body, headers=auth_header(token))
    assert _refused(response), response.text


async def test_an_mcp_token_in_the_cookie_cannot_write_either(client, redis, login_user_auth):
    """Carrying the token in the access cookie, with an allowed origin, changes nothing."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    response = await client.patch(
        "/api/v1/users/me",
        json={"name": "renamed"},
        cookies={access_cookie_name(): token},
        headers={"Origin": SITE},
    )
    assert _refused(response)


async def test_an_mcp_token_still_reads_and_can_end_its_own_session(client, redis, login_user_auth):
    """GETs and GraphQL queries work from outside; `/auth/logout` ends the session."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    assert (await client.get("/api/v1/users/me", headers=auth_header(token))).status_code == 200
    query = await client.post(
        "/graphql", json={"query": "{ currentDisaster { name } }"}, headers=auth_header(token)
    )
    assert query.status_code == 200 and "errors" not in query.json()
    assert (await client.post("/api/v1/auth/logout", headers=auth_header(token))).status_code == 204
    assert (await client.get("/api/v1/users/me", headers=auth_header(token))).status_code == 401


@pytest.mark.parametrize(
    ("body", "params"),
    [
        ({"query": 'mutation { deleteTicket(uuid: "%s") }'}, None),
        ({"query": 'mutation M { gone: deleteTicket(uuid: "%s") }'}, None),
        (
            {
                "query": 'query Q { currentDisaster { name } } mutation M { deleteTicket(uuid: "%s") }',
                "operationName": "M",
            },
            None,
        ),
        (None, {"query": 'mutation { deleteTicket(uuid: "%s") }'}),
    ],
)
async def test_an_mcp_token_cannot_run_a_mutation(
    client, redis, coordinator_auth, sample_ticket, body, params
):
    """Mutations are refused however they are sent: plain, aliased, picked by name, or over GET."""
    user_uuid, _ = coordinator_auth
    token = await _coordinator_mcp_token(redis, user_uuid)
    if body is not None:
        body = {**body, "query": body["query"] % sample_ticket}
        response = await client.post("/graphql", json=body, headers=auth_header(token))
        assert response.status_code == 403
        assert response.json()["errors"][0]["extensions"]["code"] == "mcp_read_only"
    else:
        params = {"query": params["query"] % sample_ticket}
        response = await client.get("/graphql", params=params, headers=auth_header(token))
        assert response.status_code >= 400
    async with gql.test_db() as db:
        from app.models.request import Tickets

        ticket = await db.get(Tickets, uuid_mod.UUID(sample_ticket))
        assert ticket is not None and ticket.delete_at is None


async def test_a_normal_session_still_writes(client, redis, coordinator_auth, sample_ticket):
    """The same mutation and REST write with an ordinary session token go through."""
    _, web_token = coordinator_auth
    renamed = await client.patch("/api/v1/users/me", json={"name": "renamed"}, headers=auth_header(web_token))
    assert renamed.status_code == 200
    mutation = {"query": f'mutation {{ deleteTicket(uuid: "{sample_ticket}") }}'}
    deleted = await client.post("/graphql", json=mutation, headers=auth_header(web_token))
    assert deleted.status_code == 200 and deleted.json()["data"] == {"deleteTicket": True}


async def test_an_mcp_refresh_token_is_refused_outside_the_token_endpoint(client, redis, login_user_auth):
    """`/auth/refresh` will not mint for an MCP session; the token still works at `/token`."""
    user_uuid, _ = login_user_auth
    role = await _role_uuid("Login User")
    client_id, code, verifier, redirect, _ = await _authorize_through_consent(client, redis, user_uuid, role)
    async with mcp_http() as http:
        grant = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect,
            "client_id": client_id,
            "code_verifier": verifier,
        }
        tokens = (await http.post("/mcp/token", data=grant)).json()
        refused = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        refreshed = await http.post(
            "/mcp/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": tokens["refresh_token"],
            },
        )
    assert _refused(refused)
    assert refreshed.status_code == 200
    assert await redis.ttl(f"mcp_client:{client_id}".encode()) > 3600


async def test_a_refresh_after_the_chosen_identity_is_removed_lands_on_the_default(
    client, redis, sample_ticket
):
    """Losing the identity the client switched to does not cost it its tokens: it reads as the default."""
    user_uuid, login_role, history_role = await _two_identity_user()
    client_id, code, verifier, redirect, _ = await _authorize_through_consent(
        client, redis, user_uuid, login_role
    )
    path = f"/api/v1/history/tickets/{sample_ticket}"
    async with mcp_http() as http:
        grant = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect,
            "client_id": client_id,
            "code_verifier": verifier,
        }
        tokens = (await http.post("/mcp/token", data=grant)).json()
        switched, _ = await call(http, tokens["access_token"], "switch_identity", {"role_uuid": history_role})
        async with gql.test_db() as db:
            assignment = await db.scalar(
                select(UserRoleAssign).where(
                    UserRoleAssign.user_uuid == uuid_mod.UUID(user_uuid),
                    UserRoleAssign.role_uuid == uuid_mod.UUID(history_role),
                )
            )
            await db.delete(assignment)
        refreshed = await http.post(
            "/mcp/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": tokens["refresh_token"],
            },
        )
        _, refused = await call(http, refreshed.json()["access_token"], "rest_get", {"path": path})
    assert switched["role_uuid"] == history_role
    assert refreshed.status_code == 200
    payload = _decode_access_payload(refreshed.json()["access_token"])
    assert history_role not in payload["act"] and payload["mcp"] is True
    assert "403" in refused


async def test_register_is_rate_limited_and_unused_clients_expire_soon(client, redis):
    """Registration has a per-IP allowance, and a client that never signs in is kept an hour at most."""
    body = {"redirect_uris": ["http://127.0.0.1:9/cb"], "token_endpoint_auth_method": "none"}
    answers = [await client.post("/mcp/register", json=body) for _ in range(11)]
    assert [r.status_code for r in answers] == [201] * 10 + [429]
    assert 0 < await redis.ttl(f"mcp_client:{answers[0].json()['client_id']}".encode()) <= 3600


_REGISTRATION = {"client_name": "pytest", "token_endpoint_auth_method": "none"}


@pytest.mark.parametrize(
    "redirect",
    [
        "http://127.0.0.1:47123/callback",
        "http://localhost/any/path?x=1",
        "http://[::1]:8787/callback",
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.com/api/mcp/auth_callback",
        "https://www.cursor.com/agents/mcp/oauth/callback",
        "https://chatgpt.com/connector_platform_oauth_redirect",
        "https://chatgpt.com/connector/oauth/abc123",
    ],
)
async def test_loopback_and_known_client_callbacks_register(client, redirect):
    """Native clients' loopback addresses and the hosted clients' own callbacks are accepted."""
    response = await client.post("/mcp/register", json={**_REGISTRATION, "redirect_uris": [redirect]})
    assert response.status_code == 201, response.text


@pytest.mark.parametrize(
    "redirects",
    [
        ["https://evil.example/landing"],
        ["http://127.0.0.1:9/cb", "https://evil.example/landing"],
        ["https://claude.ai.evil.example/api/mcp/auth_callback"],
        ["https://claude.ai/api/mcp/auth_callback/x"],
        ["https://claude.ai/api/mcp/auth_callback?next=https://evil.example"],
        ["https://user@claude.ai/api/mcp/auth_callback"],
        ["https://chatgpt.com/connector/oauth/abc/evil"],
        ["https://chatgpt.com/connector/oauth/"],
        ["https://chatgpt.com.evil.example/connector/oauth/abc"],
        ["http://localhost.evil.example/cb"],
        ["http://127.0.0.1@evil.example/cb"],
        ["http://evil@localhost/cb"],
        ["https://localhost/cb"],
    ],
)
async def test_any_other_redirect_uri_is_refused_and_nothing_is_stored(client, redis, redirects):
    """One redirect URI outside the allowlist refuses the whole registration."""
    response = await client.post("/mcp/register", json={**_REGISTRATION, "redirect_uris": redirects})
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_redirect_uri"
    assert await redis.keys("mcp_client:*") == []


async def test_authorize_errors_and_a_denial_never_reach_an_outside_address(client, redis, login_user_auth):
    """Authorize errors with a foreign redirect URI stay on the server, and a denial returns to loopback."""
    user_uuid, _ = login_user_auth
    outside = "https://evil.example/landing"
    refused = await client.post("/mcp/register", json={**_REGISTRATION, "redirect_uris": [outside]})
    loopback = "http://127.0.0.1:47123/callback"
    reg = (await client.post("/mcp/register", json={**_REGISTRATION, "redirect_uris": [loopback]})).json()
    unknown = await client.get(
        "/mcp/authorize", params={"response_type": "code", "client_id": "nope", "redirect_uri": outside}
    )
    foreign = await client.get(
        "/mcp/authorize",
        params={"response_type": "code", "client_id": reg["client_id"], "redirect_uri": outside},
    )
    no_pkce = await client.get(
        "/mcp/authorize",
        params={"response_type": "code", "client_id": reg["client_id"], "redirect_uri": loopback},
    )
    _, challenge = _pkce()
    authorize = await client.get(
        "/mcp/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": loopback,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    txn = parse_qs(urlsplit(authorize.headers["location"]).query)["txn"][0]
    cookies = {access_cookie_name(): await token_for(redis, user_uuid, await _role_uuid("Login User"))}
    denied = await client.post(
        "/api/v1/mcp/consent",
        data={"txn": txn, "decision": "deny"},
        cookies=cookies,
        headers={"Origin": SITE},
    )
    assert refused.status_code == 400
    assert unknown.status_code == 400 and "location" not in unknown.headers
    assert foreign.status_code == 400 and "location" not in foreign.headers
    assert no_pkce.headers["location"].startswith(loopback + "?error=invalid_request")
    assert denied.status_code == 303
    assert denied.headers["location"].startswith(loopback + "?error=access_denied")


@pytest.mark.parametrize(
    "extra",
    [
        {"client_name": "n" * 101},
        {"redirect_uris": [f"http://127.0.0.1:{port}/cb" for port in range(6)]},
        {"scope": "s " * 4200},
    ],
)
async def test_an_oversized_registration_is_refused_and_nothing_is_stored(client, redis, extra):
    """A long client_name, more than five redirect URIs or a registration over 8 KB is refused."""
    body = {**_REGISTRATION, "redirect_uris": ["http://127.0.0.1:9/cb"], **extra}
    response = await client.post("/mcp/register", json=body)
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_client_metadata"
    assert await redis.keys("mcp_client:*") == []
    assert await redis.zcard("mcp_unused_clients") == 0


async def test_a_registration_at_the_limits_is_accepted(client):
    """A 100-character client_name with five redirect URIs still fits."""
    redirects = [f"http://127.0.0.1:{port}/cb" for port in range(5)]
    body = {**_REGISTRATION, "client_name": "n" * 100, "redirect_uris": redirects}
    assert (await client.post("/mcp/register", json=body)).status_code == 201


async def test_past_the_cap_the_oldest_unused_client_is_forgotten(
    client, redis, monkeypatch, login_user_auth
):
    """A new client always registers; past the cap the oldest unused one goes, never a signed-in one."""
    monkeypatch.setattr(settings, "MCP_MAX_WAITING_CLIENTS", 3)
    user_uuid, _ = login_user_auth
    signed_in, code, verifier, redirect, _ = await _authorize_through_consent(
        client, redis, user_uuid, await _role_uuid("Login User")
    )
    async with mcp_http() as http:
        token = await http.post(
            "/mcp/token",
            data={
                "grant_type": "authorization_code",
                "client_id": signed_in,
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": redirect,
            },
        )
    assert token.status_code == 200, token.text
    body = {**_REGISTRATION, "redirect_uris": ["http://127.0.0.1:9/cb"]}

    async def register() -> str:
        response = await client.post("/mcp/register", json=body)
        assert response.status_code == 201, response.text
        return response.json()["client_id"]

    unused = [await register() for _ in range(4)]
    oldest_authorize = await client.get(
        "/mcp/authorize",
        params={"response_type": "code", "client_id": unused[0], "redirect_uri": "http://127.0.0.1:9/cb"},
    )
    assert await redis.get(f"mcp_client:{unused[0]}") is None
    assert oldest_authorize.status_code == 400
    assert await redis.zcard("mcp_unused_clients") == 3
    unused += await asyncio.gather(*(register() for _ in range(4)))
    assert await redis.zcard("mcp_unused_clients") == 3
    assert len(await redis.keys("mcp_client:*")) == 4
    assert await redis.get(f"mcp_client:{signed_in}") is not None


async def test_a_client_signing_in_while_it_is_pushed_out_is_written_back(client, redis, monkeypatch):
    """A client forgotten as the oldest waiting one just as it signs in is kept, and is no longer waiting."""
    monkeypatch.setattr(settings, "MCP_MAX_WAITING_CLIENTS", 1)
    body = {**_REGISTRATION, "redirect_uris": ["http://127.0.0.1:9/cb"]}
    first = (await client.post("/mcp/register", json=body)).json()["client_id"]
    provider = BackendOAuthProvider(lambda: redis)
    signing_in = await provider.get_client(first)
    assert (await client.post("/mcp/register", json=body)).status_code == 201
    assert await provider.get_client(first) is None
    await provider._keep_client(signing_in)
    assert await provider.get_client(first) == signing_in
    assert await redis.zscore("mcp_unused_clients", first) is None
    assert await redis.ttl(f"mcp_client:{first}") > 3600


async def test_the_consent_page_marks_the_name_as_the_clients_own_and_names_the_identity(
    client, redis, login_user_auth
):
    """The page says the client chose its own name, the identity it starts as, and that it can switch."""
    user_uuid, _ = login_user_auth
    async with gql.test_db() as db:
        db.add(UserRoleAssign(user_uuid=user_uuid, role_uuid=(await ensure_role(db, "user")).uuid))
    loopback = "http://127.0.0.1:47123/callback"
    body = {**_REGISTRATION, "client_name": "Claude", "redirect_uris": [loopback]}
    reg = (await client.post("/mcp/register", json=body)).json()
    _, challenge = _pkce()
    authorize = await client.get(
        "/mcp/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": loopback,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    consent = urlsplit(authorize.headers["location"])
    cookies = {access_cookie_name(): await token_for(redis, user_uuid, await _role_uuid("Login User"))}
    await everyone_may_use_mcp()
    page = await client.get(f"{consent.path}?{consent.query}", cookies=cookies)
    assert page.status_code == 200
    assert "<strong>Claude</strong>（名稱為用戶端自己提供，將返回 127.0.0.1:47123）" in page.text
    assert "的「一般使用者」身分開始讀取資料，也可以切換到這個帳號的其他身分。" in page.text


async def test_a_user_holds_at_most_one_worker_and_another_user_still_runs(
    client, redis, login_user_auth, monkeypatch
):
    """While A's execute runs inside the sandbox, A's second one is refused and B's runs at once."""
    pools = []
    real_pool = mcp_server.pydantic_monty.AsyncMonty

    def spy(**kwargs):
        pools.append(kwargs)
        return real_pool(**kwargs)

    monkeypatch.setattr(mcp_server.pydantic_monty, "AsyncMonty", spy)
    real_request = BackendCaller.request
    started, release = asyncio.Event(), asyncio.Event()

    async def held_request(self, method, path, **kwargs):
        # A's execute waits here inside a tool call, with its sandbox worker checked out.
        if "held" in kwargs.get("json", {}).get("query", ""):
            started.set()
            await release.wait()
            return {"data": "held"}
        return await real_request(self, method, path, **kwargs)

    monkeypatch.setattr(BackendCaller, "request", held_request)
    user_uuid, _ = login_user_auth
    role = await _role_uuid("Login User")
    token, same_user = await mcp_token(redis, user_uuid, role), await mcp_token(redis, user_uuid, role)
    other_uuid, other_role, _ = await _two_identity_user()
    other = await mcp_token(redis, other_uuid, other_role)

    def execute(code):
        return {"name": "execute", "arguments": {"code": code}}

    async with mcp_http() as http:
        first = asyncio.create_task(
            rpc(
                http,
                token,
                "tools/call",
                execute("return await call_tool('graphql_query', {'query': '{ held }'})"),
            )
        )
        await started.wait()
        second = await rpc(http, same_user, "tools/call", execute("return 2"))
        elsewhere = await asyncio.wait_for(rpc(http, other, "tools/call", execute("return 3")), 5)
        release.set()
        first = await first
    assert pools == [{"max_processes": 2, "checkout_timeout": 10}]
    assert second["result"]["isError"] is True
    assert "Another execute of yours is still running" in second["result"]["content"][0]["text"]
    assert elsewhere["result"]["content"][0]["text"] == "3"
    assert "held" in first["result"]["content"][0]["text"]


async def test_an_execute_that_waits_too_long_for_the_worker_is_refused(
    client, redis, login_user_auth, monkeypatch
):
    """While every worker stays taken, an execute is refused as busy once its wait runs out."""
    pools = []
    real_pool = mcp_server.pydantic_monty.AsyncMonty

    def spy(**kwargs):
        pools.append(real_pool(**kwargs))
        return pools[-1]

    monkeypatch.setattr(mcp_server.pydantic_monty, "AsyncMonty", spy)
    monkeypatch.setattr(settings, "MCP_SANDBOX_WAIT_SECONDS", 0.5)
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        async with pools[0].checkout(), pools[0].checkout():
            busy = await rpc(
                http, token, "tools/call", {"name": "execute", "arguments": {"code": "return 1"}}
            )
        after = await rpc(http, token, "tools/call", {"name": "execute", "arguments": {"code": "return 1"}})
    assert busy["result"]["isError"] is True
    assert "The sandbox is busy" in busy["result"]["content"][0]["text"]
    assert after["result"]["content"][0]["text"] == "1"


async def test_execute_is_rate_limited_per_user(client, redis, login_user_auth):
    """The eleventh execute in a minute from one user is refused, in any of their sessions."""
    user_uuid, _ = login_user_auth
    role = await _role_uuid("Login User")
    tokens = [await mcp_token(redis, user_uuid, role) for _ in range(2)]
    async with mcp_http() as http:
        answers = [
            await rpc(
                http, tokens[n % 2], "tools/call", {"name": "execute", "arguments": {"code": "return 1"}}
            )
            for n in range(11)
        ]
    assert [bool(m["result"].get("isError")) for m in answers] == [False] * 10 + [True]
    assert "At most 10 executes per 60 seconds" in answers[-1]["result"]["content"][0]["text"]


async def test_the_sandbox_applies_both_its_time_and_memory_limit(
    client, redis, login_user_auth, monkeypatch
):
    """The execution time and memory settings both reach the sandbox; FastMCP's other limits stay."""
    assert SharedSandbox(lambda: redis).limits == {"max_feed_duration_secs": 15.0, "max_memory": 100_000_000}
    monkeypatch.setattr(settings, "MCP_EXECUTE_SECONDS", 1.0)
    monkeypatch.setattr(settings, "MCP_EXECUTE_MEMORY_BYTES", 10_000_000)
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))

    def execute(code):
        return {"name": "execute", "arguments": {"code": code}}

    async with mcp_http() as http:
        spin = await rpc(http, token, "tools/call", execute("while True:\n    pass"))
        grow = await rpc(http, token, "tools/call", execute("return len('x' * 50_000_000)"))
        small = await rpc(http, token, "tools/call", execute("return len('x' * 1_000)"))
    assert spin["result"]["isError"] is True and "time limit" in spin["result"]["content"][0]["text"]
    assert grow["result"]["isError"] is True and "memory" in grow["result"]["content"][0]["text"].lower()
    assert small["result"]["content"][0]["text"] == "1000"


@pytest.mark.parametrize(
    "name",
    [
        "MCP_EXECUTE_SECONDS",
        "MCP_EXECUTE_MEMORY_BYTES",
        "MCP_SANDBOX_WORKERS",
        "MCP_SANDBOX_WAIT_SECONDS",
        "MCP_EXECUTES_PER_USER",
        "MCP_EXECUTE_WINDOW_SECONDS",
        "MCP_REGISTERS_PER_IP",
        "MCP_REGISTER_WINDOW_SECONDS",
        "MCP_AUTHORIZES_PER_IP",
        "MCP_AUTHORIZE_WINDOW_SECONDS",
        "MCP_MAX_WAITING_CLIENTS",
        "MCP_MAX_TOOL_CALLS",
        "MCP_CALL_TIMEOUT_SECONDS",
        "MCP_QUERY_MAX_CHARS",
        "MCP_CLIENT_NAME_MAX_CHARS",
        "MCP_MAX_REDIRECT_URIS",
        "MCP_REGISTRATION_MAX_BYTES",
        "MCP_UNUSED_CLIENT_SECONDS",
        "MCP_AUTHORIZE_REQUEST_SECONDS",
        "MCP_CODE_SECONDS",
        "MCP_TOOL_CALLS_PER_MINUTE",
    ],
)
@pytest.mark.parametrize("value", ["0", "-1", "lots", "inf"])
async def test_an_mcp_limit_that_is_not_above_zero_stops_the_settings(monkeypatch, name, value):
    """A zero, negative or non-numeric limit in the environment fails at startup."""
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings()


async def test_the_tool_call_limit_per_execute_is_the_setting(client, redis, login_user_auth, monkeypatch):
    """CodeMode stops an execute at MCP_MAX_TOOL_CALLS tool calls."""
    monkeypatch.setattr(settings, "MCP_MAX_TOOL_CALLS", 1)
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    code = "await call_tool('rest_routes', {})\nreturn await call_tool('rest_routes', {})"
    async with mcp_http() as http:
        answer = await rpc(http, token, "tools/call", {"name": "execute", "arguments": {"code": code}})
    assert answer["result"]["isError"] is True
    assert "at most 1 call_tool()" in answer["result"]["content"][0]["text"]


@pytest.mark.parametrize(
    ("name", "value", "extra"),
    [
        ("MCP_CLIENT_NAME_MAX_CHARS", 3, {"client_name": "abcd"}),
        ("MCP_MAX_REDIRECT_URIS", 1, {"redirect_uris": ["http://127.0.0.1:1/cb", "http://127.0.0.1:2/cb"]}),
        ("MCP_REGISTRATION_MAX_BYTES", 100, {}),
    ],
)
async def test_the_registration_limits_are_the_settings(client, redis, monkeypatch, name, value, extra):
    """Each registration limit refuses past its setting, not past a fixed number."""
    monkeypatch.setattr(settings, name, value)
    body = {**_REGISTRATION, "redirect_uris": ["http://127.0.0.1:9/cb"], **extra}
    response = await client.post("/mcp/register", json=body)
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_client_metadata"


async def test_the_lifetimes_are_the_settings(client, redis, monkeypatch, login_user_auth):
    """An unused client, a started sign-in and a code live as long as their settings say."""
    monkeypatch.setattr(settings, "MCP_UNUSED_CLIENT_SECONDS", 100)
    monkeypatch.setattr(settings, "MCP_AUTHORIZE_REQUEST_SECONDS", 50)
    monkeypatch.setattr(settings, "MCP_CODE_SECONDS", 40)
    body = {**_REGISTRATION, "redirect_uris": ["http://127.0.0.1:9/cb"]}
    unused = (await client.post("/mcp/register", json=body)).json()["client_id"]
    _, challenge = _pkce()
    await client.get(
        "/mcp/authorize",
        params={
            "response_type": "code",
            "client_id": unused,
            "redirect_uri": "http://127.0.0.1:9/cb",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    (pending,) = await redis.keys("mcp_authorize:*")
    user_uuid, _ = login_user_auth
    _, code, _, _, _ = await _authorize_through_consent(
        client, redis, user_uuid, await _role_uuid("Login User")
    )
    assert 0 < await redis.ttl(f"mcp_client:{unused}") <= 100
    assert 0 < await redis.ttl(pending) <= 50
    assert 0 < await redis.ttl(f"mcp_code:{code}") <= 40


async def test_the_query_size_and_call_timeout_are_the_settings(client, redis, login_user_auth, monkeypatch):
    """A tool refuses a query past MCP_QUERY_MAX_CHARS and stops a call past MCP_CALL_TIMEOUT_SECONDS."""
    user_uuid, _ = login_user_auth
    token = await mcp_token(redis, user_uuid, await _role_uuid("Login User"))
    async with mcp_http() as http:
        monkeypatch.setattr(settings, "MCP_QUERY_MAX_CHARS", 5)
        _, too_long = await call(http, token, "graphql_query", {"query": "{ __typename }"})
        monkeypatch.setattr(settings, "MCP_QUERY_MAX_CHARS", 20_000)
        monkeypatch.setattr(settings, "MCP_CALL_TIMEOUT_SECONDS", 0.000001)
        _, too_slow = await call(http, token, "graphql_query", {"query": "{ __typename }"})
    assert "longer than 5 characters" in too_long
    assert "The call took longer than" in too_slow


# --- mcp.use and the per-role tool-call allowance ---------------------------------------------------


async def _user_holding(*role_names: str) -> tuple[str, list[str]]:
    """A new account holding the named platform roles (made if missing); returns (user, role uuids)."""
    async with gql.test_db() as db:
        user = User(name=f"mcp-{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        roles = [await ensure_role(db, name) for name in role_names]
        for role in roles:
            db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
        return str(user.uuid), [str(role.uuid) for role in roles]


async def _withdraw_mcp_use(role_uuid: str, key: str = "mcp.use") -> None:
    async with gql.test_db() as db:
        await db.execute(
            text(
                "DELETE FROM role_permission_assign WHERE role_uuid = :r "
                "AND permission_uuid = (SELECT uuid FROM permissions WHERE key = :k)"
            ),
            {"r": role_uuid, "k": key},
        )


async def test_an_account_without_mcp_use_gets_no_code(client, redis):
    """The consent page says plainly the account can't use MCP, and allowing anyway issues no code."""
    user_uuid, (role_uuid,) = await _user_holding("no-mcp-role")
    loopback = "http://127.0.0.1:47123/callback"
    reg = (await client.post("/mcp/register", json={**_REGISTRATION, "redirect_uris": [loopback]})).json()
    _, challenge = _pkce()
    authorize = await client.get(
        "/mcp/authorize",
        params={
            "response_type": "code",
            "client_id": reg["client_id"],
            "redirect_uri": loopback,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    consent = urlsplit(authorize.headers["location"])
    cookies = {access_cookie_name(): await token_for(redis, user_uuid, role_uuid)}
    page = await client.get(f"{consent.path}?{consent.query}", cookies=cookies)
    allowed = await client.post(
        "/api/v1/mcp/consent",
        data={"txn": parse_qs(consent.query)["txn"][0], "decision": "allow"},
        cookies=cookies,
        headers={"Origin": SITE},
    )
    assert page.status_code == 403 and "這個帳號不能使用 MCP" in page.text and "允許" not in page.text
    assert allowed.status_code == 403 and "這個帳號不能使用 MCP" in allowed.text
    assert await redis.keys("mcp_code:*") == []


async def test_mcp_use_on_any_identity_is_enough(client, redis):
    """An account whose current identity lacks mcp.use still uses MCP through another it holds."""
    user_uuid, (without, with_it) = await _user_holding("no-mcp-role", "mcp-role")
    await everyone_may_use_mcp()
    await _withdraw_mcp_use(without)
    token = await mcp_token(redis, user_uuid, without)
    async with mcp_http() as http:
        await _withdraw_mcp_use(without)
        read, error = await call(http, token, "rest_get", {"path": "/api/v1/users/me"})
    assert error is None and read["uuid"] == user_uuid


async def test_withdrawing_mcp_use_cuts_a_session_off_at_its_next_request(client, redis):
    """The next MCP request is refused with the reason and ends the session, so the token stops everywhere."""
    user_uuid, (role_uuid,) = await _user_holding("mcp-role")
    token = await mcp_token(redis, user_uuid, role_uuid)
    bearer = {"Authorization": f"Bearer {token}"}
    async with mcp_http() as http:
        _, before = await call(http, token, "rest_get", {"path": "/api/v1/users/me"})
        assert (await client.get("/api/v1/users/me", headers=bearer)).status_code == 200
        await _withdraw_mcp_use(role_uuid)
        refused = await rpc(http, token, "tools/list", {})
        again = await http.post(
            "/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, headers=bearer
        )
    assert before is None
    assert "result" not in refused and "may not use MCP" in refused["error"]["message"]
    assert again.status_code == 401
    assert (await client.get("/api/v1/users/me", headers=bearer)).status_code == 401


async def test_without_mcp_use_a_refresh_is_refused_and_ends_the_session(client, redis, login_user_auth):
    """A client that only refreshes is cut off too: the refresh is refused with the reason."""
    user_uuid, _ = login_user_auth
    role = await _role_uuid("Login User")
    client_id, code, verifier, redirect, _ = await _authorize_through_consent(client, redis, user_uuid, role)
    async with mcp_http() as http:
        tokens = await http.post(
            "/mcp/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": redirect,
            },
        )
        await _withdraw_mcp_use(role)
        refreshed = await http.post(
            "/mcp/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": tokens.json()["refresh_token"],
            },
        )
    assert refreshed.status_code == 401, refreshed.text
    assert (
        refreshed.json()["error"] == "invalid_grant"
        and "may not use MCP" in refreshed.json()["error_description"]
    )
    bearer = {"Authorization": f"Bearer {tokens.json()['access_token']}"}
    assert (await client.get("/api/v1/users/me", headers=bearer)).status_code == 401


async def test_a_code_issued_before_mcp_use_was_withdrawn_opens_no_session(client, redis, login_user_auth):
    """The code exchange checks mcp.use too, so a code from before the change gets no token."""
    user_uuid, _ = login_user_auth
    role = await _role_uuid("Login User")
    client_id, code, verifier, redirect, _ = await _authorize_through_consent(client, redis, user_uuid, role)
    await _withdraw_mcp_use(role)
    async with mcp_http() as http:
        await _withdraw_mcp_use(role)
        exchanged = await http.post(
            "/mcp/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": redirect,
            },
        )
    assert exchanged.json()["error"] == "invalid_grant", exchanged.text
    assert "may not use MCP" in exchanged.json()["error_description"]
    repo = SessionRepository(redis)
    sids = [m.decode() for m in await redis.smembers(repo.USER_SESSIONS + user_uuid)]
    assert not [sid for sid in sids if ((await repo.get_session(sid)) or {}).get("mcp_client")]


async def _backend_calls(http, token, count: int, monkeypatch) -> tuple[int, str | None]:
    """Make `count` backend calls in one execute; return (calls that reached the app, error text)."""
    reached = []
    real = BackendCaller._in_process

    async def counted(self, scope, receive, send):
        reached.append(scope["path"])
        await real(self, scope, receive, send)

    monkeypatch.setattr(BackendCaller, "_in_process", counted)
    code = (
        f"for _ in range({count}):\n    await call_tool('rest_get', {{'path': '/api/v1/users/me'}})\nreturn 1"
    )
    answer = await rpc(http, token, "tools/call", {"name": "execute", "arguments": {"code": code}})
    error = answer["result"]["content"][0]["text"] if answer["result"].get("isError") else None
    return len(reached), error


async def test_an_account_holding_only_user_gets_ten_backend_calls_a_minute(client, redis, monkeypatch):
    """The eleventh backend call in a minute is refused before it reaches the app, saying when to retry."""
    user_uuid, (role_uuid,) = await _user_holding("user")
    token = await mcp_token(redis, user_uuid, role_uuid)
    async with mcp_http() as http:
        reached, error = await _backend_calls(http, token, 11, monkeypatch)
    assert reached == 10
    assert "At most 10 tool calls a minute for this account; try again in" in error


async def test_unlimited_use_on_another_identity_lifts_the_limit_while_acting_as_user(
    client, redis, monkeypatch
):
    """An account that also holds a role with mcp.unlimited_use has no limit, even acting as `user`."""
    user_uuid, (user_role, _) = await _user_holding("user", "team-lead-like")
    token = await mcp_token(redis, user_uuid, user_role)
    async with mcp_http() as http:
        reached, error = await _backend_calls(http, token, 12, monkeypatch)
    assert (reached, error) == (12, None)


async def test_a_per_user_grant_of_unlimited_use_lifts_the_limit(client, redis, monkeypatch):
    """A super admin can exempt one account with a direct grant."""
    user_uuid, (user_role,) = await _user_holding("user")
    await everyone_may_use_mcp()
    async with gql.test_db() as db:
        await db.execute(
            text(
                "INSERT INTO user_permission_assign (uuid, user_uuid, permission_uuid, scope) "
                "SELECT gen_random_uuid(), :u, uuid, 'all' FROM permissions WHERE key = 'mcp.unlimited_use'"
            ),
            {"u": user_uuid},
        )
    token = await mcp_token(redis, user_uuid, user_role)
    async with mcp_http() as http:
        reached, error = await _backend_calls(http, token, 12, monkeypatch)
    assert (reached, error) == (12, None)


async def test_taking_unlimited_use_from_a_role_limits_the_next_calls(client, redis, monkeypatch):
    """A change in the RBAC settings applies at the next counted call, with the configured number."""
    monkeypatch.setattr(settings, "MCP_TOOL_CALLS_PER_MINUTE", 2)
    user_uuid, (user_role, lead) = await _user_holding("user", "team-lead-like")
    token = await mcp_token(redis, user_uuid, user_role)
    async with mcp_http() as http:
        before = await _backend_calls(http, token, 3, monkeypatch)
        await _withdraw_mcp_use(lead, "mcp.unlimited_use")
        monkeypatch.undo()
        monkeypatch.setattr(settings, "MCP_TOOL_CALLS_PER_MINUTE", 2)
        after = await _backend_calls(http, token, 3, monkeypatch)
    assert before == (3, None)
    assert after[0] == 2 and "At most 2 tool calls a minute" in after[1]
