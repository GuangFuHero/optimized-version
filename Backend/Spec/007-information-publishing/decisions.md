# 資訊發布（公告、行前通知）— ADR 全集（ADR-259~262、ADR-273~275、ADR-309）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號從 259 起跳，避開 `Spec/018-ticket-disaster-fields/decisions.md` 已佔用但尚未合併的 ADR-244~258。

ADR-259~262 源自 PR #49 第一輪 review；ADR-273~274 源自第二輪。
273 起跳是避開 PR #50 已佔用的 ADR-263~272。
ADR-275 源自 PR #48 第二輪 review——決策本身與行前通知無關，但它改的是本 PR 的 migration `c3f0a1b2d4e6`，所以記在這裡。
ADR-309 是公告（緊急公告）的顯示位置，接在 ADR-308（前台／後台用語，Spec 006）之後編號。

---

### ADR-259 `PUBLIC_PERMS` 對所有呼叫端生效，不只匿名

**白話**：登入之後讀到的東西，不可以比沒登入還少。

**Context**：`check_permission` 原本只在 `user is None` 時查 `PUBLIC_PERMS`；已登入者一律走
`require_scope`，而 `pre_departure.view` 與 `announcement.view` 在 `scripts/seed_rbac.py` 裡
只發給 `super_admin`。實測結果：

| 呼叫端 | `briefings` |
|---|---|
| 匿名 | 200 |
| 預設 `user` 角色（每個註冊帳號） | **403** |
| `super_admin` | 200 |

已認領任務的志工一定是登入狀態，所以壞掉的正是真實路徑。

**Decision**：`check_permission` 改成先看 `PUBLIC_PERMS`，命中就回 `Scope.ALL`，不分匿名與否。

➕ 一處修好兩個模組（公告與行前通知），不必每新增一個角色就記得補發 view 鍵。
➕ 公開鍵少一次 grant 查詢。
◾ 對現況零行為差異：今天所有角色持有的公開鍵 scope 都是 `all`。
➖ 執行期把公開鍵收窄成 `own`/`zone` 不再有效果。

**否決「把 `pre_departure.view` 發給每個角色」的理由**：那是在治症狀。`announcement.view` 會留著同一個
洞，而「公開」的語意本來就是不需要 grant——收窄一個全世界都讀得到的鍵沒有意義。

---

### ADR-260 只有生成後的 briefing 是公開的，template 不是

**白話**：範本是編輯者的作業面，不是給志工看的公告。

**Context**：四個 read resolver 原本都只檢查 `pre_departure.view`（公開），所以匿名查詢
`briefingTemplates` 會拿到全部未刪除的範本，而且沒有 published/draft 之分。

**Decision**：`briefingTemplates` / `briefingTemplate` 改要求 `pre_departure.publish`；
`briefings` / `briefing` 維持公開。

➕ 公開面剛好等於志工真正要讀的東西。
➕ 不必為了區分草稿與已發布而多一個 state 欄位。
➖ 未來若有「只能編輯、不能發布」的角色，得同時持有 `publish` 才讀得到範本。

---

### ADR-261 `generateBriefing` 指向不存在或已軟刪的 template 直接拋錯

**白話**：範本不見了就說一聲，不要默默給一張空白通知。

**Context**：`generate_briefing` 在 `get_by_uuid_active` 回 `None` 時 fallback 成 `""`。兩種壞法：
軟刪的 template → 成功回傳 `{"templateUuid": "<已刪 uuid>", "content": ""}`；
隨機 UUID → FK violation 被 `MaskErrors` 蓋成 `Unexpected error.`。

**Decision**：`template_uuid` 有給但查不到 active 列時，`raise ValueError("Briefing template not found")`，
與 `updateBriefingTemplate` / `deleteBriefingTemplate` 同一個訊息。

➕ 兩種壞法一起修，且錯誤訊息與同模組其他 mutation 一致。
◾ 不影響 ad-hoc briefing：`template_uuid` 為 `None` 時本來就不查。

