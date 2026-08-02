# Identity and Account product definition

## Purpose

Give residents, volunteers, and administrators one durable account identity with safe authentication, understandable personal information, and self-service account lifecycle controls.

## Actors

- Residents and volunteers using the public product.
- Administrators using the operational product.
- Super Admin and Team Admin reviewers handling access requests.

## Product boundary

### In scope

- Authentication and identity linking for one internal account subject.
- User profile, in-product notifications, and cross-device preferences.
- Password, contact information, role-request, deactivation, and deletion lifecycle controls.

### Out of scope

- Permission definitions and authorization decisions, owned by Access Control.
- Team membership and reviewer operations, owned by Member Management.
- Domain-event rules that merely generate notifications; those remain in their owning product areas.

## Core principles

- Authentication proves identity; Access Control determines authorization.
- Multiple login methods attach to one stable internal user identity and never merge silently.
- Sensitive account changes require verification and observable recovery or notification behavior.
- Account and preference state persists across devices where the source requirements require continuity.
