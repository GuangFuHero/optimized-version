# Decisions: 023 Backend Session Login

Sign-in moves to the backend. The browser holds the session in cookies the backend sets, beside the Bearer
tokens that scripts and tests keep using; the backend runs the Google and LINE OAuth flows itself; and one
sign-in covers both the site and the back office, which live on sibling hosts.

Numbering continues the repo-wide ADR sequence: this spec holds ADR-325 to ADR-331. The decisions were made
by the product owner between 2026-10-11 and 2026-10-17.

---

### ADR-326 The browser keeps the session in prefixed cookies on its environment's parent domain

> **Status: ACCEPTED (2026-10-17).** The domains and the cookies were chosen by the product owner on
> 2026-10-16. The first layout scoped the refresh cookie to `/api/v1/auth/session` and let the access cookie
> expire with its JWT after 15 minutes; it was changed to point 4 below the same day, once the frontend design
> showed it could not work.

**In plain words**: after signing in, the browser holds two cookies the backend set — the short-lived pass and
the means to renew it. Page scripts cannot read them, and every page of both the site and the back office
sends them, so one sign-in covers both. Each environment's cookies carry their own name, so production,
staging and a developer's machine never mix theirs up.

**Context**: Until now the frontend's NextAuth cookie held the backend's tokens and the frontend's server sent
them on as Bearer. With sign-in moving to the backend (ADR-325), the backend sets the cookies itself, and they
have to reach two sibling hosts: the site and the back office (`staging.wan-guard.com` and
`admin.staging.wan-guard.com` on staging, `wan-guard.com` and `admin.wan-guard.com` in production).

**Decision**:

1. Three cookies, each named with `AUTH_COOKIE_PREFIX` — `wg` in production, `wgstg` on staging, `wgdev` on a
   developer's machine and by default:

   | cookie | holds | `Path` | `Max-Age` |
   |---|---|---|---|
   | `{p}_at` | the access token, a JWT that expires after 15 minutes | `/` | `REFRESH_TOKEN_EXPIRE_DAYS`, renewed on every refresh |
   | `{p}_rt` | the refresh token | `/` | the same |
   | `{p}_oauth` | the state of a Google or LINE sign-in in progress | `/api/v1/auth/oauth` | 10 minutes |

2. All three are `HttpOnly` and `SameSite=Lax`, and `Secure` unless `AUTH_COOKIE_SECURE` is false. `Secure` is
   a setting of its own rather than derived from `ENV`, which counts as production when unset.
3. `Domain` is `AUTH_COOKIE_DOMAIN`, the parent of the environment's two hosts (`.wan-guard.com`,
   `.staging.wan-guard.com`). Left empty, no `Domain` is sent and the cookie stays on one host, as a
   developer's `localhost` needs.
4. **The access cookie outlives its JWT, and the refresh cookie goes to every path.** The frontend's server
   refreshes on the browser's behalf — in its proxy, and before rendering a page — and both only ever see
   ordinary paths, so a refresh cookie scoped to the session endpoints would never reach them. An access
   cookie expiring together with its JWT would vanish from the browser: the next request would arrive as a
   guest's, public data would be served to a user who had silently become a guest, and the backend could
   never answer `access_token_expired` (ADR-328). Kept for the session's lifetime, the expired token reaches
   the backend and is answered for what it is. The frontend's proxy forwards only cookies with its own
   prefix, and strips `{p}_rt` from every request but the session endpoints'.
5. The backend reads only cookies with its own prefix, and reads `{p}_rt` only on the session endpoints
   (`/auth/session*`), so a refresh token that does travel with some other request is never used there.
   Clearing a cookie writes the same name, path and domain with `Max-Age=0`; a browser ignores a clear sent
   under any other combination.
6. No environment logs `Cookie`, `Set-Cookie` or `Authorization` headers — neither the backend nor the
   frontend's server.

**Consequences**:
➕ One sign-in covers the site and the back office.
➕ A script injected into a page cannot read a token.
➖ Staging and production are separated in one direction only. Staging's cookies, on `.staging.wan-guard.com`,
never reach production's hosts. Production's, on `.wan-guard.com`, do reach staging's, which are subdomains of
`wan-guard.com` too: staging's backend never reads them (another prefix, another signing key) and its proxy
does not forward them, but staging's frontend server receives them. Separating the two completely takes a
registrable domain of staging's own, to be decided before production launches.
➖ The refresh token now travels with every request to the frontend's own server (same origin, `HttpOnly`),
not only to the session endpoints.

---

### ADR-327 A write carried by the cookie must come from one of our own pages

> **Status: ACCEPTED (2026-10-17).** Chosen by the product owner on 2026-10-16, together with moving sign-in
> to the backend. The exception for refreshing was added the same day, for the frontend's server.

