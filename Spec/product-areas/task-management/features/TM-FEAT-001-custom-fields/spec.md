# TM-FEAT-001 product rules

## Boundary

- **Adds or changes:** Incident-scoped Task field configuration, and the presentation and enforcement of those fields on Task forms.
- **Replaces baseline rules:** None; no released baseline exists.
- **Does not change:** Task category creation, intake ownership, assignment, priority, or guest disclosure. TM-CF-111 names Task closure as the enforcement point but does not define who may close a Task.
- **Blocking Open decisions:** None.

## Rules

### TM-CF-101: Stable task categories

- **Actor/system:** Product configuration.
- **Precondition:** Task fields are being configured.
- **Trigger:** A field is added or a predefined group is applied.
- **Observable result:** Every field is associated with at least one system-defined Task category.
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
- **Observable result:** The system presents field-library search before incident-local creation; selecting an existing entry reuses that field identity rather than creating a second one.
- **Constraint/fallback:** None.

### TM-CF-104: Configuration authority

- **Actor/system:** Authorization boundary.
- **Precondition:** A user attempts to read or change the field configuration.
- **Trigger:** The request is submitted.
- **Observable result:** Any signed-in user may read the configuration. Only a Super Admin may apply, add, rename, retype, deactivate, or reactivate a field; every other role is refused.
- **Constraint/fallback:** The guest intake form contains no configurable fields, so it needs no configuration read.

### TM-CF-105: Incident-local parity

- **Actor/system:** Task forms and incident reporting.
- **Precondition:** An incident-local field has been accepted.
- **Trigger:** Staff use or report on the field during the incident.
- **Observable result:** It supports the same filtering, required/optional state, and incident reporting as a library field.
- **Constraint/fallback:** It is not automatically promoted to the cross-incident library.

### TM-CF-106: Simple required state

- **Actor/system:** Task form.
- **Precondition:** A configured field is active.
- **Trigger:** The form renders or validates the field.
- **Observable result:** The field is either required or optional; no value-dependent required rule is evaluated. Saving is never blocked by a configurable field.
- **Constraint/fallback:** Guidance may recommend detail without blocking intake. Enforcement happens only at TM-CF-111.

### TM-CF-107: Deactivation preserves evidence

- **Actor/system:** Super Admin and Task forms.
- **Precondition:** A configured field may already contain values.
- **Trigger:** The Super Admin deactivates it for a Task category.
- **Observable result:** New forms for that category stop showing the field, while previously collected values remain readable as inactive data. Reactivating it restores the required state it held at deactivation.
- **Constraint/fallback:** The field cannot be deleted. Deactivation applies to the field-category pair, so other categories using the same field are unaffected.

### TM-CF-108: Safe unsuccessful change

- **Actor/system:** Configuration service.
- **Precondition:** A configuration request is not accepted because it fails, is stale, conflicts, or cannot reach the service.
- **Trigger:** The unsuccessful request completes or connectivity is restored.
- **Observable result:** The last accepted configuration and all collected values remain intact.
- **Constraint/fallback:** None.

### TM-CF-109: Stable field identity

- **Actor/system:** Configuration service and Task records.
- **Precondition:** A field holds collected values.
- **Trigger:** The Super Admin changes its displayed name.
- **Observable result:** Every previously collected value remains attached to the same field, and reporting continues to treat them as one series.
- **Constraint/fallback:** A displayed name is a label, never the field's identity.

### TM-CF-110: Multi-category attachment

- **Actor/system:** Super Admin and Task forms.
- **Precondition:** A field identity exists.
- **Trigger:** The Super Admin attaches it to an additional Task category.
- **Observable result:** The field appears on both categories' forms as one identity, and its required state is set separately for each category.
- **Constraint/fallback:** Changing required state for one category does not change it for another.

### TM-CF-111: Closure-time enforcement

