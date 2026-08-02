# Task Management

**Status:** Definition

**Owner:** Product Owner

**Baseline:** Not released; no baseline `spec.md` exists.

## Minimum reading path

1. This file.
2. [Target Version v0.1.0](../../versions/v0.1.0.md) or [v0.2.0](../../versions/v0.2.0.md).
3. The responsible Feature under [`features/`](./features/).

## Active Features

| Feature | Status | Target Version | Blocking issue |
|---|---|---|---|
| [TM-FEAT-001 Custom fields](./features/TM-FEAT-001-custom-fields/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | None open. Closure enforcement depends on TM-FEAT-002 defining who may close a Task. |
| [TM-FEAT-002 Task assignment](./features/TM-FEAT-002-task-assignment/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Assignment authority, volunteer identity, and multi-assignee behavior are unresolved. |
| [TM-FEAT-003 Guest task privacy](./features/TM-FEAT-003-guest-ticket-privacy/feature.md) | Draft | [v0.2.0](../../versions/v0.2.0.md) | Verification threshold, location precision, and photo disclosure are unresolved. |
| [TM-FEAT-004 Intake and tracking](./features/TM-FEAT-004-intake-and-tracking/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Intake-source contract and tracking identity are unresolved. |
| [TM-FEAT-005 Priority and SLA](./features/TM-FEAT-005-priority-and-sla/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Priority levels, timers, and escalation authority are unresolved. |
| [TM-FEAT-006 Deduplication and building groups](./features/TM-FEAT-006-dedup-and-building-groups/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Deduplication and location grouping need separate approved behavior. |

## Known conflicts

- The archived request-management and volunteer-dispatch specifications disagree with current product decisions about assignment authority, task categories, priority, statuses, volunteer identity, and multiple assignees.
- Those files are `legacy-unreconciled`; they are evidence of past intent, not current product or engineering contracts.
- Runtime behavior has not been validated against an immutable build.
- The medical starting field set approved in D30 follows START triage but has not been reviewed by a qualified EMT. Confirm it with one before first release.
- The current backend implementation does not yet support the approved TM-FEAT-001 behavior. The gaps were recorded on 2026-08-02 and are owned by the backend team: field configuration has no identity, activation, or required state; configuration reads are restricted to Super Admin, which no form can render under; collected values reference a field by name rather than identity; no required-field check exists; and a Task has no defined status transition to attach closure enforcement to. Do not treat this as a product conflict — it is unbuilt work, not disputed behavior.

## Supporting material

- [Durable product-area PRD](./prd.md)
- [Binding decisions](./decisions.md)
- [Full decision history](./research/decision-history-2026-08-01.md)

