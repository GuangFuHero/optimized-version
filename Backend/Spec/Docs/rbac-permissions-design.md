# RBAC 權限系統設計（capability RBAC v1）
**版本**: 2.0
**更新日期**: 2026-07-19
**目的**: 描述**已實作**的 capability-based RBAC v1 —— 能力鍵目錄、預設角色、以及 scope 授權模型
**權威來源**:
- `app/core/permissions.py`（`Perm` 能力鍵，單一事實來源）
- `scripts/seed_rbac.py`（預設角色與 scope grant）
- `Spec/008-rbac-authorization/spec.md`（對外行為契約）
- `Spec/008-rbac-authorization/decisions.md`（ADR-012~062，完整決策記錄）

**更新者**: [zumon, popo] · v2.0 對齊實作

> ⚠️ **v2.0 大改**：本文件 v1.1（2025-12）描述的是**當時尚未實作的舊設計**——`resource:action:scope` 字串權限、萬用字元 `*:*`、組織可自訂角色、9 個角色範本、以及一套 Group/Policy SQL schema。那套引擎已在 **ADR-026 drop-and-replace**、實際資料庫從未採用（見 migration `1d52ab265e50`）。以下改寫為**已上線的 capability RBAC v1**。v1.1 的版本記錄保留在文末附錄以供對照。

---

## 1. 設計理念（capability RBAC v1）

### 核心原則
1. **能力優先、與 DB 表解耦（ADR-012）**：權限是 capability key（`ticket.view`、`work_zone.assign`），不是 `resource+action`，也不綁特定資料表。唯一事實來源 = `app/core/permissions.py:Perm`；seed 與每一次 RBAC 檢查都用這些常數，禁用裸字串。
2. **兩軸模型（ADR-019/049）**：授權 = **功能角色**（做什麼）×**組織 team**（在哪個區域）。一帳號 = 一 `platform` 角色 + 最多一 `team` 角色（`users.team_uuid`）。組織身分（gov/ngo）由 `team.type` 表達，**不進角色名、不進 scope**。
3. **固定 scope、非通用 ABAC（ADR-020/021/049）**：資料邊界用固定 enum `none/own/team/zone/all`，不做 free-JSON condition 引擎。地理管轄靠 `zone`（point-in-polygon），不靠在資源上存 owning-org。
4. **相加、無 deny（ADR-018）**：多來源 grant 取**聯集**、同一 capability 取**最寬** scope（`all > zone > team > own > none`）。收權靠移除角色/grant，**沒有 deny override**。
5. **預設 deny + 公開白名單（ADR-025/027）**：未明列一律 deny；`PUBLIC_PERMS` 匿名可讀；`ticket.view_pii` 永不公開。

### 系統架構
```
        role_permission_assign(scope)          user_permission_assign(scope)
角色 roles ───────────────────────┐            ┌────────────── 直接授權(per-user override)
(kind=platform|team)              ▼            ▼
              能力鍵 permissions ( capability keys )  ← 相加 / 最寬勝 (union, widest-wins)
                       ▲
        user_role_assign │
使用者 users ────────────┘   users.team_uuid → 最多一 team
                              │
組織 teams (type=gov|ngo) ── team_zone_assign ── work_zones ( 地理管轄, ST_Contains )
```

（資料表結構見 `Spec/Docs/er-diagram.md` 的「RBAC v1」段。）

---

## 2. 能力鍵目錄（`app/core/permissions.py:Perm`）

命名規則：`<capability>.<action>`。★ = 屬 `PUBLIC_PERMS`，匿名唯讀可用（ADR-025/027）。

| 模組 | 能力鍵 |
| :--- | :--- |
| **Ticket（求助單）** | `ticket.view` ★、`ticket.view_pii`、`ticket.add`、`ticket.edit`、`ticket.delete`、`ticket.assign`、`ticket.review`、`ticket.export` |
| **Station（資源站點）** | `station.view` ★、`station.view_pii`、`station.add`、`station.contribute`、`station.edit`、`station.delete`、`station.review` |
| **Map（地圖圖層/封閉區）** | `map.view` ★、`map.add`、`map.edit`、`map.delete` |
| **Announcement（緊急公告）** | `announcement.view` ★、`announcement.publish`、`announcement.edit`、`announcement.delete` |
| **AI Duplicate（重複審核）** | `ai_duplicate.view`、`ai_duplicate.review` |
| **User（使用者管理）** | `user.view`、`user.add`、`user.edit`、`user.delete` |
| **Team（團隊管理）** | `team.view`、`team.edit`、`team.member.manage` |
| **Work Zone（責任區）** | `work_zone.view`、`work_zone.add`、`work_zone.edit`、`work_zone.assign`、`work_zone.delete` |
| **Dynamic Field（動態欄位設定）** | `dynamic_field.view`、`dynamic_field.add`、`dynamic_field.edit`、`dynamic_field.delete` |
| **Pre-Departure（出勤前須知）** | `pre_departure.view`、`pre_departure.publish`、`pre_departure.edit` |
| **Audit（稽核日誌）** | `audit.view` |
| **RBAC 自管（僅 Super Admin）** | `rbac.assign`、`rbac.edit` |

