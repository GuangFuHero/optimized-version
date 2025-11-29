# Feature Specification: Backend Administration System (後台管理系統)

**Feature Branch**: `006-backend-administration`
**Created**: 2025-11-29
**Status**: Complete Specification
**Input**: User description: "Feature 006 - Backend Administration System for disaster relief platform"
**Dependencies**: All other features (002-005, 007)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operations Dashboard (Priority: P1)

As a relief coordinator or system administrator, I need a real-time operations dashboard showing key metrics across all platform functions so that I can monitor system health, identify bottlenecks, and make data-driven decisions about resource allocation during disaster response.

**Why this priority**: Without operational visibility, coordinators cannot effectively manage disaster response. The dashboard is the primary tool for understanding system state and making informed decisions. This is the foundation of administrative capability.

**Independent Test**: Can be tested by populating the system with sample data (requests, volunteers, supplies, users) and verifying the dashboard displays accurate real-time metrics with proper visualization (charts, graphs, heatmaps) and allows date range filtering for historical analysis.

**Acceptance Scenarios**:

1. **Given** 50 active requests (20 emergency, 30 general) with varying statuses, **When** coordinator opens the dashboard, **Then** dashboard displays accurate counts for total/pending/in-progress/completed requests, shows requests by category breakdown, displays geographic heatmap of request locations, and highlights emergency requests
2. **Given** dashboard is displaying current day metrics, **When** coordinator selects date range "Last 7 days", **Then** all metrics update to show weekly aggregates including trend lines showing changes over time
3. **Given** coordinator is viewing dashboard, **When** new request is submitted, **Then** dashboard auto-refreshes within 5 minutes showing updated request count and category distribution
4. **Given** dashboard displays multiple metric categories, **When** coordinator clicks "Export to CSV", **Then** system generates CSV file containing all current metrics with timestamp and date range metadata

---

### User Story 2 - Audit Trail Review (Priority: P1)

As a system administrator or auditor, I need comprehensive audit logging with powerful search and filtering capabilities so that I can investigate incidents, ensure accountability, verify compliance, and trace the history of all critical actions in the system.

**Why this priority**: Audit logging is essential for accountability, security, and compliance. Without it, administrators cannot investigate issues, ensure proper system usage, or meet regulatory requirements. This must be in place from day one.

**Independent Test**: Can be tested by performing various system actions (login, create request, modify user, change configuration) and verifying each action is logged with complete metadata (who, what, when, where, why), then using search/filter tools to retrieve specific log entries.

**Acceptance Scenarios**:

1. **Given** admin user "admin@example.com" edits request REQ-20250129-0001 changing priority from 50 to 100, **When** auditor searches audit logs for request REQ-20250129-0001, **Then** log entry displays: timestamp, admin email, IP address, action type "update_request", entity "REQ-20250129-0001", field "priority", old value "50", new value "100", and reason (if provided)
2. **Given** audit logs contain 1000 entries from past 30 days, **When** auditor filters by action_type="permission_change" and date range "Last 7 days", **Then** system displays only permission change actions from past week with all relevant details
3. **Given** auditor viewing filtered log results, **When** auditor clicks "Export Logs", **Then** system generates JSON/CSV file containing filtered logs with all fields for external analysis
4. **Given** audit log entry was created, **When** auditor attempts to modify or delete it, **Then** system prevents modification and displays error "Audit logs are immutable"

---

### User Story 3 - User Role Management (Priority: P2)

As a system administrator, I need granular role-based access control allowing me to assign and revoke user permissions so that I can ensure users only access functions appropriate to their responsibilities while maintaining operational security.

**Why this priority**: Access control is critical for security but can be implemented after basic admin functions. Initial system can function with simple admin/non-admin distinction, with granular RBAC added as system matures.

**Independent Test**: Can be tested by creating users with different roles, verifying each role can only access permitted functions, assigning new roles and confirming immediate permission changes, and checking audit log for permission change history.

**Acceptance Scenarios**:

