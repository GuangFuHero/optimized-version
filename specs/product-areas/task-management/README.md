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
| [TM-FEAT-001 Custom fields](./features/TM-FEAT-001-custom-fields/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Eleven interaction and failure-mode decisions remain open. |
| [TM-FEAT-002 Task assignment](./features/TM-FEAT-002-task-assignment/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Assignment authority, volunteer identity, and multi-assignee behavior are unresolved. |
| [TM-FEAT-003 Guest task privacy](./features/TM-FEAT-003-guest-ticket-privacy/feature.md) | Draft | [v0.2.0](../../versions/v0.2.0.md) | Verification threshold, location precision, and photo disclosure are unresolved. |
| [TM-FEAT-004 Intake and tracking](./features/TM-FEAT-004-intake-and-tracking/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Intake-source contract and tracking identity are unresolved. |
| [TM-FEAT-005 Priority and SLA](./features/TM-FEAT-005-priority-and-sla/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Priority levels, timers, and escalation authority are unresolved. |
| [TM-FEAT-006 Deduplication and building groups](./features/TM-FEAT-006-dedup-and-building-groups/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Deduplication and location grouping need separate approved behavior. |

## Known conflicts

- The archived request-management and volunteer-dispatch specifications disagree with current product decisions about assignment authority, task categories, priority, statuses, volunteer identity, and multiple assignees.
- Those files are `legacy-unreconciled`; they are evidence of past intent, not current product or engineering contracts.
- Runtime behavior has not been validated against an immutable build.

## Supporting material

- [Durable product-area PRD](./prd.md)
- [Binding decisions](./decisions.md)
- [Full decision history](./research/decision-history-2026-08-01.md)

