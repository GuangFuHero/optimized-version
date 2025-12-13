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

- Q: What is the policy for handling conflict/edit locking on map markers? → A: Implement configurable edit locking - System should support lockable markers to prevent simultaneous conflicting edits. Lock behavior configurable per deployment. Only backend/admins can view full edit history. Soft-delete approach for marker removal with three visibility levels: (1) backend exists + frontend shows "closed", (2) backend exists + frontend hidden, (3) backend soft-deleted. Permission configuration for deletion/approval workflow.

- Q: For locations with multiple functions (e.g., large hospital with restrooms, kitchen, medical services), how should the system handle marker representation? → A: Multi-function markers with proximity detection - When adding/editing markers, system performs real-time proximity search to detect similar nearby points and prompts user to update existing marker instead of creating duplicate. System uses geo-fencing or coordinate proximity (leveraging Uber H3 library or similar) to identify same location. Multi-function locations represented as single marker with multiple category tags.

- Q: If volunteers upload markers that don't fit existing category tags (e.g., newly opened stores, temporary义廚 mobile kitchens), how should the system handle unknown categories? → A: Whitelist-controlled category creation - Only whitelist users can create new categories. System provides emoji/icon selection for new categories. Non-whitelist users can apply for whitelist access via contact form. System includes prominent "申請白名單 - apply for whitelist" button/page for recruitment and partner onboarding.

- Q: Does the map require built-in navigation/routing functionality? → A: No built-in navigation - Map displays locations only for manual route planning. Users can switch to external apps (Google Maps, etc.) for turn-by-turn navigation. Simplifies implementation while meeting core information display needs.

- Q: For prohibited/restricted areas (禁止進入區域), should they always remain visible regardless of zoom level? → A: Always visible - Prohibited areas must always display prominently at all zoom levels as critical safety information. Not subject to clustering or category filtering that could hide them.

- Q: Should the system provide active push notifications for map updates? → A: No push notifications - System operates as pull-only information display. Users refresh map to get updates. No active notification system required for MVP.

- Q: What UI/UX considerations exist for the numerous configuration toggles discussed? → A: Document all configuration options - System will include many administrative configuration toggles. All options must have default values with comments/suggestions. UI/UX team must design clear admin interface to accommodate multiple toggle switches without overwhelming users.

- Q: The system targets 1,000 concurrent users (SC-008) but assumes 10,000-100,000 markers maximum (Assumption 8). What is the database scalability strategy if actual load exceeds these limits? → A: Manual scaling trigger with single EC2 instance deployment - System will deploy DB + web server on same EC2 instance. When approaching 80% capacity, send alerts to ops team requiring manual intervention to add resources. Optimized for cost control and simplicity during initial deployments.

- Q: LINE 2FA is required for authentication (FR-040), but session management is not specified. How long should authenticated user sessions remain valid? → A: 24-hour sessions with automatic extension on activity - Balance convenience with security during disaster response. Sessions automatically extend on user activity, minimizing re-authentication friction for active volunteers while maintaining reasonable security.

- Q: After a disaster event concludes, how long should the system retain disaster data (markers, edit history, photos) before archival or deletion? → A: 6 months active + move to read-only archive - Support post-disaster analysis and lessons learned while reducing operational cost. After 6 months, disaster data moves to read-only archive accessible for research and future disaster preparedness but no longer editable.

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

### User Story 8 - Resource Location Management (Priority: P2)

**作為資源管理志工 (As a resource management volunteer)**, I want to add, edit, and manage resource location markers (新增、編輯、下架物資站點/設施) on the map including supply warehouses, distribution points, and community kitchens, so that residents and other volunteers can find available resources easily.

**Why this priority**: Resource location management is essential for disaster response logistics, but it's P2 because it builds upon the data contribution framework (User Story 4). It enables systematic resource coordination but requires the base map viewing and contribution systems to be operational first.

**Independent Test**: Can be fully tested by implementing interfaces for authenticated volunteers to create resource location markers with detailed attributes (type, inventory summary, operating hours, contact), edit existing resource locations, and temporarily disable/archive locations that are no longer active. Verification includes checking that changes appear correctly on the map for all users.

**Acceptance Scenarios**:

1. **Given** a volunteer with resource management permissions accesses the map, **When** they click "新增資源點位 - add resource location", **Then** they can place a marker and specify: resource type (warehouse, distribution point, community kitchen, water station), name, inventory summary, operating hours, contact information, vehicle access notes, current status

2. **Given** a resource location needs updates, **When** a volunteer selects the marker and clicks "編輯 - edit", **Then** they can update all fields including inventory status, operating hours changes, or add special notes (e.g., "僅接受大型車輛 - large vehicles only")

