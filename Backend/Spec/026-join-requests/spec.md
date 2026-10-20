# Design: Join Requests — Invite Links, Team Applications and the Two Review Queues

**Date**: 2026-10-20
**Feature**: 026-join-requests
**Ticket**: BE-038 (Notion, backend). Frontend: ADMIN-027 成員管理, "Oct 20 Updates" (review rules, system map,
Stories 1–5)
**Status**: Implemented on `feat/join-requests` (Tasks 1–11, 2026-10-20)
**Branch**: `feat/join-requests`
**Depends on**: `Spec/019-role-requests` (the application this extends), `Spec/010-multi-team-membership`
(team identities, `act` claim), `Spec/012-account-profile` (verified contacts)
**Decisions**: `decisions.md` in this folder (ADR-350 to ADR-360)

## Overview

Today a person gets into a team only when an admin adds them by account (`POST /admin/teams/{uuid}/members`),
and the user site's 申請成為後台人員 can only make someone a data auditor; government and NGO applications
can be sent but never approved (Spec 019, ADR-288 point 3).

This feature lets people ask to join a team, and lets the right people decide:

- A team admin shares an **invite link** (the frontend draws it as a QR code). Anyone signed in who opens it
  within 24 hours can ask to join that team.
- On the user site, a **政府單位人員** or **社福團體人員** applicant picks an existing team of that type, or
  names a new one.
- A team's admin decides requests to join their team. A super admin can decide any request, and is the only
  one who decides new teams and data auditors.

It is built on Spec 019's `role_requests` rather than beside it (ADR-350).

## Goals

- Part A (Must, BE-038 steps 1–5):
  - Invite links: create, open, request through; 404 after 24 hours, judged by server time.
  - User-site applications for an existing team or a new team, carrying the applicant's details.
  - Two review queues over the same rows: a team admin's (own team's member requests) and a super admin's
    (everything). First decision wins.
  - Approval puts the applicant in the team as `member`, or creates the team with them as its `admin`.
