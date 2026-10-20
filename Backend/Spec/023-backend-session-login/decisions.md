# Decisions: 023 Backend Session Login

Sign-in moves to the backend. The browser holds the session in cookies the backend sets, beside the Bearer
tokens that scripts and tests keep using; the backend runs the Google and LINE OAuth flows itself; and one
sign-in covers both the site and the back office, which live on sibling hosts.

Numbering continues the repo-wide ADR sequence: this spec holds ADR-325 to ADR-331. The decisions were made
by the product owner between 2026-10-11 and 2026-10-18.

---

### ADR-325 The backend signs the browser in, and keeps its session in cookies beside the Bearer API

> **Status: ACCEPTED (2026-10-18).** Moving sign-in to the backend was chosen by the product owner on
> 2026-10-11 and confirmed on 2026-10-16, together with the separate browser endpoints and with keeping
> tokens out of their bodies. Giving switching identity a browser endpoint of its own, closing
> `/auth/switch-identity` to the cookie and the browser's endpoint to Bearer, was chosen on 2026-10-18.

**In plain words**: the backend now signs a browser in, refreshes its session and signs it out, and it
keeps the session in cookies it sets itself. The frontend only passes requests on. Scripts and tests keep the
endpoints they have always used, which hand the tokens back in the body.

**Context**: Sign-in used to belong to the frontend's NextAuth. For Google and LINE, NextAuth ran the
provider's flow, took the `id_token` it returned and posted it to the backend (`/auth/sso/google`,
`/auth/sso/line`); for passwords it called `/auth/login`. Either way it kept the backend's tokens inside its
own session cookie and sent them on as Bearer. The Google sign-in design of 2026-06-02 chose this so that the
backend would handle no redirects and hold no client secret, while one frontend app did both. That no longer
holds. The back office is now a Next app of its own, on a sibling host, and one sign-in has to cover both:
two NextAuth instances would each keep their own session, each need the OAuth configuration and its secrets,
and each sign the user in separately. The backend is the one thing both apps already talk to.

**Options**:

- Keep NextAuth in both apps and share its session between them. **Rejected**: two copies of the OAuth
  configuration and secrets, and the session still lives in two places that have to agree.
- **The backend runs sign-in and sets the cookies (adopted).**

**Decision**:

1. The browser has endpoints of its own:

   | endpoint | does | answers |
   |---|---|---|
   | `POST /auth/session` | sign in with `username` (an email or phone number, at most 320 characters) and `password` (frontend-hashed, as everywhere) | 200 `{"user": {"uuid", "name"}, "identity"}` and both cookies; 401 `credentials_invalid` with the cookies left alone |
   | `POST /auth/session/verify` | finish a registration with its code, the body of `/auth/verify` | as above; 400 `code_invalid` or `registration_expired`; 409 `identifier_taken` |
   | `POST /auth/session/refresh` | rotate the refresh cookie | 204 and both cookies renewed; 401 `refresh_token_invalid` or `identity_revoked`, with both cookies cleared |
   | `POST /auth/session/identity` | act as another identity the account holds, the body of `/auth/switch-identity`; signed in by the cookie only | 200 `{"identity"}` and a new `{p}_at`; 403 `identity_not_held`; 403 `cookie_session_required` for a Bearer request; 401 `session_expired`, with both cookies cleared, once the session is gone |
   | `DELETE /auth/session` | end this browser's session | 204 with both cookies cleared, always; 503 `session_store_unavailable` with the cookies kept when Redis cannot be reached |

2. **No token in any of their bodies.** The cookies are `HttpOnly` (ADR-326), so a script injected into a
   page cannot read them; it could read a body.
3. A new session acts as the account's default identity, `user` (ADR-290). It is written into the session
   and the token, not left for every request to work out, and the response names it. The back office reaches
   its own identity through its marker (ADR-329).
4. Signing in, verifying and signing out check the request's origin before validating the body (ADR-327
   point 4), so a foreign page is refused whatever it sent. Only a body that is not JSON at all is
   answered 422 first, by the framework, and does nothing. Refreshing is not checked.
