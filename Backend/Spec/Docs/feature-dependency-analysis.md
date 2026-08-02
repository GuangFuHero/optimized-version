# Feature Dependency Analysis Report

**Generated**: 2025-11-30
**Analyzed Features**: 002 (Interactive Map), 003 (Request Management), 004 (Volunteer Dispatch), 005 (Supply Management), 006 (Backend Administration), 007 (Information Publishing)

## Executive Summary

✅ **Overall Assessment**: Features are well-designed with clear dependency hierarchy and mostly consistent integration points.

⚠️ **Issues Found**: 3 medium-priority inconsistencies requiring clarification
🔍 **Recommendations**: 5 documentation improvements to strengthen cross-feature contracts

---

## 1. Dependency Hierarchy

### Valid Implementation Order

```
Level 1 (Foundation):
├─ Feature 002: Interactive Disaster Relief Map
   └─ Provides: Authentication (LINE 2FA), Map Infrastructure, Resource Location Model

Level 2 (Core Services - Can implement in parallel):
├─ Feature 003: Request/Task Management
├─ Feature 005: Supply Management
└─ Feature 007: Information Publishing

Level 3 (Integrated Services):
└─ Feature 004: Volunteer Dispatch
   └─ Depends on: 002 (auth/map) + 003 (requests)

Level 4 (Management Layer):
└─ Feature 006: Backend Administration
   └─ Depends on: ALL features (002-007)
```

**✅ Validation Result**: No circular dependencies detected. Implementation order is feasible.

---

## 2. Identified Issues

### Issue #1: Role Terminology Inconsistency ⚠️

**Severity**: Medium
**Affected Features**: 003, 004, 006

**Problem**:

- **Feature 004** (FR-004): "System MUST require **coordinators** to review volunteer applications and approve/reject"
- **Feature 006** (Integration Points): "**Admin** manages volunteer accounts: approve verifications, suspend accounts"

**Question**: Are "coordinators" and "admins" the same role, or is there a role hierarchy?

**Evidence from Feature 006**:

- FR-017: "System MUST support role hierarchy: Super Admin > Admin > **Coordinator** > Resource Manager > Volunteer..."

**Resolution Needed**:
Feature 004 should clarify:

1. Can **Coordinators** approve volunteer registrations, or only Admins?
2. Update FR-004 to specify exact role: "coordinators **with admin privileges**" or "admin users"

**Impact**: Medium - affects RBAC implementation and user training materials

---

### Issue #2: Feature 002 Marker Extension Not Explicitly Documented ⚠️

**Severity**: Medium
**Affected Features**: 002, 003, 004, 007

**Problem**:
Multiple features claim they display markers on Feature 002's map, but Feature 002's spec doesn't explicitly list these marker types:

**Feature 003 claims** (FR-036-038):

- "System MUST provide API endpoint for map feature to fetch all active requests"
- "System MUST return request data in GeoJSON format"
- "System MUST update map markers in real-time when request status changes"

**Feature 004 claims** (FR-050):

- "System MUST integrate with Feature 002 to display volunteer locations as real-time markers"

**Feature 007 claims** (FR-024):

- "System MUST allow timeline events to be linked to geographic locations displayed on the map"

**But Feature 002's marker types** only explicitly mention:

- Resource Locations (service centers, shelters, aid stations)
- Road status markers
- Affected areas (polygons)

**Resolution Needed**:
Feature 002 should add to its spec:

- **FR-XXX**: "System MUST support **request markers** with status-based visual styling (emergency=red, general=yellow) consumed from Feature 003 GeoJSON API"
- **FR-XXX**: "System MUST support **volunteer location markers** (when location sharing enabled) consumed from Feature 004"
- **FR-XXX**: "System MUST support **timeline event markers** consumed from Feature 007"

Or explicitly state that Feature 002 provides a **generic marker API** that other features can extend.

**Impact**: Medium - affects API design and map layer implementation

---

### Issue #3: Volunteer Data Ownership Ambiguity ⚠️

**Severity**: Medium
**Affected Features**: 003, 004

**Problem**:
Feature 003 (Request Management) has extensive volunteer assignment functionality (FR-019 to FR-024):

- Calculating volunteer-task distance
- Suggesting volunteers based on skills
- Assigning volunteers to requests
- Preventing multi-assignment

But Feature 004 (Volunteer Dispatch) is the authoritative source for volunteer data.

**Question**: Does Feature 003 have its own volunteer database copy, or does it call Feature 004's API for volunteer data?

**Current State**:

- **Feature 003** Key Entities section mentions **Assignment** entity with `volunteer_id` but doesn't define **Volunteer** entity
- **Feature 004** fully defines **Volunteer** entity with all attributes

**Resolution Needed**:
Feature 003 should clarify in its "Dependencies" or "Integration Points" section:

```markdown
### Feature 004 (Volunteer Dispatch System) Integration

- Volunteer data (skills, location, availability) is retrieved from Feature 004 volunteer database via API
- Feature 003 Assignment entity references Feature 004's volunteer_id
- When coordinator requests volunteer suggestions, system queries Feature 004 for available volunteers matching criteria
- Volunteer status updates (available/busy) are reflected in Feature 004 when assignments are made in Feature 003
```

**Impact**: Medium - affects database schema design and API contracts

---

## 3. Validated Consistencies ✅

### ✅ Feature 005 → Feature 003 Supply Request Integration

**Status**: Consistent

**Feature 005 Claims**:

- FR-006: "System MUST link outgoing transactions to approved supply requests from Feature 003"

**Feature 003 Provides**:

- FR-002: Category options include "物資 (supplies)"
- Supply requests can be created, tracked, and linked

**Resolution**: ✅ No conflict - Feature 003's category system supports Feature 005's integration need

---

### ✅ Feature 004 → Feature 003 Status Update Integration

**Status**: Consistent

**Feature 004 Claims**:

- FR-051: "System MUST update request status in Feature 003 when volunteer marks task as started or completed"

**Feature 003 Provides**:

- FR-015: Status values include `in_progress`, `completed`
- FR-016: Status transition flow: `assigned → in_progress → completed`
- FR-017: Status changes logged with user_id and timestamp

**Resolution**: ✅ Feature 003 provides the exact status update mechanism Feature 004 needs

---

### ✅ Feature 006 → All Features Admin Integration

**Status**: Consistent

**Feature 006 Claims** it can:

- Edit requests (Feature 003)
- Manage volunteer accounts (Feature 004)
- Review supply transactions (Feature 005)
- Publish information content (Feature 007)

**All Features Confirm**:

- Feature 003 FR-025: "System MUST allow admin users to edit any field of any request"
- Feature 005 FR-032: "System MUST support role-based access control with distinct permissions for: warehouse staff, coordinators, **administrators**"
- Feature 007 FR-034: "System MUST restrict content creation, editing, and publishing to **authorized users based on user roles**"

**Resolution**: ✅ All features explicitly support admin-level access

---

### ✅ Feature 005 → Feature 002 Warehouse Location Integration

**Status**: Consistent

**Feature 005 Claims**:

- Warehouse entity: "warehouse_id (can be subset of Resource Locations from Feature 002)"

**Feature 002 Provides**:

- Resource Location model with coordinates, address, type, status

**Resolution**: ✅ Feature 005 properly extends Feature 002's location model

---

### ✅ Authentication Consistency Across All Features

**Status**: Consistent

**Feature 002 Defines**:

- FR-030: LINE 2FA authentication as foundation

**All Features Respect**:

- Feature 003 FR-041: "System MUST allow **anonymous users** to submit requests" (explicit exception documented)
- Feature 004 FR-053: "System MUST use LINE authentication tokens from Feature 002"
- Feature 006 FR-042: Authentication required for coordinator/admin access
- Feature 007 FR-034: Authorized users based on roles

**Resolution**: ✅ Features properly layer on top of Feature 002's auth foundation

---

## 4. Recommendations

### Recommendation #1: Create Cross-Feature API Contract Document

**Priority**: High
**Rationale**: Prevent integration issues during implementation

**Action**: Create `Backend/Spec/Docs/api-contracts.md` documenting:

- Feature 003 → Feature 002: Request GeoJSON API specification
- Feature 004 → Feature 002: Volunteer location update API
- Feature 004 → Feature 003: Request status update API
- Feature 005 → Feature 003: Supply request linking mechanism
- Feature 006 → All: Admin operation APIs

---

### Recommendation #2: Standardize Role Terminology

**Priority**: High
**Rationale**: Prevent RBAC implementation confusion

**Action**:

1. Feature 006's role hierarchy should be the single source of truth
2. Update Feature 004 FR-004 to reference Feature 006's role definitions explicitly
3. Add cross-reference: "See Feature 006 FR-017 for complete role hierarchy"

---

### Recommendation #3: Enhance Feature 002 with Marker Extension Documentation

**Priority**: Medium
**Rationale**: Clarify map extensibility model

**Action**: Add to Feature 002 spec:

```markdown
## Map Extensibility

The map system provides a generic marker API that other features extend:

- **Feature 003** adds request markers (status-based styling)
- **Feature 004** adds volunteer location markers (real-time tracking)
- **Feature 005** uses Resource Locations for warehouse markers
- **Feature 007** adds timeline event markers (linked to historical events)

Each feature is responsible for:

1. Providing GeoJSON-formatted marker data
2. Defining marker visual styling (color, icon, size)
3. Implementing marker popup content
4. Handling marker interaction events
```

---

### Recommendation #4: Clarify Volunteer Data Ownership

