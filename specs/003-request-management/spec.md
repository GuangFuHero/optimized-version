# Feature Specification: Request/Task Management System (需求單管理系統)

**Feature Branch**: `003-request-management`
**Created**: 2025-11-29
**Status**: Complete Specification
**Input**: User description: "Feature 003 - Request Management System for disaster relief coordination"
**Dependencies**: Feature 002 (Interactive Disaster Relief Map)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Emergency Request Submission (Priority: P1)

As a disaster-affected resident, I need to quickly submit urgent help requests during a crisis so that relief coordinators can immediately respond to life-threatening situations.

**Why this priority**: This is the core entry point for the system. Without the ability to submit requests, no other functionality has value. Emergency situations require immediate response capability.

**Independent Test**: Can be fully tested by submitting a request with emergency priority through a simple form interface, receiving a confirmation with tracking number, and verifying the request appears in the coordinator's dashboard with "emergency" status highlighted.

**Acceptance Scenarios**:

1. **Given** a resident is experiencing a medical emergency, **When** they submit a request selecting "medical" category and "emergency" urgency, **Then** the system immediately creates the request with highest priority, displays a confirmation with tracking number, and marks it with red emergency indicator
2. **Given** a resident has limited information, **When** they submit an emergency request with only description and contact info, **Then** the system accepts the submission and uses their device location or prompts for manual location entry
3. **Given** multiple emergency requests are submitted, **When** coordinators view the request list, **Then** emergency requests appear at the top with visual distinction (red color, emergency icon) regardless of submission time

---

### User Story 2 - Request Status Tracking (Priority: P1)

As a disaster-affected resident, I want to check the current status of my submitted requests so that I know whether help is coming and when to expect it.

**Why this priority**: Transparency builds trust and reduces duplicate requests. Residents need assurance that their requests haven't been forgotten, which is critical for system adoption.

**Independent Test**: Can be tested by submitting a request, receiving a tracking number, and then using that number to retrieve current status showing the request's progression through workflow stages.

**Acceptance Scenarios**:

1. **Given** a resident has submitted a request and received tracking number REQ-12345, **When** they enter this number in the status check interface, **Then** they see current status (pending/assigned/in_progress/completed), timestamp of last update, and assigned volunteer name (if assigned)
2. **Given** a request status changes from "assigned" to "in_progress", **When** the resident checks status, **Then** they see the updated status with timestamp and any notes added by the volunteer
3. **Given** a request is completed, **When** the resident checks status, **Then** they see completion confirmation with completion timestamp and can provide feedback (future enhancement)

---

### User Story 3 - Coordinator Request Dashboard (Priority: P1)

As a relief coordinator, I need a centralized view of all pending requests prioritized by urgency so that I can efficiently allocate resources to the most critical needs first.

**Why this priority**: Coordinators are the operational hub. Without an effective dashboard, they cannot manage the request workflow, making the entire system ineffective regardless of how many requests are submitted.

**Independent Test**: Can be tested by submitting multiple requests with varying priorities and categories, then verifying the coordinator dashboard displays them sorted by priority with filtering and search capabilities.

**Acceptance Scenarios**:

1. **Given** 20 requests exist with mixed urgencies (10 emergency, 10 general), **When** coordinator opens the dashboard, **Then** all 10 emergency requests appear first sorted by submission time, followed by general requests
2. **Given** requests span multiple categories, **When** coordinator applies category filter for "medical", **Then** only medical requests are displayed maintaining priority sort order
3. **Given** a coordinator searches for tracking number or requester name, **When** they type partial match, **Then** system displays matching requests with highlighted search terms
4. **Given** a request's priority is manually adjusted, **When** coordinator changes priority level and adds justification note, **Then** the request repositions in the list and the change is logged with coordinator ID and timestamp

---

### User Story 4 - Volunteer Assignment (Priority: P2)

As a relief coordinator, I want the system to suggest appropriate volunteers for each request based on location and skills so that I can quickly match requests with capable responders without manual searching.

**Why this priority**: Automated matching significantly improves response time and resource allocation efficiency. However, the system can function with manual assignment initially, making this P2 rather than P1.

