---
feature: TM-FEAT-001
title: Custom fields
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-001: Custom fields

## Outcome

A Super Admin can adapt the active incident's Task detail fields without changing stable task categories or losing values already collected.

## Delta

### Current behavior

Legacy documents and partial implementation disagree on permissions, field lifecycle, validation, and concurrent changes. No released behavior or immutable-build validation exists.

### Target behavior

Approved behavior is limited to the rules in [`spec.md`](./spec.md). Interaction and failure behavior listed below remains unresolved and must not be inferred from wireframes or code.

## Scope

### In scope

- Applying predefined disaster field groups, selecting library fields, creating incident-local fields, required/optional state, deactivation, and historical-value visibility.

### Out of scope

- Creating task categories, conditional-required rules, cross-incident library promotion workflow, and public guest disclosure.

### Affects

- Super Admin configuration, staff intake and update forms, stored Task details, incident reporting, and audit needs.

## Open decisions

- **Q1 — Change awareness:** How are operational members informed when the active field list changes? Blocks AC-08.
- **Q2 — Duplicate-name prevention:** What similarity rule and refusal/warning behavior applies to local fields? Blocks AC-03 and TM-CF-103 edge behavior.
- **Q3 — Reactivation state:** Does reactivation restore the previous required/optional state? Blocks AC-07 and TM-CF-107 reactivation behavior.
- **Q4 — Required-field enforcement moment:** At which save or completion transition is a required field enforced? Blocks AC-06 and TM-CF-106 enforcement behavior.
- **Q5 — Mid-form deactivation:** What happens to an already-open form when its field is deactivated? Blocks AC-07 and TM-CF-107 concurrent-form behavior.
- **Q6 — Concurrent administrators:** How are conflicting field-configuration changes detected and resolved? Blocks AC-08.
- **Q7 — Type correction:** How is a wrong field type handled after values exist? Blocks AC-05 and TM-CF-105 correction behavior.
- **Q8 — Group application rollback:** Is an immediately applied disaster group reversible as one action? Blocks AC-02 edge behavior.
- **Q9 — Large-form organization:** How are long field lists grouped or progressively disclosed? Blocks AC-06 presentation behavior.
- **Q10 — Shared semantic field:** Can one field identity attach to several task categories? Blocks AC-03 and TM-CF-103 reuse behavior.
- **Q11 — Read-only configuration visibility:** May non-Super-Admins inspect field configuration? Blocks AC-04 visibility behavior.

## Acceptance criteria

- **AC-01:** Applying a predefined disaster field group adds its category-field pairs without removing existing fields.
- **AC-02:** Removing an active disaster context does not automatically remove configured fields; an explicit deactivation action is separate.
- **AC-03:** Adding a field starts with a field-library search, and selection of an existing field does not create a duplicate identity.
- **AC-04:** Only a Super Admin can change the active incident field configuration.
- **AC-05:** Incident-local fields can be used for filtering, required/optional state, and incident reporting like library fields.
- **AC-06:** A field supports required or optional state but no conditional-required rule; citizen intake is not blocked by these fields.
- **AC-07:** Deactivation removes the field from new forms without deleting its historical values, which remain readable.
- **AC-08:** Failed, stale, concurrent, or offline configuration changes do not silently erase an already accepted configuration or collected values.

## References

- [Product rules](./spec.md)
- [Behavior sequence](./flow.md)
- [Validation](./validation.md)
- [Target Version](../../../../versions/v0.1.0.md)
- [Binding decisions](../../decisions.md)