5. Signing out finds the session from the access cookie, even an expired one, whose signature is still
   checked; without a usable one, from the record of the refresh cookie. The refresh cookie is read only by
   these endpoints (ADR-326 point 5).
6. Signing in shares its rate limit, 5 per 60 seconds, with `/auth/login`: both check the same password, and
   two doors must not double the guesses a caller gets. Refreshing, verifying and switching identity are
   counted on their own, 10 per 60 seconds each like their Bearer twins; a registration code is burned after
   a few wrong guesses anyway.
7. The endpoints that end the caller's session clear the cookies too, but only on a request that
   authenticated with them; a Bearer request gets no `Set-Cookie`. `logout-all`, `change-password`,
   `set-password` and `DELETE /auth/link/{provider}` revoke the caller's session and clear both cookies.
   `reset-password` does not: it is used signed out, and the cookies on that browser may belong to someone
   else. If they belong to the reset account, its next request answers `session_expired` and clears them
   (ADR-328).
8. **`/auth/switch-identity` refuses the cookie**: a request authenticated by it answers 403
   `bearer_token_required`, and nothing changes. Its answer carries the new token in the body, so a script
   injected into a page could otherwise switch identity and read a working token — the one thing point 2
   and `HttpOnly` exist to prevent. A browser switches through `POST /auth/session/identity` instead, which
   in turn refuses a Bearer request with 403 `cookie_session_required`: its answer is a cookie, and the
   caller's Bearer token would be left acting as the identity it just switched away from (ADR-195). So each
   kind of client has exactly one way to switch.
9. `/auth/login`, `/auth/refresh`, `/auth/switch-identity`, `/auth/verify` and `/auth/logout` stay as they
   are for scripts, tests and the HTTP collections. Each pair goes through one set of service functions
   (`services/auth_session.py`), so the two cannot drift apart.
10. Google and LINE sign-in move to the backend too (ADR-331), in place of `/auth/sso/*`.

**Amends**:

- The Google sign-in design of 2026-06-02, never recorded as an ADR: the frontend's NextAuth no longer
  obtains the provider's `id_token` for the backend to verify; the backend runs the flow itself (ADR-331).

**Consequences**:
➕ One sign-in covers the site and the back office, and sign-in lives in one place, with its secrets.
➕ No token is reachable from a page's scripts.
➖ The backend now handles redirects and holds the OAuth client secrets (ADR-331).
➖ Two endpoints for each operation, kept in step only by sharing their service functions.
➖ A frontend that still switches identity through `/auth/switch-identity` with the cookie gets 403 until it
moves to the browser endpoint.
➖ Deploying this signs everyone out once: the frontend stops reading NextAuth's cookie.

---

### ADR-326 The browser keeps the session in prefixed cookies on its environment's parent domain

> **Status: ACCEPTED (2026-10-18).** The domains and the cookies were chosen by the product owner on
> 2026-10-16. The first layout scoped the refresh cookie to `/api/v1/auth/session` and let the access cookie
> expire with its JWT after 15 minutes; it was changed to point 4 below the same day, once the frontend design
> showed it could not work. Staging's hosts were changed on 2026-10-18: the back office was to be
> `admin.staging.wan-guard.com`, with staging's cookies on `.staging.wan-guard.com`, but Cloudflare's free
> certificate covers only one level of subdomain. The back office moved to `admin-staging.wan-guard.com`, and
> staging's cookies to `.wan-guard.com`.

**In plain words**: after signing in, the browser holds two cookies the backend set — the short-lived pass and
the means to renew it. Page scripts cannot read them, and every page of both the site and the back office
sends them, so one sign-in covers both. Each environment's cookies carry their own name, so production,
staging and a developer's machine never mix theirs up.

