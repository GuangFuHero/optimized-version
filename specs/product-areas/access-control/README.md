# Access Control

**Status:** In delivery

**Owner:** Product Owner

**Baseline:** Not released; no baseline `spec.md` exists.

## Minimum reading path

1. This file.
2. [Target Version v0.1.0](../../versions/v0.1.0.md).
3. [AC-FEAT-001 Role-based access](./features/AC-FEAT-001-role-based-access/feature.md).

## Active Features

| Feature | Status | Target Version | Blocking issue |
|---|---|---|---|
| [AC-FEAT-001 Role-based access](./features/AC-FEAT-001-role-based-access/feature.md) | In delivery | [v0.1.0](../../versions/v0.1.0.md) | Break-glass, high-impact approval, RLS verification, and mixed-role policy require Owner or engineering evidence before release. |

## Known conflicts

- The old `_shared/engineering/rbac-permissions-design.md` uses a conflicting permission vocabulary and remains non-canonical until archived and reconciled.
- Runtime behavior and database isolation have not been validated against an immutable build.
