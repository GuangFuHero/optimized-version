# RBAC v1 完整實作規格（ADR-012~050 · Schema · Pseudocode · Blast Radius · Tasks）

> **實作狀態（2026-07-06）**：**Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 已全部完成並驗證**（`pytest` 367 passed；`ruff check` 乾淨，除了一個與本次工作無關、我沒碰過的既有問題：`tests/test_graphql/test_mutations.py` 的 import 排序）。RBAC v1 規劃的四個 Phase 至此全部落地。
>
> **Review 後重構（2026-07-06，ADR-047）**：使用者 review 時指出 Phase 1 的「一動作一檔 + Command dataclass」跟專案既有的扁平 service 慣例（`auth_account.py`）並存、混淆架構。已把 7 個 domain（station/ticket/closure_area/config/suggestion/work_zone/admin）從 `app/services/<domain>/<action>.py` 收攏成扁平的 `app/services/<domain>.py`（具名函式、直接傳參、無 Command），對齊 `auth_account.py`。**行為零變更,`pytest` 367/367 重構前後皆全過。** 詳見 ADR-047;§6 與 ADR-016 已標註被取代。
>
> 落地過程中發現並修正/補上本文件原稿的幾處，見下：
>
> **Phase 4 完成內容**（T119-T120：Work Zone use-cases/API、ticket team_uuid、zone scope e2e）：
> - **T119**：`app/models/team.py` 的 `WorkZone`/`TeamZoneAssign` 早在 Phase 0 就建好，只是從沒被用過。這次新增 `app/core/permissions.py` 的 `Perm.ZONE_VIEW/MAKE/EDIT/ASSIGN`、`app/repositories/team_repository.py`（新檔）、`app/services/work_zone/{create,update,assign_team,remove_team}.py`（新檔，ADR-013/022 慣例）、`app/graphql/work_zone/{types,queries,mutations}.py`（新檔，GraphQL 而非 REST——這是核心業務功能，不是像 Phase 3 admin API 那種維運操作，遵循 ADR-035 的區分標準）。
> - **T120**：`ticket create 時設 team_uuid` 其實 Phase 1 就做了（`app/services/ticket/create.py` 一直都有 `team_uuid=actor.team_uuid`）——這次只補上「zone scope e2e 驗證」：`tests/test_graphql/test_zone_scope.py`，本 zone 通過、跨 zone 404、完全沒被指派 zone 的 team 一樣 404，三案例都透過真實 `WorkZone`/`TeamZoneAssign` + 真實 GraphQL `updateTicket` 呼叫驗證，不是 unit test 手造 resource。
> - **ADR-036**：`work_zone.view` 不進 `PUBLIC_PERMS`（內部行政資料，不像 station/ticket 那樣本來就該公開）。
> - **ADR-037**：zone assign/remove 只做 checkpoint 1、assign 為 idempotent；順便把 `validate_polygon()` 參數化掉硬編的 "Closure area" 字樣。
> - **ADR-038**：`gov_manager`/`super_admin` 拿到完整 zone 權限（`all`），這次一開始就沒漏掉 super_admin；`ngo_manager` 只給 `work_zone.view`。
> - 新測試：`tests/test_graphql/test_work_zone.py`（7 案例：CRUD、預設 deny、assign/remove 冪等性）、`tests/test_graphql/test_zone_scope.py`（3 案例，見上）。
>
> **Phase 3 完成內容**（T115-T118：audit 接線、bootstrap、admin API、rbac_test 限 dev-only）：
> - **T115 audit 接線**：`app/core/context.py:AuditContextMiddleware` + `app/db/session.py:set_audit_session_variables`（`after_begin` 監聽器）其實在本次 RBAC 改造之前就已經存在——這次只補了新增的 RBAC 表進 `AUDITED_TABLES`（Phase 0 就做了）。這次新增 `tests/test_audit_middleware.py`：先前 `tests/test_audit.py` 只驗證「trigger 讀 contextvar 正確」，但 contextvar 本身是不是真的由一個帶 JWT 的真實 HTTP request 正確設定，從來沒人端到端測過——補上後第一次跑就抓到一個純測試設計的陷阱（見該檔案內註解：測試自己的 fixture session 若在發 HTTP 請求前遺留一個尚未 commit 的交易，會讓 `app.current_user_id` 鎖定在錯誤的（空的）值——因為 `SET LOCAL` 在交易 BEGIN 當下就固定了。正式環境不會有這個問題，因為 `get_db()` 每個 request 都開一個全新的 session）。
> - **T116** `scripts/bootstrap_admin.py`（新檔）：依 verified contact 授予 `super_admin`，非 `--force` 時拒絕造出第二個（ADR-034）。
> - **T117** `app/api/v1/endpoints/admin.py` + `app/services/admin/{assign_role,add_team_member,remove_team_member}.py`（新檔）：user 列表（checkpoint1-only）、指派角色（一人一 kind、防最後一個 super_admin 被踢，ADR-032）、team member 新增/移除（checkpoint1+2）。
> - **T118** `app/api/v1/api.py:rbac_test_enabled()`：`rbac-test` 路由改白名單制，只有 `development`/`testing` 才掛（ADR-033）。
> - **ADR-031**：補 `super_admin` 缺的 `team.view`/`team.member.manage`（否則 admin API 的 team 端點對 super_admin 形同虛設）。
> - **ADR-035**：admin API 為何走 REST 不走 GraphQL。
> - 新測試：`tests/test_admin_api.py`（10 案例，含 last-super_admin 鎖死保護、跨 team 404）、`tests/test_bootstrap_admin.py`（4 案例）、`tests/test_audit_middleware.py`（1 案例，見上）、`tests/test_api_env_gating.py`（5 案例）。
>
> **Phase 2 完成內容**（T112-T114：query 讀取檢查、PII field resolver、預設 deny）：
> - `app/graphql/geo/queries.py`/`tickets/queries.py`：`stations`/`ticket(s)` 補上 checkpoint1(`check_permission`) + checkpoint2(`in_scope`，detail) / list 過濾(`scope_filter`，list)。`ticket_tasks`/`task_properties` 僅 checkpoint1。`config/queries.py` 補 `dynamic_field.view` checkpoint1。
> - `app/graphql/tickets/types.py`：`Ticket.contact_name/email/phone` 從純欄位改成掛 `ticket.view_pii` 檢查的 async field resolver，拒絕時回 `null`（ADR-029），不是 GraphQL 欄位錯誤。
> - `app/core/rbac_scopes.py:scope_filter()`（新函式，ADR-028）：`in_scope()` 的 list 版本，把 scope 轉成 SQL WHERE 條件，供 `tickets`/`stations` 列表查詢套用。
> - **ADR-027**：`station.view`/`ticket.view` 加入 `PUBLIC_PERMS`（公開瀏覽），`ticket.view_pii` 永不公開；`dynamic_field.view` 維持需登入。
> - **ADR-030**：修正 `user` 角色的 `ticket.view` 從 `own` 改成 `all`——公開瀏覽的東西，登入後可見範圍不該反而變窄。
> - 新測試：`tests/test_graphql/test_query_rbac.py`（PII 遮蔽正反案例、config 查詢預設 deny）；`tests/test_rbac_scopes.py` 新增 `scope_filter()` 的 own/team/gov/ngo/zone/none 每種都實際下 DB 查詢驗證。
>
> **Phase 1 後補測試**（原本只讓既有測試套件通過，own/all/none scope 靠舊測試意外覆蓋到，但 team/gov/ngo/zone 完全零覆蓋——事後補齊）：
> - `tests/test_rbac_scopes.py`：`widest()` 合併規則 + `in_scope()` 每種 scope（own/team/gov/ngo/zone/none/all）的正反案例，含之前完全沒測過的 team/gov/ngo/zone。
> - `tests/test_authz.py`：`require_scope` 的 403 vs 404 分流（own 不符→403、team 不符→404）、checkpoint1-only（無 resource）、以及 ADR-018 的 union/widest 合併（同一 user 兩個角色分別給 own/team，驗證取最寬）。
> - `tests/test_graphql/test_team_scope.py`：端到端驗證——同 team 使用者靠 `ticket.edit=team` 真的能改別人建立的 ticket；跨 team 同樣的 grant 會 404 不是 403。
>
> **Phase 0/1 落地決策（正式收錄為 ADR，見 §1）**：落地過程中做的每個決策都已補寫成完整的 `#### ADR-0XX`（Context/Decision/Consequences），不再只留在這段狀態說明的散列裡——
> - **ADR-039** `UserRoleAssign` 不帶 `team_uuid` 欄位（§2B 原稿曾寫要存，落地時發現會跟 `users.team_uuid` 產生雙重事實來源）。
> - **ADR-023 落地修正**（附加在 ADR-023 本文下方）：檢查點2 的狀態碼依 scope 種類分兩種——`own` 不符 403、`team`/`gov`/`ngo`/`zone` 不符 404，原稿「一律 404」過寬。
> - **ADR-040** `app/services/authz.py:require_scope`——兩檢查點邏輯從 `context.check_permission` 抽成 entrypoint-agnostic 共用函式，ADR-013「GraphQL/REST/AI 共用同一流程」真正落地的地方。
> - **ADR-041** use-case 一律收 `actor: User`（非 Optional），匿名擋在 `require_authenticated(info)`，不是 use-case 內部自己防禦。
> - **ADR-042** `GenericRepository.add()`——非 commit 版 `create()`，供多步驟原子編排（station+secondary_location 等）。
> - **ADR-043** 修正 `review_station_suggestion` 的原子性 bug（兩次獨立 commit → 一次）。
> - **ADR-044** use-case 層維持直接 import `app/graphql/scalars.py`/`suggestions/fields.py` 的純函式，不搬檔案——務實妥協，非嚴格分層。
> - **ADR-045** `in_scope()` 用 `getattr` 防禦式讀取；`created_by` 語意特殊的資源（`TaskAssignment`）用 adaptor（`as_scope_target`）包一層，不改引擎本身。
> - **ADR-046** Request-scoped 權限快取（`_rbac_cache`）——同一 request 內同一 actor 的 grant map 最多查一次 DB；程式碼裡原本寫著佔位用的 `(ADR/T105)` 已改成正確的 `(ADR-046)`（`app/core/security.py`）。

---

> **給實作模型（Sonnet）的讀法**：§1 讀決策 → §2 建 schema → §3 建 key 目錄 → §4/§5 建引擎 → §6 建 use-case → §7/§8 掛 enforcement/audit → §9 bootstrap/migration。§10 是逐檔改動表，§11 是可勾選 TASK。

**日期**：2026-07-04　**狀態**：語意決策定案，落地設計為建議實作（標 ⚙️ 者可微調）
**現況佐證**：`app/core/security.py:220-228`（舊 suffix 比對）、`app/graphql/geo/mutations.py:55-84`（authZ+validation+persist 混在 resolver）、`app/repositories/geo_repository.py:22`（repo 混業務邏輯）、`app/db/triggers.py`（audit trigger 已實作）、`app/models/auth.py:26-72`（現有 Group/Policy）。**code 內無 team/zone/gov/ngo。**

---

## 1. ADR 全集