**Independent Test**: Can be tested by creating a request in location A requiring medical skills, adding volunteers with varying locations and skill sets, then verifying the system suggests volunteers near location A with medical skills listed first.

**Acceptance Scenarios**:

1. **Given** a medical emergency request is created at coordinates (25.0330, 121.5654), **When** coordinator selects "suggest volunteers", **Then** system displays volunteers sorted by: (1) those within 5km radius with "medical" skill, (2) those within 10km with "medical" skill, (3) those within 5km without medical skill
2. **Given** a volunteer is marked as "unavailable", **When** coordinator requests volunteer suggestions, **Then** that volunteer does not appear in the suggestion list
3. **Given** coordinator views suggested volunteers, **When** they select a volunteer and click "assign", **Then** request status changes to "assigned", volunteer receives notification (if notification system exists), and assignment is logged with timestamp
4. **Given** suggested volunteers list is empty, **When** coordinator views suggestions, **Then** system displays message "No matching volunteers available" and allows manual assignment from all volunteer list

---

### User Story 5 - Request Category Management (Priority: P2)

As a relief coordinator, I want to categorize requests using standard tags (food, water, medical, shelter, cleanup) and create custom categories when needed so that I can organize requests by type and assign them to specialized teams.

**Why this priority**: Categorization improves filtering and routing efficiency but is not critical for MVP. The system can function with a single "help needed" category initially.

**Independent Test**: Can be tested by creating requests and applying multiple category tags, then filtering the dashboard by single or multiple categories to verify only matching requests are displayed.

**Acceptance Scenarios**:

1. **Given** a resident submits a request, **When** they describe needing both food and water, **Then** coordinator can apply both "food" and "water" tags to the single request
2. **Given** predefined categories don't match a request, **When** coordinator clicks "add custom category" and enters "pet rescue", **Then** system creates the new category (if user has admin permissions) and applies it to the request
3. **Given** requests are tagged with multiple categories, **When** coordinator filters by "food" OR "water", **Then** system displays all requests tagged with either category
4. **Given** a category is no longer needed, **When** admin user deprecates it, **Then** existing tags remain but the category doesn't appear in new request tagging options

---

### User Story 6 - Request Lifecycle Management (Priority: P2)

As a volunteer, I want to update the status of my assigned requests as I progress through helping residents so that coordinators and residents both know the current state of each task.

**Why this priority**: Status updates provide transparency and enable coordinators to monitor progress. However, the system can initially function with coordinator-only status updates.

**Independent Test**: Can be tested by assigning a request to a volunteer, then having the volunteer update status from "assigned" to "in_progress" to "completed" while verifying each status change is logged and visible to all stakeholders.

**Acceptance Scenarios**:

1. **Given** a volunteer has accepted an assigned request, **When** they arrive at the location and click "start task", **Then** request status changes to "in_progress" with timestamp and location recorded
2. **Given** a volunteer is working on a request, **When** they add progress notes "delivered 20L water, returning for medical supplies", **Then** notes are appended to request with timestamp and visible to coordinators and requester
3. **Given** a volunteer completes a task, **When** they click "mark completed" and add completion notes, **Then** request status changes to "completed", completion timestamp is recorded, and requester can view the outcome
4. **Given** a volunteer encounters a blocker, **When** they mark request as "needs escalation" with reason, **Then** request returns to coordinator queue with highest priority and escalation flag

---

### User Story 7 - Request Quality Control (Priority: P3)

As a backend administrator, I need to review submitted requests for validity, edit details, merge duplicates, and remove spam so that the request database maintains high quality and operational integrity.

**Why this priority**: Quality control is important for long-term system health but not critical for initial MVP. The system can launch with basic request submission and rely on coordinators to handle quality issues initially.

**Independent Test**: Can be tested by submitting duplicate or invalid requests, then having an admin user merge duplicates, edit request details, or soft-delete spam entries while verifying all actions are logged in audit trail.

**Acceptance Scenarios**:

