# RBAC v1 — Resource × Role 權限矩陣

> 產生日期：2026-07-12 · 對應 branch `popo/rbac-v1`
> 事實來源：`scripts/seed_rbac.py`（授權）+ `app/core/permissions.py`（capability 目錄）+ `app/core/rbac_scopes.py`（scope 引擎）。
> 此檔為快照，seed 一改就會過時——以程式碼為準。
>
> **⚠️ Live 事實來源（feature 009）**：runtime 的權威視圖是 `GET /admin/rbac/matrix`（角色×capability×scope 即時網格）+ `GET /admin/rbac/capabilities`（capability 目錄，含 `public` / `team_gov_only` / `team_gov_widened` 旗標）。此 `.md` 只是 2026-07-12 的靜態快照、且早於 PR #24 review 的收斂，個別 cell（例如下方 Work Zone 的 gov/ngo 註記）可能已落後——需要當下真值時查 API，不要以本檔為準。站點（Station）一節與 scope 語意表已於 2026-09-23 依 ADR-285 更新。

## 模型速記（ADR-019 / ADR-049，**身分部分已由 `Spec/010` 取代**）

- **身分（feature 010）**：一個身分 = `user_role_assign` 的一列（角色 + team 角色才有的 team）。
  一人 = 一 platform 角色 + **任意多個** team 角色，每個 team 一個。
  **任一時刻只有一個身分生效**，由 access token 的 `act` claim 指定（010/ADR-068/069）。
  `users.team_uuid` 已刪除；組織歸屬讀的是當前身分的 team（`team.type ∈ {gov, ngo}`）。
- **合併規則**：**當前身分內**的 grant 取聯集、**最寬勝**、無 deny（ADR-018/021 + 010/ADR-074）。
  跨身分**不**聯集——`super_admin` 切到團隊身分時是真的降權，本表下方每一列都要理解成
  「持有該角色**並且正以該角色行動**時」的權限。
- **兩檢查點**：CP1＝有無 capability（load 前）；CP2＝這一筆屬不屬我/我 zone（load 後）。

### Scope 語意（`none / own / team / zone / all`）

| scope | 意義 | 判定 |
|---|---|---|
| `all` | 全域 | 無條件 |
| `zone` | **當前身分**那個 team 的責任區內（通報單） | `ST_Contains(該 team 被指派的 WorkZone, resource.geometry)` |
| `team` | **當前身分**那個 team | `resource.<team 邊界欄位> == active identity 的 team`。用於團隊成員管理，以及**站點**（`stations.team_uuid`，ADR-285）；gov team 身分在站點上視同 `all` |
| `own` | 我建立的 | `resource.created_by == actor.uuid` |
| `—` | 未授予 | CP1 直接 403 |

最寬勝順序：`all > zone > team > own > none`。

> 當前身分是 platform 身分（無 team）時，`team` 與 `zone` 一律不成立（`false()`）——不是「看得到全部」，
> 是「看不到任何一筆」。同理，屬於多個 team 的人，`zone` 只涵蓋當前身分那一隊的責任區（010/ADR-074）。

## 角色一覽

| 角色 | kind | 定位 |
|---|---|---|
| **Guest** | （匿名，非 DB 角色） | `PUBLIC_PERMS` 白名單內的唯讀瀏覽 |
| **user** | platform | 預設民眾：可瀏覽、可建立，只能動自己建的 |
| **data_auditor** | platform | 稽核：全平台唯讀（含 PII、audit log），無 edit/make/review |
| **super_admin** | platform | 全能 |
| **admin** | team | 團隊協調者：責任區內的通報單、指派給本隊的站點全操作 + 管團隊成員 + 畫/指派 zone + 指派站點（後兩者僅 gov） |
| **member** | team | 團隊現場人員：責任區內的通報單、本隊的站點可編輯，無團隊管理、無 zone、無站點指派 |

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
| **station.view_pii** | —（遮罩） | own | all | all | team | team |
| **station.view_history** | — | own | all | all | team | team |
| station.add | — | all | — | all | all | all |
| station.contribute | — | all | — | all | all | all |
| station.edit | — | own | — | all | team | team |
| station.delete | — | own | — | all | team | own |
| station.review | — | — | — | all | team | — |
| **station.assign** | — | — | — | all | all（僅 gov） | — |
| station.export | — | — | all | all | team | — |
| station.import | — | — | — | all | all | — |

