---
feature: IAM-FEAT-001
title: Authentication and identity linking
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# IAM-FEAT-001: Authentication and identity linking

## Outcome

Residents, volunteers, and administrators can authenticate through the appropriate entry point without creating duplicate account subjects or receiving permissions beyond an approved role.

## Delta

### Current behavior

No released baseline is documented.

### Target behavior

- Public users can use Email, SMS, Google, or Line; administrators use the 究平安 SSO entry point.
- Every login identity attaches to one stable internal user ID. A matching verified Email or phone initiates verified linking and requires login through the existing method; the system never silently merges accounts.
- A new third-party identity can create an account even when the provider returns no Email. Line identities without Email remain independent until the user explicitly links another method.
- Unknown-account and wrong-secret failures use the same public error response.
- OTP defaults are six digits; SMS expires after five minutes, Email after ten; a code expires after three failed attempts; resend and per-number/per-IP abuse controls apply.
- Successful SSO without an existing role creates a lowest-permission pending account and notifies a Super Admin rather than granting operational authority.
- Sessions support multiple devices. Demotion or suspension invalidates access immediately; elevation may take effect at the next normal token refresh.
- OAuth cancellation or callback failure returns a retryable result without leaving a partially created account.

## Scope

### In scope

- Public Email, SMS, Google, and Line authentication.
- Administrator SSO, JIT pending-account behavior, identity linking, OTP abuse protection, and session enforcement.

### Out of scope

- Permission matrices and Team membership operations.
- Detailed break-glass credential custody until Q1 is resolved.

### Affects

- Access Control, Member Management, user settings, sessions, and security audit evidence.

## Open decisions

- **Q1 — Break-glass custody and activation:** How many emergency Super Admin credentials exist, who can activate them, and what audit/alert sequence applies? Blocks break-glass release validation.
- **Q2 — Line identity assistance:** Beyond explicit manual linking, may a verified phone number assist matching a Line identity? Blocks the Line linking boundary.
- **Q3 — International-number policy:** Which additional verification or restriction applies outside `+886`? Blocks international SMS acceptance behavior.

## Acceptance criteria

- **AC-01:** A public user can complete authentication through Email, SMS, Google, or Line.
- **AC-02:** An administrator completing SSO reaches the operational product with the approved role and does not manually select a role.
- **AC-03:** Under normal network conditions, a successful authentication flow completes within 30 seconds.
- **AC-04:** Authentication failures do not disclose whether an account exists and provide a retryable response where applicable.
- **AC-05:** A previously unseen third-party identity creates one account without leaving a partial account after a failed callback.
- **AC-06:** Linking another login method requires verified possession of the existing method and does not create a duplicate internal user.
- **AC-07:** OTP expiry, attempt, resend, number, and IP limits are enforced with additional handling for international numbers once Q3 is resolved.
- **AC-08:** SSO without an assigned role creates a lowest-permission pending account and notifies a Super Admin instead of granting operational access.
- **AC-09:** Demotion or suspension revokes access immediately while elevation may take effect on normal refresh.

## Traceability

- Source behavior is preserved in archived legacy PRD and user stories; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.2.0.md)