### 1A. 原 D 版（ADR-012~017）— 已定案，本文件承接
- **ADR-012 Permission = Business Capability**：權限用 capability key（`dashboard.view`、`ticket.review`），不用 resource+action，與 DB table 解耦。
- **ADR-013 Permission 綁 Use Case**：授權/驗證/業務邏輯/repo 收進 UseCase，GraphQL/REST/AI/Batch 共用同一流程。→ 本文件 ADR-022 細化為「只寫入動作走 thin use-case」。
- **ADR-014 GraphQL 不直接依賴 Repository**：mutation → use_case → repository；GraphQL 只做 input parse / context / response map。
- **ADR-015 Repository 無業務邏輯**：repo 只 CRUD/Query。禁 workflow。（現況 `geo_repository.py:22 create_with_secondary_location` 一次寫兩表 = 要搬走的反例。）
- **ADR-016 Service/UseCase Vertical Slice**：`services/<domain>/<action>.py`。→ 本文件 ADR-022 採「寫入動作才拆檔」，不強制全面。**⚠️ 已被 ADR-047 取代**：落地後收攏成扁平 `app/services/<domain>.py`（一 domain 一 module、具名函式、無 Command dataclass），對齊既有 `auth_account.py` 慣例。
- **ADR-017 RBAC 與 ABAC 分層**：capability（做什麼）vs data condition（看哪些）。→ **精神保留**，但 ADR-020 把 data 層改成**固定 scope**，不做通用 condition 引擎。

### 1B. 新決策（ADR-018~026）

#### ADR-018 權限相加（union，無 deny override）
**Context**：D 版曾有 `user_permission_assign.effect(allow|deny)`；舊引擎 H4（多來源同 resource 衝突、dict 覆蓋、順序不定）。
**Decision**：權限只加不減。effective = 所有 grant 的聯集。**不做 deny**，`effect` 欄不要。收權 → 從 role/team 移除。
**Consequences**：➕ 可預測、**H4 消失**。➖ 無法對單人精準扣某能力（靠 role 設計）。

#### ADR-019 一人一 team + 兩軸 union 組合
**Decision**：一帳號 = 一平台角色 + 一 team 角色（**最多一 team**）。effective = 平台 grants ∪ team grants ∪ 直接 grants，全 additive、無 override。
**範例**：平台給 `map.view`，team 給 `map.edit` → `map.view + map.edit`。
**對應**：OPEN_Q #10 的「正交 OR 組合」。

#### ADR-020 固定 scope 取代通用 ABAC
**Decision**：不做 `condition_json` 引擎。資料邊界用固定 enum（§4）。動態規則（`credibility_score≥80`、`verification_status=human_verified`）寫進**該 use case**，不當權限政策。
**Consequences**：➕ 無 free-JSON 漂移、易測。➖ 新條件要改 code（頻率低，可接受）。

#### ADR-021 scope enum + 最寬勝 + Work Zone 進 v1
**Decision**：`none/own/team/gov/ngo/zone/all`；多 grant 取最寬；**Work Zone 進 v1**（`zone`=point-in-polygon）。
**Consequences**：忠於 6/28 memo；帶回地理工程（`work_zones`、ticket→zone、gov 畫 zone）。

#### ADR-022 中間路線 use-case + 兩檢查點 + repo pure CRUD
**Decision**：只**寫入動作**（create/update/delete/review/assign/publish）走 thin use-case，一接縫掛「RBAC 檢查點1（load 前）→ load → scope 檢查點2（load 後）→ repo」。讀取與瑣碎不強制。repo 收 pure CRUD。不全面採 ADR-016 一動作一檔。
**兩檢查點**：檢查點1 = 有無 capability（便宜、可 dependency）；檢查點2 = 這一筆是否屬我/我 team/我 zone（**必先 load 才有 `created_by`/`team_uuid`/geom**）。佐證 `geo/mutations.py:96-99` 已先 load 再檢查。FastAPI `dependencies=[]` 只能做檢查點1。
**Consequences**：➕ authZ/scope 單點可測、修掉 H1 fail-open。➖ 寫入動作要建 use-case 檔。

#### ADR-023 錯誤語意 403 / 404
**Decision**：沒該 capability → **403**；有 capability 但資源屬別 team → **404**（不洩漏跨 team 存在）。
**落地修正（Phase 0）**：原稿「資源不在 scope 內一律 404」實作時發現過寬，依 scope 種類拆成兩種：
- **`own` scope 不符 → 403**「Permission Denied.」——這是單純的擁有權判斷，不是 team 邊界問題，沒有「隱藏跨 team 存在」的理由；且既有 GraphQL 測試（`test_update_ticket_no_permission_edit` 等）本就斷言 403，若改 404 會是不必要的破壞性變更。
- **`team`/`gov`/`ngo`/`zone` scope 不符 → 404**「Not Found.」——這幾種才是組織邊界，維持原本「不洩漏跨邊界資源存在」的立意。
實作見 `app/services/authz.py:require_scope`（原本在 `app/graphql/context.py:check_permission`，見 ADR-040 抽離）。

#### ADR-024 audit = DB trigger（沿用）
**Decision**：沿用 `app/db/triggers.py`（已寫 `audit_logs`：table/action/row_id/old/new/user_uuid/client_ip，redact password_hash，append-only）。**不改 use-case decorator。**
**落地注意**：① app 須每 request 設 `SET LOCAL app.current_user_id / app.client_ip`，否則 actor=NULL；② 新 schema 表要加進 `AUDITED_TABLES`；③ trigger 無「業務動作名」（review/edit 都是 UPDATE），需要再另補。

#### ADR-025 預設 deny + 唯讀公開白名單 + Guest
**Decision**：預設一律 deny；明列可匿名唯讀 capability（`map.view`、`announcement.view`…）。Guest = 無 token 程式層視角，不進 DB。

#### ADR-026 舊 Group/Policy 引擎 drop-and-replace
**Decision**：零使用者 → 直接換掉，不留兩套。`security.py:220-228` suffix 比對整套丟。

### 1C. Phase 2 決策（ADR-027~）

#### ADR-027 `station.view` + `ticket.view` 加入 PUBLIC_PERMS；PII 永不公開
**Context**：Phase 2 要幫 GraphQL query 補讀取檢查（RBAC_TASKS.md T009/C1/C2 標記的最大洞）。舊 code 的 query 完全零檢查，但舊 `seed_rbac.py`（ADR-026 已丟棄的舊引擎）裡 `Guest` 角色原本就有 `map:read=all`、`request:read=all`——顯示原始產品意圖是「地圖與求助單列表本來就该公開瀏覽」，只是從未真的被 enforce。且既有測試證據具體：`test_stations_returns_data`、`test_station_detail`、`test_tickets_returns_data`、`test_tickets_with_bounds`、`test_tickets_filter_by_status`、`test_ticket_detail`（`tests/test_graphql/test_queries.py`）六個測試全部用**匿名**（無 `headers=`）呼叫，其中 `test_ticket_detail` 還斷言匿名查詢就能拿到 `contactName`/`contactEmail`。
**Decision**：
- `Perm.STATION_VIEW`、`Perm.TICKET_VIEW` 加入 `PUBLIC_PERMS`（`app/core/permissions.py`）——比照舊 Guest 角色意圖，讓災情地圖與求助單列表/詳情無需登入即可瀏覽。
- `Perm.TICKET_VIEW_PII` **絕不**加入 PUBLIC_PERMS，且匿名（`user is None`）一律視為看不到 PII，不管 scope 判定結果——這是 T010 那個 PII 外洩洞真正被關閉的地方。
- `Perm.FIELD_VIEW`（station/task property config schema）**不**公開——目前沒有任何測試或既有行為要求匿名存取，維持需要登入判斷；已登入但缺 grant 的角色（如測試用 `Field Coordinator` 角色）另外補授權（見 §11 T112 的落地細節）。
**Consequences**：➕ 忠於舊 seed 的原始產品意圖、且讓 6 個既有測試不用重寫。➖ `test_ticket_detail` 原本斷言匿名可見 PII 的部分**必須修正**——這條斷言本身就是 T010 要修的漏洞，不是要保留的行為；已改寫成「匿名看不到 PII、擁有者/客服看得到」兩條測試。
**決策方式**：使用者透過 AskUserQuestion 選定（三選一：兩者皆公開 / 只公開 station / 兩者皆需登入），選擇「兩者皆公開」。

#### ADR-028 List 層級的 scope 過濾：`scope_filter()`
**Context**：`in_scope()`（checkpoint2）只判斷「這一個已載入的物件」在不在 scope 內；但 `tickets`/`stations` 這類 list query 要在載入前就把資料庫裡「不在 scope 內的列」濾掉，這是同一條 policy 的不同形狀（單物件布林判斷 vs SQL WHERE 子句），需要一個新函式而非重複 `in_scope` 的邏輯。
**Decision**：新增 `app/core/rbac_scopes.py:scope_filter(scope, *, actor, model, db) -> list[condition]`：
- `all` → `[]`（無過濾）
- `own` → `model.created_by == actor.uuid`
- `team` → `model.team_uuid == actor.team_uuid`
- `gov`/`ngo` → `model.team_uuid IN (SELECT uuid FROM teams WHERE type = <actor 所屬 team 的 type，用 correlated subquery 查，不額外一次 DB round trip>)`
- `zone` → `EXISTS(SELECT 1 FROM work_zones JOIN team_zone_assign ... WHERE team_zone_assign.team_uuid = actor.team_uuid AND ST_Contains(work_zones.geometry, model.geometry))`
- `none` → `false()`（防禦性；checkpoint1 應該已經擋掉，理論上不會走到這裡）
所有需要 scope 過濾的 repo list/count 方法新增 `extra_filters: Sequence = ()` 參數，用 `query.where(*extra_filters)` 套用。
**Consequences**：➕ 單物件檢查與 list 過濾共用同一套 Scope 語意，不會出現兩份互相漂移的權限邏輯。➖ gov/ngo/zone 的 SQL 較複雜（subquery/EXISTS），但目前所有角色的 `station.view`/`map.view` 皆為 `all`，只有 `ticket.view`（`user`=own、`gov_manager`=gov、`ngo_manager`=zone、其餘=all）真正會用到非 all 分支——其餘分支的正確性由 `tests/test_rbac_scopes.py`/`test_authz.py` 的單元測試釘住，非等到有真實 zone 資料才驗證。

#### ADR-029 PII 欄位被拒時回傳 `null`，不是 GraphQL 欄位錯誤
**Context**：`Ticket.contact_name/email/phone` 要改成掛 `ticket.view_pii` 檢查的 field resolver。若沿用 `check_permission`（拋 `HTTPException`），單一欄位失敗會變成該欄位的 GraphQL field-level error（其餘欄位仍正常回傳，但 `errors` 陣列會多一條）。
**Decision**：PII field resolver **不**呼叫會拋例外的 `check_permission`/`require_scope`；改成直接組合 `resolve_scope` + `in_scope`（兩者都只回傳值，不拋例外）算出布林值，沒有權限就回傳 `None`，看起來像「這張單子沒填聯絡資訊」而不是一個要接住的錯誤。
**Consequences**：➕ 前端不用特別處理「這個欄位出錯」，跟一般「欄位是 null」的資料形狀一致，符合 PII 遮蔽本來就該「看起來像不存在」的目的。➖ 客戶端無法區分「真的沒填聯絡資訊」跟「有填但你看不到」——這正是遮蔽本來就要的效果，不是副作用。