3. **Given** a resource location is temporarily closed or relocated, **When** a volunteer marks it as "暫時關閉 - temporarily closed" or "已下架 - archived", **Then** the marker status updates on the map (showing "closed" or becoming hidden based on configuration), and the location is preserved in backend for future reference

4. **Given** a volunteer adds a new resource location, **When** the system detects similar nearby locations (within 50 meters), **Then** the system prompts "附近已有類似站點，是否要更新現有站點？ - Similar location nearby, update existing instead?", preventing duplicates while allowing legitimate nearby locations

5. **Given** multiple resource locations exist in an area, **When** users view the map, **Then** they can filter by resource type (warehouses only, kitchens only, etc.) and see accurate inventory summaries and availability status for each location

---

### User Story 9 - Search Nearby Supply Stations (Priority: P2)

**作為受災居民 (As a disaster-affected resident)**, I want to search for and locate nearby supply stations, distribution points, and resource facilities on the map based on my current location or address, so I can quickly find where to obtain needed supplies and assistance.

**Why this priority**: Helping residents find resources is critical for disaster recovery, but it's P2 because it builds upon existing map search (FR-005) and facility display (User Story 5) capabilities. It becomes valuable once resource locations are populated on the map.

**Independent Test**: Can be fully tested by implementing location-based search that shows nearby supply stations sorted by distance, with filters for resource types (food, water, medical supplies, clothing), and verification that search results are accurate and include relevant details (distance, availability, operating hours).

**Acceptance Scenarios**:

1. **Given** a resident accesses the map with location services enabled, **When** they click "搜尋附近物資站 - search nearby supplies", **Then** the map displays supply stations sorted by distance from their current location, showing distance, resource types available, and current status (open/closed/limited)

2. **Given** a resident searches by address or landmark, **When** they enter "XX路XX號" or "XX學校", **Then** the map centers on that location and displays nearby supply stations within configurable radius (default 5km), with distance calculations from the search point

3. **Given** a resident needs specific resources, **When** they filter by resource type (食物 - food, 飲用水 - drinking water, 醫療物資 - medical supplies, 衣物 - clothing), **Then** the map shows only supply stations that provide those resources, with inventory availability indicators (充足 - sufficient, 有限 - limited, 已缺 - out of stock)

4. **Given** a resident selects a supply station from search results, **When** they view the station details, **Then** they see comprehensive information: exact address, distance and estimated travel time, operating hours, available resources with quantities, contact information, and any special requirements (需證件 - ID required, 限定對象 - restricted eligibility)

5. **Given** supply station status changes (inventory updates, hours change, temporarily closed), **When** a resident performs a search, **Then** the results reflect real-time status updates, preventing wasted trips to unavailable locations

---

### User Story 10 - Map Information Layers (Priority: P2)

**作為地圖使用者 (As a map user)**, I want to toggle between different information layers on the map (災區地圖資訊層) such as recovery status, cleanup progress, resource locations, road conditions, and restricted areas, so I can focus on relevant information for my specific needs without visual clutter.

**Why this priority**: Information layer management is important for usability as the map becomes more complex with multiple data types, but it's P2 because it enhances the existing transparent display design (User Story 6) rather than adding core functionality. It becomes more valuable as the amount of data on the map increases.

**Independent Test**: Can be fully tested by implementing visible layer toggle controls that allow users to enable/disable different information categories, verifying that layer changes update the map immediately without requiring page refresh, and confirming that layer preferences can optionally be saved per user session.

**Acceptance Scenarios**:

1. **Given** a user accesses the map with multiple data types displayed, **When** they view the layer control panel, **Then** they see clearly labeled toggle buttons for each layer: "修復進度 - recovery status", "清理狀況 - cleanup status", "物資站點 - supply locations", "路況資訊 - road conditions", "禁區警示 - restricted areas", "設施站點 - facility locations"

2. **Given** a user wants to focus on specific information, **When** they toggle off certain layers (e.g., disable "facility locations"), **Then** those markers immediately disappear from the map while other layers remain visible, and the legend updates to show only active layers

3. **Given** multiple layers are enabled simultaneously, **When** markers overlap at the same location, **Then** the map implements smart marker clustering or offset positioning to ensure all relevant markers remain clickable, with a marker count indicator for clustered points

4. **Given** a user configures their preferred layer settings, **When** they revisit the map in the same session, **Then** their layer preferences are preserved (using session storage), allowing them to continue working without reconfiguring

5. **Given** certain layers contain critical safety information (prohibited areas - 禁區), **When** a user views the map, **Then** those layers are always enabled by default and prominently displayed with warning colors (red/yellow), though users can still toggle them off with an additional confirmation prompt ("確定要隱藏禁區警示？ - Confirm hiding restricted area warnings?")

