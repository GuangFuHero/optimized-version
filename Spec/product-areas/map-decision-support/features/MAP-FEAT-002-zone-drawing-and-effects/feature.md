---
feature: MAP-FEAT-002
title: Zone drawing and effects
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# MAP-FEAT-002: Zone drawing and effects

## Outcome

Coordinators can draw an operational area on the map, see which tasks and resources it affects before saving, and make that area take effect as either Team responsibility or a hazard warning without losing the ability to recover from a mistake.

## Delta

### Current behavior

No released baseline is documented. The Backend exposes work-zone and closure-area GraphQL operations, but this does not establish the Zone product behavior: responsibility, hazard effect, conflict resolution, and recovery are not defined as product contract.

Coordinators assign tasks one at a time, so covering a whole street or building cluster means repeating the same decision task by task.

### Target behavior

- Super Admin and Government can draw rectangles, polygons, circles, freehand areas, and point hazards; below 768 px the drawing controls use a bottom drawer with touch-safe vertices.
- Assignment Zones identify one responsible Team and batch-assign the tasks they contain.
- Hazard Zones warn all applicable users, attach to current and future contained tasks, and expire after 24 hours by default while preserving history.
- During drawing, users see live counts of the tasks and resource stations inside the shape, with a high-volume warning above 100 affected objects.
- Saving provides a five-second Undo while no conflicting edit has occurred. Every undo is audited.
- Overlapping Zones are allowed, but one task cannot remain assigned through two Assignment Zones; the later assignment wins with a warning.
- Self-intersecting polygons are refused with an explanation and freehand geometry is simplified before it is saved.

## Scope

### In scope

- Drawing tools and their authorization, Assignment Zone behavior, Hazard Zone behavior and expiry, spatial preview counts, save conflict and Undo, geometry validity, and mobile drawing controls.

### Out of scope

- The layer catalogue, default map views, utility-pole lookup, external warning layers, large-dataset rendering, and weak-network fallback, owned by [`MAP-FEAT-001`](../MAP-FEAT-001-map-decision-support/feature.md).
- Task lifecycle and assignment policy beyond the spatial batch effect, owned by [Task Management](../../../task-management/README.md).
- Administrative boundary snapping, line buffers, and Team sub-zones until their Open decisions are resolved.

### Affects

- Task Management, Member Management, Access Control, Emergency Announcements, and map/GraphQL contracts.

## Open decisions

- **Q1 — Administrative boundary data:** Should v0.1.0 preload Taiwan administrative boundaries and support snapping? Blocks AC-01 and boundary-snapping scope. Owner: Product Owner.
- **Q2 — Line buffer tool:** Is a route/line buffer necessary in v0.1.0? Blocks AC-01 and buffer-tool scope. Owner: Product Owner.
- **Q3 — Multi-Team Zone:** May one Assignment Zone have multiple responsible Teams? Blocks AC-04 and AC-07. Owner: Product Owner.
- **Q4 — Recalculation after boundary edit:** When a task moves outside an edited Zone, is it flagged for Government review or automatically unassigned? Blocks AC-04. Owner: Product Owner.
- **Q5 — Team sub-zones:** May Team Admin draw a sub-zone inside the Team's assigned area? Blocks AC-01 drawing authority. Owner: Product Owner.
- **Q6 — Zone naming:** Is free naming plus an administrative-area sequence template sufficient? Blocks AC-01 naming validation. Owner: Product Owner.

## Acceptance criteria

- **AC-01:** Government can draw rectangle, polygon, circle, freehand, and point shapes with the authorized tools, and an unauthorized role is offered no drawing tool.
- **AC-02:** While drawing, task and resource-station counts update in under 100 ms in the defined validation dataset, and above 100 affected objects a high-volume warning appears before saving.
- **AC-03:** Saving a Zone offers five seconds to fully undo when no conflicting edit has occurred, and every undo is recorded in the audit history.
- **AC-04:** Creating an Assignment Zone assigns the contained tasks within three seconds and notifies the responsible Team Admin.
- **AC-05:** Creating a Hazard Zone marks current and future contained tasks with the applicable hazard warning.
- **AC-06:** A Hazard Zone expires after 24 hours by default, can use another expiry, and can prompt for extension while retaining history.
- **AC-07:** When one task is covered by two Assignment Zones, the later assignment replaces the earlier one and exposes a conflict warning.
- **AC-08:** A self-intersecting polygon is refused with an explanation, and freehand geometry is simplified before it is saved.
- **AC-09:** Below 768 px, drawing controls use a bottom drawer and touch targets are at least 24 px.

## References

- [Target Version](../../../../versions/v0.1.0.md)
- [MAP-FEAT-001 remaining map capabilities](../MAP-FEAT-001-map-decision-support/feature.md)
- [Current GraphQL snapshot](../MAP-FEAT-001-map-decision-support/engineering/graphql-api-design.md)
- [Task Management](../../../task-management/README.md)
