# PR #24 / #25 未解 review comment 逐條驗證

> 驗證者:逐條對照 `popo/rbac-v1`(#24)實際 code。Reviewer 原文作者:`jujuyuzu`。
> 日期:2026-07-20。announcement 相關的 2 條(context.py:40 / conftest.py:105)已另行回覆並歸給 `feature/backend-annoucement-rbac`,不列入本表。

## 分級摘要

| 級別 | 條目 |
|---|---|
| **A. 授權 correctness(建議合併前修)** | [4] station property zone-404、[5] property create/rate 漏 checkpoint2、[3] suggestion queue 匿名可讀、[11] email 遮罩漏、[12] 壞 scope → 500 |
| **B. Migration** | [0] alembic 雙 head(阻斷 fresh DB)、[15] work_zones 無 GIST index |
| **C. 設計 sign-off(要拍板,非 bug)** | [6] NGO admin 可畫 zone→PII 升權、[7] seed upsert-only 無法收權、[8] UBN 7-exception |
| **D. 非阻斷(race/perf/latent)** | [9] last-super_admin race、[10] assign 併發 500、[13] 漏 soft-delete 過濾、[14] PII 檢查 N+1 |

---

## A. 授權 correctness

### [4] `app/services/station.py:143` — team 角色改 station property 一律 404　✅ 確認真 bug
- **白話**:`update_station_property` 把 `prop`(StationProperty)當 checkpoint-2 資源傳給 `require_scope`,但 **StationProperty 沒有 geometry 欄位**。team 角色的 `station.edit=zone` 走 zone 分支要讀 `resource.geometry` → 讀不到 → `in_scope` 回 False → **404,連自己 WorkZone 內、甚至自己建的 property 都改不了**(widest-wins 解到 zone 而非 own)。
- **驗證**:`station.py:143` 確為 `await require_scope(actor, Perm.STATION_EDIT, db, resource=prop)`;`StationProperty` model 無 geometry。ticket 側同型問題已用 `_task_scope_target` 借 parent geometry 解掉(ADR-052)。
- **建議**:仿 ticket 做 `_property_scope_target`(借 parent station 的 geometry)。`review_station_suggestion` 對 `station_property` target 也踩同一面牆。

### [5] `app/services/station.py:115,157` — property create/rate 只做 checkpoint 1　✅ 確認
- **白話**:`create_station_property`(:115)與 `rate_station_property`(:157)呼叫 `require_scope(actor, Perm.STATION_EDIT, db)` **沒傳 `resource=`** → 只檢查「有沒有 edit 能力」,不檢查「這個 station 是不是我的」。於是 citizen 的 `station.edit=own` 對這兩個動作**實際變 all**(任何人可對任何 station 掛 property/評分),但同一個 `update_station` 卻正確 403。
- **驗證**:對照 `:86` `update_station` 有 `resource=station`、`:143` 有 `resource=prop`,只有 create/rate 漏。
- **建議**:下一行 station 已 load,傳 `resource=station` 即補回 checkpoint 2;若「開放群眾貢獻」是刻意的,應改用獨立 capability(如 `station.contribute`)明示。注意:補了 checkpoint2 後 zone 角色會撞 [4] 同樣的 geometry 問題。

### [3] `app/graphql/suggestions/queries.py:40` — suggestion 審核佇列變匿名可讀　✅ 確認(疑似意外)
- **白話**:`station_suggestions`(admin 審核佇列)gate 是 `check_permission(info, Perm.STATION_VIEW)`,而 **STATION_VIEW 在 PUBLIC_PERMS** → 匿名者拿 `Scope.ALL` → 未登入就能讀審核佇列。但 **docstring 明寫「Requires station.view (any logged-in user)」** → code 與意圖不符。main 上舊 `check_permission` 會把匿名者 401。
- **驗證**:`:40` 為 `await check_permission(info, Perm.STATION_VIEW)`;`permissions.py` 的 `PUBLIC_PERMS` 含 `STATION_VIEW`。
- **建議**:加 `require_authenticated(info)`(或改 gate 在 `station.review` 若佇列限 admin)+ 一個釘住匿名存取的測試。

### [11] `app/graphql/masking.py:41` — email 欄填電話會原值外洩　✅ 確認
- **白話**:`mask_email` 對「不含 `@`」的字串**直接回原值**;而 `create_ticket` 沒驗 email 格式 → 有人把電話/LINE ID 填進 email 欄,就會**原封不動顯示給訪客**。
- **驗證**:`masking.py:41` `if not email or "@" not in email: return email`。
- **建議**:非 email 形狀的值回固定 `***`;同步改 `test_masking.py:35` 目前釘住 passthrough 的測試。

### [12] `app/repositories/auth_repository.py:51` — 一列壞 scope 資料 → 該 user 每次請求 500　✅ 確認(latent)
- **白話**:`get_user_permissions` 對 `String(10)` 的 scope 欄做 `Scope(scope)`;只要一列壞值(壞 seed / 手動 SQL)就 `ValueError` → **那個 user 每個請求都 500**。
- **驗證**:`:51` `scopes_by_key.setdefault(key, []).append(Scope(scope))`,scope 來自無約束字串欄。
- **建議**:`role_permission_assign.scope`/`user_permission_assign.scope` 加 CHECK 約束(或迴圈內容錯跳過+log)。`Role.kind`、`Team.type` 同理。

---

## B. Migration

### [0] `alembic/versions/1d52ab265e50…:18` — 分支有雙 alembic head，fresh DB 跑不起來　✅ 確認(阻斷)
- **白話**:rebase 後分支同時含 announcements migration(`a7c9e1f4b2d8`,revises `71bd05e07df3`)與 RBAC chain(收尾在 `a3f8d1c9e2b5`)→ `alembic heads` 印**兩個 head** → `alembic upgrade head` 拒跑。
- **驗證**:`alembic heads` 實測輸出 `a3f8d1c9e2b5 (head)` + `a7c9e1f4b2d8 (head)`。
- **歸屬**:第二個 head 是 announcement migration,跟 announcement 整合同源;修法是加 `alembic merge a3f8d1c9e2b5 a7c9e1f4b2d8` 一個 merge revision。**建議跟 announcement 一起在 `feature/backend-annoucement-rbac` 收斂**(或 #24 合併前補 merge revision)。

### [15] `alembic/versions/1d52ab265e50…:42` — work_zones 無 GIST 空間索引　✅ 確認(perf, latent)
- **白話**:model 隱含 `spatial_index=True`,但 migration 用 raw SQL 建 `work_zones` **沒建 GIST** → 每次 zone-scope 的 `ST_Contains` 全表掃。
- **驗證**:migration 第 42 行 `geometry geometry(MultiPolygon, 4326)`,全檔無 GIST/gist。
- **建議**:補 GIST index,或 model 標 `spatial_index=False` 讓 model 與 DDL 一致。

---

## C. 設計 sign-off(需拍板,非 bug)

### [6] `scripts/seed_rbac.py:118` — NGO admin 可畫 zone→指派給自己→拿全域 PII
- **白話**:team `admin`(含 NGO)持有 `work_zone.add/edit/assign=all` 且服務只做 checkpoint 1 → 任一 NGO admin 兩個 API call(畫一塊涵蓋任意區的 polygon + 指派給自己 team)就能把 `zone`-scoped `ticket.view_pii` 升成**任意地區的受災者原始 PII**。seed 註解承認這是 policy-not-enforced(ADR-049「trust, no hard guard」)。
- **性質**:**已記錄的設計決定**,但它是每個 zone 檢查價值的上界。→ 請確認 v1 接受,或把畫/指派 zone 限 gov team / super_admin。

### [7] `scripts/seed_rbac.py:181` — seed 是 upsert-only，無法「收權」
- **白話**:從 `ROLES_DATA` 移掉一個 grant 再跑,**不會刪掉既有 `role_permission_assign` 列**;在 union/widest-wins 下那條舊的寬 grant 會**默默繼續生效** → 未來想收窄權限(例如把 `work_zone.assign` 從 team admin 拿掉)會「看起來套用了但實際沒變」。
- **性質**:真限制。「idempotent」技術上對,但讀起來像「declarative」,其實不是。→ 建議加 per-role sync(刪掉宣告集以外的 grant;audit trigger 會留歷史),或至少大聲註明「收權需手動 SQL」。

### [8] `app/schemas/admin.py:63` — UBN 檢查碼漏「第7碼=7」例外，會拒掉官方有效號
- **白話**:核心演算法(權重、折位、%5)正確,但官方規則的「第7碼為7時 `(total+1)%5==0` 也算過」例外沒做 → 部分**政府真的核發過的統編被 422 拒絕**(實測 `10000073` 官方有效、這裡被拒)。
- **性質**:code docstring 明寫「7-exception 故意不做,/5 是議定規則」→ **已記錄的決定**,但請確認是刻意的產品決策(不是的話一行可修)。另兩個小 nit:`value.isdigit()` 接受**全形數字**(建議 `isascii()`);`tax_id` **無唯一約束**,兩個 team 可註冊同一統編。

---

## D. 非阻斷(race / perf / latent)

### [9] `app/services/admin.py:84` — last-super_admin 保護是 check-then-act，併發會鎖死
- 兩個併發的降級操作可能都讀到 `remaining == 1` 並各自 commit → 變成 0 個 super_admin、沒人持有 `rbac.assign`(管理鎖死)。機率低。→ 數之前對該 role 的指派列 `SELECT … FOR UPDATE`。

### [10] `app/services/ticket.py:265` — assign 併發撞 unique constraint → 未處理的 500
- `assign_task_actor`/`assign_zone_to_team` 用 check-then-create 防重複,併發下 unique constraint 觸發 → **未捕捉的 500**(而非乾淨錯誤/idempotent)。資料完整性不受影響。→ 捕 `IntegrityError` 或 `ON CONFLICT DO NOTHING`(`UserRepository.assign_role` 已這樣做)。

### [13] `app/core/rbac_scopes.py:95` — 幾處查詢漏 soft-delete 過濾(latent)
- `add/remove_team_member` 的 `db.get(Team,…)`、`assign_zone_to_team` 的 work-zone 查詢、`rate_station_property` 的 rating 查詢,以及此處**兩個 zone-scope 查詢都沒過濾 `WorkZone.delete_at`** → 一旦 zone-delete 流程上線,已刪 zone 仍會授予 edit+PII scope。今天全 latent(尚無 delete 路徑),但每個都是一行 WHERE 可先關。

### [14] `app/graphql/tickets/types.py:372` — PII 檢查跨 ticket 沒共用 → N+1
- per-ticket memoization 沒跨 ticket 共用 → N 張 in-zone ticket 仍跑 N 次 `ST_Contains`;cold `_rbac_cache` 時 N 個併發 resolver 可能各自打一次 `get_user_permissions`(cache set 在 await 之後)。**不會 crash**(asyncpg 序列化 session,reviewer e2e 驗過),純 N+1 延遲。→ context 級共享 future + DataLoader 批次化。

---

## PR #25(1 條)

### `.gitignore:34` — `Frontend/` 行在 rebase 後語意變了
- reviewer 指出這行是 stack rebase 前加的,當時 frontend 不在此分支歷史;rebase 到最新 main 後情況改變,建議重看。→ 需看 `.gitignore:34` 的實際上下文與現在 repo 結構再定(尚未細查)。

---

## 建議處理順序
1. **A 類**(5 條授權 correctness):建議 #24 合併前修。其中 [4][5] 相扣(補 checkpoint2 就要 property 版 geometry adaptor)。
2. **[0] 雙 head**:跟 announcement 一起在 `feature/backend-annoucement-rbac` 收斂(或 #24 補 merge revision)。
3. **C 類**(3 條 sign-off):要你/團隊拍板,非改 code。
4. **B[15] + D 類**:latent/perf,可排後續。
