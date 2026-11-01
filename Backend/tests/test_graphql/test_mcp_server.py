"""The MCP server: OAuth onto backend sessions, generic read-only tools, identity choice and sign-out."""

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
from sqlalchemy import select

from app.core.auth_cookies import access_cookie_name
from app.core.identity import encode_act
from app.core.permissions import Perm
from app.core.security import _decode_access_payload, create_access_token
from app.graphql.schema import schema as app_schema
from app.main import app
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.repositories.session_repository import SessionRepository
from mcp_server import build_server
from mcp_server.tools import register_tools
from tests.conftest import token_for
from tests.test_graphql import conftest as gql
from tests.test_graphql.conftest import _create_user_with_grants, auth_header

pytestmark = pytest.mark.asyncio

SITE = "http://localhost:3000"
BASE = "http://localhost:8000"


@asynccontextmanager
async def mcp_http():
    """A fresh MCP app (its session manager runs once per instance) whose tools call the test app."""
    mcp_app = build_server(app).http_app(path="/mcp", stateless_http=True)
    async with (
        mcp_app.router.lifespan_context(mcp_app),
        AsyncClient(transport=ASGITransport(app=mcp_app), base_url=BASE) as http,
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
    """Discovery documents are served, and /mcp without a token answers 401 naming the metadata."""
    resource = (await client.get("/.well-known/oauth-protected-resource/mcp")).json()
    server = (await client.get("/.well-known/oauth-authorization-server")).json()
    response = await client.post("/mcp", json={})
    assert resource["resource"].endswith("/mcp") and resource["authorization_servers"]
    assert {"authorization_endpoint", "token_endpoint", "registration_endpoint"} <= set(server)
    assert "code_challenge_methods_supported" in server
    assert response.status_code == 401
    assert "resource_metadata=" in response.headers["www-authenticate"]


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
                "/register",
                json={
                    "redirect_uris": [redirect],
                    "client_name": "pytest",
                    "token_endpoint_auth_method": "none",
                },
            )
        ).json()
        verifier, challenge = _pkce()
        authorize = await http.get(
            "/authorize",
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
            "/token",
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
                "/token",
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
            "/token",
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
                "/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": client_id,
                    "refresh_token": tokens["refresh_token"],
                },
            )
        ).json()
        replay = await http.post(
            "/token",
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
        tokens = (await http.post("/token", data=grant)).json()
        refused = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        refreshed = await http.post(
            "/token",
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
        tokens = (await http.post("/token", data=grant)).json()
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
            "/token",
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
    answers = [await client.post("/register", json=body) for _ in range(11)]
    assert [r.status_code for r in answers] == [201] * 10 + [429]
    assert 0 < await redis.ttl(f"mcp_client:{answers[0].json()['client_id']}".encode()) <= 3600
