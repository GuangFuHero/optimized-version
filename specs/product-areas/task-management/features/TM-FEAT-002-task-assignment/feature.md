---
feature: TM-FEAT-002
title: Task assignment
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-002: Task assignment

## Outcome

Authorized responders and coordinators can establish clear ownership of a Task without ambiguous or conflicting assignment state.

## Delta

### Current behavior

Legacy documents alternately describe volunteer self-acceptance and coordinator dispatch, and disagree on responder identity and whether several people may share one Task.

### Target behavior

Assignment authority, acceptance, identity, and collaboration form one explicit product contract before implementation is treated as Ready.

## Scope

### In scope

- Task-level acceptance or dispatch, assignee identity, capacity safeguards, reassignment, and multi-person collaboration.

### Out of scope

- Ticket intake, field configuration, priority policy, and Team membership administration.

### Affects

- Responders, coordinators, Member Management, authorization, Task status, and notifications.

## Open decisions

- **Q1 — Assignment model:** Do responders self-accept, do coordinators dispatch subject to responder acceptance, or are both supported under explicit conditions? Blocks AC-01 through AC-03.
- **Q2 — Responder identity:** Must an assignee be an active Team member, or may another authenticated user accept work? Blocks AC-02 and the Member Management boundary.
- **Q3 — Multiple assignees:** Is one Task owned by one primary assignee, a fixed team, or several peers, and how is capacity counted? Blocks AC-03.
- **Q4 — Reassignment authority:** Who can release, reject, or reassign accepted work, and what happens to progress already recorded? Blocks AC-04.

## Acceptance criteria

- **AC-01:** An approved assignment path establishes who initiated and who accepted responsibility for a Task.
- **AC-02:** The server verifies assignment authority and eligible responder identity.
- **AC-03:** Concurrent or repeated assignment attempts produce one unambiguous observable ownership result.
- **AC-04:** Release or reassignment preserves an auditable history and previously recorded progress.

## References

- [Target Version](../../../../versions/v0.1.0.md)
- [Member Management](../../../member-management/README.md)
- [Archived conflicting engineering documents](../../../../_archive/legacy-engineering/task-management/README.md)