> `PII` 與檢視分離（ADR-012）：`ticket.view`（看得到單）≠ `ticket.view_pii`（看得到聯絡資訊）。
> Dashboard 是衍生視圖（ADR-049），可見性繼承自來源模組，**刻意沒有自己的 permission key**。
> 部分鍵（`ticket.export`、`ai_duplicate.*`、`pre_departure.*`）已註冊進 catalog，但**目前 seed 尚未授予任何角色**——先讓 key 存在，待對應功能落地再 wire（見 `seed_rbac.py` 開頭）。

---

## 3. Scope 授權模型

### 3.1 scope 語意（完整表見 decisions.md 附錄 A）
| scope | 判定式 |
| :--- | :--- |
| `none` | `false()`（防禦性；checkpoint 1 應已先擋掉） |
| `own` | `resource.created_by == actor.uuid` |
| `team` | `resource.<team 邊界欄位> == actor.team_uuid`（**只用於團隊成員管理**，不套在 geo 資源） |
| `zone` | `ST_Contains(actor 所屬 team 被指派的 WorkZone, resource.geometry)` |
| `all` | 全域 |

最寬勝：`all > zone > team > own > none`（`app/core/rbac_scopes.py:WIDTH`）。
> `gov`/`ngo` scope 已於 **ADR-049 退場**——組織身分改由 `users.team_uuid → team.type` 表達，不進 scope。

### 3.2 兩檢查點（ADR-022/023/040）
- **檢查點 1**：有沒有這個 capability（便宜、load 前就能判，可當 dependency）。缺 → **403**。
- **檢查點 2**：這一筆資源在不在我的 scope 內（**必先 load 才有 `created_by`/`geometry`**）。`own` 不符 → **403**；`team`/`zone` 不符 → **404**（不洩漏跨邊界資源存在）。
- 共用實作：`app/services/authz.py:require_scope`（GraphQL / REST / 未來 entrypoint 共用同一流程）。

### 3.3 PII 遮罩（ADR-029/048/068）
`ticket.view_pii` 不在 scope 內時，聯絡欄位回傳遮罩值（看起來像「沒填」），逐角色判定：`user`=own（只看自己的單原值）、team 角色=zone、`data_auditor`/`super_admin`=all、guest=一律遮罩。

`stations` 也有自己的 `contact_name`/`contact_email`/`contact_phone`（**獨立欄位，與 `tickets` 的同名欄位無關**，ADR-182），由 `station.view_pii` 以完全相同的機制與逐角色 scope 遮罩——`app/graphql/geo/types.py:StationType` 的三個 field resolver 與 `TicketType` 對齊，共用 `app/graphql/masking.py`。判定表同上。

> 遮罩只擋讀取路徑。這些欄位仍會以明文進 `audit_logs`（`stations`/`tickets` 都是 audited table，trigger 只濾 `password_hash`）——見 PR #31 review LOW 7，待未來的 audit-log PII 政策統一處理。

---

## 4. 預設角色（`scripts/seed_rbac.py`）

> 一帳號 = 一 `platform` 角色 + 最多一 `team` 角色，effective = 兩者 grant 的聯集（ADR-019）。
>
> **下表列的是各角色自己的 grant，不是有效權限。** 指派 team 角色只替換同 kind 的舊角色，所以 team 角色持有者仍保有預設 platform 角色 `user` 的所有 grant。實例：team `admin` 自己沒有 `station.contribute`，但聯集 `user` 的 `all` 之後有效 scope 就是 `all`——不要把下表的空白讀成 403。

### 4.1 Platform 角色（每帳號一個）

