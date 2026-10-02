# Decisions: 019 Role Requests

Numbering continues the repo-wide ADR sequence. ADR-286 was the last one taken when these were written
(2026-09-30). ADR-291 to ADR-293 are in `Spec/020-volunteer-claim`; ADR-294 was added here on 2026-10-01.

---

### ADR-287 A citizen applies for a back-office role, and a super admin reviews it

> **Status: ACCEPTED (2026-09-30).** Product rules from the designer's site prototype (2026-09-13) and the
> 2026-09-11 rulings recorded in it; withdrawal and the review API decided by the product owner on 2026-09-27.

**In plain words**: someone signed in on the site can ask to become a government officer, an NGO worker or a
data auditor. One application at a time; they can take it back while it waits. A super admin approves or
rejects it, and the applicant is told either way.

**Context**: The only way into the back office was an admin assigning a role directly
(`POST /api/v1/admin/users/{uuid}/role`). The prototype adds a self-service path: an entry button on the site,
an application drawer, and a result notification. Its rules: only accounts without a back-office identity see
the entry (AC-RE-101); one pending application at a time (AC-RE-106); a rejected applicant may apply again at
once — no cooldown (AC-RE-107, 2026-09-11); super admin is not on the list (2026-09-11); no "join this team"
option.

**Decision**:

1. **One table, `role_requests`**, one row per application, statuses `pending` / `approved` / `rejected` /
   `withdrawn`. "One pending per account" is a partial unique index on `created_by` where
   `status = 'pending'`, not a read-then-insert check, so two tabs submitting at once cannot both get through.
2. **Two capabilities.** `role_request.add` is seeded to `user` at `all`; revoking it at runtime in
   `/api/v1/admin/rbac` pauses applications without a deploy. `role_request.review` is seeded to
   `super_admin` at `all`. Eligibility ("the account holds exactly the platform `user`") and "one pending" are
   code, not capabilities: they depend on what the account holds and has sent.
3. **Withdrawal is allowed**, unlike the prototype: only by the applicant, only while pending, and it notifies
   no one. It asks for ownership only, not `role_request.add`, so pausing applications never strands one
   already sent. Someone else's application answers "not found", which does not reveal that it exists.
4. **Review is REST under `/api/v1/admin`**, like the other admin operations (ADR-035): a list, oldest first,
   and approve / reject with an optional note. The site uses GraphQL for its side.
5. **Every way out of `pending` locks the row** (`SELECT … FOR UPDATE`) and then checks the status. A
   withdrawal and a decision sent together are settled one after the other; the later one answers 409.
6. **Notifications**: a new application tells every holder of `role_request.review`; a decision tells the
   applicant, in the prototype's wording.
7. **Visibility**: reason and contact often name a unit and a phone number, so only the applicant and
   `role_request.review` holders read them. The table is audited from its first migration.

**Consequences**:
➕ Applications can be paused, and reviewers added, by editing grants at runtime.
➕ The concurrency rules live in the database (unique index, row lock), not in timing.
➖ Until the back office is rebuilt, reviewers call the REST API directly.
➖ Deploying needs a re-run of `scripts/seed_rbac.py`, or nothing holds the new capabilities.
➖ ADR-097's regression test lists `role_request.add` as citizen-only: every other actionable identity is
ineligible, so granting it to them would show a capability that can never be used.

---

### ADR-288 Approving a data auditor adds the role beside `user`; government and NGO approval is a placeholder

> **Status: ACCEPTED (2026-09-30).** "Add, don't replace" follows the team decision of 2026-09-28 that
> everyone has the same permissions on the site. The government / NGO placeholder is the same day's decision:
> the designer and the product owner will define that flow.

**In plain words**: an approved data auditor keeps everything they could do on the site and is not signed
out; they gain a second identity for the back office. Approving a government or NGO application is refused for
now, and the application stays pending.

