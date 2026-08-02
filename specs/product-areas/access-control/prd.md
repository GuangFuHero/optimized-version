# Access Control product definition

## Purpose

Keep every user within an explicit operational and data boundary while allowing disaster-response work to continue across platform roles and Team contexts.

## Product boundary

### In scope

- Platform RBAC roles, global actions, data visibility, and authorization invariants.
- Composition of platform permissions with the currently selected Team context.
- Immediate enforcement for demotion and suspension.

### Out of scope

- Team creation, membership, invitation, and Team-role workflows, owned by Member Management.
- Authentication mechanics, owned by Identity and Account.
- Product-area-specific business workflows beyond their authorization boundary.

## Core principles

- Platform RBAC and Team role are orthogonal dimensions.
- Default deny, least privilege, and server-side authorization are mandatory.
- Team-scoped data is isolated by Team context; hiding a control is never sufficient authorization.
- Safety information may intentionally have broader visibility than private operational data.
