# Decisions: 026 Join Requests

Numbering continues the repo-wide ADR sequence. ADR-335 was the last one on any remote branch when these were
written (2026-10-20). ADR-336 to ADR-349 are held by `Spec/025-dedup-review-queue`; this spec starts at ADR-350.

Source: Notion BE-038 (backend ticket, as updated on 2026-10-20) and ADMIN-027 "Oct 20 Updates" (review rules,
system map, Stories 1–5).

---

### ADR-350 Join requests extend Spec 019's role requests instead of being a second flow

> **Status: ACCEPTED (2026-10-20).** BE-038 step 3: "Extend it to the new model rather than build a second
> flow", following the user-site prototype (`js/site/site-actions.jsx`, 申請成為後台人員).
> **Amends**: ADR-287 (what an application carries and who reviews it), ADR-288 point 3 (government / NGO
> approval).

**In plain words**: there is still one kind of application, in `role_requests`, with the same three identities
as today. A government or NGO applicant now also picks a team, or names a new one, and approval puts them in
it. Scanning a team's invite link sends the same kind of application. The data auditor path does not change.

**Context**: Spec 019 already has the user-site application: `role_requests`, `submitRoleRequest` /
`withdrawRoleRequest` / `myRoleRequests`, and `/api/v1/admin/role-requests` for `role_request.review` holders.
Only `data_auditor` can be approved; `government` and `ngo` wait for a flow the designer and the product owner
had not defined (ADR-288 point 3). BE-038 defines it, and asks for the existing flow to be extended.

**Options**:

- A second table for team joins, beside `role_requests`. Rejected by BE-038: two flows behind one form, and
  two review lists.
- **Extend `role_requests`** (chosen).

**Decision**:

1. **The three identities stay** (`government`, `ngo`, `data_auditor`), as in today's `requested_role`.
2. **`government` / `ngo` must name a team**, exactly one of:
   - an existing team: a **member request** for that team;
   - a new team name: a **new-team application**.

   `data_auditor` names no team, and a team given with it is refused.
3. **An invite-link scan is a member request** in the same table, for the link's team. Its identity is the
   team's type (`gov` → `government`, `ngo` → `ngo`), and the row records which invite it came through.
4. **The request carries the applicant's details** (name, verified phone, optional email, reason) so the
   reviewer can call to confirm and the person does not type them again in the back office. Columns and the
   OTP check are in the spec.
5. **Who sees and decides what**:

   | Request | Team admin of that team | Super admin |
   |---|---|---|
   | Member request (picked on the site, or by invite) | Sees and decides | Sees and can decide |
   | New-team application | — | Sees and decides |
   | Data auditor | — | Sees and decides |

6. **Approval**: a member request adds the applicant to the team as `member` through the existing add-member
   logic; a new-team application creates the team and makes the applicant its team admin, in one
   transaction; a data auditor is granted as today (ADR-288 points 1–2). `granted_team_uuid` /
   `granted_role_uuid` record what was handed out.
7. **First decision wins** across both queues: every decision locks the row and checks it is still pending
   (ADR-287 point 5 already does this), so a second decision answers 409.
8. **A new request notifies** `role_request.review` holders, as today, and also the admins of the chosen team
   for a member request.
9. **Pending Spec 019 `government` / `ngo` rows are rejected by the migration**, with the note
   `申請流程已更新，請重新送出申請。` They name no team, so no one could ever approve them. There are no
   production users (2026-10-20).

**Consequences**:
➕ One table, one submit, one set of rules for withdrawal and concurrency, already tested by WG-141 to WG-143.
➕ The data auditor flow keeps working without changes to its callers.
➖ `submitRoleRequest`'s input grows, and the review endpoints are no longer super admin only: their gate
changes from `role_request.review` alone to "review holder, or admin of the request's team".
➖ `role_requests` now also holds requests that never came from the site form (invite scans).

---

### ADR-351 Still one pending application per account; a member of one team may still apply to another

> **Status: ACCEPTED (2026-10-20).** BE-038 step 3: "Unchanged: one pending application per account; a
> rejected applicant can apply again with no cooldown; super admin is never on the list." Popo, 2026-10-20:
> one pending per account, invite scans included; someone already in team A may still apply to team B.
> **Amends**: AC-RE-101 for team requests.