**Context**: The obvious implementation, `admin_service.assign_role`, deletes the account's platform role
before adding the new one (ADR-032, ADR-184). The applicant's access token acts as `user`, so once `user` is
gone ADR-096 refuses the token and signs them out. And `data_auditor` holds no write capabilities by design
(ADR-097's documented exception), so a data auditor who lost `user` could no longer file a help request or
claim a task on the site. The team decided on 2026-09-28 that this must not happen.

**Decision**:

1. **Approval inserts the platform grant `data_auditor` and leaves `user` in place.** It does not call
   `assign_role`. The insert is `ON CONFLICT DO NOTHING`, because an admin may have granted the role another
   way since the application was sent. Granting and marking the application `approved` are one commit.
2. **The applicant is not signed out**: their token still names a grant they hold. The approval notice says
   so: 右上角會出現「前往後台」，不需要重新登入。
3. **Government and NGO applications cannot be approved yet.** Approving one answers 422 and changes nothing;
   it can still be withdrawn or rejected. The approve endpoint takes no team parameter until the flow is
   defined; `role_requests.granted_team_uuid` is reserved for it.

**Amends**:

- ADR-032 / ADR-019 "one platform role per account" and ADR-069 point 4 "each account has exactly one
  platform identity": an account may now hold `user` **plus** one other platform role.
- ADR-184 "every platform grant replaces": not for approval, which adds.

**Consequences**:
➕ Approval never signs anyone out and never takes away a site permission.
➖ `admin_service.assign_role` still replaces, so using the old endpoint to make someone a data auditor removes
their `user`. The back office should stop using it for this. **Resolved by ADR-294 (2026-10-01).**
➖ ADR-185 refuses to unassign any platform role, and was written when "the platform role" was the only one.
With two, it means an approved `data_auditor` cannot be taken back through the API. Left to the back office.
**Resolved by ADR-294: assigning `user` takes it back.**
➖ `GET /admin/users` → `platform_role` shows only one of the two; `identities` lists both. **ADR-294 makes it
the one besides `user`.**

---

### ADR-289 A request from the site acts as the caller's `user` grant (`X-WG-Realm: site`)

> **Status: ACCEPTED (2026-09-30).** Rule from the team decision of 2026-09-28; the header mechanism chosen by
> the product owner the same day, to ship with this feature rather than wait for the back office.

**In plain words**: whatever identity someone switched to in the back office, the site treats them as an
ordinary signed-in user. The site says so with a header on each request; nothing about their login changes.

**Context**: The site and the back office are one app with one login and one access token, and the token acts
as exactly one identity at a time (ADR-068/069). Switching to `data_auditor` in the back office would
therefore change what the same person can do on the site — for a data auditor, lose the right to file a help
request. The team decided that on the site everyone has the permissions of `user`, and that switching identity
belongs to the back office.

**Options**:

- A "citizen base": `user`'s grants always in effect under every identity. **Rejected**, as ADR-097 already
  rejected it: it turns "one identity at a time" into a union and widens every identity everywhere, including
  the back office.
- The site switches identity when entered and switches back on leaving. **Rejected**: it rewrites the
  session that every tab shares (ADR-188), so a back-office tab would change under the user, and a crash
  mid-way leaves the session on the wrong identity.
- **A per-request marker (adopted).**

**Decision**:

1. The site sends `X-WG-Realm: site` on every request. `get_current_user` first checks the token, its session
   and its `act` claim exactly as before; then, for the value `site` only, it resolves the caller's platform
   `user` grant and uses that identity **for this request**.
2. An account that holds no `user` grant keeps the token's identity (see ADR-290 for why every account
   should hold one). A revoked identity still answers 401 — the marker does not revive it. Any other value is
   ignored.
3. The token and the session are not touched, so the next request without the marker is back on the token's
   identity. The audit trail records `user`, the identity the change was actually made under.
4. The GraphQL context passes the header to `get_current_user` itself, because it calls it directly (ADR-102).
5. **Back-office pages must reach the backend on a path that does not add the header.** Today the whole
   frontend is the site, so the header goes on the `/api/graphql` proxy and the server-side client.

**Why this is not the citizen base**: nothing is unioned. The request acts as exactly one identity — a grant
the caller already holds, and the least one. The header is set by the client, but all it can do is pick the
caller's own `user` grant, which they could log in as anyway. It cannot reach an identity they do not hold,
and it cannot widen any identity.

**Consequences**:
➕ Site permissions no longer depend on what the back office switched to.
➕ No session writes, so tabs and devices cannot disturb each other.
➖ A site request that forgets the header silently acts as the token's identity. For a data auditor that shows
up as 403 on filing a help request, not as an error about the header.
➖ One extra query per site request, to look up the `user` grant.

---

### ADR-290 Every account holds `user`, and a login starts on it — super admins included

> **Status: ACCEPTED (2026-09-30).** The backfill was approved on 2026-09-28; "super admins included" and
> keeping `user` in `bootstrap_admin` were chosen by the product owner on 2026-09-30.

**In plain words**: everyone lands on the ordinary-user identity when they log in, and moves to a
back-office identity on purpose. So a super admin who opens the site sees what everyone else sees, and has to
switch before using admin endpoints.

**Context**: ADR-289 can only switch to a `user` grant the account holds: the permission engine reads held
grants only (`repositories/auth_repository.py`). Super admins set up by `scripts/bootstrap_admin.py` did not
hold one — ADR-184 made that script replace `user` so a bootstrapped super admin could not log in as a plain
`user`. Separately, `default_for_user` ordered platform identities by role name, which puts `data_auditor` and
`super_admin` before `user`, so an approved data auditor would have logged in as `data_auditor`.

**Decision**:

1. **Migration `15370be54155`** grants `user` to every account that lacks it. On a database with no `user`
   role yet it grants nothing. Its downgrade removes nothing: it cannot tell a backfilled `user` from one
   granted since (every approved data auditor holds one), and removing it would lock an account out of the
   site.
2. **`bootstrap_admin` keeps `user`.** The script writes through `user_repository.assign_role`, which still
   replaces every other platform role, so the back office keeps one platform role besides `user`.
3. **A login starts on `user` when the account holds it.** `default_for_user` sorts `user` first. That
   covers password login, SSO, registration and a refresh that names no identity. It applies to super admins
   too: they switch with `POST /api/v1/auth/switch-identity`, or name the identity in the login `scope` field
   (ADR-207).