#### ADR-030 修正 seed：`user` 角色的 `ticket.view` 改成 `all`（不是 `own`）
**Context**：實作 `tests/test_graphql/test_query_rbac.py` 時，`test_non_owner_login_user_cannot_see_others_pii` 一開始失敗——不是 PII 沒遮好，是**整張 ticket 都查不到**（`ticket()` 回傳 `None`）。追下去發現：`scripts/seed_rbac.py` 的 `user` 角色原本 `Perm.TICKET_VIEW: "own"`（Phase 0 沿用舊 seed 矩陣時定的），但 Phase 2/ADR-027 已經把 `ticket.view` 設為公開（匿名者拿到 `Scope.ALL`）。結果是：**匿名訪客看得到全部 ticket，已登入的一般 `user` 角色反而只看得到自己的**——登入不應該讓可見範圍變小，這是登入語意上的倒退，不是 scope 設計的正常結果。
**Decision**：`user` 角色的 `Perm.TICKET_VIEW` scope 由 `own` 改成 `all`（`scripts/seed_rbac.py` 與測試用 `tests/test_graphql/conftest.py` 的 `Login User` 角色比照修改）。**`Perm.TICKET_VIEW_PII` 維持 `own` 不變**——「看得到單子」跟「看得到聯絡資訊」本來就是分開的兩件事（ADR-012 拆 PII 的原因），公開瀏覽不代表 PII 也公開；「能不能編輯/刪除」（`TICKET_EDIT`/`TICKET_DELETE`/`TICKET_MAKE`/`TICKET_ASSIGN`）也維持 `own` 不變。
**未採用的替代方案**：曾考慮在 `require_scope` 裡加「PUBLIC_PERMS 當作每個人的最低 floor scope，跟實際 grant 取 union」的機制，讓已登入使用者的 scope 永遠不會比匿名者窄。放棄理由：這是治標不治本——真正的問題是 seed 資料本身跟「viewing 應該公開」的產品意圖不一致，直接修 seed 更直接、不需要在核心引擎多繞一層每次都要考慮「這個 perm 是不是 public」的隱性語意。
**Consequences**：➕ 登入後可見範圍只會更寬不會更窄，符合直覺。➖ `own` scope 對 `ticket.view` 在目前真實 seed 中已無任何角色會用到（只剩 `ticket.view_pii`/`ticket.edit` 等仍用 own）——不是壞事，`scope_filter`/`in_scope` 的 own 分支仍由單元測試（`test_rbac_scopes.py`/`test_authz.py`）獨立釘住，不需要靠真實角色才算「有測到」。

#### ADR-031 補上 `super_admin` 缺的 `team.view`/`team.member.manage`
**Context**：實作 T117 的 admin API（team member 管理）時發現：`scripts/seed_rbac.py` 的 `super_admin` 角色權限清單裡從來沒有 `Perm.TEAM_VIEW`/`Perm.TEAM_MEMBER_MANAGE`——目前 catalog 裡唯一持有 `team.member.manage` 的是 `kind="team"` 的 `admin` 角色（scope=team，只能管自己 team）。這代表就算 bootstrap 出了 super_admin，也完全無法透過 admin API 管理任何 team 的成員，因為沒有任何 platform 角色在全域 scope 持有這個能力。
**Decision**：`super_admin` 的權限清單加上 `Perm.TEAM_VIEW`/`Perm.TEAM_MEMBER_MANAGE`，scope=`all`（`scripts/seed_rbac.py`）。
**Consequences**：➕ admin API 的 team member 端點對 super_admin 可用，不用等 Phase 4 才補。➖ 沒有；`admin`（team 角色）維持 scope=team 不變，兩者不衝突（ADR-018 union）。

#### ADR-032 一人一角色（每種 kind）由 use-case 層強制，非 DB 約束；最後一個 super_admin 禁止被踢
**Context**：T117 的「指派角色」端點要決定：(1) 使用者已有同 kind（platform/team）角色時，新指派要怎麼處理；(2) 如果要拿掉的剛好是全平台唯一的 `super_admin`，會造成沒有人能再指派角色的鎖死局面（沒有 UI 路徑能恢復）。
**Decision**：`app/services/admin/assign_role.py` 在指派新角色前，查詢並刪除該使用者「同 kind」的既有角色指派（一人一 platform role + 一 team role，ADR-019 的落地方式，見 `app/models/rbac.py:UserRoleAssign` docstring——刻意不做 DB unique 約束，因為「同 kind 只能一個」是一個會隨業務演進的政策，不是資料完整性不變量）。指派 platform 角色前，若目標使用者目前持有 `super_admin` 且新角色不是 `super_admin`，會先數一次「扣掉這個人之後還剩幾個 super_admin」，`0` 就整個操作失敗（`AdminConflictError` → HTTP 409）。找不到使用者/角色是 `AdminNotFoundError`（404）；team 角色要求先有 `users.team_uuid` 是 `AdminConflictError`（409）——這兩個型別都是 `ValueError` 的子類別（`app/services/admin/errors.py`），沿用既有 use-case 層「拋 `ValueError` 表示網域層失敗」的慣例（例如 `app/services/station/update.py` 的 `"Station not found"`），只是額外分兩個子類別讓 REST endpoint 能分別對應到不同的 HTTP 狀態碼，而不是每個 domain 錯誤都回一律的 400。
**Consequences**：➕ 不會有「所有人都被鎖在 RBAC 系統外面」的不可逆事故。➖ 目前只擋「最後一個 super_admin 被換掉」，沒有擋「刪除使用者本身」（因為目前沒有 admin API 刪除使用者的端點）——之後如果加，需要同樣的計數保護。

#### ADR-033 `rbac_test` 路由改成白名單制（僅 `development`/`testing`），不是黑名單制（`!= production`）
**Context**：T118 原意是「限制在 dev/test 環境」。原本直覺會寫 `if settings.ENV != "production"`，但檢查 `../optimized-version-dockerized-deployment-setup/Backend/scripts/deploy-config.staging.env` 發現 `ENV=staging` 是真實會部署、對外可連線的環境（`APP_BASE_URL=https://demo.wan-guard.com`）——黑名單寫法會讓 staging 上仍然掛著這條暴露原始權限探測結果的路由。
**Decision**：改成白名單 `rbac_test_enabled(env) -> bool: return env in ("development", "testing")`（`app/api/v1/api.py`），只有明確已知的非正式環境才掛上 `rbac-test` 路由；`staging`/`production`/任何拼錯或未知值一律不掛，呼應 ADR-025「預設 deny」的精神,套用到路由層級。
**Consequences**：➕ 新環境值（例如未來加 `preview`/`qa`）預設不會意外暴露這條路由，除非顯式加進白名單。➖ 如果哪天真的想在某個新環境開放它，需要明確改這行程式碼——這是刻意的摩擦，不是缺點。

#### ADR-034 `bootstrap_admin.py`：第二個 super_admin 需要顯式 `--force`
**Context**：T116 需要一支「把 super_admin 角色發給某個帳號」的一次性腳本。風險：如果不小心對錯的帳號、或在已經有 super_admin 的環境重跑，會不知不覺疊加出多個 super_admin。
**Decision**：腳本在發現「該 role 已經有人持有」時，預設直接 `SystemExit`（拒絕執行），只有明確帶 `--force` 旗標才允許再加一個。腳本本身沒有 HTTP request context，所以這個操作在 `audit_logs` 裡的 `user_uuid` 會是 `NULL`（`app.current_user_id` 只由 `AuditContextMiddleware` 在真正的 HTTP 請求中設定，見 `app/core/context.py`）——這是預期行為，不是要修的缺陷。另外腳本刻意在每次呼叫內部建立自己的 engine/session（而不是像 `scripts/seed_rbac.py` 那樣用 module-level 單例），因為 async engine 的連線池會綁定建立當下的 event loop；跑在測試裡（每個測試各自一個新 event loop）時，module-level 單例會在第二個測試就撞見「connection attached to a different loop」。
**Consequences**：➕ 意外重跑不會靜默疊加管理員，且該行為有 `tests/test_bootstrap_admin.py` 直接釘住（含「無 verified contact」「非 force 拒絕」「force 允許」三種分支）。➖ 正常的第一次 bootstrap 之後,任何後續合法的第二個 super_admin 都需要人工加上 `--force`，這是刻意的摩擦。

#### ADR-035 Admin API 走 REST，不走 GraphQL
**Context**：T117 的「使用者列表 / 指派角色 / team member 管理」要放在哪一層？Phase 1/2 的寫入與讀取全部都掛在 GraphQL（`app/graphql/*/mutations.py`/`queries.py`）。
**Decision**：Admin API 獨立開一支 REST router（`app/api/v1/endpoints/admin.py`，掛在 `/api/v1/admin`），沿用既有 `rbac_test.py`/`users.py` 的 REST 慣例，不加進 GraphQL schema。三個寫入端點維持瘦身（ADR-014 的精神）：只解析 input、呼叫 use-case，兩個檢查點都在 use-case 內的 `require_scope` 完成；只有 `list_users` 這個純讀取端點在路由層用宣告式的 `dependencies=[security.has_permission(...)]`（checkpoint 1 only），因為 `user.view` 在目前 seed 裡沒有任何角色用非 all 的 scope,不需要 list 層過濾。
**未採用的替代方案**：把這幾個操作做成 GraphQL mutation/query,跟其他網域放在同一個 schema 裡。放棄理由：admin 操作（角色指派、team 成員異動）是維運性質而非產品功能面,獨立成一支專門的內部 REST 介面,之後要單獨收緊網路層存取（例如只允許內網呼叫）時邊界更清楚,不需要在共用的 GraphQL schema 裡额外做欄位級別的隱藏。
**Consequences**：➕ admin 操作與一般業務 GraphQL schema解耦,之後個別收緊存取邊界(如另掛 middleware 限制來源 IP)更直接。➖ 這是這個專案裡第一個「寫入動作用 REST 而非 GraphQL」的先例,如果之後還有更多 admin 類端點,要沿用這個 REST 慣例而不是跟著 Phase 1/2 的 GraphQL 慣例走,否則兩套模式會並存混淆。

#### ADR-036 `work_zone.view` 不進 `PUBLIC_PERMS`
**Context**：T119 要決定 Work Zone 的讀取要不要對匿名者公開，像 `station.view`/`ticket.view`（ADR-027）那樣。
**Decision**：`work_zone.view` 維持一般登入即可（非公開白名單），`app/graphql/work_zone/queries.py` 走 `check_permission`，匿名者得到 403。理由：Work Zone 邊界是 gov 內部行政資料（決定哪個團隊負責哪塊區域），不是像地圖站點/求助單那樣本來就要對外公開的救災資訊——沒有產品理由讓一般民眾查得到「這塊區域是哪個 NGO 在負責」。
**Consequences**：➕ 不用像 ADR-030 那樣事後修正——這次先確認清楚公開/非公開再動手，不必再走一次「先做錯再補 ADR」的循環。➖ 無；之後若真的要公開（例如做一個公開的「災區責任分工地圖」），是加入 `PUBLIC_PERMS` 的一行改動,不影響其他設計。

#### ADR-037 Work Zone 指派/移除 team 只做 checkpoint 1；指派為 idempotent
**Context**：T119「指派 team」這個動作要配多細的 scope 檢查？`work_zone.assign` 的效果對象其實有兩個（zone 和 team），不像其他 use-case 天然只有一個要 checkpoint 2 的 resource。
**Decision**：`app/services/work_zone/assign_team.py`/`remove_team.py` 只做 checkpoint 1（`require_scope(actor, Perm.ZONE_ASSIGN, db)`，不傳 `resource`）——現況所有持有 `work_zone.assign` 的角色（`gov_manager`/`super_admin`）都是 `all` scope,checkpoint 2 目前不會有實際效果,等真的需要「gov 只能指派自己轄下的 zone」這種更細的邊界時再加,不預先猜。指派本身做成 idempotent（`TeamZoneAssign` 已存在就直接回傳既有那筆,不重複插入、不噴 unique constraint 錯誤），對稱地，移除找不到現有指派時回傳明確的 `ValueError`（"This team is not assigned to this work zone"），而不是靜默成功——重複移除同一個東西應該讓呼叫者知道那個東西已經不在了。
另外，共用的 `validate_polygon()`（原本只給 `closure_area` 用）訊息裡硬編了 "Closure area" 字樣；沿用給 Work Zone 用之前先把它參數化成 `validate_polygon(geojson, *, entity="Closure area")`，讓 Work Zone 呼叫時能帶 `entity="Work zone"`，訊息才不會誤導（見 `app/services/geo_validation.py`）。
**Consequences**：➕ assign/remove 的錯誤語意都可預期（idempotent 成功 vs. 明確的「找不到」錯誤），不會有 unique constraint 500。➖ checkpoint 2 目前形同虛設（所有能指派的角色都是 all scope）——這是刻意的「先簡單，等真的需要再加」（YAGNI），不是遺漏。

