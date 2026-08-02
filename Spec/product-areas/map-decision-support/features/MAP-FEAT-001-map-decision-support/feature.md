---
feature: MAP-FEAT-001
title: Map decision support
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# MAP-FEAT-001: Map decision support

## Outcome

Coordinators can read the operational picture on one map: choose which layers matter, start from the area they are responsible for, locate a reported utility pole, and keep working under scale or weak connectivity.

## Delta

### Current behavior

No released baseline is documented. The Backend exposes station, work-zone, and closure-area GraphQL operations, but this does not establish the complete map product behavior.

Zone drawing and its assignment or hazard effects are delivered earlier by [`MAP-FEAT-002`](../MAP-FEAT-002-zone-drawing-and-effects/feature.md) in `v0.1.0`; this Feature builds the surrounding map experience on top of it.

### Target behavior

- Layer controls include active tasks, building groups, resource stations, hazards, assignments, utility poles, external warnings, and the base map.
- Team users initially see their own responsibility Zones and can intentionally switch to the permitted broader view.
- Utility-pole search locates a known pole within three seconds. External warning layers target less than five minutes of source delay.
- Clustering and vector rendering support thousands to tens of thousands of points.
- Weak-network use can read already loaded data with a visible freshness timestamp and retry writes after reconnection.

## Scope

### In scope

- The layer catalogue and its controls, default map views by role, utility-pole lookup, external warning layers, large-dataset rendering performance, and weak-network fallback.

### Out of scope

- Zone drawing tools, Assignment Zone and Hazard Zone effects, spatial preview, save conflict, Undo, and geometry validity, owned by [`MAP-FEAT-002`](../MAP-FEAT-002-zone-drawing-and-effects/feature.md).
- Resource-station data stewardship, owned by [Resource Stations](../../../resource-stations/README.md).

### Affects

- Task Management, Resource Stations, Member Management, Emergency Announcements, Access Control, and map/GraphQL contracts.

## Open decisions

None.

## Acceptance criteria

- **AC-01:** Layer controls can independently show or hide active tasks, building groups, resource stations, hazards, assignments, utility poles, external warnings, and the base map.
- **AC-02:** Team users initially see their own responsibility Zones and can intentionally switch to the permitted broader view.
- **AC-03:** Utility-pole identifier search locates and marks the pole within three seconds.
- **AC-04:** External warning layers present source data with less than five minutes of delay.
- **AC-05:** The defined large dataset remains navigable using clustering and vector/WebGL rendering.
- **AC-06:** Previously loaded data remains readable offline with a visible freshness timestamp, and failed writes can retry after reconnection.

## Traceability

- [Current GraphQL snapshot](./engineering/graphql-api-design.md)
- [MAP-FEAT-002 Zone drawing and effects](../MAP-FEAT-002-zone-drawing-and-effects/feature.md)
- Source PRD and user stories are archived; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.2.0.md)
