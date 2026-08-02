---
feature: TM-FEAT-004
title: Intake and tracking
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-004: Intake and tracking

## Outcome

A reporter or operational member can create a location-based Ticket with one or more actionable Tasks and use a safe identifier to follow progress.

## Delta

### Current behavior

The durable Ticket-to-Task model is approved, but intake source, minimum fields, tracking identity, and Ticket/Task status semantics are not complete.

### Target behavior

Citizen, staff-assisted, and system intake create the same durable model while applying explicitly approved information requirements.

## Scope

### In scope

- Ticket creation, one-to-many Task creation, intake source, tracking identity, and Ticket/Task status semantics.

### Out of scope

- Assignment, field configuration, priority/SLA, privacy presentation, and geographic grouping.

### Affects

- Reporters, operational members, external imports, Task data, and status history.

## Open decisions

- **Q1 — Intake-source contract:** Is `intake_source` stored on Ticket, derived, or represented by another immutable origin record? Blocks AC-01 and AC-03.
- **Q2 — Citizen minimum:** Which location, contact, and first-Task fields are the minimum safe submission set? Blocks AC-01.
- **Q3 — Tracking identity:** What non-sensitive identifier and lookup proof can a reporter use? Blocks AC-04.
- **Q4 — Status semantics:** Which Ticket and Task states exist, who may transition them, and how does Ticket state derive from Tasks? Blocks AC-05.

## Acceptance criteria

- **AC-01:** Citizen intake can create a Ticket with at least one Task without specialist information.
- **AC-02:** One Ticket can contain several Tasks that remain independently actionable.
- **AC-03:** Staff-assisted and system intake record an unambiguous origin without changing the core Ticket-to-Task model.
- **AC-04:** A reporter receives a safe tracking identifier and can see the permitted progress state.
- **AC-05:** Ticket and Task statuses have distinct, observable semantics and auditable transitions.

## References

- [Target Version](../../../../versions/v0.1.0.md)
- [Binding decisions D4, D7, and D9](../../decisions.md)

