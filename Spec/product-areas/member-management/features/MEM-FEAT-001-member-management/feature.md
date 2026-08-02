---
feature: MEM-FEAT-001
title: Member and Team management
status: In delivery
owner: Product Owner
target_version: v0.1.0
---

# MEM-FEAT-001: Member and Team management

## Outcome

Organizations can establish isolated Team spaces, onboard and manage their members quickly, and coordinate through a visible contact window without exposing internal member data to other organizations.

## Delta

### Current behavior

Implementation is in progress, but no released or runtime-validated baseline is documented.

### Target behavior

- Super Admin can create, edit, suspend, and dissolve Teams. Suspension is reversible; dissolution preserves historical task and Zone provenance and removes only that Team membership.
- Team Admin can manage only their Team's members and Team roles. A Team role never changes platform RBAC, and every active Team retains at least one Admin.
- Government can see Team names and contact windows but not internal members. Team Members see only basic information for their own Team; Guests receive restricted, read-only Team access.
- Team invitation QR codes and short links carry a Team-bound token, require OTP, expire or reach a usage limit, can be revoked/rotated, and use an explicit confirmation action before consuming the token.
- A person can belong to multiple Teams; switching Team changes the data context without changing platform RBAC.
- Team-join and platform-role requests remain independent and route to Team Admin and Super Admin respectively.
- Audit evidence covers Team lifecycle, membership/role/status changes, invitation lifecycle, platform-role entry-point actions, and cross-Team intervention.

## Scope

### In scope

- Team CRUD and lifecycle, Team membership/roles, invitation security, Team switching, reviewer queues, account suspension entry point, and audit evidence.

### Out of scope

- Platform permission definitions, authentication mechanics, and domain workflow rules.

### Affects

- Access Control, Identity and Account, Map Decision Support, Task Management, and audit storage.

## Open decisions

None.

## Acceptance criteria

- **AC-01:** A Team Admin can invite, suspend within the Team, and change Team roles for their own members without changing platform RBAC.
- **AC-02:** A Team Admin cannot see another Team's members or change platform RBAC through either interface or API.
- **AC-03:** Government can see Team names and contact windows but cannot retrieve internal member lists.
- **AC-04:** One user can belong to multiple Teams and switching Team changes the visible data boundary and Team role.
- **AC-05:** A Team Guest cannot access member management, other Teams, map drawing, disaster activation, or Audit Log; equivalent API calls return 403.
- **AC-06:** A General User without a Team cannot enter the operational product, while an invited user can enter only the inviting Team without a platform-role change.
- **AC-07:** Dissolving a Team preserves historical task/Zone provenance, marks Zones for reassignment, and leaves other Team memberships intact.
- **AC-08:** Every active Team retains an Admin; single-use invitations expire after use and multi-use invitations expire by time or usage limit.
- **AC-09:** Only a Super Admin can execute the platform-RBAC assignment entry point.
- **AC-10:** Platform-level people without a Team appear outside every Team member list.
- **AC-11:** Team and platform-role requests route to Team Admin and Super Admin respectively and remain independently reviewable.
- **AC-12:** Audit evidence records Team lifecycle, member changes, role changes, invitation events, actor, time, and affected scope.

## Traceability

- [Validation](./validation.md)
- [Target Version](../../../../versions/v0.1.0.md)
- Source behavior is preserved in archived legacy PRD/user stories; invitation and Guest evidence is under `research/`.
