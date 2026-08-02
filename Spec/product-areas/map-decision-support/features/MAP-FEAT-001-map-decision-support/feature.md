---
feature: MAP-FEAT-001
title: Map decision support
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# MAP-FEAT-001: Map decision support

## Outcome

Coordinators can draw and understand operational areas, preview the tasks and resources affected, and communicate responsibility or hazards without losing control under scale or weak connectivity.

## Delta

### Current behavior

No released baseline is documented. The Backend exposes station and closure-area GraphQL operations, but this does not establish the complete Zone product behavior.

### Target behavior

- Super Admin and Government can draw rectangles, polygons, circles, freehand areas, and point hazards; mobile uses a bottom drawer with touch-safe vertices.
- Assignment Zones identify one responsible Team and batch-assign contained tasks. Hazard Zones warn all applicable users, attach to current and future contained tasks, and expire after 24 hours by default while preserving history.
- During drawing, users see live counts of tasks, resource stations, and conflicts; a high-volume warning appears above 100 affected objects.
- Saving provides a five-second Undo while no conflicting edit has occurred. Every undo is audited.
- Overlapping Zones are allowed, but one task cannot remain assigned through two Assignment Zones; the later assignment wins with a warning.
- Layer controls include active tasks, building groups, resource stations, hazards, assignments, utility poles, external warnings, and the base map.
- Utility-pole search locates a known pole within three seconds. External warning layers target less than five minutes of source delay.
- Clustering/vector rendering supports thousands to tens of thousands of points; polygon self-intersection is detected and freehand geometry is simplified.
- Weak-network use can read already loaded data with a visible freshness timestamp and retry writes after reconnection.

## Scope

### In scope

- Drawing and map controls, Assignment/Hazard Zone behavior, spatial preview, conflict/undo, layers, utility-pole lookup, performance, geometry correctness, and weak-network fallback.

### Out of scope

- Administrative boundary snapping, line buffers, and Team sub-zones until their Open decisions are resolved.

### Affects

- Task Management, Resource Stations, Member Management, Emergency Announcements, Access Control, and map/GraphQL contracts.

## Open decisions

- **Q1 — Administrative boundary data:** Should v0.2.0 preload Taiwan administrative boundaries and support snapping? Blocks boundary-snapping scope.
- **Q2 — Line buffer tool:** Is a route/line buffer necessary in v0.2.0? Blocks buffer-tool scope.
- **Q3 — Multi-Team Zone:** May one Assignment Zone have multiple responsible Teams? Blocks assignment cardinality and conflict behavior.
- **Q4 — Recalculation after boundary edit:** When a task moves outside an edited Zone, is it flagged for Government review or automatically unassigned? Blocks edited-Zone task behavior.
- **Q5 — Team sub-zones:** May Team Admin draw a sub-zone inside the Team's assigned area? Blocks Team drawing authority.
- **Q6 — Zone naming:** Is free naming plus an administrative-area sequence template sufficient? Blocks naming validation.

## Acceptance criteria

- **AC-01:** Government can draw rectangle, polygon, circle, freehand, and point shapes with the authorized tools.
- **AC-02:** While drawing, task and resource-station counts update in under 100 ms in the defined validation dataset.
- **AC-03:** Saving a Zone offers five seconds to fully undo when no conflicting edit has occurred.
- **AC-04:** Creating an Assignment Zone assigns contained tasks within three seconds and notifies the responsible Team Admin.
- **AC-05:** Creating a Hazard Zone marks current and future contained tasks with the applicable hazard warning.
- **AC-06:** A Hazard Zone expires after 24 hours by default, can use another expiry, and can prompt for extension while retaining history.
- **AC-07:** When one task is covered by two Assignment Zones, the later assignment replaces the earlier one and exposes a conflict warning.
- **AC-08:** Team users initially see their own responsibility Zones and can intentionally switch to the permitted broader view.
- **AC-09:** Utility-pole identifier search locates and marks the pole within three seconds.
- **AC-10:** The defined large dataset remains navigable using clustering and vector/WebGL rendering.
- **AC-11:** Self-intersecting polygons are refused with an explanation and freehand geometry is simplified.
- **AC-12:** Previously loaded data remains readable offline with a visible freshness timestamp and failed writes can retry after reconnection.
- **AC-13:** Below 768 px, drawing controls use a bottom drawer and touch targets are at least 24 px.

## Traceability

- [Current GraphQL snapshot](./engineering/graphql-api-design.md)
- Source PRD and user stories are archived; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.2.0.md)
