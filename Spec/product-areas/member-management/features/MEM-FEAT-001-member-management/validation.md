# MEM-FEAT-001 validation

**Immutable build or commit:** Not tested

**Environment:** Not tested

**Executor:** Not tested

**Date:** Not tested

Runtime validation has not been performed. Every checkbox remains unchecked until all checks run against one immutable build.

## Team and member behavior

- [ ] **AC-01:** A Team Admin manages only their Team's invitations, member status, and Team roles without changing platform RBAC.
- [ ] **AC-02:** Cross-Team member access and platform-role changes are absent in the interface and refused by the API.
- [ ] **AC-03:** Government receives Team contact windows without internal member data.
- [ ] **AC-04:** A multi-Team user switches Team and receives the correct Team role and data scope.
- [ ] **AC-05:** Guest restrictions apply in interface and API, including 403 for forbidden operations.
- [ ] **AC-06:** A no-Team General User is refused operational access and an invited user receives only one Team space.
- [ ] **AC-07:** Team dissolution preserves provenance, marks Zones for reassignment, and does not remove other memberships.
- [ ] **AC-08:** Last-Team-Admin protection and invitation use/expiry limits are enforced at their boundaries.

## Review and audit behavior

- [ ] **AC-09:** Only Super Admin can use the platform-role assignment entry point.
- [ ] **AC-10:** Platform-level people remain outside Team member lists.
- [ ] **AC-11:** Team and platform-role requests reach the correct reviewer and progress independently.
- [ ] **AC-12:** Audit evidence includes every required event, actor, time, and affected scope.

## End-to-end

- [ ] **AC-01, AC-04, AC-08, AC-11, AC-12:** Create a Team, onboard members through both invitation types, switch Team context, change a Team role, and verify reviewer routing and audit evidence on one immutable build.
