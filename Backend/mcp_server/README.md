# MCP server

A read-only [MCP](https://modelcontextprotocol.io) server inside the backend. An MCP client (Claude,
Claude Code, Cursor…) signs in with the user's normal account and reads data as one of that user's
identities, with that identity's permissions and masking.

(The package is `mcp_server`, not `mcp`: a top-level `mcp` package would hide the `mcp` SDK that
FastMCP imports.)

## Connecting a client

Point the client at `{MCP_BASE_URL}/mcp` (on staging `https://staging.wan-guard.com/mcp`, locally
`http://localhost:8000/mcp`), e.g.

```
claude mcp add --transport http wan-guard http://localhost:8000/mcp
```

The client finds everything else itself. The issuer is `{MCP_BASE_URL}/mcp`, so every OAuth path is under
`/mcp` and the discovery documents are where RFC 9728 and RFC 8414 put them for a path:

```
client ──POST /mcp──▶ 401  WWW-Authenticate: resource_metadata=…/.well-known/oauth-protected-resource/mcp
       ──GET  /.well-known/oauth-protected-resource/mcp──▶ authorization server {MCP_BASE_URL}/mcp
       ──GET  /.well-known/oauth-authorization-server/mcp──▶ endpoints
       ──POST /mcp/register──▶ client_id                    (dynamic registration)
       ──GET  /mcp/authorize?…code_challenge…──▶ 302 {SITE_APP_URL}/api/v1/mcp/consent?txn=…
browser ─ consent page on the site (through the site's /api/v1 proxy, so the sign-in cookie applies)
            not signed in → /login?callbackUrl=… (password, Google or LINE) → back to the consent page
            「允許」 → 303 redirect_uri?code=…
client ──POST /mcp/token (code + PKCE verifier)──▶ backend access token + refresh token
```

The tokens are the backend's own: allowing the client opens an ordinary backend session marked with
`mcp_client`, and refreshing goes through the backend's refresh rotation.

Settings: `MCP_BASE_URL` is the public URL clients reach the backend at; the consent page lives on
`SITE_APP_URL`. Nothing is served at the root (`/register`, `/authorize`, …), so `MCP_BASE_URL` can be the
site's own URL, whose root paths are the site's pages. Clients written for the oldest MCP authorization
spec, which looked for the metadata at the root whatever the path, are not supported.

## Deployment

The backend is reachable only through the site. To serve MCP clients, the edge in front of the site's
hostname (the Cloudflare tunnel on staging, `DEPLOY.md` "MCP clients") sends **only** these paths to the
backend:

```
/mcp   /mcp/register   /mcp/authorize   /mcp/token   /mcp/revoke
/.well-known/oauth-protected-resource/mcp   /.well-known/oauth-authorization-server/mcp
```

Never the rest of the backend: `/api/v1` and `/graphql` stay behind the site. The consent page
(`/api/v1/mcp/consent`) is reached through the site's own proxy, not this edge.

