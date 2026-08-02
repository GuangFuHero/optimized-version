# AC-FEAT-001 product rules

## Boundary

- **Adds or changes:** Initial observable platform-role and Team-context authorization contract.
- **Replaces baseline rules:** None; no released baseline exists.
- **Does not change:** Team membership workflow or authentication method.
- **Blocking Open decisions:** AC-Q1 through AC-Q5 in `feature.md` block only their named release boundaries.

## Rules

### AC-RBAC-101: Dual-layer authorization

- **Actor/system:** Operational interface and API.
- **Precondition:** An authenticated user requests an action.
- **Trigger:** The interface renders an action or the API receives the request.
- **Observable result:** Only authorized controls are shown; an unauthorized API request returns 403.
- **Constraint/fallback:** Interface hiding never substitutes for server authorization.

### AC-RBAC-102: Platform-role assignment authority

- **Actor/system:** Super Admin.
- **Precondition:** A user's platform role is being assigned or changed.
- **Trigger:** The role change is submitted.
- **Observable result:** A Super Admin can submit the change; every other role is refused.
- **Constraint/fallback:** Team Admin authority never grants platform-role assignment.

### AC-RBAC-103: Last-Super-Admin invariant

- **Actor/system:** Platform authorization service.
- **Precondition:** Only one active Super Admin remains.
- **Trigger:** An operation would remove, demote, suspend, or deactivate that user.
- **Observable result:** The operation is refused until an eligible successor exists.

### AC-RBAC-104: Super Admin revocation safeguards

- **Actor/system:** Super Admin and audit service.
- **Precondition:** More than one Super Admin exists.
- **Trigger:** One Super Admin revokes another.
- **Observable result:** Re-authentication is required, immutable audit evidence is recorded, and the affected user is notified.

### AC-RBAC-105: Orthogonal Team role

- **Actor/system:** Authorization service.
- **Precondition:** A user has both a platform role and membership in a Team.
- **Trigger:** The user acts inside a selected Team.
- **Observable result:** Platform role determines available action types and Team role/context constrains Team-local scope.
- **Constraint/fallback:** NGO never implies Team Admin.

### AC-RBAC-106: Team member privacy

- **Actor/system:** Government user.
- **Precondition:** Teams exist outside the user's membership.
- **Trigger:** The user opens Team information.
- **Observable result:** Team name and contact window are visible; internal member details are not returned.

### AC-RBAC-107: Permission-change activation

- **Actor/system:** Session and authorization services.
- **Precondition:** A user's role or account status changes.
- **Trigger:** The user refreshes or makes the next request.
- **Observable result:** Elevation is applied no later than normal refresh; demotion and suspension invalidate current access immediately.

### AC-RBAC-108: Data Auditor restriction

- **Actor/system:** Data Auditor.
- **Precondition:** The user enters the operational product.
- **Trigger:** The user attempts role management, task deletion, immediate rescue, or Zone editing.
- **Observable result:** The control is absent and the API refuses the action.

### AC-RBAC-109: Server-owned Team boundary

- **Actor/system:** API and data access layer.
- **Precondition:** A request touches Team-scoped data.
- **Trigger:** The request is evaluated.
- **Observable result:** Results contain only Teams authorized for the user and selected context.
- **Constraint/fallback:** A client-provided Team ID cannot expand scope.

### AC-RBAC-110: Shared safety visibility

- **Actor/system:** Any role, including General User.
- **Precondition:** A Hazard Zone is active.
- **Trigger:** The user views safety information.
- **Observable result:** Hazard Zone safety information is visible.
- **Constraint/fallback:** This exception does not expose Team member or private task data.

## Traceability

| Acceptance criterion | Spec rules |
|---|---|
| AC-01 | AC-RBAC-101 |
| AC-02 | AC-RBAC-102 |
| AC-03 | AC-RBAC-103 |
| AC-04 | AC-RBAC-104 |
| AC-05 | AC-RBAC-105 |
| AC-06 | AC-RBAC-106 |
| AC-07 | AC-RBAC-107 |
| AC-08 | AC-RBAC-108 |
| AC-09 | AC-RBAC-109 |
| AC-10 | AC-RBAC-110 |