1. **Given** two requests are submitted for the same address with similar descriptions, **When** admin identifies them as duplicates and selects "merge requests", **Then** system combines information from both into a single request, marks the duplicate as merged (not deleted), and redirects any references to the primary request
2. **Given** a request contains inaccurate information, **When** admin edits the location coordinates or contact information, **Then** changes are saved with admin ID, timestamp, and edit reason logged in audit trail
3. **Given** spam or fraudulent requests are detected, **When** admin marks request as spam and soft-deletes it, **Then** request is hidden from public views but preserved in database with deletion reason, admin ID, and timestamp
4. **Given** admin actions are performed, **When** another admin views the audit trail, **Then** they see complete history including who performed each action, when, what changed, and why

---

### Edge Cases

- **Network failure during submission**: What happens when a resident submits a request but loses internet connection before receiving confirmation?
  - System should implement retry logic with request deduplication based on device ID + timestamp fingerprint

- **Duplicate emergency requests**: How does the system handle multiple people submitting requests for the same emergency (e.g., building collapse)?
  - Coordinators can merge duplicates, and system can flag potential duplicates based on location proximity (<100m) + time proximity (<15min) + category match

- **Volunteer abandons assigned request**: What happens when a volunteer accepts a request but never marks it in_progress or completed?
  - System should auto-escalate requests that remain in "assigned" status for >2 hours without progress updates

- **Request priority conflicts**: How does the system resolve cases where manual priority override conflicts with automated urgency scoring?
  - Manual overrides take precedence, but system displays both automated score and manual override with justification note

- **Location accuracy issues**: How does the system handle requests with imprecise or incorrect location data?
  - Allow coordinators to edit location after submission, flag requests with low GPS accuracy, support manual map pin adjustment

- **Requester unreachable**: What happens when volunteer arrives but cannot contact the requester?
  - Volunteer can mark request as "contact failed" which returns it to queue with escalation flag and contact issue note

- **Category ambiguity**: How does the system handle requests that don't clearly fit predefined categories?
  - Allow "uncategorized" or "mixed/multiple" tags, coordinators can recategorize after triage

- **Language barriers**: How does the system handle requests submitted in languages other than Traditional Chinese?
  - Out of scope for MVP - assume all communication in Traditional Chinese initially

## Requirements *(mandatory)*

### Functional Requirements

**Request Submission**:
- **FR-001**: System MUST allow residents (authenticated or anonymous) to submit help requests including: request description, urgency level (emergency/general), contact name, contact phone, location (GPS auto-detect or manual entry)
- **FR-002**: System MUST provide predefined category options: 食物 (food), 飲用水 (water), 醫療 (medical), 住所 (shelter), 清理 (cleanup), 交通 (transportation), 物資 (supplies), 修繕 (repairs)
- **FR-003**: System MUST generate unique tracking number for each submitted request in format REQ-YYYYMMDD-NNNN (e.g., REQ-20250129-0042)
- **FR-004**: System MUST display confirmation message with tracking number upon successful submission
- **FR-005**: System MUST validate that at least one contact method (phone or location) is provided before accepting submission

**Request Prioritization**:
- **FR-006**: System MUST assign initial priority score based on urgency level: emergency=100, general=50
- **FR-007**: System MUST allow coordinators to manually adjust priority scores with range 0-200
- **FR-008**: System MUST require coordinators to provide justification note when manually changing priority by >20 points
- **FR-009**: System MUST log all priority changes with coordinator ID, old value, new value, justification note, and timestamp
- **FR-010**: System MUST sort request dashboard by priority score (highest first), then by submission timestamp (oldest first) as tiebreaker

**Request Categorization**:
- **FR-011**: System MUST allow multiple category tags to be applied to a single request
- **FR-012**: System MUST allow coordinators with admin privileges to create custom category tags
- **FR-013**: System MUST prevent duplicate category names (case-insensitive check)
- **FR-014**: System MUST allow filtering dashboard by single category (OR logic) or multiple categories (AND logic)

