# MCP server

A read-only [MCP](https://modelcontextprotocol.io) server inside the backend. An MCP client (Claude,
Claude Code, Cursor…) signs in with the user's normal account and reads data as one of that user's
identities, with that identity's permissions and masking.

(The package is `mcp_server`, not `mcp`: a top-level `mcp` package would hide the `mcp` SDK that
FastMCP imports.)

## Connecting a client

Point the client at `{MCP_BASE_URL}/mcp` (locally `http://localhost:8000/mcp`), e.g.

```
claude mcp add --transport http wan-guard http://localhost:8000/mcp
```

The client finds everything else itself:

```
client ──POST /mcp──▶ 401  WWW-Authenticate: resource_metadata=…/.well-known/oauth-protected-resource/mcp
       ──GET  /.well-known/oauth-authorization-server──▶ endpoints
       ──POST /register──▶ client_id                        (dynamic registration)
       ──GET  /authorize?…code_challenge…──▶ 302 {SITE_APP_URL}/api/v1/mcp/consent?txn=…
browser ─ consent page on the site (through the site's /api/v1 proxy, so the sign-in cookie applies)
            not signed in → /login?callbackUrl=… (password, Google or LINE) → back to the consent page
            「允許」 → 303 redirect_uri?code=…
client ──POST /token (code + PKCE verifier)──▶ backend access token + refresh token
```

The tokens are the backend's own: allowing the client opens an ordinary backend session marked with
`mcp_client`, and refreshing goes through the backend's refresh rotation.

Settings: `MCP_BASE_URL` is the public URL clients reach the backend at. The consent page lives on
`SITE_APP_URL`. In production the backend sits behind the site, so `/mcp`, `/authorize`, `/token`,
`/register`, `/revoke` and `/.well-known/oauth-*` must be routed to it.

## Tools

The server runs behind FastMCP's CodeMode: the client sees `search`, `get_schema` and `execute`, and
writes Python that calls the tools below with `call_tool(name, params)`.

| tool | what it does |
| --- | --- |
| `graphql_schema(types?)` | the live GraphQL schema (SDL), query side only |
| `graphql_query(query, variables?)` | runs a GraphQL query against `/graphql` |
| `rest_routes()` | the REST GET routes it may read, with their parameters |
| `rest_get(path, params?)` | GETs one of those routes |
| `switch_identity(role_uuid, team_uuid?)` | acts as another of the user's identities |

Nothing is listed per endpoint: a new query field or GET route appears here with no change to this
package. Each call goes to the backend's own endpoint in process, so permissions, masking and response
shapes are the endpoint's.

Read only is enforced, not listed:

- `graphql_query` parses the document and refuses anything that is not a `query`, any root field in
  `DENIED_ROOT_FIELDS`, documents over 20 000 characters and selections nested deeper than 12.
- `rest_get` only reaches GET routes under `/api/v1` outside `EXCLUDED_REST_PREFIXES` (auth, admin,
  bulk, map, rbac-test, invites, mcp).
- Every call times out after 30 seconds.

`DENIED_ROOT_FIELDS` and `EXCLUDED_REST_PREFIXES` in `tools.py` are the only lists to maintain.

## Identity

`rest_get("/api/v1/users/me")` lists the identities the account holds. `switch_identity` calls the
backend's `/auth/switch-identity`, which records the choice on the session; every later call runs as
it. A session starts on the account's default identity.

## Signing out

An MCP token works only while its backend session is live:

- signing out of the website (`DELETE /api/v1/auth/session`) ends all of the account's MCP sessions;
- `logout-all`, a password change and an administrator's revoke-sessions end every session, MCP
  sessions included;
- a client's own `/revoke` ends its session.