---

### User Story 11 - Restricted Area Warnings (Priority: P1)

**作為任何用戶 (As any user - resident, volunteer, or official)**, I want to see clearly marked restricted/prohibited areas (禁區標記與警告) on the map with safety warnings and access restrictions, so I can avoid dangerous zones and understand which areas are off-limits due to structural damage, environmental hazards, or ongoing rescue operations.

**Why this priority**: This is P1 because restricted area information directly impacts user safety. Entering prohibited zones can lead to injuries, fatalities, or interference with rescue operations. This information must be prominently displayed and always visible to prevent accidents.

**Independent Test**: Can be fully tested by adding restricted area polygons to the map with distinct visual styling (red shading, hazard icons, warning borders), verifying that users can click on restricted areas to view detailed warning information, and confirming that these areas remain visible at all zoom levels regardless of layer toggle settings.

**Acceptance Scenarios**:

1. **Given** a user accesses the map, **When** restricted areas exist in the disaster zone, **Then** they are prominently displayed with high-visibility styling: red/orange shading, hazard warning icons (⚠️ 禁止進入), bold borders, and flashing/animated indicators for critical zones

2. **Given** a user clicks on a restricted area, **When** the warning popup appears, **Then** they see detailed information: restriction type (結構不穩 - structural instability, 土石流危險 - landslide risk, 救援作業中 - active rescue operations), severity level (極度危險 - extreme danger, 危險 - dangerous, 謹慎進入 - proceed with caution), effective dates, alternative routes if available, and responsible authority contact information

3. **Given** a user zooms out to view a larger area, **When** the zoom level decreases, **Then** restricted area markers scale appropriately and remain visible at all zoom levels (not subject to clustering), with aggregated restricted zones showing combined area size and total number of restrictions

4. **Given** a user toggles map layers, **When** they attempt to disable the "restricted areas" layer, **Then** the system displays a confirmation dialog ("⚠️ 警告：關閉禁區顯示可能導致安全風險。確定要關閉嗎？ - Warning: Hiding restricted areas may create safety risks. Confirm?"), requiring explicit acknowledgment before hiding

5. **Given** restricted area boundaries change over time, **When** areas become safe or new hazards emerge, **Then** the map updates restricted zones with change notifications ("新增禁區 - new restricted area added", "禁區已解除 - restriction lifted"), and displays the timestamp of the last update prominently

6. **Given** a user navigates near a restricted area boundary, **When** their location marker approaches within 200 meters of a prohibited zone, **Then** the system displays a proximity warning ("⚠️ 您正在接近禁區 - You are approaching a restricted area") with directional indicators and distance information

---

### User Story 12 - Real-time Road Condition Reporting (Priority: P2)

**作為志工或居民 (As a volunteer or resident)**, I want to report and view real-time road condition updates (路況即時回報) including blocked roads, roads under repair, passable routes, and vehicle accessibility requirements, so I can navigate safely and efficiently through the disaster area.

**Why this priority**: Real-time road information is critical for efficient disaster response logistics, but it's P2 because it builds upon the data contribution system (User Story 4) and enhances delivery route planning (User Story 3). It's valuable for coordination but not immediately life-threatening like restricted area warnings (P1).

**Independent Test**: Can be fully tested by implementing a road condition reporting interface where authenticated users can mark road segments with status updates, add photos and notes, and verify that road condition markers/overlays appear correctly on the map with appropriate visual styling and details.

**Acceptance Scenarios**:

1. **Given** a user encounters a road condition issue, **When** they click "回報路況 - report road condition" on the map, **Then** they can select a road segment and specify: condition status (暢通 - clear, 施工中 - under repair, 部分阻塞 - partially blocked, 完全中斷 - completely blocked), vehicle accessibility (所有車輛 - all vehicles, 機車only - motorcycles only, 四驅車only - 4WD only, 禁止通行 - no access), estimated repair time, and optional photo/notes

2. **Given** a road condition report is submitted, **When** the system processes the update, **Then** the road segment's visual styling changes accordingly: green line for clear roads, yellow for partially blocked, orange for under repair, red for completely blocked, with icons indicating vehicle restrictions

3. **Given** multiple users report conditions for the same road segment, **When** reports conflict (one says "clear", another says "blocked"), **Then** the system displays the most recent report prominently while showing a "衝突報告 - conflicting reports" indicator, allowing users to view report history with timestamps and decide which information to trust

4. **Given** a user is planning a route, **When** they view the map with road condition layer enabled, **Then** they can see real-time road status across the entire disaster area, with color-coded road segments and filter options to show only specific conditions (show only blocked roads, show only accessible routes for my vehicle type)