**Context**: Until now the frontend's NextAuth cookie held the backend's tokens and the frontend's server sent
them on as Bearer. With sign-in moving to the backend (ADR-325), the backend sets the cookies itself, and they
have to reach two sibling hosts: the site and the back office (`staging.wan-guard.com` and
`admin-staging.wan-guard.com` on staging, `wan-guard.com` and `admin.wan-guard.com` in production).

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
3. `Domain` is `AUTH_COOKIE_DOMAIN`, the parent of the environment's two hosts: `.wan-guard.com` in
   production and on staging alike. Left empty, no `Domain` is sent and the cookie stays on one host, as a
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
➖ Staging and production are separated only by their prefixes. Both put their cookies on `.wan-guard.com`,
so each environment's cookies reach the other's hosts. Neither backend reads the other's (another prefix,
another signing key), and neither proxy forwards them, but each frontend server receives them. Separating
the two completely takes a registrable domain of staging's own, to be decided before production launches.
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

> **Status: ACCEPTED (2026-10-18).** Chosen by the product owner on 2026-10-16, together with moving sign-in
> to the backend. Answering an unreachable session store with a 503 instead of signing everyone out was
> chosen on 2026-10-18, after the frontend's testing showed that stopping Redis for a moment signed every
> browser out for good. Giving a revoked identity its own code, the one the refresh already answered, was
> added on 2026-10-19, after review.

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
   is an `ApiError` with one of five codes. `detail` stays "Could not validate credentials", and the
   `WWW-Authenticate: Bearer` header stays.

   | code | when | the client should |
   |---|---|---|
   | `access_token_expired` | the token's `exp` has passed | refresh, then send the request again |
   | `access_token_stale` | the token's `act` no longer matches its session's (ADR-195) | refresh, then send the request again |
   | `session_expired` | the session is gone: logout, logout-all, a password change or reset, an admin's kick | treat the user as signed out |
   | `credentials_invalid` | a bad signature, not an access token, no `sub` or `sid`, a session belonging to someone else, the account gone | treat the user as signed out |
   | `identity_revoked` | the identity the token acts as is no longer the caller's: its role revoked or deleted, its team deleted (ADR-096); the refresh answers the same (ADR-325) | treat the user as signed out, and say their access was taken away |

2. REST and GraphQL answer in one shape: HTTP 401 with `{"detail", "code"}`. The GraphQL context is a FastAPI
   dependency of the Strawberry router, so its `ApiError` reaches the same exception handler as REST instead
   of becoming a GraphQL error inside a 200. A guest who reaches a resolver that needs a user is a different
   case and keeps its GraphQL error from `require_authenticated`: there is no token to refresh.
3. **An unreachable session store is not a sign-out.** The request is still refused, as ADR-100 requires:
   without Redis the backend cannot tell a live session from a revoked one, and letting it through would
   switch revocation off for anyone who can disrupt Redis. But it answers 503 `session_store_unavailable`,
   "Session store is unavailable", without `WWW-Authenticate` — the code a sign-out that cannot reach Redis
   already answers (ADR-325). The session may well be alive, so nothing is cleared, and the same cookies
   work again once Redis is back. The log says why the store was unreachable.
4. A request authenticated by the access cookie (ADR-327) and answered `session_expired`,
   `credentials_invalid` or `identity_revoked` gets both sign-in cookies cleared in the same response
   (ADR-326); otherwise the browser keeps sending a token that can never work again. So does the browser's
   refresh (ADR-325) answered `refresh_token_invalid` or `identity_revoked`: nothing is left to try.
   `access_token_expired` and `access_token_stale` clear nothing, because the refresh needs the cookies. A
   Bearer request never has cookies cleared. The clearing is done in the exception handler REST and the
   GraphQL context share, not at each raise site, and not in a middleware, which would have to parse the
   response body to find the code.
5. A request carrying no token at all, on an endpoint that needs one, answers 401 `credentials_invalid` with
   the detail "Not authenticated". It is not cookie-authenticated, so nothing is cleared, and a client tells a
   guest apart by whether it sent a cookie.

**Amends**:

- ADR-100 (`Spec/014-session-revocation`): an unreachable Redis is still refused, never let through, but
  with a 503 of its own rather than a 401 identical to an invalid token.

**Consequences**:
➕ A client refreshes exactly when that helps, and signs the user out exactly when it must.
➕ A moment without Redis — a restart, a redeploy of its container — signs nobody out: the requests made
meanwhile fail, and the browser carries on once it is back.
➕ Bearer clients see the same status, detail and header as before for every failed token; only `code` is
new.
➖ While Redis is unreachable, every request that needs a signed-in user still fails, now with a 503. A
Bearer client that took the old 401 as "sign in again" now gets a 503 it has to retry.
➖ The answer now tells a caller that the session store is down, which the identical 401 hid. It reveals
nothing about any account.

