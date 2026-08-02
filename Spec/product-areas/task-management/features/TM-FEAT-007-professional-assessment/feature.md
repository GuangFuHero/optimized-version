---
feature: TM-FEAT-007
title: Professional on-scene assessment
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# TM-FEAT-007: Professional on-scene assessment

## Outcome

A trained responder's assessment of a scene reaches the record without asking that responder to stop working and operate a form.

## Delta

### Current behavior

Task fields are filled by whoever reports the need, using plain observations that require no training ([`TM-FEAT-001`](../TM-FEAT-001-custom-fields/feature.md), D30). Nothing carries a professional's assessment once they arrive, so it exists only on the radio and in their own paperwork.

### Target behavior

Undefined. This Feature exists to establish how a professional assessment is captured before any field is designed for it. The first question is not which fields, but who types and when.

## Scope

### In scope

- How a professional assessment reaches the system, who enters it, and where it is recorded relative to the Task the reporter created.

### Out of scope

- The reporter-facing fields, which stay owned by `TM-FEAT-001`.
- Clinical protocol itself. The product records an assessment; it does not define how one is made.

### Affects

- Trained responders, radio operators and coordinators receiving their reports, Task records, dispatch decisions, and after-action reporting.

## Open decisions

- **Q1 — Reporting channel:** How do trained responders actually report on scene today, and does any part of that reach a screen? Blocks every AC below; nothing should be designed before this is answered from observation rather than assumption.
- **Q2 — Who enters it:** If the assessment reaches the system, is it typed by the responder, by a radio operator, or by a coordinator reading the log? Blocks AC-01.
- **Q3 — Where it lives:** Does the assessment update the Task the reporter created, attach to it as a separate record, or belong somewhere other than a Task? Blocks AC-02.
- **Q4 — Mass-casualty counts:** Does the product need a per-level triage breakdown for dispatch, and if so at what freshness? Blocks AC-03.
- **Q5 — Version boundary:** Does `v0.2.0` include this at all, or does it need field observation first? Blocks the Target Version above.

## Acceptance criteria

- **AC-01:** A professional assessment is attributable to the person who made it and the person who entered it, when those differ.
- **AC-02:** Recording an assessment never overwrites or contradicts what the original reporter observed; both remain readable.
- **AC-03:** A responder is never required to operate the system while working a casualty in order for the record to stay valid.

## References

- [Reporter-facing fields](../TM-FEAT-001-custom-fields/feature.md)
- [Why this is separate](../TM-FEAT-001-custom-fields/scenarios.md)
- [Binding decisions](../../decisions.md)
- [Target Version](../../../../versions/v0.2.0.md)