5. **Given** road conditions improve over time, **When** a road is reopened or repairs are completed, **Then** authenticated users can update the status to "已恢復暢通 - reopened", triggering automatic notifications or highlights for users who may have been affected by the previous blockage

6. **Given** a user clicks on a road segment, **When** viewing road condition details, **Then** they see comprehensive information: current status with severity, vehicle restrictions, estimated duration, alternative routes suggested by other users, last update timestamp, and reporter credibility indicator (verified volunteer, government official, community member)

---

### User Story 13 - Delivery Route Display (Priority: P3)

**作為配送志工或協調者 (As a delivery volunteer or coordinator)**, I want to see planned or ongoing delivery routes displayed on the map (物資配送路線規劃展示), so I can understand current delivery operations, avoid duplicate deliveries, and coordinate multiple delivery teams efficiently.

**Why this priority**: Delivery route visualization is helpful for coordination but P3 because it's an enhancement to the manual route planning capabilities already described in User Story 3. The core delivery functionality (viewing locations and planning routes) works without visual route display. This becomes more valuable as delivery operations scale.

**Independent Test**: Can be fully tested by implementing route polyline overlays on the map that show planned delivery paths from warehouses to destination points, with route metadata (assigned volunteer, delivery status, estimated completion time), and verification that multiple concurrent routes can be displayed without visual confusion.

**Acceptance Scenarios**:

1. **Given** a delivery volunteer plans a route, **When** they select a warehouse starting point and multiple delivery destinations, **Then** the system displays the planned route as a colored polyline on the map with waypoint markers showing delivery sequence (numbered 1, 2, 3...), and route summary (total distance, estimated time, number of stops)

2. **Given** multiple delivery teams are active simultaneously, **When** the coordinator views the map, **Then** they can see all active delivery routes color-coded by team/volunteer (Team A = blue, Team B = green, etc.), with filters to show/hide specific teams or route statuses (規劃中 - planning, 進行中 - in progress, 已完成 - completed)

3. **Given** a delivery route encounters a blocked road, **When** the road condition layer shows a blockage along the planned route, **Then** the affected route segment is highlighted with a warning indicator, and the system suggests alternative route segments if available (or indicates "需要重新規劃 - requires replanning")

4. **Given** a delivery is in progress, **When** the volunteer reaches each waypoint, **Then** they can mark it as "已送達 - delivered", and the route display updates to show completed segments (grey), current position (animated marker), and remaining segments (active color), with real-time progress visible to coordinators

5. **Given** a coordinator needs to assign new deliveries, **When** they view the map with route display enabled, **Then** they can identify areas not yet covered by current delivery routes, see which volunteers are near specific supply needs, and avoid assigning duplicate deliveries to the same destination

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
- **FR-017**: Map MUST display all relevant locations (warehouses, stranded residents, blocked roads) for manual route planning by delivery volunteers. Built-in navigation/turn-by-turn routing is explicitly out of scope. Users can switch to external navigation apps (Google Maps, etc.) for detailed route guidance. This simplified approach meets core information display needs while reducing implementation complexity.
- **FR-018**: ~~If route suggestions are implemented (FR-017), they SHOULD account for vehicle type (motorcycle, car, truck, 4WD) and adjust for vehicle limitations (conditional on FR-017 implementation decision)~~ REMOVED - No automated routing functionality per FR-017 clarification.
- **FR-019**: Delivery volunteers MUST be able to mark locations as "已送達 - delivered" to update supply status

#### Community Data Contribution (User Story 4)

- **FR-020**: System MUST allow authenticated volunteers to add new location markers with: location type, name, description, contact info, status, and optional photos
- **FR-021**: System MUST allow authenticated volunteers to edit/correct existing marker information with a change note explaining the update
- **FR-022**: Newly added or edited markers MUST display on the map within 5 minutes (real-time or near-real-time) for other users to see
- **FR-023**: System MUST support photo uploads (max 5MB per photo) and display photos immediately after upload when users view marker details. Photos do not require pre-moderation. System MUST provide "回報不當照片 - report inappropriate photo" button to allow users to flag problematic content for post-publication review by moderators.
- **FR-024**: System MUST detect conflicting information when multiple users report different data for the same location. The system MUST display the most recent edit by default while preserving all conflicting reports in a viewable history with timestamps, user IDs, and change notes. Users can click "查看衝突記錄 - view conflict history" to see all versions and make informed judgments. System MUST support configurable edit locking to prevent simultaneous conflicting edits. Full edit history viewable by backend/admins only.
- **FR-024a**: System MUST implement soft-delete for marker removal with three configurable visibility levels: (1) backend exists + frontend displays "暫時關閉 - temporarily closed" status, (2) backend exists + frontend completely hidden, (3) backend soft-deleted (logically removed but recoverable). Deletion permissions and approval workflow MUST be configurable per deployment.
- **FR-024b**: When adding or editing markers, system MUST perform real-time proximity search (within 50 meters using geo-fencing or coordinate proximity library such as Uber H3) to detect similar nearby points. If nearby markers found, system MUST prompt user with "是否要修改此站點？ - Do you want to update this existing marker?" to prevent duplicates.
- **FR-024c**: System MUST support multi-function markers where a single location provides multiple services (e.g., hospital with restroom, kitchen, medical services). Markers MUST allow multiple category tags instead of forcing separate markers per function.

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
- **FR-038a**: Prohibited/restricted areas (禁止進入區域) MUST always display prominently at all zoom levels as critical safety information. They MUST NOT be subject to marker clustering or category filtering that could hide them from users.

