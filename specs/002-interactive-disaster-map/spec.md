# Feature Specification: Interactive Disaster Relief Map (互動式救災地圖)

**Feature Branch**: `002-interactive-disaster-map`
**Created**: 2025-11-23
**Status**: Draft
**Input**: User description: "作為受災居民、志工團體、配送志工等多種用戶，我希望在網站地圖上看到災區修復進度、清理狀況、物資倉庫位置、各種站點資訊，並能新增和更正站點位置，以便了解災區狀況、分配人力、規劃路線、找尋資源"

## Clarifications

### Session 2025-11-23

- Q: When multiple volunteers submit conflicting information for the same location (e.g., one says "cleaned", another says "still needs volunteers"), how should the system handle these data conflicts? → A: Last edit wins with conflict history viewable - Display the most recent edit but preserve conflict records so users can view historical reports and timestamps. Speed is prioritized during disasters; users can judge for themselves.

- Q: What are the authentication security requirements for volunteer contributors (FR-040 requires authentication but doesn't specify password policies, session management, etc.)? → A: Volunteer contributors (map data providers) should authenticate via LINE 2FA with whitelist system. Password character requirements are flexible but LINE-based two-factor authentication provides additional security while leveraging Taiwan's ubiquitous messaging platform.

- Q: For delivery volunteers planning routes (FR-017), what is the definition of "optimal route"? What factors should the system prioritize? → A: Deferred to planning phase - Uncertain whether automated route planning should be implemented for delivery volunteers. This feature may be optional or replaced with simpler alternatives (e.g., display locations only, volunteers plan manually).

- Q: Given the actual data volume is relatively small (approximately 158 total markers, maximum 54 accommodation points), is marker clustering functionality needed, or can all markers be displayed directly? → A: Category filtering only, no spatial clustering - With current data volume, display all markers without spatial clustering. Instead, allow users to filter by marker type (hide/show categories) to reduce visual load. Simpler implementation, clearer display, faster development.

- Q: Should photos uploaded by volunteers (FR-023) require moderation before being displayed, or should they display immediately after upload? → A: Display immediately - Photos display immediately after upload to prioritize speed during disasters. Trust volunteer contributors (already authenticated via LINE 2FA + whitelist). Allow users to report inappropriate photos for post-publication review.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Disaster Recovery Status (Priority: P1)

**作為受災居民 (As a disaster-affected resident)**, I want to see recovery progress markers (住家與道路、水電修復進度的標記或圖片) for my home, roads, water, and electricity on the map, so I can understand my area's recovery status and decide whether I can return home.

**Why this priority**: This is the most critical feature for affected residents - understanding if their area is safe and when they can return home is the primary concern immediately after a disaster. This directly impacts resident safety and evacuation decisions.

**Independent Test**: Can be fully tested by loading a map with sample recovery status markers (home repair, road repair, water restoration, power restoration) for a specific address/area and verifying that residents can view the status without any other features enabled. Delivers immediate value by showing recovery progress.

**Acceptance Scenarios**:

1. **Given** a resident accesses the map, **When** they search for or navigate to their home address, **Then** they see visual markers showing recovery progress for their home, nearby roads, water service, and electricity service with status indicators (e.g., "修復中 - in progress", "已完成 - completed", "尚未開始 - not started")

2. **Given** recovery status exists for an area, **When** a resident clicks on a recovery marker, **Then** they see detailed information including estimated completion time, current status, and any access restrictions

3. **Given** multiple types of recovery work in one area, **When** a resident views the map, **Then** they can distinguish between different recovery types (roads, water, electricity, buildings) through different marker icons or colors

4. **Given** no recovery data exists for an area, **When** a resident views that area, **Then** they see a clear message indicating "資訊尚未更新 - information not yet updated" rather than showing nothing

---

### User Story 2 - Volunteer Work Coordination (Priority: P1)

**作為志工團體 (As a volunteer organization)**, I want the map to clearly show which neighborhoods/villages have been cleaned ("已清理") and which still need volunteers ("尚待志工進場"), so I can allocate personnel effectively and avoid duplicate cleanup efforts or overlooked areas.

**Why this priority**: Efficient volunteer coordination is critical in the first 48-72 hours of disaster response. Poor coordination leads to wasted resources (multiple teams cleaning the same area) and gaps in coverage (some areas receive no help). This is P1 because it maximizes volunteer impact alongside resident safety.

**Independent Test**: Can be fully tested by displaying sample cleanup status data on the map (areas marked as "cleaned", "in progress", "needs volunteers") and verifying that volunteer coordinators can view status, understand which areas need help, and make assignment decisions. Works independently without other features.

**Acceptance Scenarios**:

1. **Given** a volunteer coordinator accesses the map, **When** they view the disaster area, **Then** they see neighborhoods/villages color-coded or marked with status: "已清理 - cleaned", "清理中 - in progress", "尚待志工 - needs volunteers"

2. **Given** cleanup status information exists, **When** a coordinator clicks on a neighborhood marker, **Then** they see details including: number of volunteers currently assigned, estimated completion time, specific needs (heavy equipment, medical support, etc.)

3. **Given** the map shows multiple areas needing volunteers, **When** the coordinator filters or sorts by urgency/priority, **Then** the map highlights critical areas first (e.g., areas with vulnerable populations, medical facilities, evacuation routes)

4. **Given** a volunteer team completes cleanup of an area, **When** the coordinator updates the status (through admin interface or reporting mechanism), **Then** the map updates to show "已清理 - cleaned" and removes it from "needs volunteers" list

---

### User Story 3 - Delivery Route Planning (Priority: P2)

**作為配送志工 (As a delivery volunteer)**, I want the map to show supply warehouse locations, locations of stranded residents without transportation, and road status (blocked, under repair), so I can plan optimal delivery routes, choose appropriate vehicles, and deliver supplies efficiently.

**Why this priority**: Supply delivery is critical but slightly lower priority than immediate safety assessment (P1). Once residents know their status and volunteers are coordinated, efficient supply delivery becomes the next urgent need. This story depends on having accurate location data but can function independently once data exists.

**Independent Test**: Can be fully tested by displaying sample warehouse locations, stranded resident markers, and road condition overlays, then verifying that delivery volunteers can plan a route from warehouse to multiple delivery points while avoiding blocked roads. Delivers value even if other features aren't implemented.

**Acceptance Scenarios**:

1. **Given** a delivery volunteer accesses the map, **When** they view the disaster area, **Then** they see distinct markers for: supply warehouses (物資倉庫), stranded residents needing supplies (被困居民), blocked roads (道路中斷), roads under repair (道路搶修中)

2. **Given** multiple delivery destinations exist, **When** the volunteer selects a starting warehouse and multiple destination points, **Then** the map suggests an optimal route considering: road accessibility, distance, number of stranded residents per location, vehicle capacity

3. **Given** road conditions change (newly blocked or newly opened), **When** the volunteer refreshes the map or receives a real-time update, **Then** the route suggestion adjusts accordingly and alerts the volunteer to changed conditions

4. **Given** different vehicle types have different capabilities (motorcycle, car, truck, 4WD), **When** the volunteer specifies their vehicle type, **Then** the route considers vehicle limitations (narrow roads inaccessible to trucks, off-road areas requiring 4WD)

5. **Given** a delivery is completed, **When** the volunteer marks a location as "已送達 - delivered", **Then** the resident marker updates to show supply status (reducing urgency or removing from priority list)

---

### User Story 4 - Community Data Contribution (Priority: P2)

**作為資料提供的志工 (As a data-contributing volunteer)**, I want to add new location markers to the map and update/correct existing information, so I can provide timely updates and ensure information accuracy for other users.

**Why this priority**: Crowdsourced data is essential for keeping disaster information current, but it's P2 because the system must first have baseline viewing capabilities (P1 stories) before contributions are useful. This story enables distributed data maintenance, which is critical for scaling disaster response.

**Independent Test**: Can be fully tested by implementing a form/interface that allows volunteers to add new markers (with location, type, description, photo) and edit existing markers, then verifying that submissions are saved and displayed on the map. Works independently as long as map viewing exists.

**Acceptance Scenarios**:

1. **Given** a volunteer with contribution permissions accesses the map, **When** they click "新增站點 - add location", **Then** they can place a marker on the map and fill in: location type (shelter, warehouse, medical, water source, etc.), name, description, contact info, current status, optional photo

2. **Given** a new location is submitted, **When** the volunteer saves the information, **Then** the location appears on the map immediately (or after moderation, depending on system design) and is visible to other users

3. **Given** existing information is outdated or incorrect, **When** a volunteer selects an existing marker and clicks "更正資訊 - correct information", **Then** they can edit fields and submit corrections with a note explaining the change

4. **Given** a volunteer uploads a photo with a location marker, **When** other users view that marker, **Then** they can see the photo to better understand current conditions (damage level, accessibility, available resources)

5. **Given** multiple volunteers submit conflicting information about the same location, **When** the system detects conflicts, **Then** it flags the location for review and shows multiple reports with timestamps (allowing moderators or users to determine which is most current)

---

### User Story 5 - External Volunteer Facility Locator (Priority: P3)

**作為外地志工 (As an external/visiting volunteer)**, I want to see various facility locations (各種站點) on the map with usage information and fees (收費和使用情況), so I can quickly find resources like restrooms, accommodations, showers, meals, and other support services.

**Why this priority**: Supporting external volunteers is important for sustained disaster response, but it's P3 because it's less urgent than immediate resident safety, volunteer coordination, and supply delivery. External volunteers need this information, but they can initially rely on local coordinators or ask for directions. This becomes more critical as volunteer operations scale over weeks.

**Independent Test**: Can be fully tested by displaying sample facility markers (restrooms, shower facilities, accommodations, meal points, medical tents) with details (operating hours, fees if any, capacity, current occupancy) and verifying that external volunteers can find and navigate to facilities. Delivers value independently for volunteer support.

**Acceptance Scenarios**:

1. **Given** an external volunteer accesses the map, **When** they search for facility types (restrooms, accommodations, showers, meals, water stations, charging stations), **Then** the map displays all matching facilities with icons indicating type and current availability status

2. **Given** facility information includes fees and usage rules, **When** a volunteer clicks on a facility marker, **Then** they see details including: address, operating hours, fees (if any), capacity, current occupancy status (空位 - available, 已滿 - full), contact info, special notes (e.g., "女性優先 - women priority", "需預約 - reservation required")

3. **Given** a volunteer needs a specific facility type urgently, **When** they filter the map to show only that facility type (e.g., only restrooms), **Then** the map highlights the nearest facilities and shows distance/travel time from volunteer's current location

4. **Given** facility status changes (full, closed, temporarily unavailable), **When** the volunteer refreshes the map, **Then** updated status information displays, preventing wasted trips to unavailable facilities

5. **Given** multiple facilities of the same type exist, **When** the volunteer views the map, **Then** facilities are ranked or color-coded by: distance, availability, capacity, and suitability (e.g., gender-specific facilities, facilities with accessibility features)

---

### User Story 6 - Transparent Information Display (Priority: P2)

**作為用戶 (As any user)**, I want the interface to display information in a flat, unhidden manner (攤平顯示，不要隱藏資料), so I can quickly understand how to use the map without searching through hidden menus or layers.

**Why this priority**: User experience is critical for rapid adoption during disasters, but it's P2 because it's a cross-cutting UX enhancement rather than core functionality. A poorly designed interface can still deliver value (users will struggle through), but good UX multiplies the effectiveness of all other features. This story affects all previous stories.

**Independent Test**: Can be fully tested through usability testing by timing how long it takes new users (both tech-savvy and non-tech-savvy) to complete core tasks: viewing recovery status, finding a facility, adding a location. Success means users complete tasks without training or help documentation. Delivers value by reducing cognitive load across all features.

**Acceptance Scenarios**:

1. **Given** a new user accesses the map for the first time, **When** they view the interface, **Then** all critical functions are visible without needing to open dropdowns, sidebars, or hidden menus: legend (explaining marker colors/icons), search bar, filter controls, add location button (if authenticated)

2. **Given** the map displays multiple marker types, **When** the user views the map, **Then** a persistent legend is visible showing what each marker color/icon means (不隱藏 - not hidden), eliminating guesswork

3. **Given** multiple layers of information exist (recovery status, cleanup status, facilities, etc.), **When** the user accesses layer controls, **Then** layers are presented as visible checkboxes or toggle buttons (not nested dropdown menus), allowing users to enable/disable layers with one click

4. **Given** marker information includes multiple fields, **When** the user clicks a marker, **Then** the popup/panel shows all key information upfront (status, address, contact, hours) without requiring additional clicks to expand sections

5. **Given** the map includes search and filter functions, **When** the user looks for these features, **Then** they are prominently placed (top of screen or persistent sidebar) with clear labels in Chinese and icons, not hidden under hamburger menus or requiring hover states to discover

---

### User Story 7 - Disaster Area Boundary Visualization (Priority: P3)

**作為志工 (As a volunteer)**, I want to see the approximate disaster area boundaries (災區大致的範圍) on the map, so I can plan my trip and understand the scale and location of affected areas before traveling.

**Why this priority**: Understanding disaster scope is important for trip planning, but it's P3 because volunteers will receive this information through other channels (news, coordinator briefings) and can still navigate using the map even without explicit boundaries. This is a helpful enhancement rather than critical functionality.

**Independent Test**: Can be fully tested by displaying a highlighted overlay or boundary polygon showing the disaster-affected area(s) on the map, then verifying that volunteers viewing the map from outside the region can understand: where the disaster zone is, how large it is, and major landmarks/cities within the boundary. Delivers value for pre-trip planning.

**Acceptance Scenarios**:

1. **Given** a disaster area has defined boundaries, **When** a volunteer (especially from outside the region) views the map, **Then** they see a clearly marked boundary overlay (shaded region, colored outline, or polygon) showing the disaster-affected area(s)

2. **Given** the disaster area includes multiple severity zones (severe damage, moderate damage, minor damage), **When** the user views the boundary, **Then** different zones are color-coded or shaded differently with a legend explaining severity levels

3. **Given** a volunteer is planning travel to the disaster area, **When** they view the boundary on the map, **Then** they can see major roads/highways entering the area, nearby cities for staging, and distance from their current location to the disaster zone

4. **Given** the disaster area boundary changes over time (expanding due to secondary effects like floods, or shrinking as areas recover), **When** the user views the map, **Then** the boundary reflects the current situation with a timestamp showing when it was last updated

5. **Given** multiple concurrent disasters exist in different regions, **When** the user views the national/regional map, **Then** each disaster area is marked with distinct boundaries and labels, allowing volunteers to choose which disaster they will support

---

### Edge Cases

- **No GPS/location services available**: User should be able to manually search by address or landmark name to navigate the map
- **Outdated information displayed**: System should show timestamp of last update for each marker/status, and allow users to report suspected outdated data
- **Multiple users editing the same location simultaneously**: System should handle concurrent edits through last-write-wins, conflict detection, or edit queuing to prevent data corruption
- **Map loads with no data/no markers**: Display clear message "目前沒有可用的資料 - No data available currently" rather than blank map, with instructions to check back or contact administrators
- **Mobile device with slow network**: Map should load progressively (base map first, then markers in order of priority), not freeze or crash on slow connections
- **User zoomed out too far**: With expected data volume (~158 markers max), display all markers without spatial clustering. Users can filter by category (toggle marker types on/off) to reduce visual clutter if needed
- **Accessibility for users with disabilities**: Map should support keyboard navigation, screen reader compatibility, and high-contrast modes for visually impaired users
- **Offline usage**: Critical information (last known recovery status, facility locations, disaster boundary) should be cacheable for offline viewing when network is unavailable

---

## Requirements *(mandatory)*

### Functional Requirements

#### Core Map Functionality

- **FR-001**: System MUST display an interactive map of the disaster area with zoom, pan, and search capabilities
- **FR-002**: System MUST support mobile devices (smartphones/tablets) with touch gestures (pinch-zoom, swipe-pan) and responsive layout
- **FR-003**: System MUST display a persistent legend showing all marker types, colors, and status indicators with Chinese labels
- **FR-004**: Map MUST load base layers even with slow network connections (progressive loading: base map → critical markers → additional details)
- **FR-005**: System MUST provide search functionality for addresses, landmarks, and facility names in Traditional Chinese
- **FR-006**: Map MUST display timestamp for last data update (global and per-marker) to help users assess information currency

#### Recovery Status Display (User Story 1)

- **FR-007**: System MUST display recovery status markers for homes, roads, water service, and electricity service with distinct icons
- **FR-008**: Each recovery marker MUST show status: "尚未開始 - not started", "修復中 - in progress", "已完成 - completed", or "暫停 - paused"
- **FR-009**: Recovery markers MUST display detailed information when clicked: estimated completion time, current status, responsible agency/team, access restrictions
- **FR-010**: System MUST show a clear message "資訊尚未更新 - information not yet updated" for areas without recovery data

#### Volunteer Coordination (User Story 2)

- **FR-011**: System MUST display cleanup status for neighborhoods/villages: "已清理 - cleaned", "清理中 - in progress", "尚待志工 - needs volunteers"
- **FR-012**: Cleanup markers MUST show details: number of volunteers assigned, estimated completion time, specific needs (equipment, skills)
- **FR-013**: System MUST allow filtering or sorting cleanup areas by urgency/priority (critical areas highlighted first)
- **FR-014**: System MUST allow authorized users (volunteer coordinators) to update cleanup status with status change logging

#### Delivery Route Planning (User Story 3)

- **FR-015**: System MUST display distinct markers for supply warehouses, stranded residents needing supplies, blocked roads, and roads under repair
- **FR-016**: Road status markers MUST clearly indicate: "道路中斷 - road blocked", "道路搶修中 - under repair", "道路可通行 - passable", with optional notes on vehicle requirements (4WD only, motorcycles only, etc.)
- **FR-017**: System SHOULD allow delivery volunteers to select multiple destinations and suggest an optimal route considering road accessibility and distance (NOTE: Implementation deferred to planning phase - feasibility and complexity to be evaluated. Minimum viable alternative: display all locations on map for manual route planning)
- **FR-018**: If route suggestions are implemented (FR-017), they SHOULD account for vehicle type (motorcycle, car, truck, 4WD) and adjust for vehicle limitations (conditional on FR-017 implementation decision)
- **FR-019**: Delivery volunteers MUST be able to mark locations as "已送達 - delivered" to update supply status

#### Community Data Contribution (User Story 4)

- **FR-020**: System MUST allow authenticated volunteers to add new location markers with: location type, name, description, contact info, status, and optional photos
- **FR-021**: System MUST allow authenticated volunteers to edit/correct existing marker information with a change note explaining the update
- **FR-022**: Newly added or edited markers MUST display on the map within 5 minutes (real-time or near-real-time) for other users to see
- **FR-023**: System MUST support photo uploads (max 5MB per photo) and display photos immediately after upload when users view marker details. Photos do not require pre-moderation. System MUST provide "回報不當照片 - report inappropriate photo" button to allow users to flag problematic content for post-publication review by moderators.
- **FR-024**: System MUST detect conflicting information when multiple users report different data for the same location. The system MUST display the most recent edit by default while preserving all conflicting reports in a viewable history with timestamps, user IDs, and change notes. Users can click "查看衝突記錄 - view conflict history" to see all versions and make informed judgments.

#### Facility Locator (User Story 5)

- **FR-025**: System MUST display facility markers (restrooms, accommodations, showers, meals, water stations, charging stations, medical tents) with type-specific icons
- **FR-026**: Facility markers MUST show details: address, operating hours, fees (if any), capacity, current occupancy status, contact info, special notes
- **FR-027**: System MUST allow users to filter map to show only specific facility types (e.g., show only restrooms). Filter controls MUST use toggle checkboxes to enable/disable marker categories, reducing visual clutter without spatial clustering
- **FR-028**: Facility markers MUST indicate distance and estimated travel time from user's current location (if location services enabled)
- **FR-029**: Facility information MUST include status: "空位 - available", "已滿 - full", "暫停服務 - temporarily closed"

#### User Interface & Experience (User Story 6)

- **FR-030**: All critical functions (legend, search, filters, add location) MUST be visible on the main screen without requiring menu navigation or expansion
- **FR-031**: Map legend MUST be persistently visible (not hidden in dropdown) showing all marker types, colors, and status meanings
- **FR-032**: Layer controls (recovery status, cleanup status, facilities, etc.) MUST be presented as visible toggle buttons or checkboxes, not nested menus
- **FR-033**: Marker detail popups MUST show all key information upfront without requiring additional clicks to expand sections
- **FR-034**: Search and filter controls MUST be prominently placed (top of screen or persistent sidebar) with clear Chinese labels and icons

#### Disaster Boundary Visualization (User Story 7)

- **FR-035**: System MUST display disaster area boundary overlay showing affected region(s) with color-coded severity zones if applicable
- **FR-036**: Disaster boundary MUST include major roads/highways, nearby cities, and landmarks to help volunteers plan travel
- **FR-037**: Disaster boundary MUST show timestamp of last update to indicate information currency
- **FR-038**: System MUST support multiple concurrent disaster boundaries (if multiple disasters are active) with distinct labels and colors

#### Authentication & Permissions

- **FR-039**: System MUST support public read access (anyone can view map and markers) without requiring authentication
- **FR-040**: System MUST require authentication for users who want to add or edit markers (volunteer data contributors). Authentication MUST use LINE-based two-factor authentication (2FA) for volunteer contributors. System MUST maintain a whitelist of approved contributor accounts to prevent unauthorized data manipulation.
- **FR-041**: System MUST distinguish between regular authenticated users (can add/edit markers) and coordinators/admins (can update cleanup status, review flagged conflicts, manage users, manage contributor whitelist)

#### Data Integrity & Quality

- **FR-042**: System MUST log all marker additions, edits, and status updates with timestamp and user ID for audit trail
- **FR-043**: System MUST validate location data (coordinates within Taiwan bounds, required fields completed) before saving markers
- **FR-044**: System MUST prevent duplicate markers for the same location by detecting nearby coordinates (within 50 meters) and prompting user to update existing marker instead
- **FR-045**: System MUST allow users to report suspected outdated or incorrect information with a "回報錯誤 - report error" button on each marker

---

### Key Entities

- **Map Marker**: Represents any point of interest on the map. Attributes include: ID, location (latitude/longitude), type (recovery status, cleanup area, warehouse, facility, stranded resident, road condition), name, description, status, photos, created_by, created_at, updated_at, verification_status

- **Recovery Status**: Represents progress on infrastructure repair. Attributes include: marker_id (references Map Marker), recovery_type (home, road, water, electricity), status (not started, in progress, completed, paused), estimated_completion_date, responsible_agency, access_restrictions, notes

- **Cleanup Area**: Represents neighborhood/village cleanup progress. Attributes include: marker_id, area_name, status (cleaned, in progress, needs volunteers), volunteers_assigned, estimated_completion_date, specific_needs (equipment, skills), priority_level, notes

- **Supply Warehouse**: Represents locations storing disaster relief supplies. Attributes include: marker_id, warehouse_name, inventory_summary (list of available supplies), contact_info, operating_hours, vehicle_access_notes (truck accessible, 4WD required, etc.)

- **Stranded Resident**: Represents individuals/families needing supply delivery. Attributes include: marker_id, number_of_residents, urgency_level, needs_list (food, water, medicine, etc.), contact_info, delivery_status (pending, in progress, delivered), notes

- **Road Condition**: Represents status of roads and transportation routes. Attributes include: marker_id (or line/polygon geometry), road_name, status (blocked, under repair, passable), vehicle_requirements (any, 4WD only, motorcycle only), repair_estimated_completion, alternate_routes, notes

- **Facility**: Represents support facilities for volunteers and residents. Attributes include: marker_id, facility_type (restroom, accommodation, shower, meal point, water station, charging station, medical tent), operating_hours, fees (if any), capacity, current_occupancy_status (available, full, closed), contact_info, special_notes (gender-specific, accessibility features, etc.)

- **Disaster Boundary**: Represents the geographic extent of the disaster area. Attributes include: ID, disaster_name, boundary_geometry (polygon), severity_zones (if applicable, with nested geometries and severity levels), last_updated, notes

- **User**: Represents authenticated users who can contribute data. Attributes include: user_id, name, role (volunteer, coordinator, admin), contact_info, authentication_credentials, registered_at, last_login

- **Edit History**: Represents change log for audit trail. Attributes include: edit_id, marker_id, user_id, action_type (create, update, delete), previous_value (JSON), new_value (JSON), timestamp, change_reason (optional note)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Residents can locate their home on the map and view recovery status within 2 minutes of accessing the platform (90% of users on first attempt without assistance)

- **SC-002**: Volunteer coordinators can identify areas needing volunteers and assign teams within 5 minutes of viewing the map (measured by time from login to team assignment decision)

- **SC-003**: Delivery volunteers can plan a route to 5+ delivery destinations while avoiding blocked roads in under 10 minutes (measured by time from warehouse selection to route confirmation)

- **SC-004**: Data contributors can add or update a location marker (with photo) in under 3 minutes (measured from clicking "add location" to successful submission)

- **SC-005**: External volunteers can find the nearest facility (restroom, accommodation, etc.) within 1 minute of searching (90% success rate on first search attempt)

- **SC-006**: New users (without prior training) can complete core tasks (view status, search location, filter markers) within 5 minutes of first accessing the map (measured through usability testing with representative users)

- **SC-007**: Map loads and displays base layers within 5 seconds on 3G mobile networks (measured at 1 Mbps connection speed)

- **SC-008**: System supports at least 1,000 concurrent users viewing the map without performance degradation (page load time remains under 5 seconds)

- **SC-009**: At least 70% of map markers have been updated within the past 24 hours during active disaster response (indicating information currency)

- **SC-010**: Duplicate or conflicting marker reports are flagged and resolved within 2 hours (90% of conflicts, measured from detection to moderator resolution)

- **SC-011**: User satisfaction rate of 85% or higher for "map helped me accomplish my goal" (measured via post-use survey after disaster response period)

- **SC-012**: Reduction in volunteer coordination time by 40% compared to manual/phone-based coordination (measured by comparing time to assign volunteers before and after platform deployment)

---

## Assumptions

1. **Base Map Availability**: Assumes OpenStreetMap tiles are available or a self-hosted tile server is set up. If external tile services are unavailable, offline cached tiles will be used.

2. **Internet Connectivity**: Assumes most users have at least intermittent mobile data (3G or better) during disaster response. Offline caching will be implemented for critical data to support users in areas with no connectivity.

3. **Device Availability**: Assumes most users have access to smartphones or tablets. Desktop access will also be supported, but mobile-first design is prioritized.

4. **User Authentication**: Assumes a simple username/password authentication system is sufficient for volunteer contributors. More robust authentication (OAuth, SSO) can be added later if integration with existing volunteer management systems is required.

5. **Photo Storage**: Assumes photo storage requirements are manageable (estimated 1,000-5,000 photos during typical disaster response). Cloud storage or local server storage will be used depending on deployment model.

6. **Geocoding Service**: Assumes access to a geocoding API (OpenStreetMap Nominatim or similar) for address search functionality. Fallback to manual coordinate entry if geocoding is unavailable.

7. **Data Moderation**: Assumes volunteer-contributed data is generally trustworthy but may contain errors. Lightweight moderation (flagging conflicts, audit logs) is sufficient; pre-approval moderation is not required due to time-sensitive nature of disaster response.

8. **Disaster Scope**: Assumes platform will be used for localized disasters (city/county level) rather than nationwide disasters. Database and performance are designed for 10,000-100,000 markers maximum.

9. **Language**: Assumes Traditional Chinese (繁體中文) is the primary language for all users. English UI can be added later if international volunteers require it, but initial version is Chinese-only.

10. **Data Update Frequency**: Assumes marker data is updated manually by volunteers and coordinators, not through automated feeds. Real-time automated updates (e.g., from government APIs) can be integrated later if APIs become available.

---

## Out of Scope (for this feature)

The following items are explicitly out of scope for this feature but may be considered for future iterations:

- **Real-time Automated Data Feeds**: Integration with government APIs, IoT sensors, or weather services for automatic status updates (Version 2.0)
- **Mobile Native Apps**: iOS/Android native applications (current version is mobile web only)
- **Navigation Turn-by-Turn Directions**: Detailed step-by-step navigation like Google Maps (current version provides route overview only)
- **User-to-User Messaging**: Direct communication between volunteers or residents through the platform (use external communication tools for now)
- **Inventory Management**: Detailed tracking of supply inventory quantities at warehouses (only summary inventory is shown)
- **Volunteer Scheduling/Shift Management**: Coordinating volunteer work schedules and shifts (coordinators manage this externally)
- **Payment Processing**: Handling fees for accommodations or services (facilities list fees for information only; payment happens offline)
- **Analytics Dashboard**: Reporting and analytics for disaster response metrics (may be added in future version)
- **Multi-Language Support**: Languages other than Traditional Chinese (can be added later if needed)
- **Offline Map Download**: Pre-downloading entire map areas for full offline use (partial caching only in initial version)