- Part B (Should, BE-038 Part B): last-admin guard, team contact fields, team edit and status, audit-log read
  API. Parts of it are still open; see [Part B](#part-b--team-housekeeping-should).

## Non-goals

- **Drawing the QR code.** The frontend makes it with qrcode-generator v2.0.4; the backend issues the link.
- **Revoking or extending an invite.** Every link lives exactly 24 hours (BE-038 step 1).
- **Usage caps on an invite.** Any number of people, any number of times.
- **Promoting a member to admin through review.** It is direct and already works:
  `POST /admin/teams/{uuid}/members` with `team_role_name: "admin"` (BE-038 step 5).
- **Super admin applications.** Never on the list (2026-09-11, unchanged).
- **Frontend work.** The handover is the [API](#api) section.

## Rules

| Rule | Source | Where it is enforced |
|---|---|---|
| `government` / `ngo` name exactly one of: an existing team, a new team name. `data_auditor` names neither. | ADR-350 point 2 | `submit` |
| An existing team must be active and of the identity's type (`government` → `gov`, `ngo` → `ngo`). | ADR-352 | `submit` |
| A new team name must not match an existing team's, trimmed and ignoring case; checked again on approval. | ADR-352 | `submit`, `approve` |
| At most one pending application per account, whatever it asks for and however it was sent (form or invite). | BE-038 step 3, ADR-351 point 1 | `uq_role_requests_one_pending` (unchanged) |
| A team request is refused only if the applicant is currently a member of that team (submit and approval). | ADR-351 point 2 | `submit`, `approve` |
| A data auditor request is refused to anyone holding a back-office identity (AC-RE-101); approval checks again. | ADR-351 point 3 | Unchanged |
| An invite older than 24 hours, unknown, or for a team that is not active answers 404 — opening it and requesting through it alike. Server time only. | BE-038 step 1, ADR-353 | `expires_at > now()` in the query |
| Requests sent while an invite was valid stay pending after it expires and can still be decided. | BE-038 step 1 | Approval does not look at the invite |
| A member request is decided by that team's admin or a super admin; new-team and data auditor requests by a super admin only. | ADMIN-027 review rules, ADR-354 | `_require_reviewer` |
| First decision wins; a second answers 409. | BE-038 step 4 | `_lock_pending` (unchanged) |
| A rejection requires a reason. | BE-038 step 4 | `reject` |
| Phone is required and must be a verified contact of the account; adding one follows ADR-220 (proof first). | BE-038 step 3, ADR-355 | `submit` |
| The applicant's name never changes `users.name`; approval writes it to `users.real_name`. | ADR-355 | `approve` |
| Rejected or withdrawn applicants may apply again at once. | AC-RE-107 | Only `pending` rows count |

## Data model

### `role_requests` — new columns (migration `<rev>_join_requests`)

| Column | Type | Notes |
|---|---|---|
| `team_uuid` | FK `teams` NULL, indexed | The existing team a member request asks for. NULL for new-team and data auditor requests |
| `new_team_name` | varchar(100) NULL | Same length as `teams.name`. Set only on a new-team application |
| `invite_uuid` | FK `team_invites` NULL | The invite a member request came through. NULL when sent from the site form |
| `applicant_name` | varchar(100) NULL | Snapshot at submit. NULL only on rows from before this feature |
| `applicant_phone` | varchar(20) NULL | E.164 snapshot of the account's verified phone at submit |
| `applicant_email` | varchar(320) NULL | Optional; see ADR-355 |

New CHECKs:

- `ck_role_requests_target`: `team_uuid` and `new_team_name` are never both set, and `data_auditor` has
  neither. A `government` / `ngo` row written by this feature (`applicant_phone IS NOT NULL`) has exactly one;
  rows from Spec 019 have neither and are let through by that condition.
- `ck_role_requests_invite`: `invite_uuid` is set only together with `team_uuid`.

Indexes: `uq_role_requests_one_pending` stays as it is (ADR-351). Added:
`ix_role_requests_team_pending` on (`team_uuid`, `created_at`) where `status = 'pending'`, for the team
admin's queue.

`contact` stays on the table for old rows; nothing writes it any more (ADR-355).

The migration does not rewrite existing rows. A pending Spec 019 `government` / `ngo` row has no team and
cannot be approved; the migration rejects them with the note `申請流程已更新，請重新送出申請。` so they do not
sit in the queues forever. There are no production users (2026-10-20).

### `users` — new column

| Column | Type | Notes |
|---|---|---|
| `real_name` | varchar(100) NULL | Written on approval from `applicant_name` (ADR-355). Back office only; `users.name` stays the nickname |

### `team_invites` (new)

| Column | Type | Notes |
|---|---|---|
| `uuid` | UUID PK | |
| `token` | varchar(32), unique | `secrets.token_urlsafe(24)`; what the link carries. The uuid never leaves the server |
| `team_uuid` | FK `teams`, indexed | |
| `created_by` | FK `users` | |
| `created_at` | timestamptz, default `now()` | Database time |
| `expires_at` | timestamptz | `created_at + interval '24 hours'`, set by the database default, never by the client |

No `revoked_at`, no `max_uses`, no `uses` (BE-038 step 1). The table is in `AUDITED_TABLES`.

### `teams` — Part B columns

| Column | Type | Notes |
|---|---|---|
| `contact_name` | varchar(100) NULL | Shown to other teams in 所有團隊 |
| `contact_phone` | varchar(20) NULL | Same |

`status` (exists, default `active`) gains the values `suspended` and `disbanded` with a CHECK. See
[Part B](#part-b--team-housekeeping-should) for what they mean.

## Permissions

One new capability, `team.audit.view` (ADR-358). Who may do what:

| Action | Gate |
|---|---|
| Submit, withdraw, `myRoleRequests` | Unchanged (`role_request.add`; withdraw by ownership) |
| Create or list a team's invites | `team.member.manage` on that team (seed: `admin` at `team`, `super_admin` at `all`) |
| Open an invite, request through it | Signed in. Requesting also needs `role_request.add`, like the site form |
| Review list | `role_request.review` → every request. Otherwise `team.member.manage` at `team` → member requests for the caller's active team |
| Decide a member request | `role_request.review`, or `team.member.manage` covering the request's team |
| Decide a new-team or data auditor request | `role_request.review` only |

Team admins reusing `team.member.manage` (ADR-354): approving a member is adding a member, which the
capability already allows; a separate capability would always be granted with it.

## API

### Site — GraphQL (`X-WG-Realm: site`)

| Operation | Change |
|---|---|
| `submitRoleRequest(input)` | `input` gains `teamUuid`, `newTeamName`, `name`, `email`; loses `contact`. Phone is not in the input: it is the account's verified phone |
| `myRoleRequests` | Each request gains `team { uuid, name }`, `newTeamName`, `viaInvite`, `applicantName`, `applicantPhone` (masked), `applicantEmail`. `canApply` keeps its name: no pending request and `role_request.add` on; it no longer requires having no back-office identity (ADR-351) |
| `roleRequestTeams(type: GOV \| NGO)` *(new)* | The public team directory: active teams only, `[{ uuid, name, type }]`, by name; `type` optional. Signed in, no capability. Nothing else about a team (tax ID, contact, members) — `team.view` is not widened (ADR-357 point 5) |
| `withdrawRoleRequest` | Unchanged |

New refusals on submit (message is the contract):

- `Pick a team or name a new one` / `Pick a team or a new name, not both`
- `A data auditor application names no team`
- `Team not found` (unknown, not active, or the wrong type)
- `A team with this name already exists`
- `A verified phone number is required`
- `Name is required` / `Name must be at most 100 characters`
- `You are already a member of this team`
- `You already have a pending request` (unchanged)
- `Only an account without a back-office identity can apply` (data auditor only, unchanged)

### Invites — REST

REST so that "returns 404" is a real HTTP status (ADR-353).

| Method and path | Who | Returns |
|---|---|---|
| `POST /api/v1/admin/teams/{team_uuid}/invites` | `team.member.manage` on the team | 201 `{ token, team_uuid, created_at, expires_at }` |
| `GET /api/v1/admin/teams/{team_uuid}/invites` | Same | Unexpired invites, newest first, so the page can show the current QR again |
| `GET /api/v1/invites/{token}` | Signed in | `{ team: { uuid, name, type }, expires_at, my_request }`; `my_request` is the caller's pending request for that team, if any. **404** when unknown, expired or the team is not active |
| `POST /api/v1/invites/{token}/requests` | Signed in, `role_request.add` | 201 the new request (a member request for the invite's team; identity from the team's type). Body: `{ name, email, reason }`. **404** as above; 409 / 422 as the site form |

### Back office — REST

| Method and path | Change |
|---|---|
| `GET /api/v1/admin/role-requests` | Gated as in [Permissions](#permissions) instead of `role_request.review` alone. New filters: `team_uuid`, `kind` (`member` / `new_team` / `data_auditor`). Items gain `team_uuid`, `team_name`, `new_team_name`, `via_invite` and `applicant_details` (ADR-359 point 1). Still oldest first |
| `POST …/{uuid}/approve` | Works for every kind (below). A team admin outside the request's team, or on a new-team / data auditor request, gets 404, so the request's existence is not given away. A request naming no team (Spec 019) gets 409 (ADR-359 point 2) |
| `POST …/{uuid}/reject` | `note` becomes required: `A reason is required` (422) |
| `GET /api/v1/admin/users` | Items gain `real_name`, filled only for `role_request.review` holders (data auditors also hold `user.view`, ADR-355 point 5) |
| `PATCH /api/v1/admin/teams/{uuid}` *(new)* | Name, tax ID, `contact_name`, `contact_phone`. Team admin: own team; super admin: any (ADR-357) |
| `POST /api/v1/admin/teams/{uuid}/status` *(new)* | `{"status": "active" \| "suspended" \| "disbanded"}`, super admin only |
| `GET /api/v1/admin/teams` | Items gain `contact_name`, `contact_phone` |
| `GET /api/v1/admin/audit-logs` *(new)* | `table`, `row_id`, `actor_uuid`, `from`, `to`, `limit` (≤ 100), `offset`; newest first (ADR-358) |

## Approval

All in one transaction with the status change, after `_lock_pending`:

| Kind | Checks again | Grants | Records |
|---|---|---|---|
| Member | Team still active; applicant not already a member | Team role `member` in the team, through the add-member helper | `granted_team_uuid`, `granted_role_uuid` |
| New team | Name still unused | Creates the team (name, type from the identity, status `active`); team role `admin` in it | Same |
| Data auditor | Unchanged (ADR-288) | Unchanged | Unchanged |

Every kind also writes `applicant_name` to `users.real_name` in the same commit (ADR-355).

`admin_service.add_team_member` commits and notifies on its own. The grant part moves to a helper that only
adds rows, used by both the endpoint and approval, so approval stays one commit (ADR-354).

## Notifications

| Event | To | New |
|---|---|---|
| `role_request_submitted` | `role_request.review` holders, plus that team's admins for a member request | Team admins added |
| `role_request_approved` | Applicant. Member: 「你已加入「{team}」」. New team: 「「{team}」已建立，你是管理員」 | Bodies for team kinds |
| `role_request_rejected` | Applicant, with the reason | Reason now always present |

Approval does not also send `team_member_added`; the approval notice says it.

## Part B — team housekeeping (Should)

| Item | Design | Status |
|---|---|---|
| Last-admin guard | `add_team_member` (changing an `admin` to another role) and `remove_team_member` refuse when the target is the team's only `admin`: 409 `Cannot remove the team's only admin`. Locks the team's admin rows `FOR UPDATE`, as `_remaining_super_admins` does (ADR-356) | Designed |
| Last-super-admin guard | Already enforced in `assign_role` and `rbac_admin` user-role revoke (ADR-032, ADR-056). Only tests are added for the paths BE-038 names | Exists |
| Team contact fields | `contact_name`, `contact_phone` on `teams`; in `TeamResponse`, visible where the team already is — not to other teams (ADR-356, ADR-357 point 5) | Designed |
| Team edit | `PATCH /api/v1/admin/teams/{uuid}`: name, tax ID, contact fields. Super admin any team, team admin own team, via `team.edit` (seed adds `admin` at `team`) (ADR-357) | Designed |
| Suspend / restore / disband | `POST /api/v1/admin/teams/{uuid}/status`, super admin only. Suspended: grants kept but give no permission, identity cannot be used; disbanded: grants removed, row kept (ADR-357) | Designed |
| Audit-log read API | `GET /api/v1/admin/audit-logs`. `audit.view` at `all`: every row. Team admins (new capability `team.audit.view` at `team`): rows about their active team only — the team row, its grants, requests, invites, zone assignments (ADR-358) | Designed |

## API handover for the frontend

Everything the site and the back office change, in one place. Error messages are the contract: map them to
Chinese as Spec 019 does.

### User site — 申請成為後台人員

1. **Team list**: `roleRequestTeams(type: GOV | NGO)` → `[{ uuid, name, type }]`. 政府單位人員 asks for `GOV`,
   社福團體人員 for `NGO`. The form's last option, 「＋ 清單裡沒有，建立新的單位／團隊」, sends `newTeamName` instead.
2. **Phone first**: if `/users/me` has no verified phone, add one with the contact flow before submitting:
   `POST /api/v1/auth/contacts` then `POST /api/v1/auth/contacts/verify`. **An account that already has a
   password or an email must prove itself first** (ADR-220): the add call asks for a step-up — a code sent to
   the existing email, or the password — before the SMS code is sent. That is two codes; the prototype draws
   one, so this step is new on the page.
3. **Submit**: `submitRoleRequest(input: { requestedRole, reason, name, email, teamUuid | newTeamName })`.
   `contact` is gone. `name` is prefilled from the nickname but is kept on the request only; the nickname never
   changes. A verified account email is used instead of the typed one, so show it read-only.
4. **The card**: `myRoleRequests.requests[]` gains `team { uuid name type }`, `newTeamName`, `viaInvite`,
   `applicantName`, `applicantPhone` (masked), `applicantEmail`. `canApply` now means "none pending and not
   paused"; a team member can apply to another team (`hasBackofficeIdentity` no longer hides the entry), but
   only a plain user may choose 資料檢核員 — submitting that answers
   `Only an account without a back-office identity can apply`.
5. **One pending request per account**, invite scans included: `You already have a pending request`. To ask a
   second team, withdraw the first.

### User site — invite link page

- `GET /api/v1/invites/{token}` (signed in, `X-WG-Realm: site`) → `{ team: { uuid, name, type }, expires_at,
  my_request }`. **404** `Invite not found` for unknown, expired, or a team that is not active.
- `POST /api/v1/invites/{token}/requests` with `{ name, reason, email? }` → 201 the request. 404 as above;
  409 `You are already a member of this team` / `You already have a pending request`; 422 for fields.
- Show `expires_at` as "有效至"; nothing on the client decides expiry.

### Back office — 團隊 → 我的團隊

- **Invite**: `POST /api/v1/admin/teams/{uuid}/invites` → `{ token, team_uuid, created_at, expires_at }`.
  Draw the QR from a URL built on `token` (qrcode-generator 2.0.4). `GET` the same path lists the links still
  valid, newest first.
- **審核佇列**: `GET /api/v1/admin/role-requests?status=pending` as the team identity returns that team's
  member requests only. Approve: `POST …/{uuid}/approve`. Reject: `POST …/{uuid}/reject` with a required
  `note` (`A reason is required`). A request already decided elsewhere answers 409.
- **Members**: removing or demoting the team's only admin answers 409 `Cannot remove the team's only admin`.
- **Edit team**: `PATCH /api/v1/admin/teams/{uuid}`.
- **稽核紀錄**: `GET /api/v1/admin/audit-logs` as the team admin identity.

### Back office — 成員與權限 (super admin)

- **審核佇列**: the same list returns every request; filter with `kind=member|new_team|data_auditor` and
  `team_uuid`. Approving a new-team application creates the team; the response's `team_uuid` names it.
- **Teams**: `POST /api/v1/admin/teams/{uuid}/status`. Suspending signs the team's identities out at their
  next request (401) and removes the team from the switcher; restoring brings them back; disbanding removes
  every member and cannot be undone.
- **Users**: `real_name` appears in `GET /api/v1/admin/users`.

## Tests

Carry over Spec 019's suites (`tests/test_role_request.py`, `tests/test_role_requests_api.py`,
`tests/test_graphql/test_role_requests.py`); WG-141 to WG-143 still hold. New cases, each in the
task that adds it:

- Invite: create; open within 24 hours; 404 just after `expires_at` (time moved on the database side, not by
  a client value); 404 for unknown token and for a suspended team; a request sent before expiry is approved
  after it.
- Limit: a pending form request blocks an invite request (and the other way round) → 409; concurrent submits
  through both paths leave one row; after withdrawing, the invite request goes through.
- Eligibility: member of A applies to B → allowed; member of B applies to B → refused; removed from B →
  allowed again.
- Queues: team admin sees only own team's member requests; 404 on another team's request and on new-team /
  data auditor ones; super admin sees all.
- First decision wins: team admin and super admin approve together → one 200, one 409.
- Approval: member joins as `member` and can switch to the team identity; new team created with type from
  identity and applicant as `admin`; name taken in between → 409 and still pending.
- Notifications: team admins told on a member request.
- Real name: approval writes `real_name`, rejection does not; `users.name` unchanged; `real_name` absent from
  site GraphQL and history.
- Part B: last admin cannot be removed or demoted; with two admins one can. Team admin edits own team, gets
  404 on another, cannot create a team. Suspended team: grants give no permission, switching to it refused,
  restore brings them back; disbanded: grants gone; pending requests rejected with the note.
- Audit log: team admin sees team A's grant and request rows, not team B's; member gets 403; `audit.view` at
  `audit.view` still has only its two holders; super admin and data auditor see everything.
- Migration: upgrade from main's head with a pending legacy `government` row → rejected with the note;
  downgrade.

## Operations

- Migration parent: main's head `209c4375c3e1` (2026-10-20). `Spec/025-dedup-review-queue` branches from the
  same head; whichever merges second changes its `down_revision`, and its PR says so.
- Seed changes: `team.edit` and the new `team.audit.view` to `admin` at `team`; `team.audit.view` to
  `super_admin` at `all` (ADR-357, ADR-358). Re-run
  `scripts/seed_rbac.py` on deploy.