**In plain words**: someone can have only one application waiting, whichever way they sent it. To ask a
second team, they wait for the first answer or withdraw it. Being in team A does not stop someone from asking
to join team B later; being in team B already does.

**Context**: ADR-350 point 3 makes invite scans rows of `role_requests`, so the existing partial unique index
`uq_role_requests_one_pending` (one pending row per `created_by`, AC-RE-106) covers them too. Spec 019 also
refuses an applicant holding any back-office identity (AC-RE-101, `_has_backoffice_identity`). Kept for team
requests, a member of team A could never join team B by request, although an account may belong to several
teams (`Spec/010-multi-team-membership`).

**Decision**:

1. **One pending application per account**, across every identity and both entry points (site form and
   invite scan). `uq_role_requests_one_pending` stays and enforces it; no index is added. Its violation still
   answers `You already have a pending request`.
2. **Eligibility for team requests** (member and new-team): refused only if the applicant is **currently a
   member of that team**, on submit and again on approval: `You are already a member of this team`. Other team
   or platform identities do not count. Someone who has left or been removed from the team may request again.
3. **Eligibility for a data auditor request is unchanged** (AC-RE-101, ADR-288 point 1): only an account whose
   identities are exactly `user` may apply, and approval checks again.
4. **Rejected or withdrawn applicants may apply again at once** (AC-RE-107), and super admin is never one of
   the identities.

**Consequences**:
➕ No new uniqueness rules; WG-142 ("only one pending application at a time") still holds as written.
➕ Multi-team membership is reachable by request, not only by a direct add.
➖ A volunteer waiting on team A has to withdraw before scanning team B's invite; the invite page tells them
which request is pending.
➖ `myRoleRequests.hasBackofficeIdentity` no longer decides whether the entry offers an application: a team
member still may apply to another team.

---

### ADR-352 A new team's type comes from the applicant's identity, and its name must be unused

> **Status: ACCEPTED (2026-10-20).** BE-038 "Resolved": "the applicant's chosen identity sets it (政府單位人員
> → gov, 社福團體人員 → ngo), per the prototype." The name rule is BE-038 step 3a.

**In plain words**: a 政府單位人員 picks among government teams and founds a government team; a 社福團體人員
picks among NGO teams and founds an NGO team. A new team's name cannot already belong to a team.

**Decision**:

1. **Identity → team type**: `government` → `gov`, `ngo` → `ngo`. The applicant does not choose the type
   separately, and the reviewer does not change it on approval.
2. **An existing team must be active and of the matching type.** Otherwise the submit is refused.
3. **A new team name must not match an existing team's name**, checked when the request is sent and again on
   approval, since a team of that name may have been created in between. Comparison is on the trimmed name,
   ignoring case.
4. **The team list the form shows** is active teams of the matching type; the API that serves it is in the
   spec.

**Consequences**:
➕ Nothing to confirm about the type at review time.
➖ An applicant who picked the wrong identity has to withdraw and apply again.

---

### ADR-353 Invite links: a random token, a database-set expiry, and REST so expiry is a real 404

> **Status: ACCEPTED (2026-10-20).** Confirmed by Popo on 2026-10-20. The rules are BE-038 step 1; the mechanism is a backend choice.

**In plain words**: an invite is a row with a random code and an end time the database writes. Every lookup
asks the database whether the end time has passed, so a phone with the wrong clock changes nothing. Opening
or using an expired link answers HTTP 404, the same as a made-up one.

**Decision**:

1. **`team_invites`**: `token` (`secrets.token_urlsafe(24)`, unique), `team_uuid`, `created_by`,
   `created_at`, `expires_at`. Both times are database defaults (`now()`, `now() + interval '24 hours'`). No
   revoke, extend or usage columns.
2. **The link carries the token, not the row's uuid**, so a uuid seen elsewhere (an audit row, a response)
   cannot be turned into a link.
3. **Validity is one query condition**: `token = :t AND expires_at > now() AND team.status = 'active'`.
   Unknown, expired and inactive-team invites are the same 404 and cannot be told apart.
4. **Opening and requesting are REST** (`GET /api/v1/invites/{token}`, `POST …/requests`). GraphQL answers
   200 with an error body; BE-038 asks for 404.
