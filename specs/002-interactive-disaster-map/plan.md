# Implementation Plan: Interactive Disaster Relief Map (互動式救災地圖)

**Branch**: `002-interactive-disaster-map` | **Date**: 2025-11-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-interactive-disaster-map/spec.md`

## Summary

The Interactive Disaster Relief Map provides a centralized, real-time platform for disaster response coordination. It enables residents to view recovery status, volunteers to coordinate cleanup efforts, delivery teams to plan routes, and community members to contribute and update location data. The platform displays interactive markers for recovery progress, facilities, restricted areas, road conditions, and delivery routes on an OpenStreetMap-based interface.

**Technical Approach**: Migrate from legacy REST API (FastAPI/Python) to modern GraphQL backend with flexible, configuration-driven field management. Frontend uses Leaflet.js for mapping with Progressive Web App (PWA) capabilities for offline support. Architecture emphasizes rapid deployment (<4 hours), disaster-resilient operation, and adaptability to different disaster types through configuration rather than code changes.

## Technical Context

**Language/Version**:
- Backend: Node.js 20 LTS (TypeScript 5.3+)
- Frontend: HTML/CSS/JavaScript (ES2022) with optional React 18+

**Primary Dependencies**:
- Backend: Apollo Server 4.x (GraphQL), Prisma 5.x (ORM with PostgreSQL)
- Frontend: Leaflet.js 1.9+ (mapping), Apollo Client 3.x (GraphQL)
- Authentication: LINE Login API, jsonwebtoken (JWT)
- Geospatial: Uber H3 (proximity detection), Turf.js (geometric calculations)

**Storage**:
- Database: PostgreSQL 15+ with PostGIS 3.x extension (geospatial support)
- File Storage: Local filesystem or S3-compatible (MinIO for self-hosted)
- Cache: Redis 7.x (optional, for session management)

**Testing**:
- Backend: Jest + Supertest (integration tests for critical paths)
- Frontend: Jest + Testing Library (core map rendering, marker display)
- E2E: Playwright (user journey validation)

**Target Platform**:
- Server: Docker containers on Ubuntu 22.04 LTS (single EC2 t3.medium or equivalent)
- Client: Modern mobile browsers (Chrome/Safari on iOS 15+, Android 10+)

**Project Type**: Web application (backend + frontend)

**Performance Goals**:
- Page load: <5s on 3G networks (1 Mbps)
- API response: <200ms p95 for marker queries
- Concurrent users: 1,000 without degradation
- Map render: <3s for 100 markers on mobile

**Constraints**:
- Code to Production: <4 hours deployment time (Constitution I)
- Mobile-first: Must function on smartphones with degraded networks (Constitution II)
- Offline capability: Core features cache locally (Constitution II)
- Flexible schema: Fields configurable via backend admin, not hardcoded (user requirement)
- Open source: No vendor lock-in, self-hostable (Constitution IV)

**Scale/Scope**:
- Expected markers: 10,000-100,000 maximum
- Photo storage: 1,000-5,000 photos per disaster event
- Active users: 100-1,000 concurrent during disaster response
- Data retention: 6 months active + read-only archive
- Deployment model: Single-instance initially, manual scaling at 80% capacity

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ I. Rapid Deployment Readiness

- ✅ **Dependencies containerized**: Docker Compose for PostgreSQL, Node.js backend, Nginx frontend
- ✅ **Single-command deployment**: `docker-compose up -d` (with `.env.example` provided)
- ✅ **Environment variables**: All config via `.env` (database URL, LINE API keys, storage paths)
- ✅ **Automatic migrations**: Prisma migrations run on startup (idempotent)
- ✅ **No manual steps**: Database schema, initial admin user, base map config all automated

**Status**: PASS - Target <4 hours deployment for experienced engineers

---

### ✅ II. Disaster-First Design

- ✅ **Progressive enhancement**: HTML-first forms, map loads without JS (base image fallback)
- ✅ **Offline capability**: Service Worker caches map tiles, marker data, facility info
- ✅ **Graceful degradation**: Geocoding failure → manual coordinate entry, photo upload failure → text-only submission
- ✅ **Mobile-first**: Responsive design, touch gestures, <3MB initial bundle
- ✅ **Low-bandwidth**: Images compressed (WebP/AVIF), lazy-load non-critical assets, <1MB page weight

**Taiwan-specific disasters**: Configuration files for earthquake, typhoon, flood, landslide scenarios with disaster-specific marker types and severity levels

**Status**: PASS - System functional under degraded conditions

---

### ✅ III. Maintainability & Documentation

- ✅ **README**: Quick start (<5 steps), architecture diagram, deployment guide, troubleshooting
- ✅ **Code comments**: "Why" explanations for authentication flow, geospatial calculations, conflict resolution
- ✅ **Critical paths documented**: Inline docs for LINE 2FA integration, marker proximity detection, edit history logging
- ✅ **Configuration comments**: `.env.example` explains each variable, `config/disaster-types.json` documents schema
- ✅ **Database schema**: ER diagram in `docs/`, Prisma schema includes field comments

**Bilingual support**: UI in Traditional Chinese (繁體中文), code comments in English, variables in English

**Status**: PASS - 2-hour maintainability target for new engineers

---

### ✅ IV. Flexibility & Adaptability

- ✅ **Feature flags**: `config/features.json` enables/disables modules (volunteer matching, supply tracking, restricted areas)
- ✅ **Flexible schema**: Marker types use JSONB `additional_info` field for disaster-specific attributes
- ✅ **Configurable map layers**: `config/map-layers.json` defines base maps, overlay GeoJSON layers
- ✅ **Modular UI**: React components conditionally render based on feature flags

**No vendor lock-in**:
- ✅ OpenStreetMap (self-hosted tile server option via `openstreetmap-tile-server` Docker image)
- ✅ Nominatim geocoding (self-hosted option documented)
- ✅ MinIO for photo storage (S3-compatible, self-hostable)

**Status**: PASS - Configuration-driven disaster adaptability

---

### ✅ V. Progressive Enhancement

**Phase 1 - MVP**: Map display, marker CRUD, basic authentication (LINE 2FA), facility search
**Phase 2 - Enhanced**: Resource location management, road condition reporting, delivery route display
**Phase 3 - Advanced**: Real-time updates (WebSocket), mobile PWA offline mode, admin analytics

**Test-driven (critical paths only)**:
- ✅ Integration tests: Marker CRUD, proximity detection, conflict resolution
- ✅ E2E tests: Resident views recovery status, volunteer adds facility
- ⚠️ Edge features: Skip tests for admin analytics, report generation if time-constrained

**Status**: PASS - Incremental delivery prioritized

---

### Summary

**All gates PASS** - No constitution violations. Architecture aligns with rapid deployment, disaster-first design, maintainability, flexibility, and progressive enhancement principles.

## Project Structure

### Documentation (this feature)

```text
specs/002-interactive-disaster-map/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (GraphQL migration, flexible schema patterns)
├── data-model.md        # Phase 1 output (entity definitions, GraphQL types)
├── quickstart.md        # Phase 1 output (development setup guide)
├── contracts/           # Phase 1 output (GraphQL schema definitions)
│   ├── schema.graphql   # Complete GraphQL schema with queries, mutations, types
│   ├── scalars.graphql  # Custom scalar types (DateTime, JSON, Coordinates)
│   └── directives.graphql # Auth directives (@requireAuth, @requireRole)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created yet)
```

### Source Code (repository root)

```text
# Web application structure (backend + frontend)
backend/
├── src/
│   ├── schema/           # GraphQL schema definitions (generated from Prisma)
│   │   ├── types/        # GraphQL object types (Marker, User, Facility, etc.)
│   │   ├── queries/      # Query resolvers (getMarkers, searchPlaces, etc.)
│   │   ├── mutations/    # Mutation resolvers (createMarker, updateMarker, etc.)
│   │   └── index.ts      # Schema assembly
│   ├── resolvers/        # GraphQL resolver implementations
│   │   ├── marker.resolver.ts
│   │   ├── facility.resolver.ts
│   │   ├── user.resolver.ts
│   │   └── roadCondition.resolver.ts
│   ├── services/         # Business logic (geospatial, proximity detection, auth)
│   │   ├── geospatial.service.ts  # H3 proximity, distance calculations
│   │   ├── auth.service.ts        # LINE 2FA, JWT validation
│   │   ├── conflict.service.ts    # Edit conflict detection/resolution
│   │   └── storage.service.ts     # Photo uploads (S3/MinIO)
│   ├── prisma/           # Database ORM
│   │   ├── schema.prisma # Database schema with dynamic fields (JSON)
│   │   └── migrations/   # Auto-generated migrations
│   ├── config/           # Configuration files
│   │   ├── features.json        # Feature flags
│   │   ├── disaster-types.json  # Disaster-specific schemas
│   │   └── field-definitions.json # Dynamic field configurations
│   ├── middleware/       # Express/Apollo middleware (auth, logging)
│   └── server.ts         # Apollo Server setup
├── tests/
│   ├── integration/      # API integration tests (marker CRUD, proximity)
│   └── unit/             # Service unit tests (geospatial calculations)
├── Dockerfile
└── package.json