1. **Given** user account "volunteer@example.com" exists with role "Volunteer", **When** admin assigns role "Coordinator" to this user, **Then** permission change takes effect immediately, user can now access coordinator dashboard and request assignment functions, and audit log records: admin_id, target_user "volunteer@example.com", old_role "Volunteer", new_role "Coordinator", timestamp
2. **Given** custom role "Supply Manager" exists with permissions [view_supplies, edit_supplies, view_donations], **When** admin assigns this role to user "supplies@example.com", **Then** user sees only supply management interface without access to request management or volunteer dispatch
3. **Given** user has role "Coordinator" with permissions to manage requests, **When** admin revokes coordinator role and assigns "Volunteer", **Then** user immediately loses access to coordinator functions and UI reflects volunteer-level permissions only
4. **Given** admin viewing user "user@example.com", **When** admin attempts to remove all roles leaving user with no permissions, **Then** system displays warning "User must have at least one role" and prevents role removal

---

### User Story 4 - Request Moderation (Priority: P2)

As a backend administrator, I need tools to review, edit, merge, and remove requests so that I can maintain data quality, prevent abuse, handle duplicates, and ensure the request database remains trustworthy and operationally effective.

**Why this priority**: Quality control is important but not critical for initial launch. System can operate with coordinator-level request management initially, with admin moderation tools added as data quality issues emerge.

**Independent Test**: Can be tested by creating duplicate requests and spam entries, then using admin tools to merge duplicates into single request, soft-delete spam while preserving data, and verify all actions are logged in audit trail.

**Acceptance Scenarios**:

1. **Given** two requests REQ-001 and REQ-002 describe same incident at same location, **When** admin selects both and clicks "Merge Requests" choosing REQ-001 as primary, **Then** system combines notes and status history into REQ-001, marks REQ-002 as merged with reference to REQ-001, preserves both in database, and logs merge action with admin ID and reason
2. **Given** request REQ-003 contains spam content, **When** admin marks it as spam and soft-deletes with reason "promotional content", **Then** request is hidden from public views but remains in database with deleted_at timestamp, deleted_by admin_id, deletion_reason, and can be viewed in admin-only "deleted requests" list
3. **Given** request REQ-004 has incorrect location coordinates, **When** admin edits location from (25.000, 121.000) to (25.033, 121.565) with edit reason "corrected address", **Then** location updates immediately on map, change is logged to audit trail with old/new values, and request shows "edited by admin" indicator
4. **Given** admin identifies suspicious pattern of requests from same IP, **When** admin flags multiple requests for investigation, **Then** flagged requests appear in "flagged items" queue with flag reason, admin can add investigation notes, and coordinator receives notification of flagged items

---

### User Story 5 - System Configuration (Priority: P2)

As a system administrator, I need centralized configuration management for all system behaviors so that I can adapt the platform to specific disaster response contexts, adjust operational parameters, and optimize system performance without requiring code changes.

**Why this priority**: Configuration flexibility is valuable but not essential for MVP. System can launch with reasonable defaults, with configuration UI added as operational needs become clear.

**Independent Test**: Can be tested by changing various configuration settings (map center, auto-assignment enabled, alert thresholds), verifying changes take effect immediately, confirming configuration history is logged, and testing configuration rollback functionality.

**Acceptance Scenarios**:

1. **Given** system configuration for map shows default center (25.033, 121.565), **When** admin changes map center to (23.695, 120.961) for different disaster location, **Then** all users see map centered on new coordinates on next page load, configuration change is logged, and admin can view configuration history
2. **Given** request auto-assignment is currently disabled, **When** admin enables auto-assignment with setting "auto_assign_enabled: true", **Then** system begins suggesting volunteer assignments for new requests automatically, configuration change takes effect immediately without restart
3. **Given** supply inventory alert threshold is set to 10 units, **When** admin changes threshold to 20 units with note "increased for winter storm", **Then** system generates low-stock alerts when inventory falls below 20 instead of 10, and configuration audit log records old value, new value, admin ID, timestamp, and reason
4. **Given** critical configuration "authentication_required" is currently "true", **When** admin attempts to change to "false", **Then** system displays confirmation dialog "Warning: This will allow unauthenticated access. Are you sure?" and requires admin to confirm before saving