5. **The invite is read only on submit.** Approval does not look at it, so requests sent in time can be
   decided after it expires.

**Consequences**:
➕ Expiry cannot be bent by a client clock or a client-sent time.
➖ The site uses REST for these two calls and GraphQL for the rest of the application.

---

### ADR-354 Team admins review through `team.member.manage`; approval reuses add-member in one commit

> **Status: ACCEPTED (2026-10-20).** Confirmed by Popo on 2026-10-20. Who decides what is ADMIN-027's review rules; the gate is a backend choice.
> **Amends**: ADR-287 point 7 (who reads the applicant's details).

**In plain words**: a team admin can already add members to their team. Approving someone's request to join is
the same act, so the same permission covers it. A team admin reads the details of people asking to join their
team, and nothing else in the queue.

**Decision**:

1. **No new capability.** A member request is decided by `role_request.review` holders, or by a caller whose
   `team.member.manage` scope covers the request's team (checkpoint 2 on `team_uuid`, as `add_team_member`
   does). New-team and data auditor requests need `role_request.review`.
2. **The list is filtered, not refused**: review holders see every row; a team admin sees member requests for
   their active team. Anything else the caller cannot decide answers 404 on approve / reject.
3. **Applicant details are visible to whoever may decide the request**, team admins included. Data auditors
   (`audit.view`) still do not read them.
4. **Approval adds the grant through a helper that does not commit**, extracted from
   `admin_service.add_team_member`, so the grant and the status change are one commit and a racing
   withdrawal finds both or neither.

**Consequences**:
➕ Revoking `team.member.manage` from a role at runtime also stops it from approving.
➖ The gate on `GET /admin/role-requests` is no longer a single route dependency.

---

### ADR-355 Phone from the account's verified contacts; the name the applicant gives becomes a separate real-name field on approval

> **Status: ACCEPTED (2026-10-20).** BE-038 step 3 and the live prototype (`site-actions.jsx`, 申請人基本資料):
> name and phone required, email optional, phone verified when applying, account contacts reused read-only,
> details carried into the back office. Popo, 2026-10-20: no exception to ADR-220 for applying; the name goes
> into a new real-name field written on approval, not into `users.name`.

**In plain words**: an applicant without a verified phone adds one through the existing 新增聯絡方式 flow.
An account that already has a password or an email proves it is theirs first, so that takes two codes; the
frontend draws that step. The name they type is probably their real name, so it does not replace their site
nickname: it is kept on the request, and on approval it is stored as the account's real name, which only the
back office sees.

**Context**: `users.name` is the account's one display nickname, required at registration and editable through
`PATCH /users/me`. It shows on the site and in the back office alike: history timelines, task claimers
(ADR-286), notifications. Overwriting it with a real name would put that name everywhere the nickname shows.
Adding a phone is gated by ADR-220 whenever the account has something to prove itself with.

**Decision**:

1. **Submit does not take a phone.** It reads the account's verified phone (`user_contacts`, type `phone`).
   None → `A verified phone number is required`. The site adds one with `POST /api/v1/auth/contacts` and
   `/contacts/verify` (Spec 012), including ADR-220's proof step. No exception is made for applying.
2. **Email**: the account's verified email if it has one; otherwise the one typed, optional and unverified.
3. **Name**: required. The request keeps `applicant_name`; `users.name` is never changed.
4. **`users.real_name`** (varchar(100), nullable) is new. Approval of any kind writes the request's
   `applicant_name` into it, in the same commit, replacing an earlier value. Rejection and withdrawal leave it
   alone.
5. **Who reads `real_name`**: the same people who read applicant details (ADR-287 point 7, ADR-354 point 3) —
   `role_request.review` holders anywhere, and whoever manages a team's members (its admins) in that team's
   member list (`GET /admin/teams/{uuid}/members`, ADR-362). `GET /api/v1/admin/users` returns it only to `role_request.review` holders: `user.view`
   at `all` is also seeded to `data_auditor`, which ADR-287 keeps away from these details. It is never in site
   responses, `UserRefType`, history actor names or notifications, which keep `users.name`.
6. **`contact`** is no longer written or accepted; old rows keep theirs.