---

### ADR-329 A request from the back office acts as a back-office identity (`X-WG-Realm: admin`)

> **Status: ACCEPTED (2026-10-17).** Chosen by the product owner on 2026-10-16, together with moving sign-in
> to the backend.

**In plain words**: everyone lands on the ordinary-user identity when they sign in, and the site keeps them on
it. The back office marks its requests, and on those the same session acts as the identity the person uses in
the back office: the one they switched to there, or else the first one they hold. Someone with no back-office
identity is turned away from the back office, but stays signed in.

**Context**: The back office had a sign-in of its own. Its NextAuth session held its own tokens, and
switching identity there (`POST /auth/switch-identity`) changed that session alone. With one sign-in for the
site and the back office (ADR-325, ADR-326), both send the same cookie, so they share one session and one
`act`. A login lands on `user` (ADR-290), and the site keeps every request on it with `X-WG-Realm: site`
(ADR-289). The back office needs the opposite: `user` is the one identity that has no business there.

**Options**:

- The back office calls `switch-identity` when it is opened. **Rejected**: it rewrites the session the site is
  using too. Every token the site's tabs hold then disagrees with the session and is refused as stale
  (ADR-195), so each tab has to refresh; two back-office tabs opened together race to switch; and the frontend
  has to pick the identity and handle an account with none.
- **A per-request marker, as the site has (adopted).**

**Decision**:

1. The back office sends `X-WG-Realm: admin` on every request. `get_current_user` first checks the token, its
   session and its `act` claim exactly as before; then, for the value `admin` only:
   - A token acting as a back-office identity — anything but the platform `user`, team identities included —
     keeps it. Switching identity in the back office therefore works as it did: the switch
     (`POST /auth/session/identity` from the browser, ADR-325) writes the session's `act`, and from then on
     the back office acts as it.
   - A token acting as `user`, or as no identity, acts as the caller's first back-office identity: platform
     identities first, then by role name, team name and team uuid. The last two make `admin` of two teams
     resolve to the same team every time; ordering by role name alone does not.
   - An account holding nothing besides `user` gets 403 `back_office_identity_required`, "This account has no
     back-office identity". Not a 401: the session is fine and the site still works, so nobody is signed out.
     The GraphQL context answers the same way, as an HTTP 403 rather than an error inside a 200 (ADR-328).
2. As with the site's marker (ADR-289 decisions 2 and 3): it lasts one request, and the token and the session
   are not touched; it only ever picks a grant the caller holds; a revoked identity still answers 401, because
   the marker applies after the checks; and the audit trail records the identity the request acted as.
3. One session can therefore act as `user` on the site and as a data auditor in the back office at the same
   time.
4. Only the exact value `admin` counts; any other value is ignored, as before.

**Amends**:

- ADR-289 decision 5 (`Spec/019-role-requests`): back-office pages no longer reach the backend on a path
  without the header; they send `X-WG-Realm: admin`. Decision 2's "any other value is ignored" no longer
  covers `admin`.

**Why the client may choose**: the header is set by the client, but all it can do is pick a grant the caller
already holds, which they could switch to anyway (ADR-068). It cannot reach an identity they do not hold.

**Consequences**:
➕ The site and the back office share one session, and neither changes the identity the other acts as.
➕ Nobody has to switch identity after signing in to use the back office.
➖ A back-office request that forgets the header acts as the token's identity, which is `user` for anyone who
has not switched. It shows up as 403 on back-office endpoints, not as an error about the header.
➖ One extra query for each back-office request whose token acts as `user`.
➖ Someone holding several back-office identities arrives on the first one by sort order, not on the one they
used last, and switches from there.
➖ One session, so one identity switched to. Someone who switched to a back-office identity
(`POST /auth/session/identity`) that is then revoked is signed out of the site as well, with `identity_revoked`
(ADR-096, ADR-328), and signs in again on `user`; with two sign-ins only the back office's ended. Keeping the site
signed in would take moving the session to another identity on refresh, which ADR-096 refuses: the refresh carries
no realm, so it decides for the site and the back office at once. Someone who never switched is not affected: the
site carries on, and the back office answers 403 `back_office_identity_required`.

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