#### Resource Location Management (User Story 8)

- **FR-047**: System MUST allow authenticated volunteers with resource management permissions to add new resource location markers specifying: resource type (warehouse, distribution point, community kitchen, water station), name, inventory summary, operating hours, contact information, vehicle access notes, current status
- **FR-048**: System MUST allow resource managers to edit existing resource locations including updating inventory status, operating hours, contact information, and vehicle access requirements
- **FR-049**: System MUST support resource location lifecycle management with status options: "運作中 - operational", "暫時關閉 - temporarily closed", "已下架 - archived". Archived locations remain in backend but are hidden from public view unless admin/resource manager explicitly requests to view them.
- **FR-050**: When a resource manager adds a new resource location, system MUST perform proximity detection (within 50 meters) to identify similar nearby resource locations and prompt with "附近已有類似站點 - Similar location nearby" to prevent duplicates while allowing legitimate nearby locations
- **FR-051**: System MUST allow users to filter resource locations by type (warehouses, distribution points, kitchens, water stations) and status (operational, temporarily closed) with filter controls matching the transparent UI design (FR-030 to FR-034)

#### Search Nearby Supply Stations (User Story 9)

- **FR-052**: System MUST provide location-based search functionality with "搜尋附近物資站 - search nearby supplies" button that displays supply stations sorted by distance from user's current location (if location services enabled) or from a search address/landmark
- **FR-053**: Supply station search results MUST display: station name, distance from search origin, resource types available, current status (open/closed/limited inventory), operating hours, and estimated travel time
- **FR-054**: System MUST support resource type filtering in search allowing users to filter by specific resources needed: "食物 - food", "飲用水 - drinking water", "醫療物資 - medical supplies", "衣物 - clothing", with results showing only stations providing selected resources
- **FR-055**: System MUST display inventory availability indicators for each resource: "充足 - sufficient", "有限 - limited", "已缺 - out of stock", updated based on resource manager inputs or automated inventory tracking if available
- **FR-056**: Search results MUST include comprehensive supply station details: exact address, distance and estimated travel time, operating hours, available resources with quantities, contact information, special requirements (需證件 - ID required, 限定對象 - restricted eligibility, 需預約 - reservation required)
- **FR-057**: System MUST support configurable search radius (default 5km) that can be adjusted by users or automatically expanded if no results found within initial radius

#### Map Information Layers (User Story 10)

- **FR-058**: System MUST implement layer control panel with clearly labeled toggle buttons for each information layer: "修復進度 - recovery status", "清理狀況 - cleanup status", "物資站點 - supply locations", "路況資訊 - road conditions", "禁區警示 - restricted areas", "設施站點 - facility locations"
- **FR-059**: Layer toggles MUST immediately update map display without page refresh. When a layer is disabled, all markers of that type disappear from map and legend updates to show only active layers.
- **FR-060**: When multiple layers are enabled and markers overlap at the same location, system MUST implement smart marker handling: either marker clustering with count indicator for overlapping points, or marker offset positioning ensuring all markers remain clickable
- **FR-061**: System MUST preserve user's layer preferences for session duration using session storage, automatically restoring selected layers when user navigates away and returns within same session
- **FR-062**: Critical safety layers (禁區警示 - restricted areas) MUST be enabled by default. If user attempts to disable them, system MUST display confirmation dialog: "⚠️ 警告：關閉禁區顯示可能導致安全風險。確定要關閉嗎？ - Warning: Hiding restricted areas may create safety risks. Confirm?" requiring explicit acknowledgment

#### Restricted Area Warnings (User Story 11)

