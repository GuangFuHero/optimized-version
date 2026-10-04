# GraphQL API Design: Interactive Disaster Map

**Status**: Approved | **Date**: 2026-03-29 | **Branch**: `feature/geo-endpoint`

## Overview

GraphQL endpoint at `/graphql` serves map domain data (stations, map areas, tickets, station properties, crowdsourcing). Auth (register/login/profile) stays as REST at `/api/v1`. Same JWT token works for both.

## Operations (6 queries + 10 mutations)

### Queries (all public, no auth required)

| # | Function | Args | Returns | Spec Ref |
|---|----------|------|---------|----------|
| Q1 | `stations` | `bounds?` { minLat, maxLat, minLng, maxLng }, `propertyName?`, `skip=0`, `limit=50` | `StationConnection` | US1/US2/US5 |
| Q2 | `station` | `uuid` | `StationType \| null` | US1/US5 |
| Q3 | `hazardousZones` | `bounds?`, `skip=0`, `limit=50` | `HazardousZoneConnection` | US7 |
| Q4 | `hazardousZone` | `uuid` | `HazardousZoneType \| null` | US7 |
| Q3a | `areas` | `bounds?`, `includePrivate=false` (needs `work_zone.view`), `skip=0`, `limit=50` | `AreaConnection` (public areas only by default; no team data) | ADR-311 |
| Q5 | `tickets` | `bounds?`, `status?`, `priority?`, `skip=0`, `limit=50` | `TicketConnection` | US2 |
| Q6 | `ticket` | `uuid` | `TicketType \| null` | US2 |

`bounds` is optional. Without it, returns all records (filtered by `delete_at IS NULL`). With it, uses PostGIS `ST_Intersects(geometry, ST_MakeEnvelope(...))`.

### Mutations (all require JWT + RBAC)

| # | Function | Args | RBAC | Spec Ref |
|---|----------|------|------|----------|
| M1 | `createStation` | `input: CreateStationInput` { propertyName, geometry (GeoJSON Point), address fields?, opHour?, level?, comment? } | `map` / `create` | US4 |
| M2 | `updateStation` | `uuid`, `input: UpdateStationInput` { all optional } | `map` / `edit` → scope `own`/`all` | US4 |
| M3 | `deleteStation` | `uuid` | `map` / `delete` | Spec clarification |
| M4 | `createArea` | `input: CreateAreaInput` { type (hazardous_zone\|team_zone\|mark_zone), geometry (GeoJSON Polygon/MultiPolygon), name?, note?, isPublic?, teamUuid (team_zone only, required), status (hazardous_zone only, required), informationSource? } | `work_zone.add` + gov team | ADR-311 |
| M5 | `updateArea` / `deleteArea` / `promoteMarkZone` | `uuid`, `input: UpdateAreaInput` { name?, geometry?, note?, isPublic?, status?, informationSource? } | `work_zone.edit` / `work_zone.delete` + gov team | ADR-311 |
| M6 | `createStationProperty` | `input: CreateStationPropertyInput` { stationUuid, propertyType, propertyName, quantity?, weightings? } | `map` / `create` | US5 |
| M7 | `updateStationProperty` | `uuid`, `input: UpdateStationPropertyInput` { quantity?, status?, weightings? } | `map` / `edit` → scope `own`/`all` | US5 |
| M8 | `createCrowdSourcing` | `input: CreateCrowdSourcingInput` { stationUuid, itemUuid, rating (up\|neutral\|down), distanceFromGeometry? } | `map` / `create` | Spec clarification |
| M9 | `createTicket` | `input: CreateTicketInput` { title, description, geometry, contactName?, contactEmail?, contactPhone?, priority?, type (hr\|supply), taskItems } | `request` / `create` | US2 |
| M10 | `updateTicket` | `uuid`, `input: UpdateTicketInput` { status?, priority?, title?, description? } | `request` / `edit` → scope `own`/`all` | US2 |

### Nested Fields

| Parent Type | Field | Returns |
|-------------|-------|---------|
| `StationType` | `properties` | `[StationPropertyType]` |
| `StationPropertyType` | `crowdSourcings` | `[CrowdSourcingType]` |
| `TicketType` | `photos` | `[RequestPhotoType]` |
| `HRRequirementType` | `taskSpecialties` | `[HRTaskSpecialtyType]` |
| `SupplyRequirementType` | `taskItems` | `[SupplyTaskItemType]` |

Nested collections (`StationType.properties`/`secondaryLocation`, `StationPropertyType.crowdSourcings`, `TicketType.photos`/`tasks`, `TicketTaskType.properties`/`assignments`) are resolved through per-request Strawberry DataLoaders (`app/graphql/loaders.py`) — each nesting level collapses to a single `WHERE parent_uuid IN (...)` query.

## Business Rules

### Geometry Type Validation
- **Station**: must be `Point`. Reject with "Station geometry must be a Point"
- **Map area** (all three kinds): must be `Polygon` or `MultiPolygon`. Reject with "Area geometry must be Polygon or MultiPolygon"
- **Ticket**: any geometry type

### Ticket Status State Machine
```
pending → in_progress → completed
                      → cancelled
pending → cancelled
```
Terminal states: `completed`, `cancelled`. No backward transitions.

### Crowdsourcing Upsert
If `user_uuid` + `item_uuid` match exists, update the existing vote. `userCredibilityScore` auto-filled from `user.credibility_score`.

### Soft-Delete
Every query filters `WHERE delete_at IS NULL`. `deleteStation` sets `delete_at = now()`, does not hard-delete. Filtering is in GraphQL resolvers only (Option B), not in the generic repository.

## Architecture

### File Structure
```
app/graphql/
├── __init__.py     # Empty
├── schema.py       # Context getter, permission helper, schema assembly (~60 lines)
├── scalars.py      # GeoJSON scalar + conversion helpers (~30 lines)
├── types.py        # All types, inputs, pagination (~150 lines)
├── queries.py      # All 6 query resolvers (~100 lines)
├── mutations.py    # All 10 mutation resolvers (~200 lines)
```

### Design Decisions
1. **GraphQL coexists with REST** — `/graphql` for map data, `/api/v1` for auth
2. **Plain dict context** — no custom class, `{"db": session, "user": user_or_none}`
3. **One permission helper function** — reuses `user_repository.get_user_permissions()` directly
4. **Strawberry types decoupled from SA models** — `from_model()` classmethod conversion
5. **GeoJSON as opaque scalar** — handles all geometry types uniformly
6. **No DataLoaders** — add only if profiling shows N+1 is a problem
7. **Direct SQLAlchemy in resolvers** — GenericRepository doesn't support spatial queries

## Test Plan (~52 tests, 4 files)

### test_queries.py (18 tests)
Station queries (8), hazardous zone queries (4), ticket queries (6)

### test_mutations.py (27 tests)
Station mutations (11), hazardous zone mutations (4), station property mutations (3), crowdsourcing (4), ticket mutations (5)

### test_edge_cases.py (7 tests)
GeoJSON roundtrip, invalid GeoJSON, empty bounds, unicode, multiple queries, endpoint accessible