Every per-IP rate limit (sign-in included) keys on the address `resolve_client_ip` works out. It
believes `X-Forwarded-For` only from peers in `TRUSTED_PROXIES` (default: loopback and the private
ranges, where the site's proxy sits today) and uses the socket address otherwise. So:

- the edge must put the real client IP as the **last** entry of `X-Forwarded-For` (appending to what
  the client sent is fine: the header is read right to left, past trusted hops, so entries the client
  wrote are never reached), and it must reach the backend from an address in `TRUSTED_PROXIES`;
- if the edge reaches the backend from somewhere else, add its address to `TRUSTED_PROXIES`; if
  untrusted callers could reach the backend from a private address (e.g. Docker Desktop's port
  publishing, which makes every outside caller look private), narrow `TRUSTED_PROXIES` to the
  proxies' own addresses.

The MCP tools pass the resolved caller IP on to their in-process calls, from loopback.

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

- `graphql_query` refuses documents over 20 000 characters before parsing, then anything that is
  not a `query` and any root field in `DENIED_ROOT_FIELDS`. `/graphql` itself then applies its own
  limits: depth 10, 10 aliases, 1 000 tokens.
- `rest_get` only reaches GET routes under `/api/v1` outside `EXCLUDED_REST_PREFIXES` (auth, admin,
  bulk, map, rbac-test, invites, mcp).
- Every backend call times out after 30 seconds. CodeMode's sandbox allows 15 s of execution and 100 MB per
  `execute`, and at most 50 tool calls in it; the 15 s counts sandbox time only, not time waiting for a
  worker or on a tool call.
- Every `execute` runs on one of two sandbox worker processes shared by the whole app; when both are busy,
  an `execute` waits at most 10 seconds before being refused as busy. A user runs one `execute` at a time
  across all their sessions (a second one meanwhile is refused with an error), so one user holds at most
  one worker, and may start 10 per minute.
- `/mcp/register` allows 10 registrations per IP per hour and `/mcp/authorize` 30 per IP per 10 minutes; a
  client that never finishes a sign-in is forgotten after an hour. A registration may carry a `client_name`
  of 100 characters, 5 redirect URIs and 8 KB in all (else 400 `invalid_client_metadata`). At most 1 000
  clients are kept waiting for their first sign-in: a new registration always succeeds and pushes out the
  oldest waiting one, so Redis holds at most 1 000 × 8 KB of them; a client that has signed in is never
  pushed out.
- Each backend call a tool makes counts against `MCP_TOOL_CALLS_PER_MINUTE` (10) unless the account holds
  `mcp.unlimited_use` (see "Who may use it").
- Every number in this list except `/graphql`'s own depth, alias and token limits is a setting
  (`MCP_EXECUTE_SECONDS`, `MCP_SANDBOX_WORKERS`, `MCP_MAX_WAITING_CLIENTS`, … in `app/core/config.py`); the
  numbers above are their defaults, and `DEPLOY.md` lists them all.

`DENIED_ROOT_FIELDS` and `EXCLUDED_REST_PREFIXES` in `tools.py` are the only lists to maintain.

## Who may use it

`mcp.use` decides whether an account may use the MCP and `mcp.unlimited_use` whether its tools' backend calls
are limited; what they mean, their defaults, where each is checked and why are in ADR-463
(`Spec/008-rbac-authorization/decisions.md`). The code is in `access.py`.

## MCP tokens only read, everywhere

An MCP client's access token carries an `mcp` claim (set from the session's `mcp_client` marker every
time a token is signed: on sign-in, refresh and identity switch). `accept_access_token`, which every
REST endpoint and the GraphQL context go through, refuses any non-GET request with such a token with
403 `mcp_read_only`, and the GraphQL schema runs nothing but queries for it (mutations answer 403 with
the same code). What an MCP token may still do outside the MCP:

- read (GET, HEAD, OPTIONS, and GraphQL queries);
- end its own session (`POST /api/v1/auth/logout`);
- be refreshed, through the MCP's `/mcp/token` only: `/api/v1/auth/refresh` and the browser's refresh
  refuse an MCP session's refresh token with 403 `mcp_read_only`, so nothing outside can mint a token
  that writes. The refreshed token is read-only too.

The MCP's own identity switch is the one in-process write: its calls go through an ASGI wrapper that
sets a scope-state flag, which no outside request can carry.

## Identity

`rest_get("/api/v1/users/me")` lists the identities the account holds. `switch_identity` calls the
backend's `/auth/switch-identity`, which records the choice on the session; every later call runs as
it. A session starts on the account's default identity.

## Signing out

An MCP token works only while its backend session is live:

- signing out of the website (`DELETE /api/v1/auth/session`) ends all of the account's MCP sessions;
- `logout-all`, a password change and an administrator's revoke-sessions end every session, MCP
  sessions included;
- a client's own `/mcp/revoke` ends its session.