- **FR-063**: System MUST display restricted/prohibited area polygons with high-visibility styling: red/orange shading, hazard warning icons (⚠️ 禁止進入), bold borders, and flashing/animated indicators for critical zones
- **FR-064**: Restricted area markers MUST display detailed information when clicked: restriction type (結構不穩 - structural instability, 土石流危險 - landslide risk, 救援作業中 - active rescue operations), severity level (極度危險 - extreme danger, 危險 - dangerous, 謹慎進入 - proceed with caution), effective dates, alternative routes if available, responsible authority contact information
- **FR-065**: Restricted areas MUST remain visible at all zoom levels without being subject to clustering or category filtering. When zoomed out, aggregated restricted zones MUST show combined area size and total number of restrictions.
- **FR-066**: System MUST display proximity warnings when user's location marker approaches within 200 meters of a restricted area boundary, showing message: "⚠️ 您正在接近禁區 - You are approaching a restricted area" with directional indicators and distance information
- **FR-067**: When restricted area boundaries change (areas become safe or new hazards emerge), system MUST update restricted zones with change notifications: "新增禁區 - new restricted area added" or "禁區已解除 - restriction lifted", displaying timestamp of last update prominently
- **FR-068**: System MUST support multiple concurrent restricted areas with distinct severity levels and visual styling. Critical/extreme danger zones MUST use more prominent visual indicators than lower-severity restricted areas.

#### Real-time Road Condition Reporting (User Story 12)

- **FR-069**: System MUST allow authenticated users to report road conditions by selecting road segments and specifying: condition status (暢通 - clear, 施工中 - under repair, 部分阻塞 - partially blocked, 完全中斷 - completely blocked), vehicle accessibility (所有車輛 - all vehicles, 機車only - motorcycles only, 四驅車only - 4WD only, 禁止通行 - no access), estimated repair time, optional photo and notes
- **FR-070**: Road condition reports MUST update road segment visual styling: green lines for clear roads, yellow for partially blocked, orange for under repair, red for completely blocked, with icons indicating vehicle restrictions
- **FR-071**: When multiple users report conflicting conditions for the same road segment, system MUST display most recent report prominently while showing "衝突報告 - conflicting reports" indicator, allowing users to view report history with timestamps and reporter IDs to make informed judgments
- **FR-072**: System MUST provide road condition layer displaying real-time road status across entire disaster area with color-coded road segments and filter options to show specific conditions (show only blocked roads, show only routes accessible by selected vehicle type)
- **FR-073**: Road condition details MUST include: current status with severity, vehicle restrictions, estimated repair duration, alternative routes suggested by other users, last update timestamp, and reporter credibility indicator (verified volunteer, government official, community member)
- **FR-074**: When roads are reopened or repairs completed, authenticated users MUST be able to update status to "已恢復暢通 - reopened", with system optionally highlighting these updates for users who previously viewed or were affected by the blockage

#### Delivery Route Display (User Story 13)

- **FR-075**: System MUST display planned delivery routes as colored polylines on map showing path from warehouse starting point to multiple delivery destinations, with waypoint markers indicating delivery sequence (numbered 1, 2, 3...) and route summary (total distance, estimated time, number of stops)
- **FR-076**: System MUST support multiple concurrent delivery routes color-coded by team/volunteer (Team A = blue, Team B = green, etc.) with filters to show/hide specific teams or route statuses (規劃中 - planning, 進行中 - in progress, 已完成 - completed)
- **FR-077**: When a delivery route encounters blocked roads (based on road condition layer), system MUST highlight affected route segments with warning indicators and suggest alternative route segments if available, or indicate "需要重新規劃 - requires replanning"
- **FR-078**: During active deliveries, system MUST allow volunteers to mark waypoints as "已送達 - delivered", updating route display to show: completed segments (grey), current volunteer position (animated marker), remaining segments (active color), with real-time progress visible to coordinators
- **FR-079**: Route display MUST help coordinators identify: areas not yet covered by current delivery routes, which volunteers are near specific supply needs, and prevent duplicate delivery assignments to same destination

#### Authentication & Permissions

- **FR-039**: System MUST support public read access (anyone can view map and markers) without requiring authentication
- **FR-040**: System MUST require authentication for users who want to add or edit markers (volunteer data contributors). Authentication MUST use LINE-based two-factor authentication (2FA) for volunteer contributors. System MUST maintain a whitelist of approved contributor accounts to prevent unauthorized data manipulation.
- **FR-040a**: System MUST provide prominent "申請白名單 - apply for whitelist" button/page with contact form where users can apply to become approved contributors. Form MUST collect contact information and purpose for contributing. This serves as recruitment and partner onboarding mechanism.
- **FR-040b**: Authenticated user sessions MUST remain valid for 24 hours with automatic extension on activity. Sessions automatically extend when users perform actions (view markers, add data, navigate map) to minimize re-authentication friction for active volunteers while maintaining reasonable security during disaster response.
- **FR-041**: System MUST distinguish between regular authenticated users (can add/edit markers), whitelist users (can create new marker categories with emoji/icon selection), and coordinators/admins (can update cleanup status, review flagged conflicts, manage users, manage contributor whitelist, configure system-wide permissions)

