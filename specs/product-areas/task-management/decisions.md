# Task Management binding decisions

Only approved decisions that still constrain product behavior appear here. The complete discussion record is preserved in [decision history](./research/decision-history-2026-08-01.md).

| ID | Decision | Reason | Superseded behavior | Effective Feature | Date |
|---|---|---|---|---|---|
| D4 | Intake supports citizen, staff-assisted, and system-originated paths; citizen intake must not be blocked by specialist fields. | A life-safety report must remain short enough to submit under stress. | A single mandatory-field policy for every intake path. | TM-FEAT-004; boundary for TM-FEAT-001 | 2026-06-16 |
| D7 | Ticket is the location anchor; it owns multiple Tasks, and specialist information may be added later. | Separating location from actionable needs permits independent coordination without lengthening first contact. | Treating a Ticket as one indivisible need. | TM-FEAT-004 and TM-FEAT-002 | 2026-06-16 |
| D9 | Remove the duplicate Ticket-level task category; Task is the category authority. | The Ticket field duplicated Task data and created drift. | Reading category from a Ticket summary field. | TM-FEAT-004 | 2026-08-01 |
| D10 | Task categories remain system-defined; configurable fields attach below a category, and applying a disaster field group only adds fields. | Stable categories preserve coordination semantics while fields provide incident flexibility. | Allowing administrators to create task categories or automatically removing fields with a disaster group. | TM-FEAT-001 | 2026-08-01 |
| D11 | Disaster field groups are product definitions shipped by engineering; administrators may apply but not author them during an incident. | Group design needs domain review outside incident pressure. | Incident-time editing of group composition. | TM-FEAT-001 | 2026-08-01 |
| D12 | When adding a field, search the system field library first and create an incident-local field only when no suitable entry exists. | Stable field identity permits safe reuse and prevents avoidable duplicates. | Unstructured name entry as the only path. | TM-FEAT-001 | 2026-08-01 |
| D13 | An incident-local field has the same filtering, required/optional, and incident-reporting capabilities as a library field; promotion to the library is a later governed action. | A single-incident database removes the rejected cross-incident reporting concern. | Treating local fields as second-class data. | TM-FEAT-001 | 2026-08-01 |
| D14 | Only a Super Admin may change the incident field configuration. | The configuration affects every operational form. | Reusing general map-edit permission for field configuration. | TM-FEAT-001 | 2026-08-01 |
| D15 | A configured field can be deactivated but not deleted; historical values remain readable and the field may be reactivated. | Operators need shorter current forms without orphaning collected evidence. | Deleting field definitions or hiding historical values. | TM-FEAT-001 | 2026-08-01 |
| D16 | A field is required or optional; conditional-required rules are not supported. Guidance may recommend additional information but must not block saving. | Conditional rules add unsafe operational friction and complex interactions. | Conditional-required rule engines and the former three-gate rescue rule. | TM-FEAT-001 | 2026-08-01 |

