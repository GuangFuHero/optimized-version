---
feature: TM-FEAT-001
title: Custom fields
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-001: Custom fields

## Outcome

A Super Admin can adapt the active incident's Task detail fields without changing stable task categories, interrupting work already in progress, or losing values already collected.

## Delta

### Current behavior

Legacy documents and partial implementation disagree on permissions, field lifecycle, validation, and concurrent changes. No released behavior or immutable-build validation exists.

### Target behavior

Approved behavior is limited to the rules in [`spec.md`](./spec.md). Two principles govern everything else in this Feature:

- A field has a stable identity. Its displayed name, its type, its required state, and where it appears may all change; the values collected under it stay attached.
- Configuration changes are not retroactive. Work that has already started finishes under the configuration it started with.

## Scope

### In scope

- Applying predefined disaster field groups, selecting library fields, creating incident-local fields, attaching one field to several task categories, required/optional state, list-choice changes, type correction, deactivation and reactivation, and historical-value visibility.
- Reading the field configuration, and how a Task form presents required and optional fields.

### Out of scope

- Creating task categories, conditional-required rules, cross-incident library promotion workflow, and public guest disclosure.
- Which role may close a Task. This Feature defines that closure is the enforcement point; TM-FEAT-002 defines who performs it.
- Merging two fields that turn out to mean the same thing.

### Affects

- Super Admin configuration, staff intake and update forms, guest intake, stored Task details, Task closure, incident reporting, and audit needs.

## Open decisions

None.

## Acceptance criteria

- **AC-01:** Applying a predefined disaster field group adds its category-field pairs and removes nothing.
- **AC-02:** Ending or removing a disaster context leaves configured fields in place; deactivation is a separate explicit action.
- **AC-03:** An applied disaster group can be reverted as one action while none of the fields it introduced holds a value; once any value exists, only per-field deactivation remains available.
- **AC-04:** Adding a field presents field-library search first, and selecting an existing entry reuses its identity instead of creating a second one.
- **AC-05:** Creating a field warns when a similarly named field already exists, and never refuses creation.
- **AC-06:** One field identity can be attached to several task categories, with required state set separately for each.
- **AC-07:** Renaming a field leaves every previously collected value attached to it.
- **AC-08:** Only a Super Admin can change the field configuration; every signed-in user can read it; the guest intake form contains no configurable fields.
- **AC-09:** A field is required or optional with no conditional rule, and saving a Task is never blocked by a configurable field.
- **AC-10:** A required field prevents a Task from being closed until it holds a value.
- **AC-11:** Configuration changes do not apply retroactively: a Task is checked against the configuration in force when it was created, an open form completes under the configuration it was opened with, and collected values are never altered or removed.
- **AC-12:** A field type can be corrected after values exist; values that do not fit the new type are retained unchanged and marked as non-conforming.
- **AC-13:** Removing a choice from a list field withdraws it from new entries while previously selected values stay readable.
- **AC-14:** Deactivation removes a field from new forms without deleting its historical values, and reactivation restores the required state it had before deactivation.
- **AC-15:** Failed, stale, concurrent, or offline configuration changes never erase an already accepted configuration or collected values, and each change affects only the fields it names.
- **AC-16:** A Task form presents required fields above optional fields under a visible separator without collapsing the optional section, and marks a newly added field until it is first filled.

## References

- [Product rules](./spec.md)
- [Behavior sequence](./flow.md)
- [Validation](./validation.md)
- [Target Version](../../../../versions/v0.1.0.md)
- [Binding decisions](../../decisions.md)