- **Actor/system:** Task closure.
- **Precondition:** A Task has one or more required fields under the configuration in force when it was created.
- **Trigger:** The Task is submitted for closure.
- **Observable result:** Closure is refused while any of those required fields is empty, and the empty fields are named.
- **Constraint/fallback:** This rule does not define which role may close a Task. Saving remains unaffected at every earlier point.

### TM-CF-112: Configuration is not retroactive

- **Actor/system:** Configuration service and Task forms.
- **Precondition:** A Task exists, or a form is already open, under an earlier configuration.
- **Trigger:** The Super Admin changes the configuration.
- **Observable result:** An existing Task keeps the required fields it had at creation, an already-open form can be completed and saved under the configuration it was opened with, and no collected value is altered or removed.
- **Constraint/fallback:** New fields are visible on existing Tasks and may be filled voluntarily; they are not enforced there.

### TM-CF-113: Type correction

- **Actor/system:** Super Admin and Task records.
- **Precondition:** A field holds values that do not fit the type it should have.
- **Trigger:** The Super Admin changes the field type.
- **Observable result:** New entries follow the new type, existing values are retained unchanged, and values that do not fit the new type are marked as non-conforming wherever they are displayed or reported.
- **Constraint/fallback:** Stored values are never rewritten or discarded by a type change.

### TM-CF-114: Choice withdrawal

- **Actor/system:** Super Admin and Task forms.
- **Precondition:** A list field has a choice that Tasks already reference.
- **Trigger:** The Super Admin removes that choice.
- **Observable result:** New entries can no longer select it, and Tasks that already reference it continue to display and report the value.
- **Constraint/fallback:** Adding a choice has no effect on existing values.

### TM-CF-115: Similar-name warning

- **Actor/system:** Configuration service.
- **Precondition:** The Super Admin is creating an incident-local field.
- **Trigger:** A name is entered that resembles an existing field name.
- **Observable result:** The system names the similar existing fields and offers to use one of them.
- **Constraint/fallback:** Creation proceeds if the Super Admin continues. Similarity is detected by name only and cannot detect equivalent meaning under different names.

### TM-CF-116: Group reversal

- **Actor/system:** Super Admin and configuration service.
- **Precondition:** A disaster field group was applied.
- **Trigger:** The Super Admin reverts that application.
- **Observable result:** While none of the fields the group introduced holds a value, all of them are withdrawn as one action. Once any of them holds a value, reversal is unavailable and only per-field deactivation applies.
- **Constraint/fallback:** Reversal never removes a field that existed before the group was applied.

### TM-CF-117: Independent configuration writes

- **Actor/system:** Configuration service.
- **Precondition:** More than one Super Admin is editing the configuration.
- **Trigger:** Each submits a change.
- **Observable result:** Each change affects only the fields it names, so concurrent changes to different fields both survive.
- **Constraint/fallback:** Two changes to the same field resolve last-write-wins. No client submits a whole field list as one replacement.

### TM-CF-118: Form presentation

- **Actor/system:** Task form.
- **Precondition:** A Task category has active fields.
- **Trigger:** An operational member opens the form.
- **Observable result:** Required fields appear above optional fields under a visible separator, the optional section is not collapsed, and a field added since the member last filled this form is marked as new until they first fill it.
- **Constraint/fallback:** Ordering within each section follows the configured order.

## Traceability

| Acceptance criterion | Spec rules |
|---|---|
| AC-01 | TM-CF-101, TM-CF-102 |
| AC-02 | TM-CF-102, TM-CF-107 |
| AC-03 | TM-CF-116 |
| AC-04 | TM-CF-103 |
| AC-05 | TM-CF-115 |
| AC-06 | TM-CF-110 |
| AC-07 | TM-CF-109 |
| AC-08 | TM-CF-104 |
| AC-09 | TM-CF-106 |
| AC-10 | TM-CF-111 |
| AC-11 | TM-CF-112 |
| AC-12 | TM-CF-113 |
| AC-13 | TM-CF-114 |
| AC-14 | TM-CF-107 |
| AC-15 | TM-CF-108, TM-CF-117 |
| AC-16 | TM-CF-118 |
