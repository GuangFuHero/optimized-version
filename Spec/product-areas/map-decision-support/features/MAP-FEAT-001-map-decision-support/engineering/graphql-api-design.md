# Map GraphQL implementation snapshot

**Status:** code-derived snapshot, not product authority

**Verified against code commit:** `44ce18f5836ee3e0a753240983932a865723cb54`

**Compared files:** `Backend/app/graphql/schema.py`, `context.py`, `loaders.py`, `geo/**`, `suggestions/**`, and related repositories/models.

## Current boundary

- `/graphql` composes modular query and mutation mixins for geo, tickets/tasks, property configuration, and station suggestions. Authentication remains available through REST.
- A request context contains the database session, an optional authenticated user, and per-request Strawberry DataLoaders.
- Geo list/detail queries for stations and closure areas are currently public when no token is supplied; station-suggestion review queries require `map:read`.
- Geo mutations require `map:create`, `map:edit`, or `map:delete`; edit/delete honors `own` versus `all` scope.
- Active repositories filter soft-deleted records. Station deletion sets the deletion timestamp.

## Geo operations observed

| Kind | Operations |
|---|---|
| Queries | `stations`, `station`, `closureAreas`, `closureArea` |
| Station mutations | `createStation`, `updateStation`, `deleteStation` |
| Closure-area mutations | `createClosureArea`, `updateClosureArea` |
| Station-property mutations | `createStationProperty`, `updateStationProperty`, `createCrowdSourcing` |
| Suggestion queries | `suggestableFields`, `stationSuggestions` |
| Suggestion mutations | `createStationSuggestion`, `reviewStationSuggestion` |

## Observable technical constraints

- Station creation/update accepts Point geometry and validates longitude/latitude bounds.
- Closure areas accept Polygon or MultiPolygon geometry.
- Station suggestions are field allow-listed and type-coerced. Approval applies the change; rejection preserves the target. Only pending suggestions can be reviewed.
- Nested secondary locations, station properties, ratings, ticket photos/tasks, task properties, and assignments use per-request DataLoaders.

## Known gap against MAP-FEAT-001

The current closure-area API does not by itself establish separate Assignment Zone and Hazard Zone types, task batch reassignment, hazard attachment to current/future tasks, five-second Undo, expiry reminders, spatial preview, or offline retry. These remain Feature scope and must not be claimed as implemented from this snapshot.

The archived March 2026 document is not current: it described a monolithic schema, fixed operation counts, and no DataLoaders.