**Request Status Workflow**:
- **FR-015**: System MUST support request status values: pending_assignment, assigned, in_progress, completed, cancelled
- **FR-016**: System MUST enforce status transitions: pending→assigned→in_progress→completed OR any_status→cancelled
- **FR-017**: System MUST log each status change with user ID, timestamp, and optional notes
- **FR-018**: System MUST allow residents to check their request status using tracking number without authentication

**Volunteer Assignment**:
- **FR-019**: System MUST calculate distance between volunteer location and request location using haversine formula
- **FR-020**: System MUST suggest volunteers sorted by: (1) skill match + proximity<5km, (2) skill match + proximity<10km, (3) proximity<5km, (4) all others by proximity
- **FR-021**: System MUST exclude volunteers marked as "unavailable" from suggestion list
- **FR-022**: System MUST allow coordinators to manually assign any volunteer regardless of suggestions
- **FR-023**: System MUST change request status to "assigned" and log assignment when volunteer is assigned
- **FR-024**: System MUST prevent assigning a volunteer to multiple concurrent requests unless they have "multi-task" capability flag

**Request Modification & Quality Control**:
- **FR-025**: System MUST allow admin users to edit any field of any request regardless of status
- **FR-026**: System MUST log all edits to audit trail with admin ID, timestamp, field name, old value, new value, and reason
- **FR-027**: System MUST support soft-delete operation that marks requests as deleted without removing from database
- **FR-028**: System MUST allow admin users to merge duplicate requests by selecting primary request and one or more duplicates
- **FR-029**: System MUST combine all notes, status history, and metadata from merged requests into primary request
- **FR-030**: System MUST mark merged duplicates with "merged_into" field pointing to primary request ID

**Dashboard & Filtering**:
- **FR-031**: System MUST display request dashboard with columns: tracking number, priority, status, category tags, location, submission time, last updated
- **FR-032**: System MUST support filtering by: status, category (single or multiple), urgency level, date range, location radius
- **FR-033**: System MUST support text search across: tracking number, requester name, description, notes
- **FR-034**: System MUST highlight search terms in results
- **FR-035**: System MUST support sorting dashboard by any column header (ascending/descending)

**Integration with Map**:
- **FR-036**: System MUST provide API endpoint for map feature to fetch all active requests (non-cancelled, non-completed)
- **FR-037**: System MUST return request data in GeoJSON format with properties: tracking_number, category, priority, status, description_preview (first 100 chars)
- **FR-038**: System MUST update map markers in real-time when request status changes (emergency→assigned should change marker color)

**Notifications** (future enhancement, not MVP):
- **FR-039**: System design should accommodate future notification system with hooks for: new_request_created, request_assigned, status_changed, request_completed
- **FR-040**: System MUST log notification events even if delivery mechanism is not yet implemented

**Security & Access Control**:
- **FR-041**: System MUST allow anonymous users to submit requests and check status using tracking number
- **FR-042**: System MUST require authentication for coordinator dashboard access
- **FR-043**: System MUST require admin role for editing requests, merging requests, creating categories
- **FR-044**: System MUST prevent residents from viewing requests submitted by other users (except via tracking number)

**Data Retention**:
- **FR-045**: System MUST retain completed requests for minimum 1 year for reporting and analysis
- **FR-046**: System MUST retain cancelled requests for minimum 90 days for audit purposes
- **FR-047**: System MUST retain audit trail for all admin actions indefinitely

### Key Entities

- **Request**: Core entity representing a help request
  - Attributes: request_id, tracking_number, requester_name, requester_phone, description, location (lat/lng), urgency (emergency/general), priority_score, status, category_tags (array), assigned_volunteer_id, created_at, updated_at, completed_at, cancelled_at, soft_deleted
  - Relationships: belongs_to Volunteer (optional), has_many StatusHistory, has_many AuditLog entries

- **StatusHistory**: Audit trail of status changes for a request
  - Attributes: history_id, request_id, old_status, new_status, changed_by_user_id, changed_at, notes
  - Relationships: belongs_to Request, belongs_to User (who made change)

- **Category**: Tags for categorizing requests
  - Attributes: category_id, category_name, category_name_en, is_predefined (boolean), created_by_admin_id, created_at
  - Relationships: many_to_many with Requests via RequestCategories join table