> **站點跟著指派的 team 走，不跟 zone（ADR-285）。** `team` ＝指派給當前身分那一隊的站點
> （`stations.team_uuid`）；以 team 身分建立的站會自動指派給該隊，民眾建的站為未指派。
> **gov team 身分在上表的 `team` 視同 `all`**——gov 管所有站點，不論指派給誰或未指派
> （`app/core/security.py:resolve_scope`，`GOV_TEAM_WIDENED_PERMS`）；ngo 的 `team` 只到自己的站。
> `station.assign` 與 `work_zone.assign` 同一套：seed 發給所有 team admin，執行時擋掉非 gov team
> （`require_gov_team`）。capability 目錄以 `team_gov_widened` / `team_gov_only` 兩個旗標標示這兩條
> 規則，因為角色×capability 矩陣本身表達不了 team 類型的條件。

> **⚠️ 本表每一欄是「該角色自己的 grant」。** 在 identity switching 之前，team 角色是疊加在
> platform 角色之上的，所以空格不代表沒權限——聯集後仍可能有效。**那個讀法已經失效**：
> 現在生效的只有「當前身分」那一個 identity 的 grant，platform 角色的授權不會帶進 team 身分
> （ADR-074；`app/repositories/auth_repository.py:get_user_permissions`）。
> 因此 `station.contribute` 這類原本靠 platform `user` 角色供應的能力，已改為直接授予 team
> 角色（`scripts/seed_rbac.py`），否則現場人員切成團隊身分就會失去它。
> 換句話說：對 team 角色而言，本表的空格現在**就是**沒有權限。要看某個人此刻的有效權限，
> 仍請查 `GET /admin/rbac/matrix`——它解析的是該使用者當前的 identity。

### 求助單 Ticket

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| ticket.view | all（公開） | all | all | all | all | all |
| **ticket.view_pii** | —（遮罩） | own | all | all | zone | zone |
| **ticket.view_history** | — | own | all | all | zone | zone |
| ticket.add | — | all | — | all | all | all |
| ticket.edit | — | own | — | all | zone | zone |
| ticket.delete | — | own | — | all | zone | own |
| ticket.assign | — | own | — | all | zone | own |
| ticket.review | — | — | — | all | zone | — |
| ticket.export | — | — | all | all | zone | — |
| ticket.import | — | — | — | all | all | — |

> **批量匯入匯出（feature 015, ADR-110/111）**：`*.export` 的 scope 是有作用的——它決定匯出檔涵蓋哪些列（team admin 只拿得到自己 WorkZone 內的通報單、指派給本隊的站點）。`*.import` 一律 `all`，因為逐筆保護來自每一列仍會跑的 `*.add` / `*.edit` 檢查；在這裡放 zone 只會看起來有意義而不影響任何行為。`data_auditor` 有 export 無 import（oversight only，全範圍無寫權）；team member 與 platform user 兩者皆無——批量誤操作的爆炸半徑遠大於單筆。

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
| work_zone.delete | — | — | — | all | all | — |

> ⚠️ ADR-049 的意圖是「畫/指派/刪除 zone 只有 gov 側能做」，但 gov/ngo admin 共用同一個 `admin`
> 角色，能力層分不出來。ADR-063 之後改為**硬擋**：`app/services/work_zone.py` 的
> `_require_gov_zone_authority` 要求 team-kind 持有者的 team 必須是 gov 型，否則 403。
> ngo admin 在矩陣上仍持有這些 capability，但實際呼叫會被擋下 —— 這就是
> `GOV_TEAM_ONLY_PERMS`（`app/core/permissions.py`）在 capability catalog 標記的意義。

### 動態欄位 Dynamic Field

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| dynamic_field.view | — | — | — | all | — | — |
| dynamic_field.add | — | — | — | all | — | — |
| dynamic_field.edit | — | — | — | all | — | — |
| dynamic_field.delete | — | — | — | all | — | — |

> 查詢的 `includeInactive: true`（管理端才看得到已停用欄位）在 `dynamic_field.view` 之外**額外**要求
> `dynamic_field.edit`（ADR-226）：看得到誰把欄位退役，屬於「有權退役」的一環，而不是「有權填表單」。
>
> **例外：`ticketPropertyConfigs` 與 `disasterTypes` 改由公開的 `ticket.view` 把關（ADR-263）。**
> 那是民眾填的通報單表單本身，而 `ticket.disasterTypes` / `disasterDetails` 本來就匿名可讀 ——
> 擋住只會讓持有 `ticket.add` 的民眾送得出單、看不到題目。`includeInactive` 仍各自要
> `dynamic_field.edit` / `project.edit`。

### 專案設定 Project Settings

一個部署 = 一場（混合型）災害的全域設定（ADR-090）。獨立於 `dynamic_field.*`：改災害型別會**連動整批動態欄位的可見性**，比改單一欄位定義重得多。

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| project.view | — | — | — | all | — | — |
| project.edit | — | — | — | all | — | — |