frontend/
├── public/
│   ├── index.html        # HTML entry point (progressive enhancement)
│   ├── sw.js             # Service Worker (offline caching)
│   └── assets/           # Map icons, marker images
├── src/
│   ├── components/       # React components (modular, feature-flagged)
│   │   ├── Map/          # Leaflet map wrapper, marker layers
│   │   ├── Search/       # Address/facility search
│   │   ├── Filters/      # Layer toggles, category filters
│   │   ├── MarkerDetail/ # Popup modals for marker info
│   │   └── Forms/        # Add/edit marker forms
│   ├── apollo/           # GraphQL client setup
│   │   ├── client.ts     # Apollo Client config
│   │   ├── queries/      # GraphQL query definitions
│   │   └── mutations/    # GraphQL mutation definitions
│   ├── hooks/            # Custom React hooks (useMap, useMarkers, useAuth)
│   ├── utils/            # Helper functions (geolocation, time formatting)
│   ├── config/           # Frontend config (API URL, map defaults)
│   └── App.tsx           # Root component
├── tests/
│   ├── e2e/              # Playwright tests (user journeys)
│   └── unit/             # Component tests (Testing Library)
├── Dockerfile
└── package.json

docker-compose.yml        # Orchestration (Postgres, backend, frontend, Redis)
.env.example              # Environment variable template
docs/
├── architecture.md       # System architecture diagram, data flow
├── er-diagram.png        # Database entity-relationship diagram
└── api-migration.md      # Legacy REST → GraphQL migration guide
```

**Structure Decision**: Web application (backend + frontend) structure selected because:
1. Feature requires API backend (GraphQL server) + interactive frontend (map UI)
2. Separate deployment units (backend scales independently from frontend)
3. Clear separation of concerns (API contracts in `contracts/`, business logic in `services/`)
4. Supports progressive enhancement (frontend can degrade without JS, backend remains functional)

## Complexity Tracking

No constitution violations requiring justification. All complexity is necessary:

| Technical Decision | Justification | Simpler Alternative Rejected |
|--------------------|---------------|------------------------------|
| GraphQL over REST | User requirement for flexible schema; GraphQL introspection supports dynamic field discovery | REST requires versioning for schema changes, less flexible |
| Prisma ORM | Type-safe database access, automatic migrations (Constitution I rapid deployment) | Raw SQL queries too error-prone, manual migrations slow deployment |
| H3 library | Efficient geospatial proximity detection (FR-024b requires 50m radius checks) | Naive lat/lon distance calc insufficient for clustering/proximity at scale |
| Service Worker | Offline capability required by Constitution II (disaster-resilient design) | Simple browser cache insufficient for offline marker data persistence |

---

## Phase 0: Outline & Research

**Objective**: Resolve all technical unknowns and establish best practices for GraphQL-based flexible schema architecture

### Research Tasks

1. **GraphQL Schema Design for Dynamic Fields**
   - Question: How to design GraphQL schema that supports backend-configurable fields without schema recompilation?
   - Research: Schema stitching, JSON scalar types, federation patterns
   - Output: Decision on dynamic field implementation (likely JSON scalar + resolver logic)

2. **Legacy REST API Migration Strategy**
   - Question: How to migrate from FastAPI `/places`, `/human_resources`, `/supplies` endpoints to GraphQL?
   - Research: Dual-stack approach (REST + GraphQL during transition), data mapper patterns
   - Output: Migration plan with backward compatibility strategy

3. **Flexible Field Management Architecture**
   - Question: How to store field configurations (name, type, validation rules) and apply them at runtime?
   - Research: Schema-on-read vs schema-on-write, JSON Schema validation, field metadata storage
   - Output: Decision on configuration file format (`config/field-definitions.json` structure)

4. **Geospatial Proximity Detection with H3**
   - Question: How to implement 50-meter radius proximity checks efficiently?
   - Research: H3 resolution levels, k-ring search patterns, PostgreSQL H3 extension
   - Output: Implementation approach for FR-024b proximity detection

5. **LINE 2FA Authentication Integration**
   - Question: How to integrate LINE Login API with GraphQL authentication directives?
   - Research: LINE Login flow, JWT token management, Apollo Server auth context
   - Output: Authentication flow diagram, JWT payload structure

6. **Offline PWA Implementation**
   - Question: What data should be cached offline for disaster scenarios (maps, markers, facility info)?
   - Research: Service Worker strategies, IndexedDB for structured data, cache invalidation
   - Output: Caching strategy with cache size limits, update frequency

7. **Photo Storage and Optimization**
   - Question: Local filesystem vs MinIO vs S3 for photo storage (5MB max, 1000-5000 photos)?
   - Research: Cost comparison, self-hosting requirements, image optimization pipelines
   - Output: Storage decision, image processing strategy (WebP conversion, thumbnail generation)

8. **GraphQL Performance Optimization**
   - Question: How to handle N+1 query problem for nested marker data (user, edit history, photos)?
   - Research: DataLoader pattern, batching, query complexity analysis
   - Output: DataLoader implementation plan, query cost limits

### Success Criteria

- ✅ All "NEEDS CLARIFICATION" items from Technical Context resolved
- ✅ Best practices documented for each technology choice
- ✅ Trade-offs and alternatives clearly articulated
- ✅ research.md file complete with decisions + rationales

### Output

`research.md` in this directory (specs/002-interactive-disaster-map/)

---

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete

### Tasks

1. **Extract Entities from Spec → data-model.md**
   - Map all entities from spec (Map Marker, Recovery Status, Cleanup Area, Facility, User, etc.)
   - Define fields, types, relationships, validation rules
   - Include dynamic field support (JSONB `additional_info` mapping)
   - Document state transitions (marker status: draft → published → archived)

2. **Generate GraphQL API Contracts → contracts/**
   - Create `schema.graphql` with all types, queries, mutations
   - Custom scalars: `DateTime`, `JSON`, `Coordinates` (GeoJSON Point)
   - Auth directives: `@requireAuth`, `@requireRole(role: UserRole)`
   - Pagination: Relay-style connections or offset-based
   - Examples:
     ```graphql
     type Marker {
       id: ID!
       type: MarkerType!
       name: String!
       coordinates: Coordinates!
       status: MarkerStatus!
       additionalInfo: JSON  # Dynamic fields
       createdBy: User!
       editHistory: [EditHistory!]!
     }

     type Query {
       markers(filter: MarkerFilter, first: Int, after: String): MarkerConnection!
       searchPlaces(query: String!, radius: Float): [Marker!]!
       nearbyFacilities(coordinates: Coordinates!, type: FacilityType): [Facility!]!
     }

     type Mutation {
       createMarker(input: CreateMarkerInput!): Marker! @requireAuth
       updateMarker(id: ID!, input: UpdateMarkerInput!): Marker! @requireAuth
       deleteMarker(id: ID!): DeleteResult! @requireAuth @requireRole(role: ADMIN)
     }
     ```

3. **Generate quickstart.md**
   - Prerequisites: Node.js 20, Docker, PostgreSQL tools
   - Setup steps:
     1. Clone repository
     2. Copy `.env.example` → `.env`, configure LINE API keys
     3. `docker-compose up -d` (starts Postgres, Redis)
     4. `cd backend && npm install && npx prisma migrate dev`
     5. `cd frontend && npm install && npm run dev`
     6. Access http://localhost:3000
   - Development workflow: Hot reload, GraphQL Playground, database migrations
   - Troubleshooting: Common errors (Postgres connection, LINE auth, map tiles)

4. **Update Agent Context**
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
   - Add technology: Apollo Server, Prisma, Leaflet.js, H3, LINE Login API
   - Preserve manual additions (custom patterns, team conventions)

### Success Criteria

- ✅ data-model.md includes all 15+ entities from spec with dynamic field support
- ✅ GraphQL schema complete (queries, mutations, subscriptions if needed)
- ✅ API contracts follow GraphQL best practices (pagination, error handling)
- ✅ quickstart.md enables <4 hour deployment (Constitution I)
- ✅ Agent context updated with new tech stack

### Output

- `data-model.md` in this directory
- `contracts/schema.graphql`, `contracts/scalars.graphql`, `contracts/directives.graphql`
- `quickstart.md` in this directory
- `.claude/agent-context.md` (or equivalent) updated

---

## Phase 2: Task Generation

**Not covered by `/speckit.plan` command**

Run `/speckit.tasks 002-interactive-disaster-map` to generate `tasks.md` with actionable implementation tasks based on this plan.

---

## Migration from Legacy API

**Context**: Legacy system uses FastAPI (Python) with REST endpoints `/places`, `/human_resources`, `/supplies*` and PostgreSQL with specific table schema (see `table_spec.md`).

**Migration Strategy** (detailed in research.md Phase 0):

1. **Data Schema Compatibility**:
   - Map legacy `places` table → new `Marker` entity with `type` field
   - Preserve `additional_info` JSONB field for flexible attributes
   - Add new fields: `edit_history`, `proximity_cluster_id`, `whitelist_approved`

2. **API Transition**:
   - **Dual-stack approach**: Run FastAPI + Apollo GraphQL in parallel during migration
   - GraphQL resolvers query same PostgreSQL database
   - Deprecate REST endpoints after 6 months (post-migration validation period)

3. **Field Configuration Migration**:
   - Extract field definitions from FastAPI Pydantic schemas → `config/field-definitions.json`
   - Create admin UI for backend field management (Phase 2 enhancement)
   - Support both hardcoded (system fields: name, coordinates, status) and dynamic fields (disaster-specific attributes)

4. **Backward Compatibility**:
   - Preserve existing `places` table structure, add new tables for features (edit_history, restricted_areas)
   - Create database views for legacy REST endpoints (if needed during transition)
   - Document breaking changes in `docs/api-migration.md`

**Reference Legacy Code**:
- `/Users/richard_ys_lin/projects/guangfu/legacy-version/backend/api-server/guanfu_backend/src/routers/places.py`
- `/Users/richard_ys_lin/projects/guangfu/legacy-version/backend/api-server/guanfu_backend/src/routers/human_resources.py`
- `/Users/richard_ys_lin/projects/guangfu/legacy-version/backend/api-server/table_spec.md`

---

## Next Steps

1. ✅ Constitution Check passed
2. ⏭️ Run Phase 0 research (immediate next step)
3. ⏭️ Run Phase 1 design after research complete
4. ⏭️ Run `/speckit.tasks` to generate implementation tasks

**Current Status**: Plan complete, ready for Phase 0 research execution.