#### ADR-038 `gov_manager`/`super_admin` 拿到完整 zone 權限（`all`）；`ngo_manager` 只拿 `work_zone.view`
**Context**：T119 的 seed 要決定誰能畫 zone、指派 team，誰只能看。
**Decision**：`gov_manager`：`ZONE_VIEW/MAKE/EDIT/ASSIGN` 全部 `all`（gov 協調全平台的 zone,不是只管自己團隊的——WorkZone 本身沒有 `team_uuid`/組織類型欄位可比對，用 `gov` scope 在這裡沒有意義，必須是 `all`）。`super_admin`：同樣全部 `all`（吸取 ADR-031 的教訓——這次一開始就把 super_admin 補齊，不留缺口等下個 Phase 才發現）。`ngo_manager`：只給 `ZONE_VIEW=all`（能看到自己被指派的 zone 邊界，但畫 zone / 換團隊是 gov 的職責，不是 NGO 自己能做的事）。
**Consequences**：➕ 權限矩陣跟「誰該做什麼」的業務語意一致；`super_admin` 這次沒有遺漏。➖ 無。

#### ADR-039 `UserRoleAssign` 不帶 `team_uuid` 欄位
**Context**：本文件原稿 §2B 曾把 `UserRoleAssign` 設計成連 `team_uuid` 都存一份（`team_uuid: Mapped[str | None]`），Phase 0 落地時發現這會造成雙重事實來源。
**Decision**：`UserRoleAssign` 不帶 `team_uuid` 欄位；team 角色永遠透過 `users.team_uuid` 判定（ADR-019「一人一 team」的唯一事實來源）。實作見 `app/models/rbac.py:UserRoleAssign` docstring。
**Consequences**：➕ 不會有「使用者的 `team_uuid` 跟他某筆角色指派上存的 `team_uuid` 兜不起來」的資料漂移問題。➖ 無——一人一 team 本來就代表這欄位是多餘的。

#### ADR-040 `require_scope` 抽成 entrypoint-agnostic 共用函式
**Context**：ADR-013 要求「GraphQL/REST/AI/Batch 共用同一授權流程」，但 Phase 0 落地時兩檢查點邏輯原本寫死在 `app/graphql/context.py:check_permission` 裡，REST/未來的其他 entrypoint 沒辦法重用。
**Decision**：把檢查點1+2 的核心邏輯抽到 `app/services/authz.py:require_scope(actor, perm, db, *, resource=None, cache=None)`——不知道 GraphQL/Guest 是什麼，純粹「已認證的 actor + capability + 可選 resource」。`context.check_permission` 現在只處理 GraphQL 特有的 Guest/匿名分支，其餘委派給 `require_scope`；REST 的 admin API（Phase 3）、Work Zone 的 GraphQL use-case（Phase 4）都直接呼叫這個函式，不重新實作一次判斷邏輯。
**Consequences**：➕ ADR-013 從「原則」變成真的只有一處程式碼要維護；REST/GraphQL 的授權判斷不會因為兩邊各自實作而不小心分岔。➖ 無。

#### ADR-041 Use-case 收 `actor: User`（非 Optional），匿名擋在 resolver 層
**Context**：舊版 `check_permission` 內部偷偷用「呼叫 `get_current_user(token="")` 觸發例外」的方式處理「沒登入」——這個判斷混在授權檢查裡不明顯，且 use-case 若收到 `actor: User | None` 又忘記檢查，匿名呼叫會在存取 `actor.uuid` 時炸出 500，而不是乾淨的 401。
**Decision**：每個 use-case 的 `execute()` 簽名固定收 `actor: User`（非 Optional）。GraphQL 端在呼叫 use-case 之前，一律先呼叫 `app/graphql/context.py:require_authenticated(info)` 取得真正的 `User`——沒登入就在這裡乾淨拋 401，效果等同 REST 的 `Depends(get_current_user)`，但用在「context 裡沒有 user」而非「token 壞掉」這條路徑上。
**Consequences**：➕ use-case 內部永遠不用再判斷「actor 搞不好是 None」，型別上就排除了這個情況；401 統一在同一處產生，訊息/status code 跟既有的 token 驗證失敗完全一致。➖ 每個需要登入的 mutation resolver 開頭都要記得呼叫 `require_authenticated`——這是刻意的顯式呼叫，不是自動裝置，忘記呼叫會讓 `actor` 型別對不上（型別檢查會抓到，不會留到 runtime 才炸）。

#### ADR-042 `GenericRepository.add()`：非 commit 版 `create()`
**Context**：repo 收斂成 pure CRUD（ADR-015）之後，像「建立 station 順便建立 secondary_location」這種多步驟寫入，需要在同一個 transaction 裡跑完兩個 repo 呼叫再一次性 commit，但既有的 `create()` 每次呼叫都自動 commit，兩步就是兩次 commit，中間失敗會留下半套資料。
**Decision**：`GenericRepository` 新增 `add(db, *, obj_in)`——只 `db.add()` + `flush()`，不 commit，回傳的物件已有 PK 可用（給後續步驟接線），交易邊界交給呼叫端的 use-case 自己決定何時 `commit()`。原本的 `create()` 保留不變（單步驟、自動 commit），給不需要多步驟編排的呼叫端繼續用。
**Consequences**：➕ 多表寫入現在是真正原子的（見 `app/services/station/create.py`——station + secondary_location 一次 commit）。➖ 兩個方法並存，呼叫端要知道該用哪個——`add()` 用在「這是多步驟交易的其中一步」，`create()` 用在「這就是唯一一步」，命名上已經盡量區分。

#### ADR-043 修正 `review_station_suggestion` 的原子性 bug
**Context**：落地 Phase 1 時發現舊版 resolver 對「套用建議值到 target」和「把 suggestion 標記為已審核」各呼叫一次會自動 commit 的 repo 方法——等於兩次獨立 commit。如果第二次失敗（例如 DB 斷線），target 已經被改了，但 suggestion 還卡在 `pending`，下次還會被拿出來審一次，造成資料不一致。
**Decision**：`app/services/suggestion/review.py` 改成直接操作 ORM 物件屬性（`setattr(target, ...)`、`suggestion.status = ...`），最後只呼叫一次 `db.commit()`，兩件事現在真的在同一個 transaction 裡。
**Consequences**：➕ 修掉一個真實存在、會在生產環境造成資料不一致的原子性 bug。➖ 無——這純粹是 bug fix，沒有取捨。

#### ADR-044 Use-case 層直接 import `app/graphql/*` 底下的純函式
**Context**：`geojson_to_geom`/`geom_to_geojson`（`app/graphql/scalars.py`）、`coerce_and_validate`（`app/graphql/suggestions/fields.py`）這幾個函式沒有任何 strawberry 耦合，純粹是資料轉換/驗證邏輯，但物理位置放在 `app/graphql/` 底下。嚴格照 ADR-014「GraphQL 不直接依賴 Repository」的分層精神，use-case（`app/services/`）理論上不該 import `app/graphql/*` 的任何東西。
**Decision**：**不搬動這些檔案**，use-case 層繼續直接 import 它們（見 `app/services/station|ticket|closure_area|work_zone/*.py` 開頭的 `from app.graphql.scalars import geojson_to_geom`）。這是務實妥協，不是嚴格分層——這幾個函式本質上是與 GraphQL 無關的純函式，只是歷史上放錯資料夾；為了理論上的分層整潔而搬檔案、改一堆 import path，換不到實際的解耦收益（因為函式本身早就沒有 GraphQL 依賴了）。
**Consequences**：➕ 沒有為了理論上的分層整潔去動一堆檔案路徑，省下的工夫拿去做真正有行為差異的事。➖ 分層圖上看起來「services 依賴 graphql」，第一次看的人可能會誤以為是反向依賴的架構問題——這條 ADR 就是留給那個人看的解釋。之後如果這些函式真的長出 GraphQL 專屬邏輯（不只是純轉換），才是搬家的時機。

#### ADR-045 `in_scope()` 用 getattr 防禦式讀取；`created_by` 語意不同的資源用 adaptor 包一層
**Context**：checkpoint 2（`in_scope()`）要讀 `resource.created_by`/`.team_uuid`/`.geometry`，但不是每個會被 scope 檢查的資源都有這三個欄位（例如 `TicketTask` 沒有 `team_uuid`），而且不是每個資源的「own」語意都等於「我建立的」——`TaskAssignment` 的 `own` 其實是「我是被指派的人」（`actor_uuid`），不是 `created_by`。
**Decision**：`in_scope()`／`scope_filter()` 一律用 `getattr(resource, "attr", None)` 讀取，缺欄位就讓那個 scope 分支乾脆判定不符（回傳 `False`），不拋例外。對「own 語意不是 `created_by`」的資源（如 `TaskAssignment`），呼叫端不改 `in_scope()` 本身，而是包一層小 adaptor 把語意轉譯過去——`app/services/ticket/scope_target.py:as_scope_target(created_by)` 回傳一個 `SimpleNamespace(created_by=actor_uuid, team_uuid=None, geometry=None)`，讓 `in_scope()` 看到的永遠是同一種形狀。
**Consequences**：➕ scope 引擎本身完全不需要知道每種 resource 的實際型別/欄位名稱，新增一種資源只要回答「有沒有這三個欄位」「own 語意是什麼」兩個問題就能接上，不用改引擎程式碼。➖ 每個「own 語意特殊」的資源都要自己寫一個小 adaptor 函式——目前只有 `TaskAssignment` 需要，數量夠少，還不到需要通用化這個 adaptor 機制的程度。

#### ADR-046 Request-scoped 權限快取（`_rbac_cache`）
**Context**：一個 request 裡可能對同一個 actor 檢查好幾個不同的 capability（例如 GraphQL 一次查詢裡 `stations`+`closure_areas`+ 各欄位的 PII resolver 都要各自 `resolve_scope`）。若每次都重新查一次 `role∪team∪direct` 的完整 union，同一個 request 內會重複打好幾次一樣的 DB 查詢。
**Decision**：`resolve_scope(actor, perm, db, cache=None)` 接受一個外部傳入的 plain dict；有給就用 `actor.uuid` 當 key 快取「這個 actor 的完整 grant map」，同一個 request 內不管查幾個 capability，`user_repository.get_user_permissions` 最多只打一次。GraphQL context 在 `get_context()` 建立時放一個空 dict 進 `info.context["_rbac_cache"]`；REST 的 `PermissionChecker` 依賴則用 `security.py:_request_rbac_cache(request)`（用 `request.state` 存放，同一個 request 內共用同一份）。快取用 `actor.uuid` 當 key、不是全域單例——這樣同一個 request 內就算切換 actor（例如測試情境）也不會讓不同使用者的權限互相污染。
**Consequences**：➕ 每個 request 對 RBAC 的 DB 查詢次數有上限（每個出現過的 actor 最多一次 grant-map 查詢），不會隨著檢查的 capability 數量線性增加。➖ 快取只在單一 request 內有效（存在 `request.state`/GraphQL context，request 結束就丟棄）——故意設計成這麼短命，不做跨 request 快取，避免「使用者權限剛被改，但快取還是舊的」這種過期問題，用短生命週期換取不用處理快取失效。