---

### User Story 6 - Performance Monitoring (Priority: P3)

As a system administrator, I need system performance metrics showing server health, database performance, and API response times so that I can identify performance bottlenecks, plan capacity, and ensure the platform remains responsive under load.

**Why this priority**: Performance monitoring is useful for operational maturity but not essential for initial launch. Basic monitoring can be handled through server logs initially, with dedicated performance dashboard added later.

**Independent Test**: Can be tested by generating simulated load on the system, then verifying performance dashboard displays accurate metrics for response times, error rates, resource utilization, and historical trends.

**Acceptance Scenarios**:

1. **Given** system is under normal load, **When** admin opens performance dashboard, **Then** dashboard displays: average API response time (p50, p95, p99), requests per minute, error rate percentage, active sessions count, database query time, and memory/CPU utilization
2. **Given** performance metrics show p95 response time spike from 200ms to 2000ms, **When** admin views time-series graph, **Then** spike is visually highlighted with timestamp, admin can drill down to see which endpoints were affected, and can correlate with audit log for concurrent actions
3. **Given** dashboard displays real-time metrics, **When** admin enables alert threshold for error_rate > 5%, **Then** system sends notification (email or in-app) when error rate exceeds threshold for more than 5 consecutive minutes
4. **Given** admin reviewing performance history, **When** admin selects date range "Last 30 days", **Then** system displays trend lines showing daily average response times, identifies peak usage periods, and suggests capacity planning recommendations

---

### Edge Cases

- **Concurrent configuration changes**: What happens when two admins modify the same configuration setting simultaneously?
  - System should use optimistic locking: last write wins, but both changes are logged with conflict indicator

- **Audit log storage limits**: How does system handle audit logs when storage approaches capacity?
  - System should implement log rotation: archive logs older than retention policy to cold storage, maintain searchable index for recent logs

- **Dashboard metric calculation lag**: What happens when real-time metrics show stale data during high load?
  - Dashboard should display "last updated" timestamp for each metric, warn users if data is >10 minutes old, and allow manual refresh

- **Permission escalation attempts**: How does system prevent users from granting themselves admin permissions?
  - System should prevent users from modifying their own permissions, require separate admin to make role changes, and log all permission change attempts including denied ones

- **Configuration rollback failures**: What happens when admin tries to rollback to configuration that's incompatible with current system state?
  - System should validate configuration before applying rollback, display specific incompatibility errors, and prevent rollback if validation fails

- **Audit log tampering**: How does system ensure audit logs cannot be modified after creation?
  - Implement write-only audit log with cryptographic checksums, detect tampering attempts, and alert security team

- **Role hierarchy violations**: What happens when admin tries to create circular role dependencies or invalid permission combinations?
  - System should validate role configurations, prevent circular dependencies, enforce hierarchy constraints, and display clear error messages

- **Dashboard export data sensitivity**: How does system handle exporting dashboard data containing sensitive information?
  - Export should respect user's permission level, redact sensitive fields based on role, require additional confirmation for full data export, and log all export actions

## Requirements *(mandatory)*

### Functional Requirements

**Dashboard & Metrics**:
- **FR-001**: System MUST display real-time operations dashboard with auto-refresh every 5 minutes (configurable)
- **FR-002**: Dashboard MUST show request metrics: total count, status breakdown (pending/assigned/in-progress/completed), average resolution time, requests by category, requests by urgency, geographic heatmap
- **FR-003**: Dashboard MUST show volunteer metrics: total active volunteers, status breakdown (available/busy), tasks completed (today/week/total), average rating, utilization rate
- **FR-004**: Dashboard MUST show supply metrics: total inventory value, supplies by category, low-stock alerts, donations received, distributions completed
- **FR-005**: Dashboard MUST show system metrics: total users, new registrations (today/week), map views, peak concurrent users, system uptime percentage
- **FR-006**: Dashboard MUST support date range selection for historical analysis with presets: today, last 7 days, last 30 days, custom range
- **FR-007**: Dashboard MUST allow metric export to CSV/Excel format with filename including metric type and date range
- **FR-008**: Dashboard visualizations MUST include: line graphs (trends), bar charts (comparisons), pie charts (proportions), geographic heatmaps (spatial distribution)

