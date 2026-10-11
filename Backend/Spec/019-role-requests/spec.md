# Design: Role Requests — A Citizen Applies to Become Back-Office Staff

**Date**: 2026-09-30
**Feature**: 019-role-requests
**Status**: Backend implemented (`feat/role-request`); site UI implemented (`feat/site-role-request`, in
`feat/site-revamp` since 2026-10-01); back-office role assignment fixed by ADR-294 (2026-10-01)
**Depends on**: `Spec/010-multi-team-membership` (identities, `act` claim, identity switching),
`Spec/009-rbac-runtime-management` (capabilities editable at runtime)
**Decisions**: `decisions.md` in this folder (ADR-287 to ADR-290, ADR-294)

## Overview

A signed-in citizen can ask to become back-office staff — a government unit officer, an NGO worker, or a
data auditor — from the public site. A super admin reviews the application and approves or rejects it.
Before this feature the only way to gain a back-office role was for an admin to assign it directly
(`POST /api/v1/admin/users/{uuid}/role`).

The feature also settles a question the team decided on 2026-09-28: **everyone signed in has the same
permissions on the site — those of the platform role `user` — and which identity someone acts as is a
back-office matter.** Three identity rules follow from it and ship with this feature:

1. A request the site marks with `X-WG-Realm: site` acts as the caller's own `user` grant (ADR-289).
2. Every account holds `user`, and a login starts on it, super admins included (ADR-290).
3. Approving a data auditor *adds* `data_auditor` beside `user` instead of replacing it (ADR-288).

Product rules come from the designer's site prototype (2026-09-13):
`Design/前台/js/site/site-actions.jsx` (`RoleElevationDrawer`, `RoleRequestCard`),
`Design/前台/js/site/site-shell.jsx` (the entry button), `Design/前台/js/shared/wg-bridge.js`
(`submitRoleRequest` / `decideRoleRequest`, notification wording). The acceptance criteria AC-FEAT-002 and
AC-RE-101 to AC-RE-107 come from the spec delivered on 2026-08-22, which is not in the repo; the code cites
them by number.

## Goals

- A citizen with no back-office identity can apply, see their applications and withdraw a pending one.
- Holders of `role_request.review` (the seed gives it to `super_admin` only) can list applications and
  approve or reject them. Both outcomes notify the applicant.
- A super admin can pause applications at runtime by revoking `role_request.add` from `user` in
  `/api/v1/admin/rbac`, without a deploy.
- An approved data auditor keeps every site permission and is not signed out.

## Non-goals

- **Approving government and NGO applications.** Which team the applicant joins, and with which team role,
  waits on the designer and the product owner. Those applications can be sent, withdrawn and rejected;
  approving one is refused and it stays pending (ADR-288). `role_requests.granted_team_uuid` exists for when
  the flow is settled.
- **A back-office review screen.** Reviewers use the REST API directly until the back office is rebuilt.
- **Joining a specific team through this form.** Team membership goes by invitation; the prototype leaves the
  option out on purpose.
- **Applying to become a super admin.** Ruled out on 2026-09-11.
- **A cooldown after rejection.** An applicant may apply again at once (AC-RE-107, 2026-09-11).
- **Team admins reviewing applications to their own team.** Only `role_request.review` holders review.

## Rules

| Rule | Where it is enforced |
|---|---|
| Only an account whose identities are exactly the platform `user` may apply. Any other platform role, or any team role, counts as a back-office identity (AC-RE-101). | `services/role_request.py:_has_backoffice_identity` |
| Approval checks again: an applicant who has since gained a back-office identity other than `data_auditor` is refused with 409, and the application stays pending (ADR-288). | `approve`, after `_lock_pending` |
| At most one pending application per account, whatever it asks for (AC-RE-106). Two tabs submitting at once still leave one. | Partial unique index `uq_role_requests_one_pending`; the service turns only that index's violation into a 409 |
| A rejected or withdrawn applicant may apply again at once (AC-RE-107). | No check needed: neither state is `pending` |
| Only the applicant can withdraw, and only while pending. Anyone else's application is reported as not found, so its existence is not given away. | `withdraw` looks the row up by uuid **and** `created_by` |
| Withdrawing does not require `role_request.add`, so pausing applications never strands one already sent. | `withdraw` checks ownership only |
| A decision or a withdrawal can only leave `pending` once. When a withdrawal and a decision arrive together, the first one to lock the row wins and the other gets 409. | `_lock_pending`: `SELECT … FOR UPDATE`, then the status check |
| Reason and contact often name a unit and a phone number, so only the applicant and `role_request.review` holders read them — not data auditors. | GraphQL returns only the caller's own; the REST list is gated on `role_request.review` |
| Reason: required, at most 500 characters. Contact: optional, at most 100. Review note: optional, at most 500. Text is trimmed; blank means none. | Service checks with readable messages; table CHECKs as the backstop |

