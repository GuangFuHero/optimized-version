# TM-FEAT-001 product rules

## Boundary

- **Adds or changes:** Incident-scoped Task field configuration only.
- **Replaces baseline rules:** None; no released baseline exists.
- **Does not change:** Task category creation, intake ownership, assignment, priority, or guest disclosure.
- **Blocking Open decisions:** See the canonical list in `feature.md`; this Spec does not duplicate it.

## Rules

### TM-CF-101: Stable task categories

- **Actor/system:** Product configuration.
- **Precondition:** Task fields are being configured.
- **Trigger:** A field is added or a predefined group is applied.
- **Observable result:** Every field is associated with a system-defined Task category.
- **Constraint/fallback:** A Super Admin cannot create a new Task category through field configuration.

### TM-CF-102: Additive disaster groups

- **Actor/system:** Super Admin and configuration service.
- **Precondition:** A product-defined disaster field group exists.
- **Trigger:** The Super Admin applies the group to the active incident.
- **Observable result:** Missing category-field pairs are added and existing configured fields remain.
- **Constraint/fallback:** Ending or removing a disaster context never automatically deletes or deactivates fields.

### TM-CF-103: Library-first addition

- **Actor/system:** Super Admin.
- **Precondition:** A field is needed for the active incident.
- **Trigger:** The Super Admin starts adding a field.
- **Observable result:** The system presents field-library search before incident-local creation; selecting an existing identity reuses it.
- **Constraint/fallback:** Duplicate-name and multi-category behavior is not defined by this rule.

### TM-CF-104: Configuration authority

- **Actor/system:** Authorization boundary.
- **Precondition:** A user attempts to apply, add, deactivate, or reactivate a field.
- **Trigger:** The change is submitted.
- **Observable result:** A Super Admin may proceed; every other role is refused.

### TM-CF-105: Incident-local parity

- **Actor/system:** Task forms and incident reporting.
- **Precondition:** An incident-local field has been accepted.
- **Trigger:** Staff use or report on the field during the incident.
- **Observable result:** It supports the same filtering, required/optional state, and incident reporting as a library field.
- **Constraint/fallback:** It is not automatically promoted to the cross-incident library; correction after data exists is not defined by this rule.

### TM-CF-106: Simple required state

- **Actor/system:** Task form.
- **Precondition:** A configured field is active.
- **Trigger:** The form renders or validates the field.
- **Observable result:** The field is either required or optional; no value-dependent required rule is evaluated.
- **Constraint/fallback:** Guidance may recommend details without blocking citizen intake; this rule does not define a later enforcement transition.

### TM-CF-107: Deactivation preserves evidence

- **Actor/system:** Super Admin and Task forms.
- **Precondition:** A configured field may already contain values.
- **Trigger:** The Super Admin deactivates it.
- **Observable result:** New forms stop showing the field, while previously collected values remain readable as inactive data.
- **Constraint/fallback:** The field cannot be deleted; this rule does not define reactivation or already-open form behavior.

### TM-CF-108: Safe unsuccessful change

- **Actor/system:** Configuration service.
- **Precondition:** A configuration request is not accepted because it fails, is stale, conflicts, or cannot reach the service.
- **Trigger:** The unsuccessful request completes or connectivity is restored.
- **Observable result:** The last accepted configuration and all collected values remain intact.
- **Constraint/fallback:** This rule preserves accepted data but does not define notification or conflict-resolution UX.

## Traceability

| Acceptance criterion | Spec rules |
|---|---|
| AC-01 | TM-CF-101, TM-CF-102 |
| AC-02 | TM-CF-102, TM-CF-107 |
| AC-03 | TM-CF-103 |
| AC-04 | TM-CF-104 |
| AC-05 | TM-CF-105 |
| AC-06 | TM-CF-106 |
| AC-07 | TM-CF-107 |
| AC-08 | TM-CF-108 |
