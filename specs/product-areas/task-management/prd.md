# Task Management product area

## Purpose

Turn reports of real-world needs into work that authorized responders can identify, coordinate, and track without forcing a caller to understand the platform's internal model.

## Durable model

- A **Ticket** is the location and contact anchor: where help is needed.
- A **Task** is one actionable need under a Ticket: what must be done. One Ticket may have several Tasks.
- Assignment, progress, and completion operate on a Task, not on an entire location.
- Task-specific details may be added after intake so the initial request is not blocked by specialist information.

## Actors

- A reporter submits a need and later checks its progress.
- An operational member records or updates information on behalf of a reporter.
- A responder accepts or receives work and reports progress.
- A coordinator manages responsibility and workload within authorized scope.
- A platform administrator controls platform-wide task configuration.
- An auditor reviews data-quality suggestions without gaining operational authority.

## Product-area scope

- Intake and tracking of Tickets and Tasks.
- Task assignment and responder coordination.
- Task priority and escalation.
- Task-specific configurable fields.
- Guest-safe disclosure of task information.
- Duplicate detection and location grouping.

Each change is governed by its Feature folder. This PRD does not define Feature-specific acceptance criteria, open decisions, UI sequence, or release evidence.

## Boundaries

- Authorization rules are owned by [Access Control](../access-control/README.md).
- Member and responder identity are owned by [Member Management](../member-management/README.md).
- Map presentation and geographic decisions are owned by [Map Decision Support](../map-decision-support/README.md).
- Resource inventory and station operation are owned by [Resource Stations](../resource-stations/README.md).
- The currently released product behavior belongs in a baseline `spec.md`, which does not exist until the first Task Management Feature is Released.

