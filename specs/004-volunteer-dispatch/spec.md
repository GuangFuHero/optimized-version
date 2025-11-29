# Feature Specification: Volunteer Dispatch System (志工调度系统)

**Feature Branch**: `004-volunteer-dispatch`
**Created**: 2025-11-23
**Status**: Draft - Outline Only
**Dependencies**: Feature 002 (Interactive Disaster Relief Map), Feature 003 (Request Management)

---

## Overview

This feature provides a comprehensive volunteer management system covering registration, skill matching, task assignment, work tracking, and performance evaluation. It enables relief organizations to efficiently mobilize, coordinate, and retain volunteer workforce during disaster response operations.

**Core Value**: Transforms volunteer coordination from manual phone/spreadsheet tracking into a systematic digital platform that maximizes volunteer utilization, matches skills to needs, and provides accountability through work history tracking.

---

## User Stories Included

This feature specification will include the following user stories extracted from the comprehensive requirements:

### 1. **志工注册、审核、认证** - Volunteer Registration & Verification
**Priority**: P1
**As a** potential volunteer, **I want to** register in the system with my information and skills, undergo verification, and receive certification, **so that** I can be assigned tasks and contribute to disaster relief efforts.

**Acceptance Criteria**:
- Volunteers can register with: name, contact info, skills/expertise, availability, preferred work areas, emergency contact
- Verification process includes: identity confirmation, skill validation (if applicable), background check (for sensitive tasks)
- Verified volunteers receive certification status and credentials
- Integration with LINE authentication (from Feature 002 whitelist system)
- Rejected applications include reason and reapplication instructions

---

### 2. **志工技能标签与匹配** - Volunteer Skills & Matching
**Priority**: P2
**As a** relief coordinator, **I want** the system to match volunteers to requests based on skills, location, and availability, **so that** tasks are assigned to the most qualified available volunteers.

**Acceptance Criteria**:
- Volunteers select from predefined skill tags: 醫療-medical, 搬運-heavy_lifting, 駕駛-driving, 烹飪-cooking, 翻譯-translation, 建築-construction, 心理輔導-counseling, etc.
- System calculates match scores based on: skill relevance, proximity to task location, availability windows, past performance ratings
- Coordinators see top volunteer matches for each request with match scores and explanations
- Volunteers can add certifications/credentials to validate specialized skills

---

### 3. **志工接单、开始工作、完成任务** - Volunteer Task Workflow
**Priority**: P1
**As a** volunteer, **I want to** accept assigned tasks, mark when I start work, and mark tasks as completed with notes, **so that** coordinators can track progress and residents know help is on the way.

**Acceptance Criteria**:
- Volunteers can view assigned tasks with details: location, task type, requester info, estimated time, special instructions
- Volunteers accept or decline tasks (with reason for decline)
- Upon acceptance, volunteer marks task as "開始工作 - started" with timestamp
- Upon completion, volunteer marks "已完成 - completed" with completion notes and optional photo
- Task status updates reflect on map (Feature 002) and in request system (Feature 003)

---

### 4. **志工任务历史记录** - Volunteer Task History
**Priority**: P2
**As a** volunteer or coordinator, **I want to** view complete history of tasks a volunteer has completed, **so that** we can recognize contributions, track experience, and make informed assignment decisions.

**Acceptance Criteria**:
- System maintains complete task history for each volunteer including: task details, completion time, performance notes
- Volunteers can view their own task history with completion dates and requester feedback
- Coordinators can view any volunteer's history when making assignment decisions
- Task history influences volunteer matching scores (experienced volunteers prioritized for complex tasks)

---

### 5. **志工排班或可用时间** - Volunteer Scheduling & Availability
**Priority**: P2
**As a** volunteer, **I want to** set my availability schedule (which days/hours I can work), **so that** I only receive task assignments during times when I'm available to help.

**Acceptance Criteria**:
- Volunteers can set recurring availability patterns: daily schedules, specific date ranges, blackout periods
- Volunteers can mark themselves as temporarily unavailable or on break
- Assignment suggestions only include volunteers who are currently available based on their schedules
- Volunteers receive warnings before accepting tasks outside their availability windows

---

### 6. **志工等级或评价系统** - Volunteer Rating & Leveling
**Priority**: P3
**As a** relief organization, **I want** to track volunteer performance through ratings and experience levels, **so that** we can recognize top contributors, identify training needs, and prioritize reliable volunteers for critical tasks.

**Acceptance Criteria**:
- Coordinators (and optionally requesters) can rate volunteer performance on completed tasks: 1-5 stars with optional comments
- System calculates volunteer levels based on: number of completed tasks, average ratings, task complexity, time invested
- Volunteer profiles display: current level (志工新人-novice, 志工達人-regular, 志工英雄-hero), total tasks completed, average rating, badges earned
- High-level volunteers are prioritized in assignment suggestions for critical/complex tasks

---

## Integration Points

- **Feature 002 (Interactive Map)**: Volunteers appear as real-time location markers (if location sharing enabled). Task assignments visible on map with volunteer-task connections.

- **Feature 003 (Request Management)**: Volunteers are assigned to requests, update request status as they work, complete requests and provide notes. Volunteer skills inform request assignment logic.

- **Feature 006 (Backend Administration)**: Admin dashboard displays volunteer statistics, enables bulk volunteer management, provides access to volunteer performance analytics and task completion metrics.

---

## Key Entities (Preliminary)

- **Volunteer**: Core entity representing registered volunteers. Attributes: volunteer_id, user_id (references User entity), registration_date, verification_status (pending/approved/rejected), skills (array of skill tags), certifications, availability_schedule, current_availability_status (available/busy/offline), location_sharing_enabled, current_location, experience_level, total_tasks_completed, average_rating, badges_earned

- **Task Assignment**: Represents assignment of volunteer to request. Attributes: assignment_id, request_id, volunteer_id, assigned_by (coordinator_id), assigned_at, accepted (boolean), accepted_at, declined_reason, started_at, completed_at, completion_notes, completion_photo, rating, rating_comments

---

## Out of Scope (for this feature)

- Volunteer insurance or liability management
- Volunteer training program management
- Volunteer expense reimbursement processing
- Real-time messaging between volunteers and coordinators (may use external tools initially)

---

## Next Steps

1. Consult with volunteer coordinators on workflow requirements and pain points
2. Define complete functional requirements (FR-XXX series)
3. Design volunteer registration and verification workflows
4. Create mockups for volunteer mobile app interface and coordinator dashboard
5. Develop skill taxonomy and matching algorithm specifications
6. Plan integration with LINE authentication and external communication platforms

---

**Note**: This is an outline document. Full specification development will follow the `/speckit` workflow:
- `/speckit.specify` to expand into complete specification with all mandatory sections
- `/speckit.plan` to generate implementation plan
- `/speckit.tasks` to create actionable task breakdown