**Consequences**:
➕ The site nickname stays what the person chose; the back office gets the name reviewers confirmed.
➕ No second OTP mechanism; the phone becomes a login contact as Spec 012 already does.
➖ An applicant who already has a password or email enters two codes before the form submits.
➖ `real_name` is personal data: a new column in `users` (audited), the admin user list, and exports if added.

---

### ADR-356 Last-admin guard and team contact fields

> **Status: ACCEPTED (2026-10-20).** Confirmed by Popo on 2026-10-20. BE-038 Part B; ADMIN-027 Story 4 step 3.

**Decision**:

1. **A team's only `admin` cannot be removed or changed to another team role.** `remove_team_member` and
   `add_team_member` lock the team's admin grants `FOR UPDATE` and refuse with 409
   `Cannot remove the team's only admin`, so two admins demoting each other at once cannot both pass. The
   admin may remove every other member (Story 4 step 4).
2. **`teams.contact_name` and `teams.contact_phone`**, nullable, returned in `TeamResponse`.
3. **The last-super-admin guard already exists** (`assign_role`, `rbac_admin` user-role revoke; ADR-032,
   ADR-056); this spec adds tests only.

Team edit, status and the audit-log read API are open questions in the spec.

---

### ADR-357 Team edit by super admin and the team's own admin; suspending a team switches its grants off

> **Status: ACCEPTED (2026-10-20), amended 2026-10-21.** Popo, 2026-10-20: team details are edited by the
> super admin and the team admin; a suspended team's members hold no team permissions; contact fields are not
> shown to other teams. **2026-10-21, Popo: there is no disbanding.** ADMIN-027 Story 4 (step 3: the only admin
> cannot be removed or demoted; step 4: an admin who wants the team gone removes the other members and stops
> signing in, and the team stays) has no such feature, and disbanding removed every grant, the last admin's
> included, which went round ADR-356. The `disbanded` status, its grant removal and its checks are gone.
> Confirmed with Carol (product) on 2026-10-21; BE-038 Part B updated to match.

**In plain words**: a team admin can edit their own team's name, tax ID and contact; a super admin can edit
any team. Only a super admin suspends or restores a team. While a team is suspended its members are still
listed but can do nothing as that team. A team is never disbanded: it stays, with at least one admin.

**Decision**:

1. **`PATCH /api/v1/admin/teams/{uuid}`**: name, tax ID, `contact_name`, `contact_phone`. Not the type, which
   applications and permissions rely on (ADR-352, `GOV_TEAM_ONLY_PERMS`). A new name follows ADR-352 point 3.
2. **Gate: `team.edit` with checkpoint 2 on the team.** The seed grants `team.edit` to the team role `admin` at
   `team`; `super_admin` keeps `all`. Creating a team (`POST /admin/teams`) now requires `team.edit` at `all`,
   so the new grant does not let team admins create teams.
3. **`POST /api/v1/admin/teams/{uuid}/status`** with `active` / `suspended`, gated on `team.edit` at `all`
   (super admin only). `teams.status` gets a CHECK on the two values; anything else is a 422.
