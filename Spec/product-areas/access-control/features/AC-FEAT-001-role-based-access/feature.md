---
feature: AC-FEAT-001
title: Role-based access control
status: In delivery
owner: Product Owner
target_version: v0.1.0
---

# AC-FEAT-001: Role-based access control

## Outcome

Operational users see and can perform only the actions authorized by their platform role and current Team context, with private Team data protected from unrelated organizations.

## Delta

### Current behavior

Implementation is in progress, but no released or runtime-validated baseline is documented.

### Target behavior

- Platform roles are Super Admin, Government, NGO, Data Auditor, and General User. Team roles are Admin, Member, and Guest and do not replace platform roles.
- Effective access combines a role's global scope with the selected Team's scope. General Users without a Team have no operational-product access; Team membership can unlock only that Team space.
- Only a Super Admin can assign platform RBAC, and the platform must always retain at least one Super Admin.
- Government may see Team names and contact windows but not internal member lists. Data Auditors cannot manage roles, delete tasks, or edit Zones.
- Authorization is enforced by the API and data boundary as well as the interface. Unauthorized calls return 403.
- Demotion and suspension revoke access immediately; elevation may take effect on refresh. Super Admin revocation requires re-authentication, immutable audit evidence, and notification.
- Hazard safety information remains visible to all roles; private Team and task information follows its owning visibility rules.

## Scope

### In scope

- Platform role definitions, role assignment constraints, effective-scope derivation, and observable authorization outcomes.

### Out of scope

- Team-role administration workflow and product-specific operations themselves.

### Affects

- Every operational product area, authentication/session behavior, Team data, and audit evidence.

## Open decisions

- **Q1 — Read-only Viewer:** Is a separate privacy-limited Viewer role required, or is a Government read-only subset sufficient for the early trial? Blocks new role scope only.
- **Q2 — Mixed-role precedence:** Confirm the proposed rule that platform RBAC determines actions, Team context determines data scope, and member-list privacy always follows Team role. Blocks mixed-role edge-case release validation.
- **Q3 — High-impact approval:** Which actions require dual approval versus a reversible cooling period? Blocks close-disaster and dissolve-Team behavior.
- **Q4 — RLS evidence:** Has `FORCE ROW LEVEL SECURITY` and pooled-session isolation been verified against the current database? Blocks defense-in-depth release evidence.
- **Q5 — Break-glass:** Define credential custody, activation, audit, and notification with IAM-FEAT-001. Blocks emergency-access release behavior.

## Acceptance criteria

- **AC-01:** Each role sees only controls it may use, and the API independently rejects an unauthorized operation with 403.
- **AC-02:** Only a Super Admin can assign or change platform RBAC.
- **AC-03:** The platform refuses removal or demotion of the last Super Admin until a successor exists.
- **AC-04:** Revoking another Super Admin requires re-authentication, immutable audit evidence, and immediate notification.
- **AC-05:** An NGO user's Team operations follow that Team role rather than assuming NGO equals Team Admin.
- **AC-06:** Government users can see Team names and contact windows but cannot see internal member lists.
- **AC-07:** A role or Team-context change is reflected on the next applicable refresh or request; demotion and suspension revoke access immediately.
- **AC-08:** Data Auditors cannot change roles, delete tasks, trigger immediate rescue, or edit Zones.
- **AC-09:** Team-scoped API data is filtered by authorized Team context rather than a client-provided Team ID alone.
- **AC-10:** Hazard Zone safety information remains visible across roles without exposing unrelated private Team data.

## Traceability

- [Product rules](./spec.md)
- [Validation](./validation.md)
- [Target Version](../../../../versions/v0.1.0.md)
