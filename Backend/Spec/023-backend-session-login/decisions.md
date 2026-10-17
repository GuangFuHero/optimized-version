# Decisions: 023 Backend Session Login

Sign-in moves to the backend. The browser holds the session in cookies the backend sets, beside the Bearer
tokens that scripts and tests keep using; the backend runs the Google and LINE OAuth flows itself; and one
sign-in covers both the site and the back office, which live on sibling hosts.

Numbering continues the repo-wide ADR sequence: this spec holds ADR-325 to ADR-331. The decisions were made
by the product owner between 2026-10-11 and 2026-10-17.

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

**Consequences**:
➕ A client refreshes exactly when that helps, and signs the user out exactly when it must.
➕ Bearer clients see the same status, detail and header as before; only `code` is new.
➖ While Redis is unreachable, everyone who makes a request reads as signed out — as before this ADR, now
spelled out in the code.

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