**Audit Logging**:
- **FR-009**: System MUST log all significant actions including: user authentication, request CRUD operations, volunteer assignments, supply transactions, admin actions, permission changes, configuration changes
- **FR-010**: Each audit log entry MUST include: timestamp (ISO 8601), user_id, IP address, user_agent, action_type, entity_type, entity_id, previous_value (JSON), new_value (JSON), result_status (success/failure/error), error_message (if applicable)
- **FR-011**: Audit logs MUST be immutable (append-only) and tamper-evident using cryptographic checksums
- **FR-012**: Audit log interface MUST support filtering by: date range, user, action type, entity type, IP address, result status
- **FR-013**: Audit log interface MUST support full-text search across all log fields
- **FR-014**: Audit logs MUST be exportable to JSON/CSV format for external analysis or archival
- **FR-015**: System MUST enforce configurable log retention policy: operational logs retained for 90 days minimum, critical audit events retained permanently
- **FR-016**: System MUST alert administrators if audit log integrity check fails or tampering is detected

**Role-Based Access Control**:
- **FR-017**: System MUST support role hierarchy: Super Admin > Admin > Coordinator > Resource Manager > Volunteer > Whitelist User > Authenticated User > Public
- **FR-018**: System MUST enforce granular permissions for view/create/edit/delete operations on each entity type (requests, users, supplies, markers, content)
- **FR-019**: System MUST allow admins to assign/revoke roles with changes taking effect immediately (no session restart required)
- **FR-020**: System MUST allow creation of custom roles with specific permission combinations
- **FR-021**: System MUST prevent users from modifying their own permissions or roles
- **FR-022**: System MUST log all permission changes including: admin_id, target_user_id, previous_role, new_role, timestamp, reason
- **FR-023**: System UI MUST adapt to user role showing only functions user has permission to access
- **FR-024**: System MUST prevent orphaned users by requiring at least one role assignment per user

**Request Moderation**:
- **FR-025**: Admin interface MUST allow viewing all requests regardless of status with advanced filtering
- **FR-026**: Admins MUST be able to edit any request field with all changes logged to audit trail
- **FR-027**: System MUST support soft-delete operation marking requests as deleted while preserving in database
- **FR-028**: System MUST allow admins to merge duplicate requests by selecting primary request and one or more duplicates
- **FR-029**: When merging requests, system MUST combine: notes, status history, attachments, references into primary request
- **FR-030**: Merged duplicate requests MUST be marked with "merged_into" field pointing to primary request_id
- **FR-031**: System MUST allow admins to flag suspicious requests for investigation with flag reason and investigation notes
- **FR-032**: Flagged requests MUST appear in dedicated "flagged items" queue visible to coordinators and admins

**System Configuration**:
- **FR-033**: System MUST provide configuration interface organized by category: map, request, volunteer, supply, authentication, notification
- **FR-034**: Each configuration option MUST include: current value, default value, valid values/ranges, description, help text, requires_restart indicator
- **FR-035**: Configuration changes MUST be logged to audit trail with old value, new value, admin_id, timestamp, reason
- **FR-036**: System MUST support configuration rollback to previous values with validation before applying
- **FR-037**: Critical configuration changes MUST require confirmation dialog before saving
- **FR-038**: Map settings MUST include: default zoom level, center coordinates, tile server URL, clustering thresholds, layer visibility defaults
- **FR-039**: Request settings MUST include: auto-assignment enabled (boolean), priority calculation weights, required fields, status transition rules
- **FR-040**: Volunteer settings MUST include: verification workflow (automatic/manual), skill taxonomy, rating system enabled, availability tracking granularity
- **FR-041**: Supply settings MUST include: inventory alert thresholds, donation receipt templates, delivery route optimization parameters
- **FR-042**: Authentication settings MUST include: LINE 2FA required (boolean), session timeout duration, whitelist approval workflow

