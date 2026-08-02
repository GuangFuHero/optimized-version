# TM-FEAT-001 validation

**Immutable build or commit:** Not tested

**Environment:** Not tested

**Executor:** Not tested

**Date:** Not tested

Runtime validation has not run. Every item remains unchecked until it is executed against the immutable build recorded above.

## Core behavior

- [ ] **AC-01 / TM-CF-101 / TM-CF-102:** Applying a defined group adds only missing category-field pairs and preserves existing configuration.
- [ ] **AC-02 / TM-CF-102 / TM-CF-107:** Removing a disaster context leaves fields intact until an authorized explicit deactivation.
- [ ] **AC-03 / TM-CF-103:** Adding a field starts with library search and reuses an existing field identity.
- [ ] **AC-05 / TM-CF-105:** An incident-local field supports forms, filtering, required/optional state, and incident reporting.
- [ ] **AC-06 / TM-CF-106:** Forms expose only required or optional state, evaluate no conditional requirement, and do not block citizen intake with these fields.

## Permission and data retention

- [ ] **AC-04 / TM-CF-104:** Super Admin changes succeed and equivalent changes from every other role are refused by the server boundary.
- [ ] **AC-07 / TM-CF-107:** Deactivation hides the field from a newly opened form while historical values remain readable and cannot be deleted through configuration.

## Failure, offline, and boundary behavior

- [ ] **AC-08 / TM-CF-108:** A rejected, stale, conflicting, or offline change preserves the last accepted configuration and all collected values.
- [ ] **AC-04 / TM-CF-104:** Direct API use cannot bypass configuration authority.
- [ ] **AC-06 / TM-CF-106:** Field configuration does not add Task categories, conditional rules, or guest-disclosure behavior.

## End-to-end

- [ ] **AC-01 / AC-03 / AC-04 / AC-05 / AC-06 / AC-07 / AC-08 / TM-CF-101 / TM-CF-102 / TM-CF-103 / TM-CF-104 / TM-CF-105 / TM-CF-106 / TM-CF-107 / TM-CF-108:** A Super Admin applies a group, adds one local field, staff records a value, the field is deactivated, and a later view still shows the historical value while an unauthorized or failed change leaves accepted state intact.