- **Assignment**: Record of volunteer assignments to requests
  - Attributes: assignment_id, request_id, volunteer_id, assigned_by_coordinator_id, assigned_at, accepted_at (volunteer confirmation), completed_at
  - Relationships: belongs_to Request, belongs_to Volunteer, belongs_to Coordinator (User)

- **AuditLog**: Complete audit trail of admin actions
  - Attributes: log_id, action_type (edit/delete/merge), request_id, performed_by_admin_id, performed_at, field_changed, old_value, new_value, reason
  - Relationships: belongs_to Request, belongs_to Admin (User)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Residents can submit emergency requests in under 60 seconds from opening the interface (measured by time from page load to confirmation display)
- **SC-002**: Coordinators can identify and assign highest priority requests within 2 minutes of opening dashboard (measured by time from login to assignment completion)
- **SC-003**: 95% of submitted requests receive status updates within 4 hours of submission (measured by time between submission and first status change from pending_assignment)
- **SC-004**: System supports 100 concurrent request submissions without degradation (measured by p95 response time remaining under 2 seconds)
- **SC-005**: Zero requests are lost due to system errors (measured by request submission success rate >99.9%)
- **SC-006**: Request status is accurate and up-to-date for 99% of status checks (measured by comparing resident status view with actual database status)
- **SC-007**: Coordinators can filter requests by category and urgency with results appearing in under 1 second (measured by dashboard filter response time)
- **SC-008**: Admin actions are fully auditable with complete history available within 3 seconds (measured by audit trail query response time)
- **SC-009**: Duplicate requests are identified and merged within 30 minutes of detection (measured by time between duplicate submission and merge completion)
- **SC-010**: Volunteer suggestions are relevant with at least 80% of suggested volunteers having appropriate skills and location (measured by coordinator acceptance rate of top-3 suggestions)

## Assumptions *(mandatory)*

### Technical Assumptions

1. **Network connectivity**: Assumes residents have internet access (mobile data or WiFi) when submitting requests. For areas without connectivity, manual submission via coordinator is fallback.

2. **GPS availability**: Assumes most users have devices with GPS capability. System supports manual location entry as fallback.

3. **Device compatibility**: Assumes mobile-first design supporting iOS 14+ and Android 8+ browsers, with desktop as secondary interface.

4. **Data storage**: Assumes PostgreSQL database with PostGIS extension for geospatial queries. Storage capacity sufficient for 10,000 requests per disaster event.

5. **Authentication**: Assumes integration with existing authentication system (LINE 2FA as specified in Feature 002). Anonymous submission is allowed for residents.

6. **Real-time updates**: Assumes WebSocket or Server-Sent Events (SSE) for coordinator dashboard real-time updates. Polling is acceptable fallback.

### Business Assumptions

1. **Request volume**: Assumes peak load of 500 requests per hour during first 24 hours of disaster event, declining to 50 requests per hour after 48 hours.

2. **Coordinator availability**: Assumes at least 3 coordinators are actively managing requests during peak hours to ensure timely assignment.

3. **Volunteer pool**: Assumes minimum 50 registered volunteers with various skills and locations to enable effective matching.

4. **Language**: Assumes all communication in Traditional Chinese (繁體中文) for MVP. Multilingual support is future enhancement.

5. **Notification method**: Assumes initial version uses in-app status checking only. Push notifications and SMS are future enhancements.

6. **Request validity**: Assumes 95% of submitted requests are legitimate. Remaining 5% spam/duplicates are managed via admin tools.

### Operational Assumptions

1. **Coordinator training**: Assumes coordinators receive 2-hour training on dashboard usage, priority management, and volunteer assignment before disaster event.

2. **Volunteer onboarding**: Assumes volunteers are pre-registered with skills, location, and availability before disaster event (managed in Feature 004).

3. **Data retention**: Assumes organization has policy for retaining disaster-related data for 1 year minimum for analysis and compliance.

4. **Access control**: Assumes organization has defined roles (resident, volunteer, coordinator, admin) with RBAC enforced at application layer.