## Data model

`role_requests` (migration `666b59ab2581`), one row per application:

| Column | Type | Notes |
|---|---|---|
| `uuid` | UUID PK | |
| `created_by` | FK `users`, indexed | The applicant. Named after the repo convention that `own` scope reads (ADR-045) |
| `requested_role` | varchar(20), CHECK `government` / `ngo` / `data_auditor` | `government` and `ngo` name a **team type**, not a role (ADR-049); `data_auditor` is the platform role |
| `reason` | text, CHECK length ≤ 500 | |
| `contact` | text NULL, CHECK length ≤ 100 | |
| `status` | varchar(20), CHECK `pending` / `approved` / `rejected` / `withdrawn`, default `pending` | |
| `review_note` | text NULL, CHECK length ≤ 500 | The reviewer's reply; shown to the applicant |
| `reviewed_by` | FK `users` NULL | Stays NULL when the applicant withdraws |
| `granted_role_uuid` | FK `roles` NULL | The role approval handed out |
| `granted_team_uuid` | FK `teams` NULL | Unused until government / NGO approval exists |
| `closed_at` | timestamptz NULL | When it left `pending` — approved, rejected or withdrawn alike |
| `created_at`, `updated_at`, `delete_at` | timestamptz | `TimestampMixin`; `delete_at` is unused |

Indexes: `uq_role_requests_one_pending` (unique on `created_by` WHERE `status = 'pending'`) and
`ix_role_requests_status_created_at` for the review list. The table is in `AUDITED_TABLES` and its audit
trigger is created in the same migration, so submitting, withdrawing and deciding are all in `audit_logs`,
attributed to the identity that did it.

Migration `15370be54155` grants `user` to every account that lacks it (ADR-290). Its downgrade removes
nothing.

## Permissions

| Capability | Seed grant | Checked by |
|---|---|---|
| `role_request.add` | `user`: `all` | `submitRoleRequest`; `myRoleRequests.canApply` reads it so the entry can say applications are paused |
| `role_request.review` | `super_admin`: `all` | `GET /admin/role-requests` (route gate) and approve / reject (`require_scope` in the service) |

Eligibility and "one pending" are rules in code, not capabilities: they depend on what the account holds and
has sent, not on a grant.

`tests/test_seed_rbac.py` requires every actionable identity to cover `user`'s capabilities (ADR-097).
`role_request.add` is listed there as citizen-only (`_CITIZEN_ONLY_PERMS`): an account with a back-office
identity is ineligible anyway, so granting it to other roles would show a capability that can never be used.

## API

### Site — GraphQL