**Performance Monitoring**:
- **FR-043**: System MUST collect performance metrics including: API response times (p50, p95, p99), requests per minute, error rate, active sessions, database query time, resource utilization
- **FR-044**: Performance dashboard MUST display real-time metrics with time-series graphs showing trends
- **FR-045**: System MUST support configurable alert thresholds for critical metrics (error rate, response time, resource utilization)
- **FR-046**: When alert threshold is exceeded for >5 minutes, system MUST notify administrators via configured channel
- **FR-047**: Performance metrics MUST be retained for minimum 30 days for trend analysis and capacity planning

**User Management**:
- **FR-048**: Admin interface MUST allow searching users by: email, name, role, registration date, last login
- **FR-049**: Admins MUST be able to view user activity history including: login times, actions performed, resources accessed
- **FR-050**: Admins MUST be able to suspend/unsuspend user accounts with suspension reason logged
- **FR-051**: Suspended users MUST be prevented from logging in and receive clear suspension message
- **FR-052**: Admins MUST be able to reset user passwords with password reset logged to audit trail

**Data Export & Reporting**:
- **FR-053**: System MUST allow exporting data with formats: CSV, Excel (XLSX), JSON
- **FR-054**: Exports MUST respect user's permission level, redacting sensitive fields based on role
- **FR-055**: All export operations MUST be logged to audit trail with: user_id, export_type, date_range, record_count
- **FR-056**: Large exports (>10,000 records) MUST be processed asynchronously with email notification when complete

### Key Entities

- **AdminUser**: Extends User entity with administrative attributes
  - Attributes: admin_id, user_id, admin_role (super_admin/admin), granted_permissions (array), assigned_responsibilities, last_admin_action_at, total_admin_actions_count
  - Relationships: belongs_to User, has_many AuditLogEntries, has_many ConfigurationChanges

- **AuditLogEntry**: Immutable record of system actions
  - Attributes: log_id, timestamp, user_id, ip_address, user_agent, action_type, entity_type, entity_id, previous_value (JSON), new_value (JSON), result_status (success/failure/error), error_message, session_id, request_trace_id, checksum (for tamper detection)
  - Relationships: belongs_to User, indexed_by timestamp, action_type, entity_type for fast queries

- **SystemConfiguration**: Stores configurable system settings
  - Attributes: config_id, config_category (map/request/volunteer/supply/auth/notification), config_key, config_value (JSON for complex values), default_value, valid_values (enum or range), description, help_text, requires_restart (boolean), last_modified_by, last_modified_at, version
  - Relationships: belongs_to AdminUser (last modifier), has_many ConfigurationHistory (for rollback)

- **Role**: Defines user permission sets
  - Attributes: role_id, role_name, role_type (system_defined/custom), permissions (JSON array), role_hierarchy_level (integer for hierarchy enforcement), description, is_active
  - Relationships: many_to_many with Users via UserRoles, has_many PermissionAuditLogs

- **DashboardWidget**: Configurable dashboard components
  - Attributes: widget_id, widget_type (metric_card/line_chart/bar_chart/pie_chart/heatmap/table), data_source_query, refresh_interval_seconds, display_order, visible_to_roles (array), widget_settings (JSON), cache_duration
  - Relationships: visible_to_many Roles

- **PerformanceMetric**: System performance measurements
  - Attributes: metric_id, metric_name, metric_value, metric_unit, timestamp, aggregation_period (minute/hour/day), percentile (for latency metrics), metadata (JSON)
  - Relationships: indexed_by timestamp, metric_name for time-series queries

- **FlaggedItem**: Items flagged for admin review
  - Attributes: flag_id, entity_type, entity_id, flagged_by_user_id, flag_reason, flag_category (spam/suspicious/duplicate/other), investigation_notes, investigation_status (pending/under_review/resolved), resolved_by_admin_id, resolved_at
  - Relationships: belongs_to User (flagger), belongs_to AdminUser (resolver)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can access complete operations dashboard within 3 seconds of login (measured by time from authentication to dashboard fully rendered)