5. **Audit compliance**: Assumes all admin actions must be auditable for compliance with disaster relief fund regulations.

6. **Disaster event lifecycle**: Assumes each disaster event is treated as separate context with requests scoped to specific event_id (managed in Feature 006).

## Out of Scope *(mandatory)*

The following items are explicitly excluded from Feature 003:

1. **Push notifications**: Real-time push notifications to volunteers or residents. Initial version uses in-app status checking only. Push notifications are future enhancement requiring separate notification service.

2. **SMS integration**: Text message notifications or SMS-based request submission. MVP uses web interface only.

3. **Offline mode**: Ability to submit requests without internet connection. Requires complex sync logic and is deferred to future release.

4. **Payment processing**: Any financial transactions, donations, or reimbursements. These are managed separately in fundraising/accounting systems.

5. **Identity verification**: Detailed resident verification beyond basic contact information. Trust-based system initially with fraud detection as future enhancement.

6. **Automated assignment algorithm**: Full AI-based assignment that automatically assigns volunteers without coordinator approval. MVP uses coordinator-approved suggestions only.

7. **Media uploads**: Photos or videos of damage or needs. Limited to text descriptions initially due to storage and bandwidth constraints during disasters.

8. **Multi-language support**: Languages other than Traditional Chinese. International disasters or multilingual regions require separate localization effort.

9. **Request dependencies**: Ability to link requests with dependencies (e.g., "deliver medical supplies before treating patient"). Complex workflow is future enhancement.

10. **Resource allocation**: Inventory management, supply tracking, or resource availability checking. These are managed in Feature 005 (Supply Management).

11. **Volunteer scheduling**: Shift management, availability calendars, or time-off requests. These are managed in Feature 004 (Volunteer Dispatch).

12. **Historical analytics**: Detailed reporting, trend analysis, or performance metrics. Basic statistics are provided, but comprehensive analytics are handled in Feature 006 (Backend Administration).

## Integration Points

### Feature 002 (Interactive Disaster Relief Map)
- Requests appear as map markers with status-based visual styling (emergency=red, general=yellow)
- Clicking markers displays request summary popup with tracking number and status
- Map filtering includes request categories alongside other map layers
- Request location updates in real-time when admin edits coordinates

### Feature 004 (Volunteer Dispatch System)
- Volunteers listed in assignment suggestions are pulled from volunteer database with skills and availability
- When request is assigned to volunteer, their availability status is checked/updated
- Volunteer accepts assignment and updates status through their volunteer interface
- Volunteer skills taxonomy used for matching (e.g., "medical" category matches volunteers with "first aid" or "EMT" skills)

### Feature 005 (Supply Management System)
- Request categories (food, water, supplies) can optionally link to supply inventory for availability checking (future enhancement)
- Completed requests may trigger inventory updates when supplies are distributed (future enhancement)

### Feature 006 (Backend Administration System)
- Admin dashboard displays request statistics: total submitted, completion rate, average response time, by-category breakdown
- RBAC roles defined in admin system control coordinator and admin permissions in request system
- Audit trail from request system feeds into centralized audit log in admin system
- Disaster event context (event_id) managed in admin system and used to scope requests to specific disasters

## Dependencies

### Prerequisites
- **Feature 002 (Interactive Map)**: Must be implemented first to provide map interface where requests are displayed as markers
- **Authentication system**: LINE 2FA integration for coordinators and admins (specified in Feature 002)
- **Database infrastructure**: PostgreSQL with PostGIS extension for geospatial queries

### External Systems
- **User authentication**: Relies on external auth provider (LINE) for coordinator/admin login
- **SMS gateway** (future): When SMS notifications are implemented, requires integration with external SMS provider
- **Push notification service** (future): When push notifications are implemented, requires Firebase Cloud Messaging (FCM) or similar

### Data Dependencies
- **Volunteer database**: Requires Feature 004 volunteer registration to be populated before volunteer assignment suggestions can function effectively
- **Disaster event context**: Requires event_id from Feature 006 to scope requests to specific disasters (can use default event_id for MVP)