**In plain words**: once the browser holds the session in cookies, a page on any site could make the browser
send us a request with those cookies attached. So a request that signs in with the cookie and changes
something has to show that it came from one of our own pages; otherwise it is turned away.

**Context**: A Bearer token is only sent by code that holds it. A cookie is attached by the browser to every
request for our hosts — including one that a form on another site submits, which is cross-site request
forgery. CORS does not help: since #75 it allows any origin without credentials, and in any case it decides
who may read a response, not whether a request is sent. `SameSite=Lax` stops another site's form from carrying
the cookie, but not a page on another subdomain of ours: to the browser, every `*.wan-guard.com` host is the
same site.

**Decision**:

1. A request authenticates with a Bearer token when it sends one, and with the `{p}_at` cookie (ADR-326) only
   when it does not. The two are never combined: a Bearer token that fails is a failure, whatever cookie came
   with it. REST (`get_current_user`, `get_current_session`) and the GraphQL context go through the same
   function; the audit middleware reads the token by the same rule, to attribute writes.
2. A request authenticated by the cookie whose method is not GET, HEAD or OPTIONS must carry an `Origin`
   listed in `AUTH_ALLOWED_ORIGINS` — the site's and the back office's — compared case-insensitively and
   without a trailing slash; without `Origin`, the origin of its `Referer` counts. Neither, `Origin: null`,
   or any other origin answers 403 `origin_not_allowed`. On GraphQL this covers every mutation and every
   query sent as a POST. A query sent as a GET only reads and passes like any GET; the frontend's GraphQL
   route forwards GET queries, and Strawberry refuses a mutation over GET.
3. A Bearer request is not checked: a browser never puts a token into a header on its own.
4. The endpoints that start a session from no cookie at all — signing in, finishing a registration, signing
   out, starting a Google or LINE sign-in — check the origin as well (ADR-325, ADR-331), against signing a
   victim into someone else's account. Refreshing is the exception: the frontend's server refreshes before it
   renders a page, and a browser asks for a page without an `Origin`. Little is lost by it. A cross-site
   request cannot carry the `SameSite=Lax` refresh cookie, and one from a sibling subdomain can only make the
   victim's own browser renew its own session, without the attacker seeing the result — the worst case is one
   rotation more, which ADR-330's grace period already absorbs. The OAuth callback is the provider's redirect
   and is protected by its state instead.
5. CORS stays as #75 left it.

**Consequences**:
➕ No other site, and no other subdomain, can make a signed-in browser change anything.
➖ The frontend's server must send `Origin` itself on any POST it makes with a user's cookie — GraphQL queries
sent as POSTs included — or be refused.
➖ The allowed origins are configuration. An environment that forgets them refuses every cookie-authenticated
write: loudly, rather than accepting one it should not.

---

### ADR-328 Every 401 a token earns names why: refresh, or signed out

> **Status: ACCEPTED (2026-10-17).** Chosen by the product owner on 2026-10-16, together with moving sign-in
> to the backend.

**In plain words**: when the backend turns a token away, it now says why. Two answers mean "this pass just ran
out, get a new one and try again"; the others mean "you are signed out". The browser has to know which: the
first is fixed without the user noticing, the second sends them to the sign-in page.

**Context**: Every failure of an access token answered with the same bare 401, "Could not validate
credentials", and no `code` — unlike the other auth errors, which carry one (`app/core/api_errors.py`). With
sign-in moving to the backend, the frontend's server keeps the session in cookies and refreshes on the user's
behalf (ADR-325), so it must know whether a refresh can help. An access token that simply passed its 15
minutes and a session an admin had just revoked looked identical: a client either refreshed after every 401,
or signed the user out whenever a token expired.

**Decision**:

1. The 401 from `get_current_user` and `get_current_session` — every REST endpoint and the GraphQL context —
   is an `ApiError` with one of four codes. `detail` stays "Could not validate credentials", and the
   `WWW-Authenticate: Bearer` header stays.

   | code | when | the client should |
   |---|---|---|
   | `access_token_expired` | the token's `exp` has passed | refresh, then send the request again |
   | `access_token_stale` | the token's `act` no longer matches its session's (ADR-195) | refresh, then send the request again |
   | `session_expired` | the session is gone: logout, logout-all, a password change or reset, an admin's kick | treat the user as signed out |
   | `credentials_invalid` | a bad signature, not an access token, no `sub` or `sid`, a session belonging to someone else, the account or the acting identity gone, the session store unreachable | treat the user as signed out |

2. REST and GraphQL answer in one shape: HTTP 401 with `{"detail", "code"}`. The GraphQL context is a FastAPI
   dependency of the Strawberry router, so its `ApiError` reaches the same exception handler as REST instead
   of becoming a GraphQL error inside a 200. A guest who reaches a resolver that needs a user is a different
   case and keeps its GraphQL error from `require_authenticated`: there is no token to refresh.