- **SC-002**: All critical system actions are logged to audit trail within 1 second of occurrence (measured by timestamp delta between action and log entry)
- **SC-003**: Administrators can search and filter audit logs across 100,000 entries with results appearing in under 2 seconds (measured by query response time)
- **SC-004**: Permission changes take effect immediately with users seeing updated UI within 5 seconds of role assignment (measured by time from permission change to UI update)
- **SC-005**: Dashboard displays accurate real-time metrics with less than 5 minutes staleness during normal operation (measured by "last updated" timestamp on dashboard)
- **SC-006**: Configuration changes are applied without system restart for 90% of settings (measured by percentage of configs not requiring restart)
- **SC-007**: System detects and alerts on audit log tampering within 1 minute of detection (measured by time from tampering attempt to admin notification)
- **SC-008**: Dashboard data export for date ranges up to 30 days completes within 10 seconds (measured by time from export request to download ready)
- **SC-009**: Administrators can merge duplicate requests in under 1 minute including finding duplicates and confirming merge (measured by time from search to merge completion)
- **SC-010**: System maintains 99.9% audit log reliability with zero critical action failures to log (measured by action count vs log entry count)

## Assumptions *(mandatory)*

### Technical Assumptions

1. **Database performance**: Assumes PostgreSQL with proper indexing can handle audit log queries efficiently. Query optimization may be needed for >1M log entries.

2. **Admin user volume**: Assumes maximum 20 concurrent administrators accessing system. Performance tuning needed if admin count significantly higher.

3. **Dashboard refresh**: Assumes WebSocket or Server-Sent Events (SSE) for real-time dashboard updates. Polling is acceptable fallback with configurable interval.

4. **Configuration storage**: Assumes configuration changes are persisted to database and cached in memory for fast access. Cache invalidation handled via pub/sub.

5. **Audit log retention**: Assumes sufficient storage for 90 days operational logs plus permanent critical event storage. Approximately 10GB per month for typical disaster event.

6. **Time synchronization**: Assumes all servers have synchronized clocks (NTP) for accurate audit log timestamps and metric correlation.

### Business Assumptions

1. **Admin access patterns**: Assumes admins access dashboard primarily during business hours with peak usage during first 48 hours of disaster event.

2. **Audit requirements**: Assumes organization has regulatory requirement to maintain tamper-evident audit trail for compliance purposes.

3. **Role hierarchy**: Assumes organization has clear role definitions aligned with operational responsibilities in disaster response.

4. **Configuration frequency**: Assumes configuration changes are infrequent (weekly at most) after initial setup. Daily configuration changes may indicate operational issues.

5. **Performance monitoring**: Assumes basic performance monitoring sufficient initially. Advanced APM (Application Performance Monitoring) tools can be integrated later if needed.

6. **Data export usage**: Assumes data exports used primarily for reporting and analysis, not for regular operational workflows.

### Operational Assumptions

1. **Admin training**: Assumes administrators receive comprehensive training on dashboard interpretation, audit log analysis, and configuration management before disaster event.

2. **Backup and recovery**: Assumes organization has database backup strategy ensuring audit logs and configurations can be recovered in disaster scenarios.

3. **Security monitoring**: Assumes security team monitors audit logs for suspicious patterns, unusual permission changes, and potential security incidents.

4. **Capacity planning**: Assumes infrastructure team reviews performance metrics monthly to plan capacity upgrades before performance degradation.

5. **Incident response**: Assumes organization has incident response procedures for handling flagged items, suspicious activity alerts, and system performance issues.

6. **Access control governance**: Assumes organization has governance process for requesting, approving, and revoking admin access with documented justification.

## Out of Scope *(mandatory)*

The following items are explicitly excluded from Feature 006:

1. **Advanced analytics and machine learning**: Predictive analytics, anomaly detection using ML, or intelligent alerting. Basic threshold-based alerts only.

2. **External system integrations**: APIs for government reporting systems, third-party audit tools, or external compliance platforms. May be added in future releases.

3. **Real-time alerting infrastructure**: SMS alerts, push notifications, or email alerts for system events. Notification hooks provided but delivery mechanism is separate concern.