#### Data Integrity & Quality

- **FR-042**: System MUST log all marker additions, edits, and status updates with timestamp and user ID for audit trail
- **FR-043**: System MUST validate location data (coordinates within Taiwan bounds, required fields completed) before saving markers
- **FR-044**: System MUST prevent duplicate markers for the same location by detecting nearby coordinates (within 50 meters) and prompting user to update existing marker instead
- **FR-045**: System MUST allow users to report suspected outdated or incorrect information with a "回報錯誤 - report error" button on each marker
- **FR-046**: System MUST implement comprehensive administrative configuration interface with default values and documentation for all configurable options including: edit locking behavior, marker deletion visibility levels, approval workflows, whitelist management, category creation permissions, and photo moderation policies. All configuration options MUST include inline help text with recommended settings and trade-off explanations.
- **FR-080**: System MUST retain disaster data (markers, edit history, photos, user contributions) in active database for 6 months after disaster event conclusion. After 6 months, data MUST be moved to read-only archive accessible for research and future disaster preparedness analysis. Archived data remains searchable but not editable. Disaster event conclusion date set by system administrators.

---

### Non-Functional Requirements

#### Performance & Scalability

- **NFR-001**: System MUST be deployed with database and web server on same EC2 instance for initial deployment, optimizing for cost control and operational simplicity
- **NFR-002**: System MUST implement capacity monitoring with alerts triggered at 80% resource utilization (CPU, memory, database connections, storage). Alerts sent to operations team for manual scaling intervention.
- **NFR-003**: System MUST support manual vertical scaling (instance size increase) and horizontal scaling (adding instances with load balancer) as contingency plans when capacity limits approached
- **NFR-004**: System architecture MUST document scaling runbook with step-by-step procedures for capacity expansion during disaster response surge periods

---

### Key Entities

- **Map Marker**: Represents any point of interest on the map. Attributes include: ID, location (latitude/longitude), categories (array supporting multiple tags for multi-function locations), name, description, status, photos, created_by, created_at, updated_at, verification_status, edit_lock (boolean), visibility_level (shown/hidden/soft_deleted), conflict_history (references to conflicting edits)

- **Recovery Status**: Represents progress on infrastructure repair. Attributes include: marker_id (references Map Marker), recovery_type (home, road, water, electricity), status (not started, in progress, completed, paused), estimated_completion_date, responsible_agency, access_restrictions, notes

- **Cleanup Area**: Represents neighborhood/village cleanup progress. Attributes include: marker_id, area_name, status (cleaned, in progress, needs volunteers), volunteers_assigned, estimated_completion_date, specific_needs (equipment, skills), priority_level, notes

- **Supply Warehouse**: Represents locations storing disaster relief supplies. Attributes include: marker_id, warehouse_name, inventory_summary (list of available supplies), contact_info, operating_hours, vehicle_access_notes (truck accessible, 4WD required, etc.)

- **Stranded Resident**: Represents individuals/families needing supply delivery. Attributes include: marker_id, number_of_residents, urgency_level, needs_list (food, water, medicine, etc.), contact_info, delivery_status (pending, in progress, delivered), notes

- **Road Condition**: Represents status of roads and transportation routes. Attributes include: marker_id (or line/polygon geometry), road_name, status (blocked, under repair, passable), vehicle_requirements (any, 4WD only, motorcycle only), repair_estimated_completion, alternate_routes, notes

- **Facility**: Represents support facilities for volunteers and residents. Attributes include: marker_id, facility_type (restroom, accommodation, shower, meal point, water station, charging station, medical tent), operating_hours, fees (if any), capacity, current_occupancy_status (available, full, closed), contact_info, special_notes (gender-specific, accessibility features, etc.)

- **Disaster Boundary**: Represents the geographic extent of the disaster area. Attributes include: ID, disaster_name, boundary_geometry (polygon), severity_zones (if applicable, with nested geometries and severity levels), last_updated, notes

- **User**: Represents authenticated users who can contribute data. Attributes include: user_id, name, role (volunteer, whitelist_user, coordinator, admin), contact_info, authentication_credentials (LINE 2FA tokens), registered_at, last_login, whitelist_status (pending/approved/rejected), whitelist_application_info

- **Marker Category**: Represents system-wide or custom marker categories. Attributes include: category_id, category_name, icon/emoji, color_code, created_by (whitelist user or admin), created_at, system_default (boolean), description

- **Edit History**: Represents change log for audit trail. Attributes include: edit_id, marker_id, user_id, action_type (create, update, delete), previous_value (JSON), new_value (JSON), timestamp, change_reason (optional note)