**Amends**:

- ADR-184 decision 1 ("`bootstrap_admin` replaces"): replaces every platform role **except `user`**. Its
  reason — that a bootstrapped super admin could log in as a plain `user` — is now the intended behaviour.
- ADR-184 decision 2 and ADR-069 point 4 ("the default is the platform identity"): the default is `user`; the
  ordering after it stays deterministic (name, then uuid).

**Consequences**:
➕ The default identity is the least privileged one the account holds; more is always a deliberate step.
➕ Every account, super admins included, uses the site as `user`.
➖ Super admins must switch identity before calling admin endpoints; HTTP collections and scripts that log in
as one need the extra step.
➖ `admin_service.assign_role` still replaces `user`, so a super admin made through
`POST /admin/users/{uuid}/role` holds no `user`. On the site they then keep the super_admin identity (ADR-289
decision 2) and land on it at login. Left to the back office, which owns that endpoint. **Resolved by ADR-294
(2026-10-01).**

---

### ADR-294 The back office's `assign_role` keeps `user`; assigning `user` takes the other platform role back

> **Status: ACCEPTED (2026-10-01).** Chosen by the product owner on 2026-10-01, once the gaps left by ADR-288
> and ADR-290 turned out to include a demotion that did nothing.

**In plain words**: an account always keeps the ordinary-user identity, plus at most one other platform role.
Making someone a super admin or a data auditor in the back office no longer takes `user` away or signs them
out. Assigning `user` is how a super admin is demoted and how an approved data auditor is taken back.

**Context**: `admin_service.assign_role` (`POST /api/v1/admin/users/{uuid}/role`) replaced every platform role
the account held with the new one (ADR-019, ADR-032). Since ADR-290 every account holds `user`, and that broke
it three ways:

1. Making someone a super admin or a data auditor deleted their `user`. On the site they then kept the
   back-office identity, since ADR-289 had no `user` to switch to, and landed on it at login.
2. Demoting did nothing. Assigning `user` to a super admin found `user` already held and returned before
   removing anything: the API answered 200 and the account stayed a super admin. ADR-185 names exactly this
   assignment as the way to demote, because it refuses to unassign a platform role.
3. An approved data auditor (ADR-288) could not be taken back: unassigning is refused (ADR-185) and assigning
   `user` did nothing.

Separately, `GET /api/v1/admin/users` reported as `platform_role` the first platform identity by role name.
That was the back-office one only because `data_auditor` and `super_admin` sort before `user`. A platform
role created at runtime (`POST /api/v1/admin/rbac/roles`) whose name sorts after `user`, such as
`volunteer_lead`, would have shown as `user`.

**Options**:

- Keep the endpoint and let ADR-185 unassign the platform role besides `user`. Rejected: demoting through
  `assign_role` would stay broken, and the back office would have two ways to change a platform role.
- **Give `assign_role` the rule approval and `bootstrap_admin` already follow** (chosen).

**Decision**:

1. Assigning a platform role removes the platform roles the account holds **except `user` and the role being
   assigned**, then grants the role if it is not held yet:

   | Holds | Assigned | Result |
   |---|---|---|
   | `user` | `super_admin` | `user`, `super_admin` |
   | `user`, `data_auditor` | `super_admin` | `user`, `super_admin` |
   | `user`, `super_admin` (another super admin exists) | `user` | `user` |
   | `user`, `data_auditor` | `user` | `user` |
   | `user`, `super_admin` (the only super admin) | `user` | 409 `Cannot remove the last super_admin` |
   | the role already, and nothing else to remove | that role | unchanged, 200 |

2. The last-super-admin guard (ADR-032) applies whenever `super_admin` is among the roles removed, so it covers
   demoting to `user` as well.
3. An account without `user` is not given one here. The ADR-290 migration and registration grant it, and
   `bootstrap_admin` does not add it either.
4. `platform_role` in `GET /api/v1/admin/users` is the platform role besides `user` if the account holds one,
   otherwise `user`. `identities` still lists every identity.

**Amends**:

- ADR-019 / ADR-032 "assigning replaces the role of the same kind": every platform role except `user`.
- 010/ADR-096's accepted side effect "promotion signs the person out": a token acting as `user` stays valid,
  because `user` is no longer deleted. A token acting as a removed role is still refused, as ADR-096 says.
- ADR-185's "demote by assigning a smaller role" works again and also takes a data auditor back. ADR-185's own
  rule — a platform role cannot be unassigned — is unchanged.

**Consequences**:
➕ The back office, approval (ADR-288) and `bootstrap_admin` (ADR-290) follow one rule: `user` plus at most one
other platform role.
➕ Demoting and taking back a data auditor go through the endpoint the back office already has.
➕ Promotion no longer signs anyone out. Since ADR-290 they would have come back on `user` anyway; now they
switch to the new identity when they need it.
➖ Removing a back-office role is spelled "assign `user`". A back-office screen should label it as removing the
role; an admin looking for "remove" will not think of "assign".