| 角色 | 定位 | scope grant 重點 |
| :--- | :--- | :--- |
| **`user`** | 一般民眾（每個註冊帳號的預設） | `map.view`/`station.view`/`ticket.view`=all；`station.add`/`ticket.add`=all；**`station.contribute`=all**（群眾貢獻刻意開放，ADR-063 [5]）；`station.edit`/`station.delete`/`ticket.edit`/`ticket.delete`/`ticket.assign`=own；`ticket.view_pii`/**`station.view_pii`**=own |
| **`data_auditor`** | 監督查核（唯讀，看全部含 PII） | `map.view`/`station.view`/`ticket.view`=all；`ticket.view_pii`/**`station.view_pii`**=all；`user.view`=all；`audit.view`=all |
| **`super_admin`** | 平台最高權限（1–2 人） | 上述所有模組 + user/team/work_zone/rbac/audit/announcement 全部 = all（**唯一持有 `rbac.assign`/`rbac.edit`、`team.edit`**） |

### 4.2 Team 角色（綁在 `user_role_assign`；組織 = 該 team 的 `type`）

| 角色 | 定位 | scope grant 重點 |
| :--- | :--- | :--- |
| **`admin`** | 團隊協調員 | 操作類（station/ticket 的 edit/delete/review/assign）=**zone**；`ticket.view_pii`/**`station.view_pii`**=zone；`team.view`/`team.member.manage`=team；`work_zone.view/add/edit/assign/delete`=all；view/add=all |
| **`member`** | 團隊現場人員 | station/ticket 的 edit=**zone**；delete/assign 維持 own；`ticket.view_pii`/**`station.view_pii`**=zone；`team.view`=team；**無**團隊管理、**無**畫 zone |

> 「政府協調員」= `admin` 角色 + `gov` 型 team；「NGO 協調員」= `admin` 角色 + `ngo` 型 team。組織差異只在 team.type，不在角色。

---

## 5. 執行與管理

- **enforcement**：寫入動作走 thin use-case（`app/services/<domain>.py`），一接縫掛「檢查點1 → load → 檢查點2 → repo」；讀取 query 在 resolver 補 checkpoint1 + list `scope_filter` / detail `in_scope`（ADR-022/028）。
- **audit**：所有 mutation 走 DB trigger 寫 `audit_logs`（ADR-024），新 RBAC 表已納入 `AUDITED_TABLES`。
- **seed vs runtime**：本文件描述 **seed 決定的預設角色/grant**（`scripts/seed_rbac.py`，ADR-049 基準）。**runtime 動態管理**（讀矩陣、寫矩陣、角色 CRUD、per-user 直接授權）由後續 stack PR（#25 讀取顯示 / #26 矩陣寫入 / #27 角色 CRUD + 直接授權）提供的 admin API 承接，細節見各分支與 decisions.md ADR-055~061；`rbac.*` 能力維持 **super_admin 專屬**。

---

## 6. 與舊 v1.1 設計的對照

| 面向 | v1.1 舊設計（未實作） | v2.0 現況（capability RBAC v1） |
| :--- | :--- | :--- |
| 權限形式 | `resource:action:scope` 字串 + 萬用字元 `*:*` | capability key enum（`ticket.view`），scope 分離存 grant |
| 角色來源 | 組織可自訂角色 | seed 預設 5 角色 + runtime 管理（#25-#27），`rbac.*` 限 super_admin |
| 角色數 | 9 個範本（Guest/Field Coordinator/Content Manager…） | 3 platform（user/data_auditor/super_admin）+ 2 team（admin/member） |
| 組織/地理 | 無 | 兩軸（team）+ 地理管轄（work_zone/zone scope） |
| scope | `own`/`any` 二元 | `none/own/team/zone/all`，最寬勝、union、無 deny |
| DB schema | `permissions`(VARCHAR id)/`roles`(organization_id)/`role_permissions`/`user_roles` | 見 `er-diagram.md`：roles/permissions/role_permission_assign/user_role_assign/user_permission_assign + teams/work_zones/team_zone_assign |
| PII | 未區分 | `ticket.view` 與 `ticket.view_pii` 分離，逐角色遮罩 |

---

## 附錄. v1.1 舊版記錄（保留備查，內容已被 v2.0 取代）

- v1.0 (2025-11-30): 初始版本，定義核心權限和 8 個預設角色。
- v1.1 (2025-12-16): 公開存取策略（Public Access）；補充 `content`/`request` 領域驅動命名；區分「未登入訪客」與「已登入民眾」。
- v2.0 (2026-07-19): **全面改寫對齊已實作的 capability RBAC v1**（ADR-026 drop-and-replace 後的現況）。舊的 `resource:action:scope` 字串模型、萬用字元、組織自訂角色範本、Group/Policy SQL schema 皆已不再適用；權威來源改以 `app/core/permissions.py` + `scripts/seed_rbac.py` + `Spec/008-rbac-authorization/{spec,decisions}.md` 為準。

**提醒**: 本文件描述現況；任何權限/角色調整以 code（`permissions.py`/`seed_rbac.py`）與 decisions.md 的 ADR 為準，並同步更新此文件。