### 緊急公告 Announcement

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| announcement.view | all（公開） | all（公開） | all（公開） | all | all（公開） | all（公開） |
| announcement.publish | — | — | — | all | — | — |
| announcement.edit | — | — | — | all | — | — |
| announcement.delete | — | — | — | all | — | — |

### 行前通知 Pre-Departure（功能 007）

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| pre_departure.view | all（公開） | all（公開） | all（公開） | all | all（公開） | all（公開） |
| pre_departure.publish | — | — | — | all | — | — |
| pre_departure.edit | — | — | — | all | — | — |
| pre_departure.delete | — | — | — | all | — | — |

> 公開的是**生成後的 briefing**；template 是編輯者的作業面，讀取要 `pre_departure.publish`。

### 稽核 / RBAC 自管

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| audit.view | — | — | all | all | — | — |
| rbac.view | — | — | — | all | — | — |
| rbac.assign | — | — | — | all | — | — |
| rbac.edit | — | — | — | all | — | — |

> `rbac.view`（feature 009 #25：`/admin/rbac` 唯讀面的 checkpoint-1 gate）只有 super_admin；`rbac.*` 全是 super_admin 專屬治理，不委派給其他角色。

## 補充說明

### 公開白名單（`PUBLIC_PERMS`，`app/core/permissions.py`）
`map.view`、`station.view`、`ticket.view`、`announcement.view`、`pre_departure.view` — **所有**呼叫端唯讀可用，
`check_permission` 直接給 `Scope.ALL` 而不查 grant；靠 role 發這些鍵會讓登入者讀得比匿名少（ADR-259）。
`ticket.view_pii` **絕不**公開；匿名一律看不到 PII。

### PII 遮罩（ADR-049）
`ticket.view_pii` 不在 scope 內時回傳**遮罩字形**（`王◯◯` / `j***@***.com` / `09*****678`），不是 null、也不是報錯。逐角色：guest→遮罩、user→own、team admin/member→zone、data_auditor/super_admin→all。

### 異動時間軸的四層可見度（ADR-127~130，功能 016）
`*.view_history` 是**進入時間軸的門票**，它決定看得到「哪些資源」的歷史；`audit.view` 決定看得到「多深」。同一個時間軸依 caller 權限分四層揭露：

| 層級 | 內容 | 解鎖條件 |
|---|---|---|
| 一般 | 業務欄位（狀態、優先度、名稱、營業時間…） | `*.view_history` |
| PII | `contact_*`、詳細地址、精確座標 | `ticket.view_pii` 且 in scope，否則遮罩／不給值 |
| 稽核 | `review_note`、`moderation_status` | `audit.view` |
| RAW | 整列原始 audit 負載 | `audit.view` |

`data_auditor` 與 `super_admin` 同時持有 `audit.view=all` 與 `ticket.view_pii=all`，因此自動看得到四層全部，**沒有任何特例程式**。

> **通報單的團隊角色是 `zone` 不是 `team`。** ADR-049 把 `team_uuid` 從 `base_geometries` 移除後，`in_scope()` 的 TEAM 分支對 ticket 永遠回 `False`——對通報單發 `team` 等於發一個不成立的授權。**站點相反，是 `team`**：ADR-285 讓 `stations` 帶上指派的 `team_uuid`，站點不再用 zone。

### 「已定義、但目前無角色授予」的 capability（ahead-of-feature，ADR-050）
下列 key 存在於目錄、但 seed 沒發給任何角色，等對應功能實作時才會接上 enforcement：
`ai_duplicate.view`、`ai_duplicate.review`。
（`ticket.export` 自功能 015 起已授予；`audit.view` 自功能 016 起首次真正被 enforcement 消費；`pre_departure.*` 自功能 007 起已接上 enforcement，並補上原本沒有的 `pre_departure.delete`。）

### 相關 ADR
ADR-018（union）、ADR-019（兩軸/一人一 team，**身分部分被 010/ADR-068 取代**）、010/ADR-068·073·074（多 team 身分切換）、010/ADR-097（team 角色必須自給自足，`station.contribute`）、ADR-021（scope enum + 最寬勝）、ADR-027（view 公開）、ADR-030/048/049（view=all、PII 遮罩、scope 定案為純地理）、ADR-050（軟刪 + ahead-of-feature）、ADR-052（task 借 parent geometry 判 zone）、ADR-053（team 邊界欄位）、ADR-054（team.edit = super_admin）、ADR-127/128/130（時間軸 capability 與四層可見度）、ADR-285（站點改為手動指派給單一 team，不跟 zone）。
