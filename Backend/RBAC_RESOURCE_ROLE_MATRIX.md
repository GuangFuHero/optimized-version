# RBAC v1 — Resource × Role 權限矩陣

> 產生日期：2026-07-12 · 對應 branch `popo/rbac-v1`
> 事實來源：`scripts/seed_rbac.py`（授權）+ `app/core/permissions.py`（capability 目錄）+ `app/core/rbac_scopes.py`（scope 引擎）。
> 此檔為快照，seed 一改就會過時——以程式碼為準。

## 模型速記（ADR-019 / ADR-049）

- **兩軸角色**：功能角色（`user_role_assign`）× 組織（`users.team_uuid → team.type ∈ {gov, ngo}`）。一人 = 一 platform 角色 + 最多一 team 角色。
- **合併規則**：所有 grant 取聯集、**最寬勝**、無 deny（ADR-018/021）。
- **兩檢查點**：CP1＝有無 capability（load 前）；CP2＝這一筆屬不屬我/我 zone（load 後）。

### Scope 語意（`none / own / team / zone / all`）

| scope | 意義 | 判定 |
|---|---|---|
| `all` | 全域 | 無條件 |
| `zone` | 我 team 責任區內 | `ST_Contains(我 team 被指派的 WorkZone, resource.geometry)` |
| `team` | 我自己的 team | `resource.<team 邊界欄位> == actor.team_uuid`（僅團隊成員管理用） |
| `own` | 我建立的 | `resource.created_by == actor.uuid` |
| `—` | 未授予 | CP1 直接 403 |

最寬勝順序：`all > zone > team > own > none`。

## 角色一覽

| 角色 | kind | 定位 |
|---|---|---|
| **Guest** | （匿名，非 DB 角色） | `PUBLIC_PERMS` 白名單內的唯讀瀏覽 |
| **user** | platform | 預設民眾：可瀏覽、可建立，只能動自己建的 |
| **data_auditor** | platform | 稽核：全平台唯讀（含 PII、audit log），無 edit/make/review |
| **super_admin** | platform | 全能 |
| **admin** | team | 團隊協調者：責任區內全操作 + 管團隊成員 + 畫/指派 zone |
| **member** | team | 團隊現場人員：責任區內編輯，無團隊管理、無 zone |

## 權限矩陣

圖例：`all` / `zone` / `team` / `own` / `—`（未授予）。「公開」＝該 capability 在 `PUBLIC_PERMS`，匿名者亦可（唯讀）。

### 地圖 Map（疊層／封路）

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| map.view | all（公開） | all | all | all | all | all |
| map.add | — | — | — | all | — | — |
| map.edit | — | — | — | all | — | — |
| map.delete | — | — | — | all | — | — |

### 站點 Station

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| station.view | all（公開） | all | all | all | all | all |
| station.add | — | all | — | all | all | all |
| station.edit | — | own | — | all | zone | zone |
| station.delete | — | own | — | all | zone | own |
| station.review | — | — | — | all | zone | — |

### 求助單 Ticket

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| ticket.view | all（公開） | all | all | all | all | all |
| **ticket.view_pii** | —（遮罩） | own | all | all | zone | zone |
| ticket.add | — | all | — | all | all | all |
| ticket.edit | — | own | — | all | zone | zone |
| ticket.delete | — | own | — | all | zone | own |
| ticket.assign | — | own | — | all | zone | own |
| ticket.review | — | — | — | all | zone | — |

### 使用者 User

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| user.view | — | — | all | all | — | — |
| user.add | — | — | — | all | — | — |
| user.edit | — | — | — | all | — | — |
| user.delete | — | — | — | all | — | — |

### 團隊 Team

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| team.view | — | — | — | all | team | team |
| team.edit | — | — | — | all | — | — |
| team.member.manage | — | — | — | all | team | — |

> `team.edit`（建立/編輯 team）只有 super_admin（ADR-054）；team admin 只管成員。

### 責任區 Work Zone

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| work_zone.view | — | — | — | all | all | — |
| work_zone.add | — | — | — | all | all | — |
| work_zone.edit | — | — | — | all | all | — |
| work_zone.assign | — | — | — | all | all | — |

> ⚠️ ADR-049 的意圖是「畫/指派 zone 只有 gov 側能做」，但 gov/ngo admin 共用同一個 `admin` 角色，能力層分不出來，故 **ngo admin 技術上也拿得到**。目前採「先信任、不硬擋」（ADR-049 §303），未加 `team.type==gov` 硬牆。

### 動態欄位 Dynamic Field

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| dynamic_field.view | — | — | — | all | — | — |
| dynamic_field.add | — | — | — | all | — | — |
| dynamic_field.edit | — | — | — | all | — | — |
| dynamic_field.delete | — | — | — | all | — | — |

### 稽核 / RBAC 自管

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| audit.view | — | — | all | all | — | — |
| rbac.assign | — | — | — | all | — | — |
| rbac.edit | — | — | — | all | — | — |

## 補充說明

### 公開白名單（`PUBLIC_PERMS`，`app/core/permissions.py`）
`map.view`、`station.view`、`ticket.view`、`announcement.view` — 匿名可唯讀。`ticket.view_pii` **絕不**公開；匿名一律看不到 PII。

### PII 遮罩（ADR-049）
`ticket.view_pii` 不在 scope 內時回傳**遮罩字形**（`王◯◯` / `j***@***.com` / `09*****678`），不是 null、也不是報錯。逐角色：guest→遮罩、user→own、team admin/member→zone、data_auditor/super_admin→all。

### 「已定義、但目前無角色授予」的 capability（ahead-of-feature，ADR-050）
下列 key 存在於目錄、但 seed 沒發給任何角色，等對應功能實作時才會接上 enforcement：
`ticket.export`、`ai_duplicate.view`、`ai_duplicate.review`、`announcement.publish/edit/delete`、`pre_departure.view/publish/edit`。
（`announcement.view` 屬公開白名單，故匿名可見，即使無角色 grant。）

### 相關 ADR
ADR-018（union）、ADR-019（兩軸/一人一 team）、ADR-021（scope enum + 最寬勝）、ADR-027（view 公開）、ADR-030/048/049（view=all、PII 遮罩、scope 定案為純地理）、ADR-050（軟刪 + ahead-of-feature）、ADR-052（task 借 parent geometry 判 zone）、ADR-053（team 邊界欄位）、ADR-054（team.edit = super_admin）。
