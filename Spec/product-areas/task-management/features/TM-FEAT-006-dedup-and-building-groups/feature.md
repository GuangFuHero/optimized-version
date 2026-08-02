---
feature: TM-FEAT-006
title: Deduplication and building groups
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-006: Deduplication and building groups

## Outcome

Auditors can reduce confusing duplicate demand without treating several legitimate needs at one location as the same record.

## Delta

### Current behavior

Legacy material combines duplicate Task review with map grouping of Tickets at one building even though they have different meanings and data effects.

### Target behavior

Duplicate consolidation and location grouping have separate signals, review actions, reversibility, and ownership rules.

## Scope

### In scope

- Duplicate candidates, reviewer disposition, merge history, location-group candidates, and group presentation.

### Out of scope

- Generic map clustering, automatic assignment, address normalization, and AI-model implementation.

### Affects

- Data Auditors, Tickets, Tasks, map presentation, history, and Team responsibility.

## Open decisions

- **Q1 — v0.1.0 boundary:** Does the early trial include duplicate review, location grouping, both, or neither? Blocks AC-01 through AC-04.
- **Q2 — Duplicate semantics:** Which fields establish that two Tasks represent the same need, and what survives a merge? Blocks AC-01 and AC-02.
- **Q3 — Building identity:** Is a building group based on normalized address, distance, a durable anchor, or auditor confirmation? Blocks AC-03.
- **Q4 — Group responsibility:** Must grouped Tickets share one Team, and how are exceptions represented? Blocks AC-04.
- **Q5 — Reversal:** How can an incorrect merge or group confirmation be undone without losing audit history? Blocks AC-02 and AC-04.

## Acceptance criteria

- **AC-01:** The interface distinguishes a duplicate Task candidate from a same-location Ticket group candidate.
- **AC-02:** Reviewer disposition preserves provenance and supports the approved reversal path.
- **AC-03:** Grouping does not erase separately actionable Tasks or their source Tickets.
- **AC-04:** Group responsibility and display remain unambiguous after assignment or reassignment.

## References

- [Target Version](../../../../versions/v0.1.0.md)
- [Map Decision Support](../../../map-decision-support/README.md)