4. **What each status does**:

   | Status | Team grants | Identity switch to it | New requests, invites | Reversible |
   |---|---|---|---|---|
   | `active` | Work | Yes | Yes | — |
   | `suspended` | Kept, but resolve to no permission | Refused; a token acting as it answers 401, as a revoked identity does (ADR-096) | Refused (invite 404, team not in the form's list) | Restore to `active` |

   Pending requests for a team that is suspended are rejected with the note `團隊已停用`, and the applicants told.
5. **Contact fields are visible where the team already is** (`team.view` scope, unchanged): its own members and
   super admins. They are not shown to other teams; `team.view` is not widened.

**Consequences**:
➕ Suspension is undone by one call, with every membership as it was.
➖ Every permission check has to know the team's status; resolving grants joins `teams`.
➖ `scripts/seed_rbac.py` must be re-run on deploy for team admins to edit their team.

---

### ADR-358 Audit-log read API: the platform view for `audit.view` at `all`, a team view for team admins only

> **Status: ACCEPTED (2026-10-20).** Popo, 2026-10-20: the team view is for team admins only, and shows changes
> related to the team. The platform view and the filter are a backend design.

**In plain words**: super admins and data auditors can read every change on the platform. A team admin can
read the changes made to their own team: the team's details, who joined or left, requests to join, invites
and zone assignments. Ordinary members cannot read the log. Nobody sees changes to another team.

**Context**: `audit_logs` is written by a database trigger for every table in `AUDITED_TABLES`, with the actor,
the IP and the identity snapshot (role and team names, ADR-076). There is no API to read it; the only reader
is the Spec 016 history timeline, which shows raw audit only at `audit.view` `all` (ADR-198). The team roles
hold no `audit.view`.

**Decision**:

1. **`GET /api/v1/admin/audit-logs`**, newest first, paged (`limit` ≤ 100, `offset`), filters `table`,
   `row_id`, `actor_uuid`, `from`, `to`.
2. **Platform view**: `audit.view` at `all` (seed: `data_auditor`, `super_admin`). Every row.
3. **Team view: a new capability `team.audit.view`**, seeded to the team role `admin` at `team` and to
   `super_admin` at `all`; `member` gets none. A caller who has it but not `audit.view` at `all` sees only
   rows related to their active team, and cannot ask for another team.
4. **"Related to the team"** means, for team `T`:

   | Table | Row is related when |
   |---|---|
   | `teams` | `row_id = T` |
   | `user_role_assign`, `user_permission_assign` | `team_uuid = T` in the old or new values |
   | `role_requests` | `team_uuid = T` or `granted_team_uuid = T` |
   | `team_invites`, `team_zone_assign` | `team_uuid = T` |

   Not included: what members did while acting as the team (tasks, stations). That is the history timeline's
   job, gated by its own capabilities.
5. **Why not `audit.view` at `team`**: ADR-130 rests on every `audit.view` holder already reading all data and
   all PII (`tests/test_history_permissions.py` checks both), and the history timeline treats `audit.view` as
   platform oversight. A team admin is neither, so the team view gets its own capability and `audit.view`
   keeps its two holders.
6. **Index**: an expression index on `COALESCE(new_values, old_values) ->> 'team_uuid'`, so the team view does
   not scan the whole log.

**Consequences**:
➕ A team admin can see who added or removed whom, and who approved which request.
➖ `role_requests` rows carry the applicant's phone, so a team admin reads it in the log as well, the same as in
their queue (ADR-354 point 3).
➖ One more capability in the matrix (`RBAC_RESOURCE_ROLE_MATRIX.md`, `/admin/rbac/matrix`); re-run
`scripts/seed_rbac.py` on deploy.

---

### ADR-359 Details settled while implementing: the REST shape, teamless legacy requests, suspended identities

> **Status: PROPOSED (2026-10-20).** Backend choices made in code during Tasks 5–9; for review in the PR.

**Decision**:

1. **The REST review item keeps `applicant_name` as the account's nickname** (Spec 019's contract) and
   carries what the applicant sent under `applicant_details: {name, phone, email}`, null on rows from before
   this spec. GraphQL, which had no such field, uses `applicantName` / `applicantPhone` / `applicantEmail`.
2. **Approving a `government` / `ngo` request that names no team answers 409**
   `This application names no team; the applicant should apply again`. The migration rejects the pending
   ones (ADR-350 point 9); this covers any written another way.
3. **A team that is not active yields no usable identities**: `active_identity_repository` leaves it out of
   resolving a token, logging in, refreshing, switching and the switcher (`/users/me`). Its grants are
   untouched, so restoring needs nothing re-granted. Questions about what an account *holds* — the AC-RE-101
   eligibility check and the RBAC admin's permissions view — still see it (`include_inactive_teams=True`), so
   a suspended team's member cannot become a data auditor in the meantime.
4. **Every path that names a team checks the same rules**, after code review: creating, renaming and founding
   a team take the same advisory lock on the name before checking it is unused; a suspended team refuses
   invites (409); the last-admin guard also covers the RBAC admin's role revoke; approving a member request
   locks the team before the request, the order suspending takes them in, so the two cannot interleave.
5. **The platform audit view masks applicant details** (`reason`, `contact`, `applicant_*` on
   `role_requests`; `real_name` on `users`) and, after PR #93 review, every account's login contacts and SSO
   subjects (`value` on `user_contacts`, `provider_subject` on `user_identities`), which would otherwise undo
   the first masking — for callers without `role_request.review`, in practice data auditors, who ADR-287
   point 7 keeps from them. Team admins read their own team's applicants, as in their queue.