---

### ADR-262 migration 重新接到 main 的 head，不另加 merge revision

**白話**：跟 `90c93167fa66` 當初的處理方式一樣。

**Context**：`c3f0a1b2d4e6` 還接在 `07ac630e0009`（announcements 之後），但 main 早已往前走到
`c4a91e77b0d3`。合併後 `alembic heads` 出現兩個 head，`alembic upgrade head` 會拒絕執行。

**Decision**：把 `down_revision` 改成 `c4a91e77b0d3`。`c3f0a1b2d4e6` 只在本分支存在、未進 main，
符合本 repo 的 amend-latest 慣例；migration 只依賴 `users`，中間這 145 個 commit 沒有動到這兩張表。

同一批 review 還揭露：欄位刪除讓 main 上的 `tests/test_history_fields.py` 轉紅，因為
`app/services/history_fields.py` 的 `EXCLUDED` 仍列著這三欄。**三個 `EXCLUDED` 項目與測試清單一併移除**
——不存在的欄位不需要排除理由。拆成獨立 PR 反而會讓「刪欄位」與「同步 EXCLUDED」分處兩次合併之間，
中間任何一刻 CI 都是紅的。

➕ 不新增只為接合而存在的空 revision。
➖ main 每次前進都要重新指一次；migration docstring 已寫明這點。

---

### ADR-273 公開能力的語意只寫在 `require_scope` 一處

**白話**：「這個能力全世界都讀得到」這句話，兩個入口要講同一套。

**Context**：ADR-259 把 `PUBLIC_PERMS` 的短路寫在 `app/graphql/context.py::check_permission`，
但 use-case 層是直接呼叫 `app/services/authz.py::require_scope`，那裡仍然查 grant matrix。
兩層因此對同一個公開能力給出不同答案。全庫唯一踩到的呼叫點是
`app/services/suggestion.py:49`（`require_scope(actor, Perm.STATION_VIEW, db)`）——今天沒有
行為差異，因為每個 seed 角色都持有 `station.view` 且 scope 是 `all`，但語意分歧是真的。

同一輪 review 另外指出：`check_permission` 的短路發生在看 `resource` 之前，未來若有呼叫端
對公開能力傳 `resource`，checkpoint 2 會被無聲跳過。實測全庫（`app/` 與 `tests/`）目前沒有
任何呼叫端對 `check_permission` 傳 `resource`，所以那條路今天不可達。

**Decision**：短路搬進 `require_scope`，`check_permission` 只留 Guest 分支（匿名沒有 `User`
row，根本沒辦法往下傳）。同時在 `require_scope` 裡，公開能力配上 `resource` 直接 `ValueError`。

```
check_permission(info, perm, resource)          require_scope(actor, perm, db, resource)
├── user is None                                ├── perm in PUBLIC_PERMS
│   ├── perm in PUBLIC_PERMS → Scope.ALL        │   ├── resource is not None → ValueError
│   └── 否則 → 403                              │   └── 否則 → Scope.ALL
└── 否則 → require_scope(...)  ────────────▶    └── 否則 → 兩道 checkpoint 照走
```

➕ 兩個入口不可能再分歧——GraphQL 的答案就是 use-case 層的答案。
➕ 「公開能力 + 物件範圍」是矛盾（全世界都持有，沒有東西可收窄），現在會炸，而不是靜靜跳過檢查。
➕ `suggestion.py:49` 不用改也自動一致。
◾ 對現況零行為差異：`suggestion.py` 那個呼叫點原本每個角色都過得去。
➖ 公開能力的檢查不再經過 grant matrix，所以在 RBAC 後台把它收窄成 `own`/`zone` 不會有效果——
  這正是 ADR-259 的決定，只是現在對所有入口都成立。