---

### ADR-331 The backend runs the Google and LINE sign-in itself

> **Status: ACCEPTED (2026-10-18).** Chosen by the product owner on 2026-10-16, together with moving sign-in
> to the backend (ADR-325); sending every failure back to the sign-in page was chosen on 2026-10-17, and
> leaving the sibling-subdomain risk below for before production on 2026-10-18. A callback this browser did
> not start leaving `{p}_oauth` alone was added on 2026-10-19, after review. It covers Google and LINE;
> `/auth/sso/google` and `/auth/sso/line` are removed in the same change. That a browser can no longer
> present an `id_token` for a step-up was recorded on 2026-10-21, after review.

**In plain words**: "Sign in with Google" (or LINE) now takes the browser from our page to the provider and
back to our own backend, which then talks to the provider directly and signs the browser in. The frontend
never sees the provider's tokens or our secret. Whatever goes wrong, the person lands back on the sign-in
page with the reason.

**Context**: The frontend's NextAuth used to run the provider's flow and post the `id_token` it got to
`/auth/sso/google` or `/auth/sso/line` (ADR-325). With sign-in in the backend, the backend has to take the
browser to the provider and back, exchange the one-time code for the `id_token` itself, and hold the client
secret that exchange needs. Done naively, that flow can be hijacked in three places: a code intercepted on
its way back, a callback planted in another person's browser to sign them into the attacker's account, and
a `return_to` pointing at another site.

**Decision**:

1. Two endpoints per provider, both browser navigations: `GET /auth/oauth/{provider}/start?app=…&return_to=…`
   and `GET /auth/oauth/{provider}/callback`, which the provider redirects to.
2. **Authorization code with PKCE (S256), a nonce, and a state bound to the browser.** `start` records the
   provider, the app, `return_to`, the PKCE verifier and the nonce under `oauth_state:{state}` in Redis for
   10 minutes, sets the state in the `{p}_oauth` cookie (ADR-326), and sends the browser to the provider.
   `callback` first requires the state it receives to equal that cookie and to be on record, and spends it
   in the same step (`GETDEL`): a state works once, in the browser that started it. Only then does it
   exchange the code, with the verifier and the client secret, verify the `id_token` as before (signature,
   audience, issuer, expiry), and require its nonce to be the one recorded. For Google the backend compares
   the nonce itself; LINE's verify API is handed it and compares it.
3. **One redirect URI per provider, on the site's host**:
   `{OAUTH_REDIRECT_BASE_URL}/api/v1/auth/oauth/{provider}/callback`. A sign-in started from the back office
   comes back there too and is sent on to the back office, as its state records.
4. **`return_to` is a path on our own site**: it starts with `/` but not `//`, and holds no backslash, no
   character that is not printable, and no `.` or `..` segment, percent-encoded or not (a browser resolves
   `/.//host` into `//host`). `app` is `site` or `admin`, which the backend maps to `SITE_APP_URL` and
   `ADMIN_APP_URL`; the browser never names a host to return to.
5. **Every failure goes back to the sign-in page**, `{app}/login?error=<code>`: `oauth_request_invalid`
   (an unknown or unconfigured provider, a bad `return_to`), `origin_not_allowed`, `oauth_state_invalid`,
   `oauth_cancelled` (the user said no at the provider), `oauth_exchange_failed`, `sso_token_invalid` (the
   token does not verify, or carries another nonce), `sso_email_unverified`, `sso_email_taken` and
   `sso_signin_race` (a first sign-in that lost a race with another; trying again works). A
   callback whose state is not on record cannot tell which app it was for and goes to the site's. Only a
   start naming no app of ours answers with JSON, 400 `oauth_request_invalid`. A callback whose state
   matches `{p}_oauth` clears it whatever its outcome: that sign-in is spent. A callback whose state does not
   match leaves it alone, as a refused start does. Both are top-level GETs, so a link from another site
   brings the cookie along, and clearing it would end a sign-in another tab has in progress.