#### ADR-047 Use-case 層收攏成扁平 service 風格，拿掉 Command dataclass（取代 ADR-016 的 vertical slice）
**Context**：Phase 1 原本照 ADR-016 把每個寫入動作拆成 `app/services/<domain>/<action>.py`（一動作一檔），每檔一個 `@dataclass Command` + `async def execute(cmd, *, actor, db)`。Review 時使用者指出:專案原本就有 service 層慣例（`app/services/auth_account.py`——扁平 module、多個 function、`db` 首位直接傳參），這套「資料夾 + 一動作一檔 + Command dataclass」等於**多引入一種風格**,讓人以為 use-case 是一層新的抽象、混淆架構。實際查證後確認:`station/create.py` 跟 `auth_account.py` **是同一層**（都住 `app/services/`、都被 resolver 呼叫、都編排 repo），差別只有「檔案組織方式」和「多包一個 Command dataclass」兩個純儀式,沒有實質抽象差異。
**Decision**：把 7 個 domain（station/ticket/closure_area/config/suggestion/work_zone/admin）從資料夾收攏成**單一扁平 module**（`app/services/station.py` 等），`execute(cmd)` 展開成具名函式（`create_station(db, *, actor, geometry, …)`），**移除所有 `Command` dataclass**，簽名對齊 `auth_account.py`（`db` 首位、`*`、其餘 keyword、回傳 model）。內部小依賴一併收攏:`ticket/scope_target.py`→`ticket.py` 私有 `_as_scope_target()`、`admin/errors.py`→`admin.py` 的例外類別。**唯一刻意保留不動的是「resolver 只做 parse→呼叫 service→map，授權+驗證留在 service」**——這條有實質資安理由（舊 resolver 把授權跟業務邏輯混在一起是真的會出漏洞的地方，ADR-014），不是風格問題,不因這次收攏而回退。
**取代關係**：本 ADR 取代 ADR-016「vertical slice / 一動作一檔」與 §6 的 `services/<domain>/<action>.py` 檔案佈局。ADR-013/014/015/022 的其餘精神（use-case 擁有 authz+validation+transaction、repo 純 CRUD、兩檢查點）**全部保留**,只有「怎麼切檔 + 要不要 Command」這一點改變。
**Consequences**：➕ service 層只有一種風格,跟既有 `auth_account.py` 一致,不再有兩套並存;檔案數大幅減少（例如 ticket 從 10 檔變 1 檔）;拿掉 Command 的樣板,resolver→service 的呼叫更直接。➖ 單一 module 行數變多（`ticket.py` 約 250 行,仍遠低於 800 行上限）;失去「一個 Command 當 GraphQL/REST/AI 共用輸入契約」的形式化,但目前只有 GraphQL/REST 兩個 entrypoint、且都是內部呼叫,這個契約的價值本來就沒被用到,屬 YAGNI。**行為零變更**——這是純風格重構,`pytest` 367/367 在重構前後皆全過。

#### ADR-048 授權不用 `resource.team_uuid`;view 一律公開;delegation 用 zone;PII 依角色遮罩
> **狀態:部分被 ADR-049 取代(2026-07-09)。** 本條 2026-07-08 定案時漏看了兩件事:①`Docs/rbac-permissions-design.md` + `Dashboard.md` 的角色其實是「功能 × 組織」兩軸,gov/ngo 是 team 不是 role;②Dashboard 的資料範圍是組織歸屬(`ALL_GOV`/`OWN_TEAM`),跟本條「丟掉 team/gov/ngo、只用 zone」直接衝突。**「view 一律公開」「PII 依角色遮罩」仍成立;但「丟掉 team/gov/ngo + 移除 team_uuid」的 scope 決定被 ADR-049 重新打開。** 下方 Decision/Blast Radius 以 ADR-049 為準。

**Context（review 推出來的三個核心觀察）**

1. **view 不該被 team_uuid scope,應是純 capability。** 現況 `station.view` 對所有角色已是 `all`(公開瀏覽),但 `ticket.view` 只有 `user`/`data_auditor`/`super_admin` 是 `all`,**`gov_manager=gov`、`ngo_manager=zone`**。gov/ngo 這種「按組織過濾 view」跟「看得到 = 有沒有 capability」的直覺相衝突。救災平台的 view 應該全平台透明(協調、找重複都需要看到全部),受限的只該是**改**和**PII**。

2. **`resource.team_uuid` 有兩種身份,現況把它們綁死了。**
   - (a) **授權邊界**:「這筆屬別 team → 你不能碰」——把資料分區當權限牆。
   - (b) **資料歸屬**:「這個 station 是 X 組織登記的」——純描述,給未來「列出我組織的資源」filter / 顯示 / 報表用。
   查證後確認:**`resource.team_uuid` 目前唯一的消費者就是 RBAC scope 引擎的 team/gov/ngo 分支**(`app/core/rbac_scopes.py` 的 `in_scope`/`scope_filter`)+ ticket PII resolver(也是呼叫 `in_scope`)。沒有任何非授權用途。`zone` scope 吃的是 `geometry`+`ST_Contains`,**不吃 `resource.team_uuid`**。所以真正的選擇不是「刪不刪欄位」,是「**要不要讓它參與授權**」。

3. **team_uuid 當授權牆處理「gov 劃分給 ngo」很差;zone 才是對的機制。** 固定 scope 模型(ADR-020)沒有 per-resource ACL——沒辦法「針對特定資源、授權給特定 NGO」。所以 team_uuid 授權下,gov 要把單交給 NGO 只能**轉移 `team_uuid`(改歸屬)**,而且會讓 gov 自己(若為 team/gov scope)失去存取。相對地 **zone(Phase 4 的 `TeamZoneAssign`)天生就是幹這個的**:gov 指派一塊 WorkZone 給 NGO → NGO 對「地理落在該區的單」自動拿 `zone` scope,**不動任何單的歸屬、gov 也不失去存取、可疊加**,且符合救災按地理分工的現實。

**確定項（不論最後選哪案都要修,類 ADR-030 的倒退 bug）**
`gov_manager`/`ngo_manager` 的 `ticket.view=gov/zone`,配合 gov/zone scope 對 `team_uuid IS NULL`(民眾建的單)判定不匹配,導致 **一個政府協調員登入後看得到的求助單,比一個匿名 guest 還少**(guest 靠 ADR-027 拿 `ticket.view=all`)。跟 ADR-030 是同一個病根,只是當時只修了 `user` 角色。→ `gov_manager`/`ngo_manager` 的 `ticket.view` 應改 `all`。

**Options（授權模型光譜）**
- **A1（最純）**:授權只留 `own`/`all`,team/gov/ngo **和 zone 全拿掉**;`resource.team_uuid` 整欄刪除;`WorkZone`/`TeamZoneAssign`/Phase 4 一併報廢。角色只靠 capability 區分。最簡單,但無任何 org/地理邊界,且「任何 NGO 志工能看全國受災者電話」的隱私疑慮。
- **A2（最貼原則,建議）**:team/gov/ngo 退出授權;`resource.team_uuid` **保留為純資料欄位**(供未來「我組織的資源」filter,不當權限牆);`zone`(地理,不吃 team_uuid)**保留**,作為「gov 劃分給 ngo」的 delegation 機制。授權 = capability + `own`(+ NGO 的 `zone`)。
- **A2 變體**:連 zone 都砍 → 等於「純 own/all 授權 + team_uuid 留當資料」,比 A1 少刪一個欄位、比 A2 少一個地理邊界。
- **PII 可獨立處理**:即使「改」放寬到 own/all,`ticket.view_pii` 仍可能值得用 `zone`(資料最小化——不讓每個 NGO 看全國受災者 PII)。這是唯一「地理 scope 有獨立隱私理由」的地方。

**Decision（2026-07-08 定案，走 A2-變體 + 角色化 PII 遮罩）**

原本兩個 Open Question 都拍了:①「gov 劃分給 ngo」的粒度 = **整片區域(zone)**,不是特定幾張單(per-resource ACL 不做);② gov 與 ngo = **同一場救災、協作透明**(劃分後兩邊都能改,additive)。據此:

1. **view 全公開**:`station.view`/`ticket.view` 對所有角色一律 `all`(含 `gov_manager`/`ngo_manager`——修掉「登入後看得比匿名 guest 少」的倒退 bug)。
2. **任何人可建 station**:`STATION_MAKE` 加進預設 `user` 角色——一般民眾也能建立(這推翻了我原本「只有 gov/ngo 能建」那個無根據的預設)。
3. **team/gov/ngo 三種 scope 退出授權,`resource.team_uuid` 整欄移除。** 授權 scope 收斂成 **`none`/`own`/`zone`/`all`** 四種。理由:改/PII 都不再按組織身份分,「我區域內有幾個 station」是幾何查詢(`ST_Contains`)、不吃 team_uuid,`created_by` 已記錄建立者——`resource.team_uuid` 無任何剩餘消費者。（`users.team_uuid` **保留**——那是 team 成員身份,zone 指派與 admin 都要用。）
4. **delegation = zone(additive)**:gov 畫 WorkZone 用 `TeamZoneAssign` 指派給 NGO → NGO 對「地理落在該區」的 station/ticket 拿 `zone` scope;gov 自己的 scope 照舊,兩邊 union 疊加,**不轉移任何歸屬**。
5. **PII = 依角色遮罩(P3,角色化)**:`ticket.view_pii` capability **保留且維持 scope 化**(`own`/`zone`/`all`),但「不在 scope 內」的呈現從**回 `null`(原 ADR-029)改成遮罩(masking)**——借用 PR #23 的遮罩字形(`王◯◯` / `j***@***.com` / `09*****678`)。判定**不是二元 guest/登入**,而是**逐角色**:guest 無 capability → 遮罩;`user`=own(看自己的單原值,別人的遮罩);`ngo_manager`=zone;`gov_manager`/`data_auditor`/`super_admin`=all。→ 本決定**部分取代 ADR-029**(改成 masking-on-deny)、**推翻 PR #23 的二元模型**(見下「與 PR #23 的關係」)。

**與 PR #23 的關係**：PR #23（OPEN,`feature/backend-briefing` 上）做的是「guest 遮罩、任何登入者看原值」的**二元**模型,跟本決定的**角色化**模型**互斥**——PR #23 不該按原樣 merge。採用方式:**移植它的遮罩工具函式(`app/graphql/masking.py`)**,但改由 `ticket.view_pii` 的 scope 檢查驅動(取代它的 `MaskForGuests` 二元 FieldExtension)。PR #23 的 H3 geospatial 改動與本 RBAC 決定無關,各走各的。

**Blast Radius（本決定的落地範圍）**：
- `app/core/rbac_scopes.py`:移除 `in_scope`/`scope_filter` 的 team/gov/ngo 分支;`Scope` enum 拔掉 `TEAM`/`GOV`/`NGO`(留 `none`/`own`/`zone`/`all`)。
- `app/models/geo.py`:移除 `BaseGeometry.team_uuid` + 新 migration `drop column`。
- `scripts/seed_rbac.py` + `tests/test_graphql/conftest.py`:`user` 加 `station.make`;`gov_manager`/`ngo_manager` 的 `ticket.view` 改 `all`;edit/delete 由 gov/team 改成 `own`+`zone`(NGO)或 `all`;PII 維持 own/zone/all。
- `app/graphql/tickets/types.py`:PII resolver 從「回 null」改成「回遮罩」,拔掉 `_team_uuid_raw`,改吃 geometry(for zone);新增/移植 `app/graphql/masking.py`。
- `app/services/station.py`/`ticket.py`/`closure_area.py`:建立時不再寫 `team_uuid`。
- 測試:`tests/test_graphql/test_team_scope.py`(team scope 案例)移除或改寫成 zone;`tests/test_rbac_scopes.py` 拔 team/gov/ngo、保留 zone;PII 測試從 null 斷言改成遮罩斷言。