**測試**：`tests/test_authz.py::test_require_scope_resolves_a_public_capability_without_the_grant_matrix`
同時釘住兩件事（無 grant 也拿到 `Scope.ALL`、給 `resource` 會 raise）。
`test_require_scope_unions_a_role_grant_with_a_direct_grant` 與
`test_require_scope_ignores_the_roles_the_actor_is_not_acting_as` 原本借用 `ticket.view` 當載具，
現在改用 `ticket.edit`——它們測的是身分與 union 機制，不是那個能力本身。

---

### ADR-274 PRD VB-FEAT-001 的形狀不在這個 PR 實作

**白話**：PRD 想要的是另一張表，不是這張表少了幾個欄位。

**Context**：Notion PRD VB-FEAT-001（最後編輯 2026-09-13）要的結構與已實作的
`content` + `tags` + `state` 不同:

| PRD 要求 | 現況 |
|---|---|
| 內容以災害類型（水災/震災/風災）分類，四個固定段落固定順序（VB-BR-101/102） | 單一 free-form `content` |
| 每個類型各有草稿與已發布，存草稿不影響公開內容（VB-BR-131） | 沒有草稿概念(ADR-260:template 本身就是作業面) |
| 全案場同時只有一則公開公告，發布 B 就下架 A（VB-BR-103a / AC-14） | `briefings` 把所有未軟刪的列都回給匿名呼叫端 |
| 每次發布保留完整內容供事後查閱（AC-11 / VB-BR-171） | 沒有快照表 |

**Decision**：不在本 PR 實作，記錄為延後。理由是 PRD 自己在開頭標了「年底範圍，不在本次實作範圍」；
而且這四項不是補欄位，是重新設計兩張表、migration 與整個 GraphQL 介面，屬於另一個 feature。

➕ 本 PR 的範圍維持在 review 已經驗證過的東西上。
➕ 差異寫進 `spec.md` 的「Deliberately not built」，不會變成無人知道的漏洞。
◾ 已實作的部分不會因此作廢:free-form 的 template/briefing 是 PRD 形狀的子集。
➖ 在那個 feature 做之前，「同時只有一則公開公告」這條不變式沒有東西擋著。

---

### ADR-275 `users.password` 的 contract stage 補在 `c3f0a1b2d4e6`，不另開 revision

**白話**：兩年前搬家搬一半的欄位，現在補上最後一步；順手補在本 PR 已經在刪廢欄位的那支 migration 裡。

**Context**：`d19cda4d9871`（2026-05-31）是一組 expand/contract 的 expand 半邊——新增
`user_identities.password_hash`，並把 `users.password` 改成 nullable，註解寫明
`# expand stage: keep the column but make it nullable; drop happens in P4 (contract stage)`。
P4 從來沒有被寫出來。`739eea8` 把 `password: Mapped[str] = mapped_column(String(512))` 從
`app/models/auth.py` 移掉了，但資料庫那邊沒有動，於是形成一個只存在於「用 migration 建出來的
資料庫」的欄位：

| 建庫方式 | `users.password` |
|---|---|
| `alembic upgrade head`（正式環境） | **存在** |
| `Base.metadata.create_all`（`tests/conftest.py`） | 不存在 |

沒有任何東西讀它或寫它（全庫 grep 只命中請求欄位、provider 標籤與
`user_identities.password_hash`），dev 資料庫上 41 個使用者有 **0 個**非 NULL，同一批人裡
`user_identities.password_hash` 有 37 個有值。所以這不是資料遺失風險，是 schema 對不上。

**Decision**：把 `ALTER TABLE users DROP COLUMN IF EXISTS password` 補進
`c3f0a1b2d4e6` 的 `upgrade()`，`downgrade()` 以 `varchar(512)`（`739eea8` 移除前的型別）還原。

不另開 revision 的理由有兩個。一是本 revision 已經在做同一件事——它本來就順手刪掉
`stations.confidence_score` / `stations.priority_score` / `ticket_tasks.confidence_score`
三個廢欄位，`users.password` 是第四個，性質完全相同。二是 `c3f0a1b2d4e6` 還沒進 main，
仍是 branch-local，改它不會讓任何已經跑過 migration 的環境對不上。

