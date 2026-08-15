# Product Requirements Document
## Notification Button System — Design Spec

| Field | Value |
|---|---|
| Status | Draft — For Review |
| Author (TPM) | Carol |
| Date | July 29, 2026 |
| Reviewers | Dan / Cedric (Backend Engineer), Haoyuan (UI/UX Designer) |
| Target release | MVP |
| Depends on | Existing schema: `users`, `roles`/`permissions`/`role_permission_assign`/`user_role_assign` (RBAC v1), `teams`, `work_zones`, `team_zone_assign`, `tickets`, `ticket_tasks`, `stations`, `announcements` |

---

## 1. Purpose & Scope

This spec defines the **notification system** layered on top of the existing platform: what triggers a notification, who receives it, how it's stored, and how the notification button/center behaves in the UI. Roles, pages, and RBAC are assumed context (already shared with the team) — this document does not re-derive them, only references the actual tables (`teams`, `work_zones`, `ticket_tasks`, `stations`, etc.) as the source of truth for triggers and recipients.

**In scope:** notification data model, trigger-to-event mapping, recipient resolution, notification center UI/UX, delivery mechanism, API surface.
**Out of scope:** the underlying features that produce these events (work zone drawing, dedup AI logic, ticket lifecycle) — those are existing/separate specs.

---

## 2. Notification Data Model

New table, following existing schema conventions (uuid PK, soft delete via `delete_at`, polymorphic reference like `photos.ref_type/ref_uuid`):

```
notifications {
    uuid uuid PK
    uuid recipient_uuid FK        -- FK to users; who sees this
    uuid actor_uuid FK "nullable" -- FK to users; who/what caused it (nullable for system-generated)
    string type                   -- enum, see Section 3
    string priority                -- info/medium/high/urgent
    string ref_type "nullable"     -- ticket/ticket_task/station/work_zone/team/announcement
    uuid ref_uuid FK "nullable"    -- polymorphic FK, resolved per ref_type (matches photos.ref_uuid pattern)
    string title
    string body
    boolean read "default false"
    timestamp read_at "nullable"
    timestamp created_at
    timestamp updated_at
    timestamp delete_at "nullable"
}
```
```
users ||--o{ notifications : "receives"
```

**Notes:**
- `ref_type`/`ref_uuid` follows the same polymorphic pattern as `photos` — the client resolves the deep link by looking up the referenced entity (e.g., `ref_type=work_zone` → `GET /work_zones/{ref_uuid}`) rather than storing a raw URL, so links never rot if front-end routes change.
- No `org_id` field — team context is derivable via `recipient_uuid → users.team_uuid`, consistent with how the rest of the schema treats team membership (no duplication).
- `delete_at` (not hard delete) matches every other table's soft-delete convention — supports the retention question in Open Questions.

---

## 3. Notification Types & Trigger Mapping

Each row = one real DB event that should fire a notification. This is the actual "when do we insert into `notifications`" table for backend implementation.

**Role granularity used below:** Per ADR-049, team roles in the `roles` table hold `name='admin'` and `name='member'` (`kind='team'`), while the organization type lives on `teams.type` (`'gov'` or `'ngo'`). A team administrator is identified by `User.team_uuid == :team_uuid` with `Role.name == 'admin'`. The distinction matters because several notification types are admin-only, not team-wide.

