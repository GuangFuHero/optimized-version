---
feature: TM-FEAT-005
title: Priority and SLA
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-005: Priority and SLA

## Outcome

Operational users can distinguish urgent work and recognize when response is late without relying on undocumented labels or timers.

## Delta

### Current behavior

Legacy material mixes a manual highest-priority override, proposed levels, suggested timers, and escalation ideas without one approved contract.

### Target behavior

Priority vocabulary, response targets, timers, and escalation recipients are approved and observable as one Feature.

## Scope

### In scope

- Priority levels, manual overrides, response targets, overdue state, escalation, and notifications.

### Out of scope

- Medical triage protocol, responder assignment mechanics, and map visualization.

### Affects

- Coordinators, Super Admins, responders, Task ordering, notifications, and audit evidence.

## Open decisions

- **Q1 — Version scope:** Does v0.1.0 include only a priority label, or also response timers and escalation? Blocks AC-01 through AC-04.
- **Q2 — Vocabulary and authority:** What levels exist, who sets them, and who may apply the highest override? Blocks AC-01.
- **Q3 — Timer contract:** What starts, pauses, satisfies, or resets each response target? Blocks AC-02.
- **Q4 — Escalation:** Which recipients receive overdue warnings, and may escalation alter priority automatically? Blocks AC-03 and AC-04.

## Acceptance criteria

- **AC-01:** An authorized actor can assign one approved priority and users see its consistent meaning.
- **AC-02:** Any included response target has an observable start, due, satisfied, and overdue condition.
- **AC-03:** An overdue condition produces the approved warning without silently changing unrelated Task data.
- **AC-04:** Manual or automatic escalation is authorized and auditable.

## References

- [Target Version](../../../../versions/v0.1.0.md)
- [Supporting research](./research/priority-sla-volunteer-matching-patterns.md)

