---
feature: IAM-FEAT-003
title: User settings and account lifecycle
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# IAM-FEAT-003: User settings and account lifecycle

## Outcome

Users can recover and maintain their accounts, request operational access through a traceable process, and deactivate safely without informal administrator intervention.

## Delta

### Current behavior

No released baseline is documented.

### Target behavior

- Password recovery accepts Email or phone and returns an enumeration-safe response. Email links expire after 30 minutes, SMS codes after five, and only the latest credential is valid.
- A successful password reset or change invalidates other sessions and notifies the user. SSO and social-only users are directed to their provider rather than shown a platform-password action.
- Email or phone changes require recent step-up authentication, verification of the new destination, and notification to the old destination before becoming effective.
- Team-join requests route to the relevant Team Admin; platform-role requests route to a Super Admin. Users can see status, withdraw before review, and receive outcome notifications.
- Self-deactivation is reversible dormancy: it signs out all sessions and suppresses notifications; a later login restores the account. A sole Team Admin or last Super Admin cannot deactivate without a successor.
- Account deletion uses a proposed 30-day reversible soft-deletion path, but Version timing and anonymized fields remain unresolved.

## Scope

### In scope

- Password recovery/change, contact changes, access requests, self-deactivation, and deletion lifecycle definition.

### Out of scope

- Reviewer-side Team and RBAC management operations.
- Final deletion rollout until Q2 is resolved.

### Affects

- Authentication, profile notifications, Access Control, Member Management, sessions, and personal data.

## Open decisions

- **Q1 — Sensitive-change rollback:** Should a completed Email or phone change remain reversible for 24 hours? Blocks post-change recovery behavior.
- **Q2 — Account deletion delivery:** Is the 30-day deletion flow part of v0.2.0, and which fields are anonymized at expiry? Blocks deletion scope and AC-09.
- **Q3 — Rejected-request resubmission:** Must users wait 24 hours, provide additional reasons, or satisfy both before resubmitting? Blocks rejected-request retry behavior.

## Acceptance criteria

- **AC-01:** A user can complete Email or SMS password recovery within the applicable credential lifetime without account-enumeration disclosure.
- **AC-02:** An access request shows a traceable submitted/review/outcome state to the requester.
- **AC-03:** Approval, rejection, and other relevant request transitions produce an in-product notification.
- **AC-04:** A new Email or phone becomes effective only after new-destination verification and old-destination notification.
- **AC-05:** Self-deactivation requires explicit confirmation.
- **AC-06:** Password reset or change invalidates other sessions and sends a change notification.
- **AC-07:** Duplicate pending access requests are blocked, and withdrawal remains available before review.
- **AC-08:** Team and platform-role requests route to Team Admin and Super Admin respectively.
- **AC-09:** Self-deactivation is reversible, while sole-Team-Admin and last-Super-Admin constraints prevent abandonment; deletion behavior remains blocked by Q2.
- **AC-10:** SSO and social-only users do not receive an unusable platform-password action.

## Traceability

- Source behavior is preserved in archived legacy PRD and user stories; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.2.0.md)