6. `start` must come from one of our pages (ADR-327 point 4). A navigation carries no `Origin`, so in
   practice the `Referer` decides, and a browser set to send none is refused with `origin_not_allowed`. The
   callback is the provider's redirect and carries neither; the state protects it instead.
7. Who signs in follows the rules `/auth/sso/*` always had, now in `services/sso_login.py`. A known
   identity signs in to its account. A first Google sign-in creates one with Google's verified email, and
   an email another account already holds is refused: its owner links Google in their settings (ADR-217). A
   first LINE sign-in always creates one, because LINE's email is optional: a missing, malformed or taken
   email is left out rather than refused, and an account without a display name is called `LINE-` and the
   first 8 characters of its LINE id. LINE is asked for `openid profile`, as the frontend always asked:
   the `email` scope needs a permission LINE grants each channel separately, so LINE sign-ins carry no
   email until the channel holds it and the scope is added. The new session acts as the account's default
   identity (ADR-325 point 3), and the browser is sent to `{app}{return_to}` with the sign-in cookies set.
8. The client secrets (`GOOGLE_CLIENT_SECRET`, `LINE_CHANNEL_SECRET`) live only in the backend's settings,
   and a provider without its secret refuses to start. Nothing we log holds the code, the `id_token`, the
   state, the verifier or the nonce, and uvicorn's access log has the query of every
   `/api/v1/auth/oauth/` request replaced with `?…`.
9. `start` and `callback` are each limited to 10 requests per 60 seconds, as `/auth/sso/*` was.
10. `/auth/sso/google` and `/auth/sso/line`, which signed in with an `id_token` the frontend obtained, are
    removed: this flow is the only way to sign in with a provider. Linking one (`/auth/link/*`) still takes
    an `id_token`, as before, which only a Bearer client can now present (see the consequences).

**Consequences**:
➕ The frontend holds no OAuth configuration or secret, and one flow serves both apps.
➕ An intercepted code is useless without the verifier, a token minted for another sign-in fails the nonce,
and a callback planted in a browser from another site fails the cookie.
➖ **Not from one of our own subdomains.** `{p}_oauth` sits on the parent domain (ADR-326), so that a
sign-in started from the back office's host reaches the callback on the site's. Whoever can run a page on
any sibling host (an XSS on another of our apps, a dangling subdomain) can therefore set it: start a
sign-in in their own browser, plant its state in the victim's cookie, and send the victim to the callback
with their own code. The victim is then signed in as the attacker, and whatever they enter lands in the
attacker's account. Closing it means a host-only `__Host-` cookie and starting every sign-in on the site's
host, which changes the frontend's links and its cookie filter; it is left for before production.
➖ Signing in now depends on the backend reaching the provider's token endpoint.
➖ A browser or extension that strips `Referer` cannot start a sign-in from our pages.
➖ Each environment's redirect URI has to be registered with each provider before its first deployment.
➖ The backend, the site and the back office are merged together and deployed at once: a frontend still on
NextAuth posts to `/auth/sso/*`, now a 404, and cannot sign in with Google or LINE.
➖ Over their rate limit, start and callback answer 429 as JSON, a bare page for a navigation, rather than
going back to the sign-in page; the refused callback leaves `{p}_oauth` to expire on its own. So does a
callback that fails on the server itself (Redis or the database), as a 500.
➖ **A browser no longer holds an `id_token`.** Two things still take one in a request body: the third
step-up proof of ADR-234 (an account with no password and no contact proves itself with a fresh token from
a provider it holds) and linking a provider (`/auth/link/*`). Only a Bearer client can use them now. A
LINE-only account is that shape, since LINE gives us no email (point 7), so from the site it cannot add a
first contact, set a first password, or link or unlink a provider: each answers 422 `step_up_required`. The
frontend never sent such a token before this change either (ADR-234 left it for its own ticket), so nothing
that worked stops working. To be closed in a follow-up with a re-authentication through this flow, a
`start` for a signed-in session whose callback records a short-lived proof for one action instead of signing
in.