- **Resource Location**: Represents supply warehouses, distribution points, and community resource facilities. Attributes include: marker_id (references Map Marker), resource_type (warehouse, distribution_point, community_kitchen, water_station), inventory_summary (list of available supplies with quantities), inventory_status (充足-sufficient, 有限-limited, 已缺-out_of_stock), operating_hours, contact_info, vehicle_access_notes (大型車輛-large_vehicles, 機車-motorcycles, 四驅車-4WD), resource_status (運作中-operational, 暫時關閉-temporarily_closed, 已下架-archived), last_inventory_update, special_requirements (需證件-ID_required, 限定對象-restricted_eligibility, 需預約-reservation_required)

- **Restricted Area**: Represents prohibited or dangerous zones on the map. Attributes include: ID, area_geometry (polygon defining boundary), restriction_type (結構不穩-structural_instability, 土石流危險-landslide_risk, 救援作業中-active_rescue, 環境危害-environmental_hazard), severity_level (極度危險-extreme_danger, 危險-dangerous, 謹慎進入-caution), effective_date_start, effective_date_end (if temporary), responsible_authority, contact_info, alternative_routes, last_updated, warning_message, visibility_level (always_visible, warning_before_hiding)

- **Road Condition Report**: Represents real-time user-submitted road status updates. Attributes include: report_id, road_segment_id (or geometry), road_name, condition_status (暢通-clear, 施工中-under_repair, 部分阻塞-partially_blocked, 完全中斷-completely_blocked), vehicle_accessibility (所有車輛-all_vehicles, 機車only-motorcycles_only, 四驅車only-4WD_only, 禁止通行-no_access), estimated_repair_completion, photo, notes, reported_by (user_id), reporter_credibility (verified_volunteer, government_official, community_member), reported_at, last_updated, alternative_routes_suggested, conflict_reports (references to conflicting reports for same segment)

- **Delivery Route**: Represents planned or active delivery paths for supply distribution. Attributes include: route_id, assigned_volunteer (user_id), team_identifier, route_geometry (polyline from warehouse to destinations), warehouse_start (marker_id), delivery_destinations (array of marker_ids with sequence numbers), route_status (規劃中-planning, 進行中-in_progress, 已完成-completed, 需重新規劃-requires_replanning), total_distance, estimated_time, number_of_stops, waypoints (array with sequence, location, status: pending/delivered, delivery_time), current_position (real-time volunteer location if active), route_color_code (for multi-team coordination), blocked_segments (references to blocked road conditions), created_at, updated_at, completion_time

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

8. **Disaster Scope & Deployment**: Assumes platform will be used for localized disasters (city/county level) rather than nationwide disasters. Database and performance are designed for 10,000-100,000 markers maximum with 1,000 concurrent users target. Initial deployment uses single EC2 instance hosting both database and web server for cost optimization and operational simplicity. Manual scaling intervention required when capacity limits approached (80% resource utilization triggers alerts).

9. **Language**: Assumes Traditional Chinese (繁體中文) is the primary language for all users. English UI can be added later if international volunteers require it, but initial version is Chinese-only.

10. **Data Update Frequency**: Assumes marker data is updated manually by volunteers and coordinators, not through automated feeds. Real-time automated updates (e.g., from government APIs) can be integrated later if APIs become available.

---

## Out of Scope (for this feature)

The following items are explicitly out of scope for this feature but may be considered for future iterations:

- **Real-time Automated Data Feeds**: Integration with government APIs, IoT sensors, or weather services for automatic status updates (Version 2.0)
- **Mobile Native Apps**: iOS/Android native applications (current version is mobile web only)
- **Built-in Navigation/Routing**: Any form of automated route planning, turn-by-turn directions, or navigation functionality (current version displays location information only for manual planning; users switch to external apps like Google Maps for actual navigation)
- **Push Notifications**: Active notifications for map updates or alerts (system operates as pull-only; users manually refresh to get updates)
- **User-to-User Messaging**: Direct communication between volunteers or residents through the platform (use external communication tools for now)
- **Inventory Management**: Detailed tracking of supply inventory quantities at warehouses (only summary inventory is shown)
- **Volunteer Scheduling/Shift Management**: Coordinating volunteer work schedules and shifts (coordinators manage this externally)
- **Payment Processing**: Handling fees for accommodations or services (facilities list fees for information only; payment happens offline)
- **Analytics Dashboard**: Reporting and analytics for disaster response metrics (may be added in future version)
- **Multi-Language Support**: Languages other than Traditional Chinese (can be added later if needed)
- **Offline Map Download**: Pre-downloading entire map areas for full offline use (partial caching only in initial version)