3. The session store being unreachable stays `credentials_invalid`. ADR-100 makes that answer identical to an
   invalid token on purpose, and the log is still what tells the two apart.
4. A request authenticated by the access cookie (ADR-327) and answered `session_expired` or
   `credentials_invalid` gets both sign-in cookies cleared in the same response (ADR-326); otherwise the
   browser keeps sending a token that can never work again. `access_token_expired` and `access_token_stale`
   clear nothing, because the refresh needs the cookies. A Bearer request never has cookies cleared. The
   clearing is done in the exception handler REST and the GraphQL context share, not at each raise site, and
   not in a middleware, which would have to parse the response body to find the code.
5. A request carrying no token at all, on an endpoint that needs one, answers 401 `credentials_invalid` with
   the detail "Not authenticated". It is not cookie-authenticated, so nothing is cleared, and a client tells a
   guest apart by whether it sent a cookie.

**Consequences**:
➕ A client refreshes exactly when that helps, and signs the user out exactly when it must.
➕ Bearer clients see the same status, detail and header as before; only `code` is new.
➖ While Redis is unreachable, everyone who makes a request reads as signed out — as before this ADR, now
spelled out in the code — and a browser also has its cookies cleared, so it signs in again once Redis is back.

---

### ADR-330 A rotated refresh token is accepted again for 30 seconds

> **Status: ACCEPTED (2026-10-17).** The grace period was chosen by the product owner on 2026-10-16, together
> with moving sign-in to the backend.

**In plain words**: when two tabs, or the site and the back office, refresh with the same token at almost the
same moment, both get the same new token and nobody is signed out. Presenting an old token again after 30
seconds is still treated as theft and ends the session, as before.

**Context**: A refresh token works once. `SessionRepository.rotate` claims it with a `SET NX` on
`refresh_used:{hash}`, and a second claim revokes the whole session, because a token used twice is the signal
that it was stolen (ADR-196 made the claim safe to retry). That held while each browser kept its own tokens.
It no longer does: the site and the back office share one cookie (ADR-326); one page fires several requests
whose access token expires together; and more than one server process can refresh at once. Two refreshes
carrying the same token within a moment are now the normal case, and the second one signed the user out of
every device.

**Decision**:

1. **The first rotation records the new token inside its claim.** The value written by the `SET NX` is now a
   small JSON record: the attempt's nonce, when the claim was made, and the new refresh token encrypted with
   AES-GCM. The key is derived from the old token with HKDF-SHA256 (`info = wg-refresh-grace-v1`), and the
   old token's hash is the associated data. Redis therefore never holds a usable token: only someone
   presenting the old token can decrypt the new one. Because the record travels in the claim itself, there
   is no moment when the token is claimed but the record is missing.
2. **A replay within `REFRESH_REUSE_GRACE_SECONDS` (30) gets the same new refresh token**, with a freshly
   signed access token. The session is neither revoked nor touched.
3. **A replay within the grace period whose session is already gone is refused** as an invalid token —
   logging out, changing the password or an admin's kick inside those 30 seconds is not undone.
4. **After the grace period, a replay revokes the session as before.** So does a claim this record cannot be
   read from, including every claim written before this change. Setting the grace period to 0 restores the
   old behaviour exactly.
5. **ADR-196's retry still holds.** A client whose `SET NX` ran but whose reply was lost reads back its own
   value and carries on. The per-attempt nonce inside the record keeps every attempt's value unique.
6. `POST /auth/refresh` and the browser's refresh (ADR-325) both go through `rotate`, so both get this.

**Amends**:

- ADR-196 decision 2 (`Spec/014-session-revocation`): the `SET NX` value is no longer a bare per-attempt
  nonce but the record in point 1, which still carries that nonce. A retried claim still reads back its own
  value, so ADR-196's retry semantics are unchanged.

**Consequences**:
➕ The site, the back office, several tabs and several server processes can refresh at once without signing
each other out.
➕ Theft detection is unchanged outside the window, and Redis still holds only hashes and ciphertext.
➖ Someone who steals an old refresh token and presents it within 30 seconds of its rotation gets the same new
token as its owner, and the backend cannot tell them apart. Auth0's refresh token reuse interval and Okta's
grace period make the same trade.
➖ If the chain was rotated again inside the window — one client turned `new1` into `new2` before another
arrived with the old token — the late client gets `new1`. That still works: `new1`'s own window opened later
than the old token's, so the late client's next refresh is inside it.
➖ A process that crashes after its claim but before storing the new token leaves the grace path handing out a
token that was never stored. The next refresh with it fails and the user signs in again — the same safe
failure the claim had before.
➖ The window is measured with each server process's own clock: the claim records when it was made, and a
replay compares that with the time where it lands. With one backend today this is exact. With several, clock
drift between them stretches or shrinks the window by the drift; if that ever matters, measure it with the
Redis server's clock instead (the claim key's remaining TTL).
