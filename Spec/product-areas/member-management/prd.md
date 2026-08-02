# Member Management product definition

## Purpose

Let disaster-response organizations collaborate in separate Team spaces while enabling rapid, auditable member onboarding and preserving internal-member privacy.

## Actors

- Super Admin managing all Teams and platform-level people.
- Government users viewing Team contact windows for coordination.
- Team Admin, Member, and Guest operating within one or more Teams.
- General Users applying or accepting an invitation to join.

## Product boundary

### In scope

- Team lifecycle, Team membership, Team roles, invitations, Team switching, review queues, and member-change audit evidence.
- Reviewer-side entry points for platform-role requests without redefining the permission model.

### Out of scope

- Platform RBAC rules and invariants, owned by Access Control.
- User-side request submission and account lifecycle, owned by Identity and Account.
- Task, Zone, and announcement business behavior beyond membership-based access boundaries.

## Core principles

- Platform RBAC, Team membership, and Team role are separate dimensions.
- Each active Team retains at least one Team Admin.
- Private member details never become cross-Team coordination data.
- Invitations optimize urgent onboarding without bypassing identity verification, approval, expiry, or auditability.
