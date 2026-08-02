# AC-FEAT-001 validation

**Immutable build or commit:** Not tested

**Environment:** Not tested

**Executor:** Not tested

**Date:** Not tested

Runtime validation has not been performed. Every checkbox remains unchecked until all checks run against one immutable build.

## Authorization and invariants

- [ ] **AC-01 / AC-RBAC-101:** Authorized controls appear, hidden controls are absent, and an equivalent unauthorized API request returns 403.
- [ ] **AC-02 / AC-RBAC-102:** A Super Admin can change platform RBAC and a non-Super-Admin cannot.
- [ ] **AC-03 / AC-RBAC-103:** Removing or demoting the last Super Admin is refused until a successor exists.
- [ ] **AC-04 / AC-RBAC-104:** Super Admin revocation requires re-authentication, records immutable audit evidence, and notifies the affected user.
- [ ] **AC-05 / AC-RBAC-105:** NGO identity does not grant Team Admin behavior; the selected Team role controls Team-local actions.
- [ ] **AC-06 / AC-RBAC-106:** Government receives Team names and contact windows without internal member details.
- [ ] **AC-07 / AC-RBAC-107:** Elevation applies by normal refresh while demotion and suspension revoke current access immediately.
- [ ] **AC-08 / AC-RBAC-108:** Data Auditor cannot change roles, delete tasks, trigger immediate rescue, or edit Zones through UI or API.
- [ ] **AC-09 / AC-RBAC-109:** Manipulating a client Team ID cannot return unauthorized Team-scoped records.
- [ ] **AC-10 / AC-RBAC-110:** Hazard Zones remain visible while private Team and task data remains protected.

## End-to-end

- [ ] **AC-01, AC-05, AC-07, AC-09 / AC-RBAC-101, AC-RBAC-105, AC-RBAC-107, AC-RBAC-109:** Change a user's role and selected Team, then verify interface, API, and returned data on the same immutable build.