**Consequences**:
➕ One rule for team names, whichever endpoint is used.
➖ Masked audit values read `[redacted]`, so a data auditor sees that a field changed, not to what.

---

### ADR-360 Disbanding a team does not reassign its stations

> **Status: SUPERSEDED (2026-10-21).** There is no disbanding (ADR-357 as amended 2026-10-21), so a team's
> stations and zones never need reassigning on that account. The follow-up ticket is cancelled. ADR-285 point 8
> (a deleted team's stations read as unassigned) is unchanged. Kept below as it was decided.

**Context**: ADR-285 point 8 says a deleted team's stations become unassigned. Disbanding keeps the team row
(ADR-357), so `stations.team_uuid` still points at it. Gov widening already requires an active team
(`_acts_for_gov_team`), and a disbanded team has no members, so no one acts for it.

**Decision**: this spec does not change `stations.team_uuid` on disband. The stations stay assigned to the
disbanded team until a super admin or a gov team reassigns them.

**Consequences**:
➖ A station of a disbanded team shows that team's name until it is reassigned.

---

### ADR-362 Account lists share one base; a team's member list has its own capability

> **Status: ACCEPTED (2026-10-21).** Popo, 2026-10-21, after PR #93 review asked where team admins read their
> members: one base, one subclass for every account and one for a team's members, each with its own
> permission; `team.member.view` seeded to `admin` and `member` at `team`, `super_admin` at `all`.

**In plain words**: a team's people can open their team's member list. A super admin can open any team's.
The list says each person's role in that team and nothing about their other teams. Team admins and super
admins also see the real name each one confirmed.

**Decision**:

1. **`app/services/user_directory.py`**: `UserDirectory` holds what account lists share — which accounts,
   oldest first so paging is stable, and who reads `real_name`. A subclass says who may read it and which
   accounts it covers:
   - `PlatformUserDirectory` — every account, `user.view` (`GET /admin/users`, unchanged rows).
   - `TeamMemberDirectory` — one team's members, `team.member.view` with checkpoint 2 on the team
     (`GET /admin/teams/{uuid}/members`); another team is not found (ADR-023).
2. **`team.member.view` is its own capability**, apart from `team.view` (the team) and `user.view` (every
   account), so the list can be granted or revoked on its own at `/admin/rbac`.
3. **A team row is `uuid`, `name`, `real_name`, `role_uuid`, `role`**: the role in this team only. No other
   teams' identities, sessions or logins.
4. **`real_name` in the team list** goes to `role_request.review` holders and to whoever's
   `team.member.manage` covers the team — its admins (ADR-355 point 5). Members read nicknames.
5. **Existing databases** get the grants from migration `79a19cabc98a`, missing rows only (ADR-055).

**Consequences**:
➕ A new audience (a work zone's people, say) is one more subclass.
➖ `/admin/users` now pages oldest first; before, the order was whatever the database returned.

---

### ADR-411 The review response carries `granted_team_uuid`; `team_uuid` keeps meaning what was applied for

> **Status: ACCEPTED (2026-10-28).** Popo, 2026-10-28, after the frontend reported that approving a new-team
> application returned no id for the new team.

**In plain words**: after approving a new-team application, the response now says which team was founded, in
`granted_team_uuid`. `team_uuid` still says which team the applicant asked to join, so it stays `null` for a
new team.

**Context**: the spec said the approval's `team_uuid` names the new team, but `RoleRequestResponse` copies the
row, whose `team_uuid` is the team applied for — `null` for a new team, and it cannot be filled: the
`ck_role_requests_target` CHECK forbids `team_uuid` beside `new_team_name`. The founded team is only in
`granted_team_uuid` (ADR-350 point 6), which the response left out. The frontend looked the team up by name
(unique, ADR-352) as a stopgap.

**Decision**: `RoleRequestResponse` — the approve and reject answers and every row of the review list — adds
`granted_team_uuid`: the team joined, or the one founded; `null` until approved and for a data auditor. The
spec's back-office note names this field.

**Consequences**:
➕ The response says both what was asked for and what was handed out, matching the table.
➖ A client reading the new team from `team_uuid` has to switch fields; none did, since it was always `null`.
