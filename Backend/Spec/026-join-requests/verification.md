# 026 Join Requests — Verification

## Round 2 (2026-10-21, after PR #93 review, on main `31e948877`)

| Check | Result |
|---|---|
| Local full suite, `pytest tests -n 8` | 2531 passed, 0 failed |
| Container full suite (same image) | 2531 passed, 0 failed |
| Migrations from scratch, down to `209c4375c3e1` and up | clean, head `79a19cabc98a` |
| API walk-through (round 1's 41 checks, minus nothing, plus 4) | 45/45 |
| Frontend after `pnpm schemas:generate` | typecheck, lint, test pass |

Added checks: a team admin lists the team's members with real names; a member lists them without; a team
admin's list of another team → 404; the invite page names a pending request for another team
(`pending_elsewhere`). Masking on rows the real trigger wrote: a data auditor reads `applicant_phone` and
`user_contacts.value` as `[redacted]`; a super admin reads the values. Disbanding is gone: `disbanded` → 422.

## Round 1 (2026-10-20)

Isolated stack `-p join026verify`: `disaster-postgres-h3:16-3.4`, `redis:7-alpine`, and the branch's image
built with `DOCKER_BUILDKIT=0 docker build`. No published ports; scripts ran inside the backend container
against `localhost:8000`. The user's own `backend-*` containers were not touched. Torn down with `down -v`.

## Migrations

- Fresh volume: `alembic upgrade head` → `209c4375c3e1 → 11f0025d521b → 0662cf1d2c83 → 79a19cabc98a`, one head.
- `downgrade 209c4375c3e1` then `upgrade head`: clean (3 down, 3 up).
- After `scripts/seed_rbac.py`: `downgrade 0662cf1d2c83` then `upgrade head`: clean.

## Test suite

| Where | Result |
|---|---|
| Local, `pytest tests -n 8` (final commit) | 2335 passed, 0 failed |
| Container, `pytest tests -n 8` (before the last test fix) | 2334 passed, 1 failed: `test_migration_contact_details_open` read every grant into a role → scope dict, so the new grant migration overwrote its entry. Fixed in the test (filter on `ticket.view_pii`); the file then passes locally with the other migration tests (20 passed) |

## API walk-through (41/41)

Real HTTP, accounts and tokens made with the ORM and `SessionRepository`, site calls with `X-WG-Realm: site`.

| Flow | Checks |
|---|---|
| Invite | team admin creates (201, exactly 24 h); another team's → 404; visitor opens (200) and requests (201, identity from the team type) |
| Queues | the request is in the team admin's and the super admin's queue, with `applicant_details` |
| Decisions | team admin approves; super admin's later reject → 409; super admin approves a gov member request, the team admin's later approval → 409 |
| Membership | the approved member switches into the team identity; the team token works; `real_name` written, nickname kept |
| One pending | a site-form request blocks an invite request (409); after withdrawing, the invite request goes through |
| Expiry | `expires_at` moved into the past in SQL: open 404, request 404; a burst of 5 → all 404 |
| New team | a team admin cannot see it (404); super admin approves → gov team created, applicant is its admin |
| Last admin | the only admin leaving → 409 |
| Data auditor | still applied for and approved |
| Team edit | team admin edits own contact; creating a team → 403 |
| Status | suspend → member's team token 401, own identity 200; restore → team token works again |
| Audit log | team admin reads only rows about T (team, grants, requests, invites); no `client_ip`; member → 403; `EXPLAIN` uses `ix_audit_logs_team_uuid` (Bitmap Index Scan) |
| Masking | on rows the real trigger wrote: a data auditor reads `applicant_phone` as `[redacted]`, a super admin reads the numbers |
| Concurrency | 20 accounts requesting through one invite at once → 20 × 201, no 500 |