Every site request carries `X-WG-Realm: site` (see [Identity](#identity)).

| Operation | Returns | Refusals (message is the API contract; the site maps it to Chinese) |
|---|---|---|
| `myRoleRequests` | `{ hasBackofficeIdentity, canApply, requests }`; `requests` is every status, newest first | `401` when signed out |
| `submitRoleRequest(input: { requestedRole, reason, contact })` | `RoleRequestType`, now `pending` | `Reason is required`; `Reason must be at most 500 characters`; `Contact must be at most 100 characters`; `Only an account without a back-office identity can apply`; `You already have a pending request`; `403` while applications are paused; `401` |
| `withdrawRoleRequest(uuid)` | `RoleRequestType`, now `withdrawn` | `Role request not found` (unknown, or someone else's); `Role request is no longer pending`; `401` |

`RoleRequestType`: `uuid`, `requestedRole` (`government` / `ngo` / `data_auditor`), `reason`, `contact`,
`status` (`pending` / `approved` / `rejected` / `withdrawn`), `reviewNote`, `createdAt`, `closedAt`.

`hasBackofficeIdentity` decides the entry button: `true` shows 前往後台, `false` shows 申請成為後台人員. It is
read live rather than from the NextAuth session, because approval changes the account's identities while the
session lives on. `canApply` is true only with `role_request.add` granted, no back-office identity and nothing
pending.

### Back office — REST, under `/api/v1/admin`

| Endpoint | Body | Returns |
|---|---|---|
| `GET /role-requests?status=&skip=0&limit=100` | — | List, **oldest first** (a review queue: first come, first reviewed). Each item is the application plus `applicant_uuid` and `applicant_name`. `status` is optional |
| `POST /role-requests/{uuid}/approve` | `{ "note": string \| null }` (optional) | The application, now `approved` |
| `POST /role-requests/{uuid}/reject` | `{ "note": string \| null }` (optional) | The application, now `rejected` |

REST fields are snake_case: `uuid`, `requested_role`, `reason`, `contact`, `status`, `review_note`,
`reviewed_by`, `created_at`, `closed_at`.

| Status | When | `detail` |
|---|---|---|
| 401 | Not signed in | `Could not validate credentials` |
| 403 | Caller does not hold `role_request.review` **as the identity they are acting as** | `Permission Denied.` |
| 404 | No such application | `Role request not found` |
| 409 | It has already left `pending` | `Role request is no longer pending` |
| 409 | Approving, when the applicant has since become a super admin or joined a team | `The applicant has another back-office identity now` |
| 422 | Note over 500 characters | `Note must be at most 500 characters` |
| 422 | Approving a `government` or `ngo` application | `Approving government and NGO applications is not available yet` |
| 422 | `status` query value outside the four statuses | FastAPI's validation error list |

A super admin logs in as `user` (ADR-290), so the list answers 403 until they switch:
`POST /api/v1/auth/switch-identity` with `{ "role_uuid": "<super_admin role uuid>" }` (the uuid is in
`GET /api/v1/users/me` → `identities`), or log in with the OAuth2 `scope` form field set to
`<super_admin role uuid>:` — the `act` claim format, `role_uuid:team_uuid` with no team (010/ADR-207).

## Approval

Only a `data_auditor` application can be approved. In one transaction, `approve`:

1. checks `role_request.review`, then locks the application and checks it is still `pending`;
2. checks the applicant holds no back-office identity besides `data_auditor`, which may have turned up since
   they applied; one who does is refused with 409 and nothing changes;
3. inserts the platform grant `data_auditor` for the applicant — `ON CONFLICT DO NOTHING`, since an admin may
   have granted it another way since the application was sent;
4. marks the application `approved` with `reviewed_by`, `review_note`, `granted_role_uuid` and `closed_at`;
5. commits once, then notifies the applicant.

It does **not** call `admin_service.assign_role`, which removed `user` until ADR-294 and still replaces any
other platform role the account holds. The applicant keeps `user`, so the access token they hold stays valid (ADR-096 signs out only an identity
that is gone): no sign-out, no re-login. Their `identities` now list `data_auditor` for the back office.

## Notifications

In-app, through `NotificationService.dispatch`, with `ref_type = "role_request"` and `ref_uuid` = the
application. The actor is never notified of their own action.

| `type` | To | Priority | Title / body |
|---|---|---|---|
| `role_request_submitted` | Every holder of `role_request.review` | medium | 有新的後台人員申請 / {applicant name} 申請成為「{role label}」。 |
| `role_request_approved` | The applicant | high | 你的「{role label}」申請通過了 / 右上角會出現「前往後台」，不需要重新登入。 |
| `role_request_rejected` | The applicant | medium | 你的「{role label}」申請沒有通過 / the review note, or 你原本的權限沒有任何改變，可以再送一次申請。 |

Role labels: `government` 政府單位人員, `ngo` 社福團體人員, `data_auditor` 資料檢核員. Withdrawing sends nothing.
Reviewers are told of new applications now even though no back-office screen shows them yet, so the backend
does not change when one does.

## Identity

- **Site realm (ADR-289).** `get_current_user` reads `X-WG-Realm`. After the token, its session and its `act`
  claim have been checked as before, the value `site` switches *this request* to the caller's platform `user`
  grant. A revoked identity still answers 401; an account without `user` keeps the token's identity; any
  other value is ignored. The token and the session do not change, and the audit trail records `user`. The
  GraphQL context passes the header through itself, because it calls `get_current_user` directly.
- **Every account holds `user`; logins start on it (ADR-290).** Registration grants `user`.
  `scripts/bootstrap_admin.py` keeps it when granting `super_admin`. Migration `15370be54155` backfilled it.
  `default_for_user` puts `user` first, so a fresh login — password, SSO, registration, or a refresh that
  names no identity — lands on `user`, super admins included.

## Site integration

Built in `Frontend/libs/modules/src/role-request/` (2026-10-01).


- Add `X-WG-Realm: site` to every request the site sends: the `/api/graphql` proxy
  (`Frontend/apps/demo/src/app/api/graphql/route.ts`) and the server-side client that calls the backend
  directly (`Frontend/apps/demo/src/lib/urql-rsc.ts`). The whole app is the site today (`/admin` is a placeholder).
  **Back-office pages must reach the backend on a path that does not add the header**, or every back-office
  request would act as `user`.
- Entry button: signed out, neither is shown; `hasBackofficeIdentity` → 前往後台 (to a "back office in
  preparation" page at `/admin`); otherwise 申請成為後台人員, which opens the application drawer.
- Drawer: the form when nothing is pending; the pending card (with 撤回申請) when one is; the last rejected
  card with its reply above the form. Withdrawn applications show no card. Withdrawing asks first:
  撤回後這筆申請會取消，要再申請得重新填寫。 A refused withdrawal keeps its reason in that dialog while the
  drawer reloads behind it. Once the account holds a back-office identity — approved while the drawer was
  open — the drawer says so instead of showing the form, since `canApply` is then false without applications
  being paused.

## Operations

- **`scripts/seed_rbac.py` must run after the migration**, or nothing holds the two new capabilities and every
  call answers 403. `scripts/deploy.sh` already runs it right after `alembic upgrade head`; a database set up
  by hand needs it run explicitly. The seed is additive and never overwrites a grant changed at runtime.
- `alembic upgrade head` creates `role_requests` and backfills `user`. On a fresh database the backfill
  finds no `user` role and grants nothing; the seed runs after it and registration grants `user` from then on.
- Super admins land on `user` after logging in. Scripts and HTTP collections that call admin endpoints must
  switch identity first (see [API](#api)).

## Back-office role assignment (ADR-294)

These were known gaps until 2026-10-01; ADR-294 closes them in the back office's existing endpoints.

- `POST /api/v1/admin/users/{uuid}/role` (`admin_service.assign_role`) keeps `user`. Assigning a platform role
  replaces the other one the account holds, so an account has `user` plus at most one other platform role —
  the same rule as approval and `bootstrap_admin`. Promotion no longer signs anyone out.
- Assigning `user` removes the other platform role. That is how to demote a super admin and how to take back an
  approved data auditor (ADR-185 still refuses to unassign a platform role). Demoting the only super admin
  answers 409 `Cannot remove the last super_admin`. Before ADR-294 this call answered 200 and changed nothing.
- `GET /api/v1/admin/users` → `platform_role` is the platform role besides `user` if there is one, otherwise
  `user`. `identities` lists them all.

## Tests

| File | Covers |
|---|---|
| `tests/test_role_request.py` | Service rules: eligibility, one pending (including two connections at once), withdraw, reject, approve, notifications, the review list, approval racing withdrawal |
| `tests/test_graphql/test_role_requests.py` | GraphQL wiring and refusal messages |
| `tests/test_role_requests_api.py` | REST wiring and status codes; an approved applicant's token keeps working and the site still files for them |
| `tests/test_site_realm.py` | `X-WG-Realm: site` on REST and GraphQL, one request only, audit identity, no `user`, revoked identity |
| `tests/test_identity_switching.py` | `test_login_prefers_user_over_every_other_platform_role` |
| `tests/test_migration_backfill_user_role.py` | The backfill, from a database stopped at `666b59ab2581` |
| `tests/test_bootstrap_admin.py` | `bootstrap_admin` keeps `user` and replaces any other platform role |
| `tests/test_seed_rbac.py` | The two capabilities' seed grants; the ADR-097 citizen-only exception |
| `tests/test_admin_api.py` | ADR-294: `assign_role` keeps `user`, assigning `user` demotes or takes a data auditor back, the last-super-admin guard on that path, promotion keeps a `user` session, `platform_role` |
