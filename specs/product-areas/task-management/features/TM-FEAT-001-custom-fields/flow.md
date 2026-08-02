# TM-FEAT-001 flow

This file describes sequence only. Product behavior is defined by [`spec.md`](./spec.md).

## Apply a predefined field group

1. A Super Admin opens configuration for the active incident. (`TM-CF-104`)
2. The Super Admin selects a product-defined disaster field group. (`TM-CF-101`)
3. The system adds missing category-field pairs and keeps every existing configured field. (`TM-CF-102`)
4. Operational forms use the last accepted active configuration. (`TM-CF-108`)

## Add one field

1. A Super Admin starts adding a field under a system-defined Task category. (`TM-CF-101`)
2. The system presents the field library for search. (`TM-CF-103`)
3. The Super Admin selects an existing identity or, when none is suitable, creates an incident-local field. (`TM-CF-103`)
4. The accepted incident-local field becomes available for forms, filters, required/optional state, and incident reporting. (`TM-CF-105`)

## Use configured fields

1. An operational member opens a Task form. (`TM-CF-105`)
2. The form presents active fields as required or optional without evaluating conditional-required behavior. (`TM-CF-106`)
3. Guidance may ask for further detail without blocking citizen intake. (`TM-CF-106`)
4. A successful save preserves the entered Task details. (`TM-CF-108`)

## Deactivate a field

1. A Super Admin chooses an active field for deactivation. (`TM-CF-104`)
2. The system stops showing it on new forms. (`TM-CF-107`)
3. Existing Tasks continue to display previously collected values as inactive, read-only information. (`TM-CF-107`)

## Unsuccessful configuration change

1. A submitted change fails, conflicts, is stale, or cannot reach the service. (`TM-CF-108`)
2. The system retains the last accepted configuration and all previously collected values. (`TM-CF-108`)
3. A later form load continues from that accepted configuration. (`TM-CF-108`)