**Priority**: Medium
**Rationale**: Prevent database schema conflicts

**Action**: Add to Feature 003's Integration Points section:

```markdown
### Volunteer Data Integration with Feature 004

- Feature 004 is the source of truth for all volunteer data
- Feature 003 references volunteers via volunteer_id only
- Volunteer suggestions retrieved via Feature 004 API calls
- Volunteer availability checks performed against Feature 004 database
```

---

### Recommendation #5: Add Integration Testing Checklist

**Priority**: Low
**Rationale**: Ensure cross-feature workflows are tested

**Action**: Create `Backend/Spec/Docs/integration-test-scenarios.md` covering:

1. **Request → Volunteer → Map Flow**: Submit request → assign volunteer → see both on map
2. **Supply Request → Fulfillment Flow**: Request supplies → allocate inventory → record delivery
3. **Timeline → Map Flow**: Add timeline event → verify marker appears on map
4. **Admin Moderation Flow**: Admin edits request → changes visible to volunteer and requester

---

## 5. Implementation Sequence Recommendation

Based on dependency analysis, recommended implementation order:

### Phase 1: Foundation (Sprint 1-2)

```
Feature 002: Interactive Disaster Relief Map
- Core map infrastructure
- Authentication (LINE 2FA)
- Resource location model
- Generic marker API with extension points
```

### Phase 2: Core Services (Sprint 3-5, Parallel Development)

```
Feature 003: Request/Task Management
Feature 005: Supply Management
Feature 007: Information Publishing

Dependencies: Only Feature 002
Can be developed by separate teams concurrently
Integration point: All display markers on Feature 002 map
```

### Phase 3: Integrated Services (Sprint 6-7)

```
Feature 004: Volunteer Dispatch

Dependencies: Features 002 + 003
Integrates volunteer matching with request assignment
Updates request status when tasks progress
```

### Phase 4: Management Layer (Sprint 8-9)

```
Feature 006: Backend Administration

Dependencies: All features (002-007)
Provides unified admin interface for all features
Implements RBAC and audit logging across entire platform
```

---

## 6. Summary Matrix

| Feature        | Depends On    | Consumed By        | Status | Issues                           |
| -------------- | ------------- | ------------------ | ------ | -------------------------------- |
| 002 Map        | None          | 003, 004, 005, 007 | ✅     | Marker extension not documented  |
| 003 Requests   | 002           | 004, 005, 006      | ✅     | Volunteer data ownership unclear |
| 004 Volunteers | 002, 003      | 006                | ✅     | Role terminology inconsistent    |
| 005 Supplies   | 002           | 006                | ✅     | None                             |
| 006 Admin      | All (002-007) | None (top layer)   | ✅     | None                             |
| 007 Info       | 002           | 006                | ✅     | None                             |

---

## 7. Conclusion

**Overall System Health**: ✅ Good

The feature specifications show strong architectural thinking with:

- Clear separation of concerns
- Proper dependency layering (no circular dependencies)
- Consistent entity models
- Well-defined integration points

**Critical Path Issues**: 0 (No blocking conflicts found)

**Medium Priority Issues**: 3 (All addressable through documentation updates)

1. Role terminology standardization
2. Map marker extension documentation
3. Volunteer data ownership clarification

**Recommendations**:

- All recommended actions are documentation improvements
- No code changes required to resolve identified issues
- System can proceed to implementation with clarifications documented

**Risk Assessment**: LOW - All features can be implemented successfully with minor documentation updates.

---

## Appendix: Cross-Feature Data Flow Diagrams

### Request → Volunteer Assignment Flow

```
User (Feature 003)
  → Submit Request
  → Coordinator reviews
  → System queries Feature 004 for volunteer suggestions
  → Coordinator assigns volunteer
  → Volunteer (Feature 004) accepts task
  → Volunteer marks started (updates Feature 003 request status)
  → Volunteer marks completed (updates Feature 003 request status)
  → Request closes
```

### Supply → Request Fulfillment Flow

```
User (Feature 003)
  → Submit supply request (category=supplies)
  → Coordinator reviews
  → Warehouse manager (Feature 005) sees linked request
  → Allocates inventory to request
  → Creates delivery plan
  → Volunteer delivers supplies
  → Warehouse records outgoing transaction (links to request ID)
  → Request marked completed
```

### Map → Multi-Feature Visualization Flow

```
User opens map (Feature 002)
  → Map loads base layers
  → Requests Feature 003 GeoJSON API for active requests
  → Displays request markers (color by urgency)
  → Requests Feature 004 API for active volunteer locations (if location sharing enabled)
  → Displays volunteer markers
  → Requests Feature 005 API for warehouse locations
  → Displays warehouse markers with inventory status
  → Requests Feature 007 API for timeline event locations
  → Displays timeline event markers
  → User interacts with markers (popups, filters, clicks)
```
