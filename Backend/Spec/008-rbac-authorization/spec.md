# Feature Specification: RBAC Authorization System (權限授權系統)

**Feature Branch**: `008-rbac-authorization`
**Created**: 2026-07-09
**Status**: Implemented (see `Backend/RBAC_V1_DECISIONS.md` ADR-012~050 for decision records)
**Input**: User description: "Capability-based RBAC replacing the legacy Group/Policy engine — who can view, create, edit, delete and review disaster-relief data, plus PII protection"
**Dependencies**: Feature 002 (Interactive Disaster Relief Map), Feature 003 (Request/Task Management), Feature 006 (Backend Administration)

## Overview *(mandatory)*

Every disaster is deployed as its **own project with its own database**; cross-disaster
isolation is a deployment boundary, not an authorization concern. Within one disaster, this
feature decides **who may see, create, edit, delete, and review** each piece of data, and
**who may see requesters' personal contact information (PII)**.

Authorization is built on two orthogonal axes:

- **Functional role** — *what a person may do*: `super_admin`, `data_auditor` (platform-wide),
  `admin`, `member` (within a team). Organisation-agnostic.
- **Organisation (team)** — *whose area a person works in*: a person belongs to at most one team,
  whose `type` is `gov` or `ngo`. Which data a team may act on is decided **geographically** —
  by whether a record's location falls inside a Work Zone polygon assigned to that team.

A record's jurisdiction is therefore **computed from geography**, never stored as an owning-org
tag on the record.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Public read access with PII protection (Priority: P1)

As a member of the public (not logged in), I need to see the disaster map and the help-request
board so that I can understand the situation and offer help, without exposing victims' private
contact details.

**Why this priority**: Transparency during a disaster is core to the platform's value; but a
help request contains a victim's name/phone/email, which must never be harvestable by anonymous
visitors.

**Independent Test**: Query a ticket without an auth token and confirm the ticket is visible but
its contact fields are masked (`王◯◯`, `j***@***.com`, `09*****678`).

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they browse stations, closure areas and help
   requests, **Then** all records are visible (view is public).
2. **Given** an anonymous visitor viewing a help request, **When** they read its contact fields,
   **Then** the name, email and phone are returned **masked**, never in full.
3. **Given** an anonymous visitor, **When** they attempt any create/edit/delete or try to read
   Work Zone boundaries or dynamic-field configuration, **Then** the request is denied (403).

---

### User Story 2 - Citizen submits and manages their own records (Priority: P1)

As a registered resident, I need to create help requests and register resource stations, and
manage the ones I created, so that I can report needs and resources during the disaster.

**Why this priority**: Citizen reporting is the primary source of disaster data; anyone must be
able to contribute, but only to what they themselves created.

**Independent Test**: A logged-in citizen creates a ticket and a station, edits and soft-deletes
their own, and is denied editing/deleting records created by others.

**Acceptance Scenarios**:

1. **Given** any logged-in user, **When** they create a help request or a resource station,
   **Then** it succeeds regardless of their team membership (creation is a pure capability check).
2. **Given** a citizen who created a record, **When** they edit or delete it, **Then** it
   succeeds; delete is a **soft delete** (the record is hidden from active lists but retained).
3. **Given** a citizen, **When** they try to edit or delete a record someone else created,
   **Then** the request is denied.
4. **Given** a citizen viewing their own help request, **When** they read its contact fields,
   **Then** they see the full (unmasked) values; on other people's requests the values are masked.

---

### User Story 3 - Team responders act within their assigned area (Priority: P1)

As a government or NGO coordinator/member, I need to view, edit, assign and review the help
requests and stations located inside my team's assigned area, so that my organisation can run
relief operations in the zone it is responsible for.

**Why this priority**: Disaster response is partitioned geographically; each responding
organisation works the area delegated to it, including citizen-reported records in that area.

**Independent Test**: Assign a Work Zone polygon to a team; confirm the team's members can edit a
ticket whose location is inside the polygon and get a "not found" for one outside it.

**Acceptance Scenarios**:

1. **Given** a team with an assigned Work Zone, **When** a member acts on a record whose location
   falls inside that zone, **Then** it is permitted; **When** the record is outside the zone,
   **Then** it is denied as "not found" (the record's existence is not confirmed across a boundary).
2. **Given** a government team that has delegated a sub-area to an NGO team by assigning that NGO a
   polygon nested inside its own, **When** a record falls inside the nested polygon, **Then** both
   the government and the NGO team can act on it (geographic containment overlaps; nothing is
   transferred).
3. **Given** a team `admin`, **When** they manage their own team's members, **Then** it succeeds
   only for their own team.
4. **Given** a team member (not admin), **When** they attempt to draw or assign Work Zones, **Then**
   the request is denied — only government-side coordinators draw and delegate zones.

---

### User Story 4 - Oversight and full control (Priority: P2)

As a data auditor I need read-only visibility (including PII) across the whole deployment for
quality and accountability; as a super administrator I need unrestricted control including role
assignment.

**Why this priority**: Accountability (audit) and a break-glass administrator are required, but
must be distinct: the auditor must never be able to modify data.

**Independent Test**: A data auditor can read every record and its PII but every write is denied;
a super admin can perform every action and assign roles, and cannot demote the last super admin.

**Acceptance Scenarios**:

1. **Given** a data auditor, **When** they read any record or its contact fields, **Then** it
   succeeds; **When** they attempt any create/edit/delete/review, **Then** it is denied.
2. **Given** a super administrator, **When** they perform any action, **Then** it succeeds.
3. **Given** the only remaining super administrator, **When** an attempt is made to reassign them
   to a non-admin role, **Then** it is refused (no lock-out).

---

### User Story 5 - Review is distinct from edit (Priority: P3)

As a coordinator, verifying/approving a record (marking a help request "human_verified", or
approving a proposed change to a station) is a distinct decision from routine editing, so that
the two can be granted independently.

**Independent Test**: A role holding `ticket.edit` but not `ticket.review` can change a ticket's
title but is denied changing its verification status.

**Acceptance Scenarios**:

1. **Given** a role with edit but not review permission, **When** it edits routine fields, **Then**
   it succeeds; **When** it tries to set the verification status, **Then** it is denied.
2. **Given** a role with review permission, **When** it approves or rejects a proposed change,
   **Then** the decision is applied and recorded.

## Permission Model Summary *(reference)*

- **Operations** (capabilities): `view`, `view_pii`, `make`, `edit`, `delete`, `assign`, `review`
  per module (ticket, station, map/closure, work_zone, dynamic_field, team, user, audit, rbac).
- **Data scope** (per grant): `none` / `own` (creator) / `zone` (inside my team's assigned
  polygons) / `all`. `team` is retained solely for team-member management. There is **no**
  organisation-membership scope (`gov`/`ngo`) — jurisdiction is geographic.
- **Default deny**: anything not explicitly granted is refused; a small public allow-list covers
  read-only browsing (map, station, ticket, announcement view).
- **PII**: masked when the caller's `view_pii` scope does not cover the record (including guests).
- **Deletes**: domain records are soft-deleted (retained, hidden); relationship rows
  (role/zone/task assignments) are hard-deleted and captured by the audit trigger.
- **Error semantics**: missing capability → 403; ownership mismatch → 403; cross-zone/boundary
  mismatch → 404 (do not confirm existence across a boundary).

## Assumptions

- One database per disaster deployment; no multi-tenant partitioning inside a database.
- All mutations are recorded by a database-level, append-only audit trigger (Feature 006), so
  history survives hard deletes of relationship rows.
- Frontend hashes passwords before transmission (PBKDF2); this feature covers authorization, not
  authentication.