4. **Financial reporting and accounting**: Detailed financial reports, budget tracking, expense management, or accounting integrations beyond basic donation tracking.

5. **Advanced performance troubleshooting**: Distributed tracing, flame graphs, query profiling, or performance optimization recommendations. Basic metrics only.

6. **Automated incident response**: Automatic remediation of system issues, self-healing capabilities, or intelligent problem diagnosis. Manual investigation and resolution only.

7. **Multi-tenancy administration**: Managing multiple disaster events or organizations in single system instance. Each deployment serves single organization/event.

8. **Mobile admin application**: Native mobile apps for administrative functions. Responsive web interface is sufficient for MVP.

9. **Advanced RBAC features**: Time-based permissions, location-based access control, context-aware permissions, or dynamic role assignment. Static role hierarchy only.

10. **Custom dashboard builder**: User-configurable dashboard layouts, drag-and-drop widgets, or personalized metric views. Fixed dashboard layout with standard widgets.

11. **Automated compliance reporting**: Auto-generated compliance reports, regulatory submission templates, or audit evidence packaging. Manual export and report generation only.

12. **Advanced log analysis**: Log aggregation across multiple servers, log correlation, or intelligent log mining. Single-server logging with basic search/filter only.

## Integration Points

### Feature 002 (Interactive Disaster Relief Map)
- Admin dashboard displays map usage statistics: view count, marker interactions, popular map areas
- Admin can moderate map markers: approve, reject, edit, delete user-submitted markers
- Admin can manage marker categories: create, edit, deprecate categories system-wide
- Admin can configure map settings: default center, zoom levels, tile server, clustering parameters
- Configuration changes to map settings take effect for all users immediately

### Feature 003 (Request Management System)
- Admin can access all requests regardless of status for quality control
- Admin can edit request details: priority, category, location, description, status
- Admin can merge duplicate requests, preserving complete history
- Admin can soft-delete spam or invalid requests
- Dashboard displays request metrics: total, by status, by category, by urgency, geographic distribution
- Audit log records all request CRUD operations with complete change history
- Configuration controls request workflow: auto-assignment, priority weights, required fields

### Feature 004 (Volunteer Dispatch System)
- Admin manages volunteer accounts: approve verifications, suspend accounts, reset passwords
- Admin can view volunteer activity history and performance metrics
- Dashboard displays volunteer metrics: total active, availability status, task completion, ratings
- Admin configures volunteer settings: verification workflow, skill taxonomy, rating system
- Audit log records volunteer assignments, status changes, and verification decisions

### Feature 005 (Supply Management System)
- Admin reviews supply transactions: donations, distributions, inventory adjustments
- Admin monitors inventory levels and low-stock alerts across all categories
- Admin manages donor records: contact info, donation history, receipts
- Dashboard displays supply metrics: inventory value, donations received, distributions completed
- Admin configures supply settings: alert thresholds, receipt templates, optimization parameters
- Audit log records all supply transactions with complete details

### Feature 007 (Information Publishing System)
- Admin creates, edits, publishes information content: announcements, news, updates
- Admin manages publication workflow: draft, review, publish, archive
- Dashboard displays content engagement metrics: views, shares, user feedback
- Admin configures publishing settings: approval workflow, auto-archive rules, content categories
- Audit log records all content publication actions

## Dependencies

### Prerequisites
- **Authentication system**: LINE 2FA integration for admin login with multi-factor authentication required
- **Database infrastructure**: PostgreSQL with proper indexing for audit log queries and metric aggregation
- **All other features**: Admin system touches all features, requiring their core entities to exist

### External Systems
- **Email service** (future): When email notifications are implemented for alerts and exports
- **Monitoring tools** (optional): Integration with external APM tools like Datadog, New Relic for advanced monitoring
- **Backup system**: Database backup and restore capabilities for audit log preservation

### Data Dependencies
- **User database**: Requires user accounts from authentication system to assign roles and track admin actions
- **Entity data**: Requires requests, volunteers, supplies, content from respective features to display metrics and perform moderation
- **Time-series data**: Requires historical data to display trends and perform meaningful analytics
