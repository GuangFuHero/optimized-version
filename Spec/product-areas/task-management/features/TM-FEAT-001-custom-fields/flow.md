# TM-FEAT-001 flow

This file describes sequence only. Product behavior is defined by [`spec.md`](./spec.md).

## Apply a predefined field group

1. A Super Admin opens configuration for the active incident. (`TM-CF-104`)
2. The Super Admin selects a product-defined disaster field group. (`TM-CF-101`)
3. The system adds missing category-field pairs and keeps every existing configured field. (`TM-CF-102`)
4. Operational forms use the last accepted active configuration. (`TM-CF-108`)

## Revert a group applied by mistake

1. The Super Admin reverts a group application. (`TM-CF-116`)
2. While none of the introduced fields holds a value, the system withdraws all of them together. (`TM-CF-116`)
3. Once any of them holds a value, the system offers per-field deactivation instead. (`TM-CF-107`)

## Add one field

1. A Super Admin starts adding a field under a system-defined Task category. (`TM-CF-101`)
2. The system presents the field library for search. (`TM-CF-103`)
3. The Super Admin selects an existing identity, or enters a new name. (`TM-CF-103`)
4. On a new name that resembles an existing field, the system names the similar fields and offers to use one. (`TM-CF-115`)
5. The Super Admin continues, and the accepted field becomes available for forms, filters, required state, and incident reporting. (`TM-CF-105`)

## Reuse one field on another category

1. The Super Admin attaches an existing field identity to a second Task category. (`TM-CF-110`)
2. The Super Admin sets required state for that category. (`TM-CF-110`)
3. Both categories' forms show the field as one identity, each under its own required state. (`TM-CF-110`)

## Open a category that has no fields

1. An operational member selects a Task category that has no configured fields. (`TM-CF-119`)
2. The form presents the built-in Task information with no configurable-field section. (`TM-CF-119`)
3. A Super Admin later adds a field to that category, and it appears on the next form. (`TM-CF-103`)

## Use configured fields

1. An operational member opens a Task form. (`TM-CF-105`)
2. The form presents required fields above optional fields under a separator, with fields added since the member last filled this form marked as new. (`TM-CF-118`)
3. The form presents each field as required or optional without evaluating conditional-required behavior. (`TM-CF-106`)
4. A save preserves the entered Task details whether or not required fields hold values. (`TM-CF-106`)

## Close a Task

1. A Task is submitted for closure. (`TM-CF-111`)
2. The system checks the required fields that were in force when the Task was created. (`TM-CF-112`)
3. While any of them is empty, the system refuses closure and names the empty fields. (`TM-CF-111`)
4. Once they hold values, closure proceeds. (`TM-CF-111`)

## Correct a field after values exist

1. The Super Admin renames a field, and previously collected values stay attached to it. (`TM-CF-109`)
2. The Super Admin changes its type, and new entries follow the new type. (`TM-CF-113`)
3. Existing values that do not fit the new type are retained and shown as non-conforming. (`TM-CF-113`)
4. The Super Admin withdraws a list choice, and Tasks that already reference it continue to display it. (`TM-CF-114`)

## Deactivate and reactivate a field

1. A Super Admin chooses an active field for deactivation under one Task category. (`TM-CF-104`)
2. The system stops showing it on new forms for that category, while other categories using the same field are unaffected. (`TM-CF-107`)
3. Existing Tasks continue to display previously collected values as inactive, read-only information. (`TM-CF-107`)
4. A form already open when the field was deactivated can still be completed and saved. (`TM-CF-112`)
5. On reactivation, the field returns with the required state it held at deactivation. (`TM-CF-107`)

## Two administrators change configuration at once

1. Two Super Admins each submit a change from a screen loaded at a different time. (`TM-CF-117`)
2. Each change affects only the fields it names, so changes to different fields both survive. (`TM-CF-117`)
3. Two changes to the same field resolve last-write-wins. (`TM-CF-117`)

## Unsuccessful configuration change

1. A submitted change fails, conflicts, is stale, or cannot reach the service. (`TM-CF-108`)
2. The system retains the last accepted configuration and all previously collected values. (`TM-CF-108`)
3. A later form load continues from that accepted configuration. (`TM-CF-108`)