| Type | DB Trigger | `ref_type` | Priority | Recipient scope (see §4) |
|---|---|---|---|---|
| `zone_assigned` | New row in `team_zone_assign` | `work_zone` | Urgent | `team_admin` — **only `admin`** of the assigned team. NGO members can still *view* the zone/tickets on the map/ticket page (existing view permission) — they just don't get the notification. The admin is expected to triage and delegate to members via individual task assignments (which do notify — see `task_assignment_created`). |
| `zone_unassigned` | Row deleted/soft-deleted in `team_zone_assign` | `work_zone` | High | `team_admin` — same as above |
| `ticket_task_moderation_update` | `ticket_tasks.moderation_status` changes (→ `approved`/`rejected`/`merged`) | `ticket_task` | High | `own` — the `created_by` of the `ticket_task`, plus anyone in `task_assignments` for it |
| `ticket_task_status_update` | `ticket_tasks.status` changes (→ `in_progress`/`fulfilled`/`canceled`) | `ticket_task` | Medium | `own` — all `actor_uuid`s in `task_assignments` for that task |
| `task_assignment_created` | New row in `task_assignments` | `ticket_task` | High | `own` — the `actor_uuid` on the new assignment (this is how a team member actually learns they have work, since they don't get `zone_assigned`) |
| `dedup_flag_ticket` | `ticket_tasks.is_duplicate` set true / `dedup_group_id` populated | `ticket_task` | Medium | `permission` — holders of `ai_duplicate.review` capability (see §4) |
| `dedup_flag_station` | `stations.is_duplicate` set true / `dedup_group_id` populated | `station` | Medium | `permission` — same `ai_duplicate.review` holders |
| `resource_station_updated` | New row in `stations`, or update to a station's operational fields (`is_open`, `water_level`, `beds_available`, `supply_rationed`, or similar type-specific property in `station_properties`) | `station` | Medium | `team_type:gov` + zone NGO Admin — **every** Gov team member, plus NGO admins whose work zone contains the station. |
| `team_member_added` | New row in `user_role_assign` granting a `kind='team'` role | `team` | High | `own` — the newly-assigned `user_uuid` |
| `announcement_published` | New row in `announcements` with `active=true` | `announcement` | Medium | `all`, or scoped subset if targeting is added (Open Question) |

**NGO/Gov page-access note (context, not a new requirement):** NGO admins have edit+view on the resource station management page; members and Gov staff are view-only there. This is why `resource_station_updated`'s *actor* is typically an NGO user (or system/crawler `source`), while its *recipients* are Gov and zone-assigned NGO admins — actor and recipient set are never assumed to be the same people (see §4).

**Explicitly deferred from MVP:** a "team/org verification approved" notification, because the current `teams` schema has no verification workflow — `teams.status` defaults to `active` with no `pending`/`rejected` states defined. If org onboarding needs an approval step, that's a schema change first, notification type second — flagged in Open Questions rather than assumed.

---

## 4. Recipient Resolution Logic

Notifications don't have a flat "recipient list" — who gets notified is **derived from the RBAC scope model already in the schema** (`role_permission_assign.scope`: `none/own/team/gov/ngo/zone/all`), so the notification system doesn't invent a second permission system.

| Scope | Resolution logic |
|---|---|
| `own` | Recipient is a specific, already-known `user_uuid` from the triggering row itself (e.g., `task_assignments.actor_uuid`, `ticket_tasks.created_by`) — no query needed beyond the trigger row. |
| `team` | Recipient set = `SELECT uuid FROM users WHERE team_uuid = :team_uuid` for the team on the triggering row — every member, admin and non-admin alike. |
| `team_admin` *(new, notification-specific)* | Recipient set = `SELECT u.uuid FROM users u JOIN user_role_assign ura ON ura.user_uuid = u.uuid JOIN roles r ON r.uuid = ura.role_uuid WHERE u.team_uuid = :team_uuid AND r.name = 'admin'` — narrows `team` down to just the admin role for that team. |
| `team_type:<gov\|ngo>` *(new, notification-specific)* | Recipient set = every user (admin + member) belonging to *any* team where `teams.type = 'gov'` (or `'ngo'`) — crosses team boundaries, unlike `team`/`team_admin` which are scoped to one specific team. Used for `resource_station_updated`, where the audience includes all Gov staff. |
| `permission` *(new, notification-specific)* | Recipient set = every user holding a given capability key (e.g. `ai_duplicate.review`), via the union of `role_permission_assign` (through `user_role_assign`) and `user_permission_assign`, filtering out `scope = 'none'`. This reuses existing RBAC tables; it does not add a new grant mechanism. |
| `all` | Every active user — used sparingly (announcements only). |

This means adding a *new* notification type in the future is primarily a matter of: (1) identify the DB trigger, (2) identify which existing scope pattern above already answers "who should see this" — not building bespoke recipient logic per type.

**On `team_admin` vs. `role_permission_assign.scope`:** the existing schema's scope enum (`none/own/team/gov/ngo/zone/all`) doesn't have an admin/member distinction — it's a *data-boundary* scope (what rows can you see), not a *notification-audience* scope (who gets pinged). `team_admin` and `team_type` above are notification-layer concepts built from the same underlying `user_role_assign`/`teams` tables, not changes to the RBAC permission model itself. Worth a naming discussion with backend so "scope" doesn't mean two different things in two different tables.

---

## 5. Notification Center UI/UX (the button system)

### 5.1 Bell Icon & Badge
- Persistent icon in the global header, all back-face pages.
- Badge = count of `notifications` where `recipient_uuid = current_user AND read = false AND delete_at IS NULL`.
- Badge shows exact count up to 9, then "9+". Disappears at zero.

### 5.2 Panel Behavior
- Click opens a dropdown panel (not a full page) anchored to the bell — keeps the user on their current page (map, ticket table, etc.) rather than navigating away.
- List sorted `created_at DESC`, paginated (infinite scroll, page size 20).
- Each row shows: type icon (mapped from `type`), `title`, `body` (truncated to ~80 chars), relative time (`created_at`), unread indicator.
- Unread rows: bold title + subtle left-border accent in the priority color (urgent = red, high = orange, medium = blue, info = gray).
- Clicking a row: marks it read (`PATCH`, optimistic UI update) and, if `ref_type`/`ref_uuid` present, navigates to the resolved entity (e.g., a `ticket_task` row opens that ticket's detail view; a `work_zone` row opens the map centered on that zone).
- "Mark all as read" button in the panel header.
- Empty state: simple "No notifications yet" — no illustration needed for MVP.

### 5.3 Priority Escalation Beyond the Panel
`urgent` notifications (`zone_assigned`) get an additional non-blocking toast on session load, in addition to appearing in the panel — because a new zone assignment is time-sensitive field-ops information that shouldn't wait for someone to think to click the bell. All other priorities are panel-only.

### 5.4 Role-Scoped Visibility
Because recipient resolution (§4) already filters at write-time, the panel itself does **not** need client-side role filtering logic — a user only ever has rows in `notifications` that were already resolved for them. This keeps the front-end simple: query is always just `WHERE recipient_uuid = current_user`.

### 5.5 Interaction States to Design
Please design states for: empty, unread-urgent (toast + panel), unread-normal, read, loading/skeleton, and the "mark all read" confirmation (if any — TBD whether this needs a confirm step or is instant).

---

## 6. Delivery Mechanism

**Recommendation: polling**, with one exception:

- Standard poll: `GET /notifications/unread-count` every 30–60s while tab is active, paused on background/blur, forced on tab focus and page load.
- Exception: `zone_assigned` is operationally time-sensitive. Rather than building real-time infra platform-wide, recommend a forced unread-count check immediately after any action that could plausibly follow a zone assignment (e.g., navigating into the map or ticket table) — cheap to implement, no WebSocket needed. Flagged as open question if this is sufficient or if backend wants to special-case it further.

---

## 7. API Endpoints (proposed)

- `GET /notifications` — paginated list for current user, newest first
- `GET /notifications/unread-count`
- `PATCH /notifications/{uuid}/read`
- `PATCH /notifications/read-all`
- No public creation endpoint — all inserts are server-side, fired from the trigger points in §3 (i.e., wherever `team_zone_assign`, `ticket_tasks`, `stations`, `user_role_assign`, or `announcements` are mutated, add a notification-insert step in that same transaction/service call).

---

## 8. Success Metrics
- % of `zone_assigned` notifications read within 1 hour of the recipient's next active session
- % of `ticket_task_moderation_update` notifications read within 24 hours
- Read rate (`read`/total) broken out by `type`
- No measurable page-load regression from polling

---

## 9. Open Questions & Agreed Decisions (開放問題與決議)

| # | Question (問題) | Owner | Status | Decision Summary (決議摘要) |
|---|---|---|---|---|
| 1 | `teams.status` has no `pending`/`rejected` states — is org/team verification actually a future schema addition, or out of scope entirely for this platform? | Dan / Cedric, Carol | **Resolved (決議)** | **MVP 暫不實作**。團隊建立預設即為 `active`，不加入審核通知；待未來有組織驗證需求時，於 v2 統一增加 `teams.status` 與對應通知。 |
| 2 | What capability key(s) define the `dedup.manage` recipient set — is it one key for both `dedup_flag_ticket` and `dedup_flag_station`, or two separate keys? | Dan / Cedric | **Resolved (決議)** | **拆分為獨立 Key**：定義 `dedup.ticket.manage` 與 `dedup.station.manage`，讓工單與站點去重職責分離，避免通知疲勞。 |
| 3 | Does `announcement_published` need role/team targeting in MVP, or is `all` sufficient? | Carol | **Resolved (決議)** | **MVP 僅支援 `all`**。全站公告一律廣播全體活躍用戶；定向公告留待後續版本擴充。 |
| 4 | Retention: how long before `delete_at` is set on read notifications? | Dan / Cedric | **Resolved (決議)** | **30 天自動軟刪除**。由排程工作（Cron/Worker）定期將已讀超過 30 天或建立超過 90 天的通知標記 `delete_at`。 |
| 5 | Is the forced-check approach for `zone_assigned` (§6) sufficient, or does backend want a shorter dedicated poll interval for that type only? | Dan / Cedric | **Resolved (決議)** | **焦點刷新 + 30s 常規輪詢**。維持 PRD 建議，於分頁切換/進入地圖時強制觸發一次，其餘維持 30~60s 輪詢即可。 |
| 6 | "Mark all as read" — instant or confirm-first? | Haoyuan | **Resolved (決議)** | **立即執行 (Instant) + Toast 提示**。點擊後立即樂觀更新並呼叫 API，右下角跳出 Toast 提示，操作最輕快流暢。 |
| 7 | `resource_station_updated` is currently scoped to *all* Gov teams platform-wide. Should this narrow to Gov teams whose `work_zones` geographically overlap the station? | Carol, Dan / Cedric | **Resolved (決議)** | **MVP 全體 Gov，v2 擴充地理過濾**。MVP 先採全體 Gov 接收確保情資不漏接；資料庫保留空間資訊，未來再升級為 PostGIS 區域過濾。 |
| 8 | Do NGOs ever get notified about resource stations, or is `resource_station_updated` exclusively a Gov-facing notification? | Carol | **Resolved (決議)** | **Gov 全體 + 責任區 NGO Admin**。除了全體政府人員外，若該站點位於某 NGO 的指派工作區 (`team_zone_assign`) 內，該 NGO 的 `ngo_admin` 也應接收異動通知。 |

### 9.1 Detailed Decision Notes (決議詳細說明)
1. **Q1 團隊審核 (Team Verification)**: MVP 聚焦於核心災情調度與任務派發，避免前置過多流程阻礙。
2. **Q2 去重權限 (Dedup Keys)**: 拆分 `dedup.ticket.manage` 與 `dedup.station.manage`，後端解析 recipient 時分別查詢持有對應權限的使用者。
3. **Q3 公告定向 (Announcement Targeting)**: MVP 發布公告即發布給所有 active 使用者 (`scope: all`)。
4. **Q4 保留機制 (Data Retention)**: 定期排程軟刪除（已讀 30 天 / 未讀 90 天），保護資料庫查詢效能。
5. **Q5 輪詢間隔 (Polling)**: 頁面切換、進入地圖/工單列表、分頁 Focus 時強制打 `GET /notifications/unread-count`，背景輪詢維持 30-60 秒。
6. **Q6 全部已讀 (Mark All Read)**: 前端直接樂觀更新為已讀並非同步送出 `PATCH /notifications/read-all`，搭配短暫 Toast。
7. **Q7 區域過濾 (Gov Spatial Filter)**: MVP 保持全體 Gov 廣播，降低 PostGIS 空間計算複雜度。
8. **Q8 NGO 資源站通知 (NGO Station Notifications)**: 當 Station 異動時，後端解析該 Station 所在位置之 `work_zones`，若有指派對應 NGO 團隊，將該團隊之 `ngo_admin` 一併列入接收者清單。

---

## 10. Out of Scope (MVP)
- Email/push/SMS channels
- Per-user notification preferences/mute
- Real-time push (WebSocket/SSE)
- Org/team verification workflow (deferred to v2)
- Announcement targeting beyond `all` (deferred to v2)

---

## 11. Future Roadmap & TODOs (待辦事項與未來功能擴充規劃)

以下列出後續版本（v2+）可評估加入的功能清單與技術 TODO：

- [ ] **TODO-1: 多管道通知串接 (Multi-channel Delivery)**
  - 整合外部通訊管道（Email、SMS、瀏覽器 Web Push）。
  - 支援 Discord / Slack Webhook 機器人推播重大災情或緊急派工（可參考 `DISCORD_WEBHOOK_SETUP.md`）。
- [ ] **TODO-2: 即時通訊推播架構 (Real-Time WebSockets / SSE)**
  - 針對高時效性事件（如 `zone_assigned` 緊急指派、災情等級升級），升級為 Server-Sent Events (SSE) 或 WebSocket 即時推播，取代 HTTP 輪詢。
- [ ] **TODO-3: 地理空間智能過濾 (Geospatial / PostGIS Filtering)**
  - 針對 `resource_station_updated` 與災情回報，結合 PostGIS 幾何運算，只推播給地理轄區重疊之政府與搜救隊伍。
- [ ] **TODO-4: 使用者通知偏好與免打擾設定 (Notification Preferences & DND)**
  - 允許使用者在個人設定中選擇各類別（任務、公告、物資站）的接收開關或靜音時段。
- [ ] **TODO-5: 組織驗證與審核工作流 (Org/Team Verification Workflow)**
  - 擴充 `teams.status` (`pending`, `approved`, `rejected`)，建立審核後台，並補齊 `team_verification_approved` / `team_verification_rejected` 通知。
- [ ] **TODO-6: 公告精準定向發布 (Targeted Announcements)**
  - 在發布公告時可指定受眾（如：特定角色、特定團隊類型、特定行政區）。
- [ ] **TODO-7: 資料保留排程清理任務 (Retention Cleanup Cron Job)**
  - 建立每日執行的 Worker/Cron，自動將已讀超過 30 天與建立超過 90 天的舊通知寫入 `delete_at`。
- [ ] **TODO-8: 通知中心歷史搜尋與分類篩選 (Notification Search & Filter)**
  - 前端通知下拉面板支援依「未讀/已讀」、「優先級 (Urgent/High)」、「類型 (任務/物資/公告)」進行篩選與搜尋。

---

## 12. Sign-off

| Role | Name | Approved (Y/N + date) |
|---|---|---|
| TPM | Carol | |
| Backend Engineer | Dan / Cedric | |
| UI/UX Designer | Haoyuan | |