#### ADR-049 角色改採「功能 × 組織」兩軸;scope 模型定案 = 乙(純地理);一災一 DB
> **狀態:ACCEPTED 並已落地驗證（2026-07-09,`pytest` 367 passed、`ruff` 乾淨)。** 本條整合 2026-07-08/09 對照 `Docs/rbac-permissions-design.md`(v1.1)+ `Dashboard.md` §3~§7 後的修正,並取代 ADR-048 的 scope 部分。
>
> **落地內容**:`permissions.py` 移除 `DASHBOARD_*`;`rbac_scopes.py` 移除 `Scope.GOV`/`NGO`(留 none/own/team/zone/all,team 僅團隊管理用);`models/geo.py` + migration `2f9a1c7b6e04` drop `base_geometries.team_uuid`;`services/{station,ticket,closure_area}.py` 建立時不再寫 team_uuid;`seed_rbac.py` 角色重寫成 super_admin/data_auditor/user(平台)+ admin/member(團隊),廢除 gov_manager/ngo_manager;新增 `graphql/masking.py`(移植 PR #23 遮罩)+ `tickets/types.py` PII resolver 從 null 改遮罩(zone 判定改吃 geometry);測試:移除 `test_team_scope.py`(team-geo 已退場)、`test_rbac_scopes.py`/`test_authz.py` 的 team/gov/ngo 案例改 zone、`test_query_rbac.py` PII 斷言改遮罩、新增 `test_masking.py`。

**框住整個模型的前提:一場災難 = 一個新專案 = 一個獨立 DB,災後關閉**
跨災難的資料隔離**靠分部署(各自一個 DB)達成,不靠 RBAC**。所以:① RBAC 只需處理「單一災難內部」的授權;② schema **不需要** `disaster_id` 之類的租戶欄位;③ **不需要「看全國政府(ALL_GOV)」這種跨地理層級**——「災難指揮中心看這場全部」用「指派一塊涵蓋整個災區的 polygon」或給該角色 `all` 即可;④ seed **每次部署跑一次**;⑤ 生命週期短、拋棄式 → 不過度建治理機制。**這個前提正是「scope 選乙(純地理、無組織歸屬層)剛好夠、沒有缺點」的根據。**

**Context(關鍵認知修正)**
1. **角色是「功能 × 組織」兩軸,我當初把它們揉成一個。** `gov_manager`/`ngo_manager` 是錯的——那是「功能(Admin/Member)× 組織(gov/ngo)」。`Dashboard.md` §3 的 6 個「platform role」拆開就是:`Super Admin`/`Data Auditor`(平台級、org-agnostic 功能)+ `Admin`/`Member`(§4 團隊階層功能)× `team.type`(gov/ngo/無)。
2. **schema/引擎本來就支援兩軸**,所以角色拆解**幾乎純 seed**:`user_role_assign→role`(功能)、`users.team_uuid→team.type`(組織)早就分開,`in_scope` 的 gov/ngo 分支本來就是 `actor.type == resource.type`(相對於當事人、gov/ngo 邏輯相同)。當初填 `gov_manager` 角色是**seed 訂錯,不是結構錯**。
3. **gov ≠ ngo 有一項功能差異**:只有 gov 能 `work_zone.make`/`work_zone.assign`(政府劃定責任區、指派給 NGO 的職權)。→ 這條能力綁 `team.type==gov`(seed 只發給 gov 側)。
4. **Dashboard 沒有自己的權限**:它是把 ticket/station/物資/志工等模組「彙總」出來的視圖,可見範圍**繼承自來源模組的 scope**,不該有獨立 `dashboard.view`/`export`。→ 從目錄移除 `DASHBOARD_*`。同理 `map.view`(看圖是彙總)可能該拆成「看圖=衍生 / 封路=真實資源」。
5. **無 `ANY_TEAM`**(Dashboard §6 有,但不採用)。

**Decision — 角色模型(ACCEPTED,純 seed,不動結構)**
- 功能角色 = `super_admin`、`data_auditor`(平台級)+ `admin`、`member`(團隊階層);**廢除 `gov_manager`/`ngo_manager`**。
- 組織 = `users.team_uuid → team.type ∈ {gov, ngo}`;「政府協調員」= role `admin` + gov team。
- gov 專屬:`work_zone.make`/`assign` 只發給 gov 側(seed)。
- 其餘 seed 訂正:`ticket.view` 一律 `all`(修 gov/ngo 看得比 guest 少);`user` 加 `station.make`(任何人可建站);`data_auditor` **拿掉 `station.review`**(稽核員只讀,ADR 與 `Docs` §2.4 一致);`data_auditor` 加 `audit.view`(但看 log 端點尚未實作)。
- `DASHBOARD_*` 從 `permissions.py` 目錄移除(衍生視圖無獨立權限)。

**Decision — scope 資料範圍模型 = 乙(純地理,ACCEPTED)**
- **scope 全集收斂成 `none` / `own` / `zone` / `all`**;`team` 僅保留給「團隊管理員管自己 team 成員」(`team.member.manage=team`,對 Team 實體、不碰 geo 資源)。**移除 `Scope.GOV` / `Scope.NGO`。**
- **管轄權由地理決定,不由歸屬**:一筆 geo 資源能不能被某 team 的人 edit / 看 PII,看它的座標是否落在該 team 被指派的 WorkZone polygon 內(`ST_Contains`)。**`resource.team_uuid` 整欄移除(migration drop column)**;`users.team_uuid` 保留(成員身份、zone 指派要用)。
- **gov→ngo 委派 = 巢狀 polygon**:ngo 的 polygon 嵌在 gov 的 polygon 內,同一點同時命中兩者 → 兩邊都能改,不轉移任何歸屬(附錄:走一遍實例見對話紀錄)。
- **建立權與 team_uuid 完全脫鉤**:`station.make`/`ticket.make` 是純 capability(checkpoint 1),任何人有能力就能建;建立時**不再寫 team_uuid**。
- **zone 指派階層採「先信任」不硬擋**:`work_zone.assign` 目前 scope=all,持有者(super_admin + gov admin,ngo admin 因共用 `admin` 角色也技術上拿得到)能指派任何 polygon 給任何 team;**不加 team.type=gov 硬牆**。萬一濫用,最壞是「某 team 被錯誤授予/移除某區 zone 存取」或「gov 自我擴大地理範圍」——但**碰不到大眾(view 已公開、PII 逐角色遮罩)、不刪資料、不提權到 super_admin、`team_zone_assign` 全程進 audit log、完全可逆**。硬牆(檢查目標 team.type + 子 polygon 是否在自己轄區內)列為之後可加的一層,不擋本輪。

**取代關係**：ADR-048 的「view 一律公開」「PII 依角色遮罩」**維持**;其「丟掉 team/gov/ngo + 移除 team_uuid」**由本條正式定案採用**(乙)。ADR-030(view own→all)被「view 一律 all」涵蓋。

**PII 落地補充(承 ADR-029/048,不再是 null)**:`ticket.view_pii` 維持 scope 化(own/zone/all);不在 scope 內 → **回遮罩**(移植 PR #23 的 masking 字形:`王◯◯`/`j***@***.com`/`09*****678`),不是 null。判定逐角色:guest→遮罩、user→own、team admin/member→zone、data_auditor/super_admin→all。zone 判定吃 `resource.geometry`(不再吃 team_uuid)。

**seed 角色矩陣（本輪落地採用；member/admin 的 own vs zone 切分為落地時的判斷,可調）**:
- `super_admin`(平台):全部 `all`。
- `data_auditor`(平台):唯讀——map/station/ticket `view`、`ticket.view_pii`、`user.view`、`audit.view` 皆 `all`;**無** edit/make/review。
- `user`(平台,預設民眾):view 全 `all`;`station.make`/`ticket.make`=all;`station.edit/delete`、`ticket.edit/delete`、`ticket.view_pii`、`ticket.assign` 皆 `own`。
- `admin`(團隊,協調者):view 全 `all`;make=all;`station/ticket .edit/delete`、`ticket.assign/review`、`station.review`、`ticket.view_pii` 皆 `zone`;`team.view`/`team.member.manage`=team;`work_zone.view/make/assign`=all。
- `member`(團隊,現場):view 全 `all`;make=all;`edit`、`ticket.view_pii`=zone;`delete`、`ticket.assign`=own;**無** team 管理、**無** work_zone。

**落地分類(給你估工)**
- **純 seed(便宜、無 migration、低風險)**:角色拆兩軸、gov-only zone、view=all、任何人建站、稽核員拿掉 review、加 audit.view 的 grant。
- **動結構(要 code / 可能 migration)**:① **PII 角色化遮罩**(移植 masking 函式 + resolver `null→遮罩`)——**不論 scope 選哪案都要做**;② **scope 模型**——選乙才砍欄位/migration,選甲/丙 team_uuid 留著、結構幾乎不動;③ `DASHBOARD_*` 移除目錄(小);④ map.view 拆(小,可選)。
- **另立新功能(非本輪)**:多角色放寬(`assign_role` use-case)、audit 檢視端點、志工/物資/公告模組——都是建功能,不只權限。

#### ADR-050 Capability↔現有程式碼一致性稽核;補齊三個對稱缺口;軟刪政策
> **狀態:ACCEPTED 並已落地(2026-07-09,`pytest` 371 passed、`ruff` 乾淨)。** 收斂範圍:只把 RBAC 定義/權限接進**現有程式碼**,不建新模組。

**稽核結果(code ↔ seed 交叉比對)**
- **A. 現有程式碼檢查了、但沒角色被授權 = 空**——沒有「現有功能沒人能用」的破洞;service 層每個寫入動作查的 Perm **全對**。
- **刪除死碼 `app/graphql/queries.py`**:與已刪的 `graphql/mutations.py` 同類——定義了 `GeoQuery`/… 同名 class 但 schema.py 從子模組 import,**零引用**,且是 Phase 2 前的舊版(resolver 無權限檢查)。留著有「被誤接、繞過 read 檢查」的風險。

**補齊三個功能對稱缺口(權限已發、但現有 code 缺對應動作)**
- `delete_ticket`(GraphQL mutation + `services/ticket.py`,查 `TICKET_DELETE`)——station 有 delete、ticket 卻沒有的不對稱。
- `delete_closure_area`(+ `services/closure_area.py`,查 `MAP_DELETE`)——封路原本只有 create/update。
- `review_ticket`(+ `services/ticket.py`,查 **`TICKET_REVIEW`**)——把「改 `verification_status`(審核)」從 `update_ticket`(`TICKET_EDIT`)**拆出來**,成為獨立的 review 閘門,對齊 spec 的 REVIEW 語意。`update_ticket` 不再碰 verification_status。

**軟刪政策(承 `TimestampMixin.delete_at`)**
- **Entity(資料)一律軟刪**:`delete_ticket`/`delete_closure_area` 用 `soft_delete()`(set `delete_at`),與既有 `delete_station` 一致——救災資料永不真的丟,只從 active 查詢隱藏;audit trigger 另有完整記錄。
- **junction 關聯(`UserRoleAssign`/`TeamZoneAssign`/`TaskAssignment`)一律硬刪(2026-07-09 定案)**:
  - `UserRoleAssign`/`TeamZoneAssign` 是**授權關聯**——移除角色/移除 zone 是**撤權**,軟刪會讓「撤了卻殘留」(只要有一支授權查詢忘濾 `delete_at`)= 資安反模式。
  - `TaskAssignment`(志工↔任務)也硬刪——「取消指派」就該是**直接斷開**,不留半死不活的關聯。
  - **歷史不靠軟刪保留,靠 audit trigger**:三張表都在 `AUDITED_TABLES`(已驗證),每次硬刪都寫進 append-only 的 `audit_logs`(含 `old_values`),所以「誰曾被指派/曾有什麼角色/曾管哪塊 zone」查得到,不會遺失。→ **junction 不需要 `delete_at`,不需要 migration。**

**未做/已決定留著**:「純超前定義」的 capability(`AUDIT_VIEW`/`USER_MAKE/EDIT/DELETE`/`RBAC_EDIT`/`TEAM_VIEW`/`FIELD_MAKE/DELETE` + 目錄佔位 `AI_DUP_*`/`ANN_*`/`PREDEP_*`/`TEAM_EDIT`/`TICKET_EXPORT`)**留著不修剪**(ahead-of-feature 慣例,2026-07-09 定案),等對應功能實作時才會被 enforcement 接上。

---

## 2. 資料模型（新 schema）

### 2A. 移除（ADR-026）
`Group` / `Policy` / `PolicyGroupAssign` / `PolicyUserAssign` / `UserGroupAssign`（`app/models/auth.py:26-72`）。

### 2B. 新增（`app/models/rbac.py` + `app/models/team.py`）
```python
# --- team.py ---
class Team(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "teams"
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(10))      # "gov" | "ngo"   ← 支援 gov/ngo scope
    status: Mapped[str] = mapped_column(String(20), default="active")

class WorkZone(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "work_zones"
    name: Mapped[str] = mapped_column(String(100))
    geometry = mapped_column(Geometry("MULTIPOLYGON", srid=4326))  # gov 畫的 polygon
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))

class TeamZoneAssign(Base, UUIDPKMixin):                # gov 指派 zone 給 team
    __tablename__ = "team_zone_assign"
    __table_args__ = (UniqueConstraint("team_uuid", "zone_uuid", name="uq_team_zone"),)
    team_uuid: Mapped[str] = mapped_column(ForeignKey("teams.uuid"), index=True)
    zone_uuid: Mapped[str] = mapped_column(ForeignKey("work_zones.uuid"), index=True)

# --- rbac.py ---
class Role(Base, UUIDPKMixin):
    """定義全域共用；team 綁在指派(user_role_assign)，不綁 role 本身。"""
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(50), unique=True)
    kind: Mapped[str] = mapped_column(String(10))      # "platform" | "team"

class Permission(Base, UUIDPKMixin):
    __tablename__ = "permissions"
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)  # "ticket.review"
    description: Mapped[str | None] = mapped_column(String(255))

class RolePermissionAssign(Base, UUIDPKMixin):
    """★ scope 綁這裡（不綁 permission）→ 同 permission 不同 role 可有不同 scope。"""
    __tablename__ = "role_permission_assign"
    __table_args__ = (UniqueConstraint("role_uuid", "permission_uuid", name="uq_role_perm"),)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    scope: Mapped[str] = mapped_column(String(10), default="none")   # none/own/team/gov/ngo/zone/all

class UserRoleAssign(Base, UUIDPKMixin):
    """一人最多一 platform role + 一 team role；team role 這裡帶 team_uuid。"""
    __tablename__ = "user_role_assign"
    __table_args__ = (UniqueConstraint("user_uuid", "role_uuid", name="uq_user_role"),)
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"))
    team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), nullable=True)  # team role 才有

class UserPermissionAssign(Base, UUIDPKMixin):
    """例外直接 grant，additive（無 effect 欄，ADR-018）。"""
    __tablename__ = "user_permission_assign"
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"))
    scope: Mapped[str] = mapped_column(String(10), default="none")
```

### 2C. 變更既有
```python
# users (auth.py): 加單一 team_uuid（一人一 team, ADR-019）
team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), nullable=True, index=True)

# base_geometries (base.py 的 BaseGeometry / geo.py): 加 team_uuid（team/gov/ngo scope 的資源歸屬）
#   建立時 = 建立者的 team_uuid（denormalize，省 join）。tickets/stations/closure_areas 都繼承到。
team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), nullable=True, index=True)
#   註：zone scope 用既有 geometry（srid=4326）做 point-in-polygon，不需 resource 存 zone。
```

---

## 3. Permission-key 目錄（`app/core/permissions.py`）

命名 `<capability>.<action>`（ADR-012），**單一事實來源**＝以 C 版「11 模組 × Operation Code」推導。⚙️ 可調。`FILTER/REFRESH/RESET` 屬前端 UI，不列權限。

```python
class Perm(StrEnum):
    # Dashboard
    DASHBOARD_VIEW="dashboard.view"; DASHBOARD_EXPORT="dashboard.export"
    # Ticket（PII 拆開：view != view_pii）
    TICKET_VIEW="ticket.view"; TICKET_VIEW_PII="ticket.view_pii"; TICKET_MAKE="ticket.make"
    TICKET_EDIT="ticket.edit"; TICKET_DELETE="ticket.delete"; TICKET_ASSIGN="ticket.assign"
    TICKET_REVIEW="ticket.review"; TICKET_EXPORT="ticket.export"
    # Resource Station
    STATION_VIEW="station.view"; STATION_MAKE="station.make"; STATION_EDIT="station.edit"
    STATION_DELETE="station.delete"; STATION_REVIEW="station.review"
    # Interactive Map（圖磚/封閉區/公開讀）
    MAP_VIEW="map.view"; MAP_MAKE="map.make"; MAP_EDIT="map.edit"; MAP_DELETE="map.delete"
    # AI Duplicate Review
    AI_DUP_VIEW="ai_duplicate.view"; AI_DUP_REVIEW="ai_duplicate.review"
    # User Management
    USER_VIEW="user.view"; USER_MAKE="user.make"; USER_EDIT="user.edit"; USER_DELETE="user.delete"
    # Team Management（MEMBER op）
    TEAM_VIEW="team.view"; TEAM_EDIT="team.edit"; TEAM_MEMBER_MANAGE="team.member.manage"
    # Dynamic Fields
    FIELD_VIEW="dynamic_field.view"; FIELD_MAKE="dynamic_field.make"
    FIELD_EDIT="dynamic_field.edit"; FIELD_DELETE="dynamic_field.delete"
    # Emergency Announcement（PUBLISH op）
    ANN_VIEW="announcement.view"; ANN_PUBLISH="announcement.publish"
    ANN_EDIT="announcement.edit"; ANN_DELETE="announcement.delete"
    # Pre-Departure Notice
    PREDEP_VIEW="pre_departure.view"; PREDEP_PUBLISH="pre_departure.publish"; PREDEP_EDIT="pre_departure.edit"
    # Audit Log
    AUDIT_VIEW="audit.view"
    # RBAC 自身（Super Admin）
    RBAC_ASSIGN="rbac.assign"; RBAC_EDIT="rbac.edit"

PUBLIC_PERMS = {Perm.MAP_VIEW, Perm.ANN_VIEW}   # ADR-025 唯讀公開白名單（Guest 可）
```
seed 驗證：`role_permission_assign` 用到的 key 必須 ∈ `Perm`；key 只放已存在或下一個要做的模組。

---

## 4. Scope 引擎（`app/core/rbac_scopes.py`）

```python
class Scope(StrEnum):
    NONE="none"; OWN="own"; TEAM="team"; GOV="gov"; NGO="ngo"; ZONE="zone"; ALL="all"

WIDTH = {Scope.NONE:0, Scope.OWN:1, Scope.TEAM:2, Scope.ZONE:3, Scope.GOV:4, Scope.NGO:4, Scope.ALL:5}
def widest(scopes): return max(scopes, key=lambda s: WIDTH[s], default=Scope.NONE)  # ADR-021 最寬勝

# 檢查點2：拿到 resource 後判定。回傳 True/False；False 由呼叫端決定 403/404（見 §5）
async def in_scope(scope, *, actor, resource, db) -> bool:
    if scope == Scope.ALL:  return True
    if scope == Scope.OWN:  return resource.created_by == actor.uuid
    if scope == Scope.TEAM: return resource.team_uuid is not None and resource.team_uuid == actor.team_uuid
    if scope in (Scope.GOV, Scope.NGO):
        return resource.team is not None and resource.team.type == actor.team.type   # 同型別
    if scope == Scope.ZONE:  # ticket.geom ∈ actor.team 被指派 zones（point-in-polygon）
        return await db.scalar(
            select(func.count()).select_from(WorkZone)
            .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == WorkZone.uuid)
            .where(TeamZoneAssign.team_uuid == actor.team_uuid,
                   func.ST_Contains(WorkZone.geometry, resource.geometry))
        ) > 0
    return False
# ⚙️ team/zone/gov 交錯 precedence（「本 team 但不在其 zone」）落地精修。
```

---

## 5. 權限解析 pipeline（`app/core/security.py` 重寫 PermissionChecker；`app/graphql/context.py` 重寫 check_permission）

```
# 檢查點1（load 前）：有無 capability？→ 回傳該 capability 的最寬 scope，或 403
def resolve_scope(actor, perm_key, db) -> Scope:
    grants = union(
        role_permission_assign for role in actor.platform_role + actor.team_role,   # ADR-019
        user_permission_assign for actor,                                            # 直接 grant
    ) filtered by permission.key == perm_key
    if grants is empty: raise HTTP 403           # ADR-023 無 capability
    return widest(g.scope for g in grants)       # ADR-018 union / ADR-021 最寬勝
    # request-scoped cache（存 graphql context / request.state），一 request 一次查

# 檢查點2（load 後）：資源歸屬
async def check_object(scope, actor, resource, db):
    if scope == Scope.ALL: return
    ok = await in_scope(scope, actor=actor, resource=resource, db=db)
    if not ok:
        # ADR-023：有 capability 但跨 team/zone → 404（不洩漏存在）
        raise HTTP 404
# 註：純寫入無既有 resource（create）只跑檢查點1。edit/delete/review 一定跑檢查點2（修 H1）。
```
GraphQL context（ADR-025）：無 token → actor=Guest；Guest 只有 `PUBLIC_PERMS`，其餘 perm → 403。

---

## 6. Use-case 架構（ADR-013/014/015/022）

> **⚠️ 本節的「一動作一檔 + Command dataclass」佈局已被 ADR-047 取代。** 實際落地是扁平風格：
> ```
> services/
>   station.py    # create_station / update_station / delete_station / create_station_property / ...
>   ticket.py     # create_ticket / update_ticket / assign_task_actor / ...
>   closure_area.py  config.py  suggestion.py  work_zone.py  admin.py
> ```
> 每個是具名 `async def <verb>_<noun>(db, *, actor, …)` 函式（對齊 `auth_account.py`），**無 `Command` dataclass、無 `execute()`**。下面保留原稿的一動作一檔 pseudocode 作為「當初的設計意圖」紀錄,但檔案佈局以 ADR-047 為準。

**（原稿）檔案佈局**（只寫入動作）：`app/services/<domain>/<action>.py`
```
services/
  station/ create.py update.py delete.py review.py
  ticket/  create.py update.py delete.py review.py assign.py
  announcement/ publish.py ...
```
**Use-case 骨架（pseudocode）**：
```python
async def execute(cmd: CreateStationCommand, actor: User, db) -> Station:
    scope = resolve_scope(actor, Perm.STATION_MAKE, db)   # 檢查點1（create 免檢查點2）
    validate_point(cmd.geometry)                          # 驗證（從 resolver 搬來）
    station = await station_repo.create(db, {             # repo = pure CRUD
        **cmd.to_row(), "created_by": actor.uuid, "team_uuid": actor.team_uuid,
    })
    if cmd.secondary_location:                            # ADR-015 兩表編排搬上 use-case
        await secondary_location_repo.create(db, station.uuid, cmd.secondary_location)
    await db.commit()                                     # use-case 擁有 transaction
    return station                                        # audit 由 DB trigger 自動記
```
**update 型（含檢查點2）**：
```python
async def execute(cmd: UpdateStationCommand, actor, db):
    scope = resolve_scope(actor, Perm.STATION_EDIT, db)  # 檢查點1
    station = await station_repo.get_active(db, cmd.uuid) or raise 404
    await check_object(scope, actor, station, db)        # 檢查點2 → 跨 team 404
    await station_repo.update(db, station, cmd.changed_fields())
    await db.commit()
```
**repo pure CRUD（ADR-015）**：把 `geo_repository.py:22 create_with_secondary_location` 拆成 `station_repo.create` + `secondary_location_repo.create`，編排移到 use-case。
**GraphQL thin resolver（ADR-014）前→後**：
```python
# 前（現在 geo/mutations.py:55-84）：check_permission + validate + map + repo 全在 resolver
# 後：
@strawberry.mutation
async def create_station(self, info, input) -> StationType:
    cmd = CreateStationCommand.from_input(input)
    station = await station_create.execute(cmd, actor=info.context["user"], db=info.context["db"])
    return StationType.from_model(station)
```

---

## 7. Enforcement rollout
- **預設 deny**（ADR-025）：`context.py` 無 token → Guest；移除「無 token 放行」預設。
- **公開白名單**：`map.view` / `announcement.view` 允許 Guest。
- **GraphQL query 補 read 檢查**（現最大洞）：`tickets/queries.py`、`geo/queries.py`、`config/queries.py`、`announcements/queries.py` 每個 resolver 先 `resolve_scope(actor, <X>.view)`，依 scope 過濾（own→加 created_by filter；team→加 team_uuid filter；zone→空間 filter）。
- **PII 拆欄**：ticket `contact_*` 改 field resolver，檢查 `ticket.view_pii`；無權回 None。
- **REST**：`app/api/v1/endpoints/*` 業務端點掛檢查點1（`dependencies=[]`）；需 own/team 過濾者注入 scope 參數。

---

## 8. Audit 整合（ADR-024）
- **注入 actor**：在 `get_db()`（`security.py:166`）或 middleware，取到 current_user 後對該連線 `SET LOCAL app.current_user_id = :uuid`（＋`app.client_ip`）。GraphQL 走 `context.py` 的 db。
- **更新 `AUDITED_TABLES`**（`app/db/triggers.py:4`）：加 `teams, work_zones, team_zone_assign, roles, permissions, role_permission_assign, user_role_assign, user_permission_assign`；移除舊 `groups, policies, policy_*`。

---

## 9. Bootstrap + Migration
- **Alembic migration**：drop 舊 5 表；create 新 8 表；alter users/base_geometries 加 `team_uuid`。零使用者 → 無 backfill。
- **seed 重寫**（`scripts/seed_rbac.py`）：建 `permissions`(所有 Perm)、`roles`(平台：super_admin/data_auditor/gov_manager/ngo_manager/user；team：admin/member/guest)、`role_permission_assign`(角色×perm×scope，對 C 版矩陣)。idempotent upsert。
- **bootstrap super_admin**（`scripts/bootstrap_admin.py`）：指定 email → 指派 super_admin platform role；僅在尚無 super_admin 或 --force 時；寫 audit。

---

## 10. Blast Radius（當前檔案 → 要改什麼）

| 檔案 | 動作 | 改什麼 |
|---|---|---|
| `app/models/auth.py:26-72` | ✂️ 刪 | Group/Policy/PolicyGroupAssign/PolicyUserAssign/UserGroupAssign |
| `app/models/auth.py` (User) | ✏️ 改 | User 加 `team_uuid`；移除 groups/policies relationship |
| `app/models/rbac.py` | ➕ 新 | Role/Permission/RolePermissionAssign/UserRoleAssign/UserPermissionAssign |
| `app/models/team.py` | ➕ 新 | Team/WorkZone/TeamZoneAssign |
| `app/models/geo.py` (BaseGeometry) | ✏️ 改 | 加 `team_uuid`（tickets/stations/closure 繼承） |
| `app/models/__init__.py` | ✏️ 改 | import 新 model |
| `app/core/permissions.py` | ➕ 新 | `Perm` StrEnum + `PUBLIC_PERMS` |
| `app/core/rbac_scopes.py` | ➕ 新 | `Scope` + `widest` + `in_scope` |
| `app/core/security.py:202-238` | ✏️ 重寫 | PermissionChecker → `resolve_scope`（capability+union+最寬勝）；刪 suffix 比對 |
| `app/core/security.py:166` | ✏️ 改 | `get_db` 注入 `app.current_user_id` |
| `app/graphql/context.py:34-66` | ✏️ 重寫 | `check_permission` → 檢查點1/2 拆開；Guest 預設 deny |
| `app/repositories/auth_repository.py:29` | ✏️ 重寫 | `get_user_permissions` → 查 role/permission/直接 grant union |
| `app/repositories/geo_repository.py:22` | ✏️ 改 | 拆 `create_with_secondary_location` → pure CRUD |
| `app/services/**` | ➕ 新 | 各寫入動作 use-case |
| `app/graphql/*/mutations.py` | ✏️ 改 | 全部瘦身成呼叫 use-case（geo/tickets/config/announcements/suggestions） |
| `app/graphql/*/queries.py` | ✏️ 改 | 每 resolver 補 read 檢查 + scope 過濾 |
| `app/graphql/tickets/types.py` | ✏️ 改 | `contact_*` 改 field resolver + `ticket.view_pii` |
| `app/graphql/mutations.py` | ✂️ 刪 | 死碼（H2） |
| `scripts/seed_rbac.py` | ✏️ 重寫 | permissions/roles/role_permission_assign seed |
| `scripts/bootstrap_admin.py` | ➕ 新 | bootstrap super_admin |
| `app/db/triggers.py:4` | ✏️ 改 | 更新 `AUDITED_TABLES` |
| `app/api/v1/endpoints/rbac_test.py` + `api.py:16` | ✏️ 改 | 限 dev-only（M1） |
| `alembic/versions/xxxx.py` | ➕ 新 | drop 舊表 / create 新表 / alter team_uuid |

---

## 11. TASK 清單（分階段，可勾選）

### Phase 0：模型與引擎（阻塞後續）
- [x] **T101** 新 model：`team.py`(Team/WorkZone/TeamZoneAssign)、`rbac.py`(Role/Permission/RolePermissionAssign/UserRoleAssign/UserPermissionAssign)；User+`team_uuid`；BaseGeometry+`team_uuid`
- [x] **T102** `app/core/permissions.py` `Perm` StrEnum + `PUBLIC_PERMS`
- [x] **T103** `app/core/rbac_scopes.py` `Scope`+`widest`+`in_scope`（含 zone `ST_Contains`）
- [x] **T104** 重寫 `auth_repository.get_user_permissions` → union(role∪team∪direct)，request-scoped cache
- [x] **T105** 重寫 `security.PermissionChecker`→`resolve_scope`（刪 suffix 比對）；`context.check_permission`→檢查點1/2
- [x] **T106** Alembic migration：drop 舊 5 表 + create 新 8 表 + alter team_uuid
- [x] **T107** 重寫 `seed_rbac.py`（permissions/roles/scope 矩陣，對 C 版）＋ key∈Perm 驗證

### Phase 1：Use-case 化寫入動作
- [x] **T108** `station` use-cases（create/update/delete/review）＋ 拆 `create_with_secondary_location`
- [x] **T109** `ticket` use-cases（create/update/delete/review/assign）
- [x] **T110** `announcement`/`suggestion`/`config` 寫入 use-cases
- [x] **T111** 各 `*/mutations.py` 瘦身呼叫 use-case；刪死碼 `graphql/mutations.py`

### Phase 2：讀取面與 PII
- [x] **T112** GraphQL query 補 read 檢查 + scope 過濾（tickets/geo/config/announcements）
- [x] **T113** ticket `contact_*` field resolver + `ticket.view_pii`
- [x] **T114** 預設 deny + Guest 公開白名單（context）

### Phase 3：Audit / Admin / Bootstrap
- [x] **T115** `get_db` 注入 `app.current_user_id`；更新 `AUDITED_TABLES`
- [x] **T116** `bootstrap_admin.py` + 第一個 super_admin
- [x] **T117** admin API（user 列表 / 指派 role / team member manage）＋防刪最後 super_admin
- [x] **T118** `rbac_test` 限 dev-only（M1）

### Phase 4：地理（Work Zone）
- [x] **T119** gov 畫 zone（create/update work_zones）+ 指派 team（team_zone_assign）use-cases/API
- [x] **T120** ticket create 時設 `team_uuid`；zone scope e2e 驗證（本 zone 通過、跨 zone 404）

### 測試（每 Phase 併行）
- [ ] 單元：`in_scope` 每 scope、`widest`、union 合併、Guest deny、403/404 分流
- [ ] 整合：各角色×模組權限矩陣、跨 team 404、zone point-in-polygon、PII 遮蔽、seed idempotent

---

## RBAC v1 — Code Review 修正（2026-07-10）

#### ADR-051 `require_scope(resource=None)` = 刻意跳過 checkpoint 2；「先撈物件再當 resource」的 use-case 必須自己擋 None
> **狀態:ACCEPTED（2026-07-10,code review 發現）。**

**Context**：`app/services/authz.py:require_scope` 的 checkpoint 2 是條件式的——`needs_checkpoint_2 = resource is not None and scope != Scope.ALL`。也就是說 **`resource=None` 會讓它退化成「只驗 capability(checkpoint 1)」**。這是刻意設計:`create_*` 這種「新物件、無前主」的情境本來就只需要 checkpoint 1,所以傳 `resource=None`。

**問題**:如果一個「先把物件撈出來、再把它當 `resource` 傳進去」的 use-case 沒有先擋掉「撈不到(None)」的情況,就會**意外**走進「resource=None → 跳過 checkpoint 2」這條路,把物件級授權整個略過。`services/ticket.py:update_task_property` 就中了——parent task 撈不到(`get_by_uuid_active` 因 `delete_at` 過濾回 None)時,照樣 `resource=task(=None)`,任何持 `ticket.edit` 的人(連 own)都能改那個孤兒 property。已用 `test_update_task_property_blocked_when_parent_task_soft_deleted` 實測重現(非 owner 成功改值、無 error)。

**Decision**:
1. 確立通則:**凡是「load 物件 → 當 resource 傳給 `require_scope`」的 use-case,都必須在 load 之後、require_scope 之前擋掉 None**(`if not obj: raise ...`)。`resource=None` 只保留給「create、本來就沒有前置物件」的呼叫。
2. 即刻修 `update_task_property`,補 `if not task: raise ValueError("Ticket task not found")`,與 `update_ticket_task` 對齊。

**Blast Radius**:`services/ticket.py:update_task_property` +1 行 guard;`tests/test_graphql/test_mutations.py` +1 回歸測試。其餘 use-case 已檢查過(`update_ticket`/`update_ticket_task`/`review_ticket`/`update_station*` 等都已有 None guard)。

---

## 附錄 A. Scope 語意表
| scope | 判定式 | 依賴 |
|---|---|---|
| none | 無 | — |
| own | `resource.created_by == actor.uuid` | — |
| team | `resource.team_uuid == actor.team_uuid` | 一人一 team |
| gov/ngo | `resource.team.type == actor.team.type` | `teams.type` |
| zone | `ST_Contains(team_zones, resource.geometry)` | `work_zones`+`team_zone_assign` |
| all | 全域 | — |

最寬勝：`all > gov/ngo > zone > team > own > none`。

## 附錄 B. D 版 schema 修正（已納入 §2）
1. scope 綁 `role_permission_assign`（非 permission）→ 同 perm 不同 role 可不同 scope。**最關鍵。**
2. `teams.type`(gov/ngo)。
3. role 定義全域、team 綁在 `user_role_assign`（非 roles.team_uuid 每 team 複製）。
4. users 單 `team_uuid`（一人一 team 已定）。

## 附錄 C. 對 RBAC_SPEC_OPEN_QUESTIONS 的解答
- #10 兩軸組合 → ADR-019（union/OR、無 override、跨 team 404）。
- #1~9,#11,#12（gov/ngo/auditor 權限細節）→ §3/§9 seed 對 C 版矩陣時逐條落定。