`IF EXISTS` / `IF NOT EXISTS` 的理由與既有的 score drops 相同：有人可能在這幾行被補上之前
就已經在自己的 branch checkout 上跑過這支 revision。

**Consequences**：
➕ 「用 migration 建的資料庫」與「用 model 建的資料庫」在 `users` 上終於一致。
➕ 一個沒有寫入路徑、名字看起來像機密的欄位從正式 schema 消失。
◾ 對應用程式零行為差異：沒有程式碼路徑讀寫它，密碼驗證早就走 `user_identities.password_hash`。
➖ 本 PR 的 migration 因此多帶一個與行前通知無關的決策。替代方案是另開一支 revision 或另開一個
  PR，但兩者都違反本 repo「branch-local 的 revision 直接修改，不疊新的」的慣例。
➖ `downgrade()` 只還原欄位形狀，不還原資料——原本就沒有資料可還原。

---

### ADR-309 公告的顯示位置：後台、前台或兩邊，共用一條排序

**白話**：每則公告多一個 `placement`，決定它出現在後台、前台還是兩邊；排序還是同一條，各頁只是把
不屬於自己的那幾則濾掉。

**Context**：公告原本只有一個讀者群，所有啟用中的公告都出現在同一份公開清單。現在要能發只給後台看的
公告（例如協調會通知），也要能發只給前台看的。用語依 ADR-308：前台 = public，後台 = admin。

**Decision**：

- `announcements.placement` 是 `admin_page` / `public_page` / `all`（兩邊都顯示）。GraphQL 輸入用
  `AnnouncementPlacement` enum 擋值，DB 欄位是自由字串，沿用 repo 其他欄位的做法。
- 新增時不指定就是 `all`；migration 把既有公告回填成 `all`，所以它們照舊到處都看得到。
- `announcements(placement:)` 預設 `PUBLIC_PAGE`，回傳 `public_page` 與 `all`；`ADMIN_PAGE` 回傳
  `admin_page` 與 `all`；`ALL` 回傳全部。
- 只要不是 `PUBLIC_PAGE`，呼叫端就必須登入（`require_authenticated`）。單筆 `announcement(uuid)` 讀到
  `admin_page` 的公告時也一樣。

```
排序（全站一條）           匿名 → 前台               登入 → 後台
 1  all          停水通知      1 停水通知              1 停水通知
 2  admin_page   協調會                                2 協調會
 3  public_page  物資站搬遷    3 物資站搬遷
 4  all          道路封閉      4 道路封閉              4 道路封閉
```

**為什麼共用一條排序**：各頁照全站順序過濾，相對順序自然一致，`move`、`setAnnouncementActive`、
`deleteAnnouncement` 一行都不用改。分頁排序得多一個排序欄位，維持連號的邏輯也要跑兩份。管理清單
（`filter: ALL, placement: ALL`）看得到每一則，管理員在那裡排序就是排全站。

**為什麼「登入」就夠**：前端的 `/admin` 本身只檢查有沒有登入，後端沒有「後台使用者」這個概念。發布通知
本來就送給所有啟用中的帳號，而他們都是登入者，所以每個收到通知的人都打得開那則公告。

**Consequences**：
➕ 既有的匿名呼叫結果不變，而且永遠拿不到 `admin_page` 的公告。
➕ 排序、啟用、刪除的邏輯完全沒動。
◾ 通知不分 placement：發布任何一則都通知所有啟用中的帳號。
➖ 單一頁面上的 `order` 會跳號（上例前台是 1、3、4）；前端要照 `order` 排序，不能把它當名次顯示。
➖ 任何登入者都讀得到 `admin_page` 公告，包括一般使用者。日後若要收窄，再補一個 capability。
