# 資訊發布（公告、行前通知）— ADR 全集（ADR-259~262、ADR-273~275、ADR-309、ADR-335、ADR-363~364）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號從 259 起跳，避開 `Spec/018-ticket-disaster-fields/decisions.md` 已佔用但尚未合併的 ADR-244~258。

ADR-259~262 源自 PR #49 第一輪 review；ADR-273~274 源自第二輪。
273 起跳是避開 PR #50 已佔用的 ADR-263~272。
ADR-275 源自 PR #48 第二輪 review——決策本身與行前通知無關，但它改的是本 PR 的 migration `c3f0a1b2d4e6`，所以記在這裡。
ADR-309 是公告（緊急公告）的顯示位置，接在 ADR-308（前台／後台用語，Spec 006）之後編號。
ADR-335 是公告與行前通知的草稿，接在 repo 目前最大的 ADR-334 之後編號。
ADR-363 是公告改成每頁一則、發布就取代；361、362 已分給 PR #94 與 #93。
ADR-364 是行前通知的下架：每個 state 一版上線、發布就取代，接在 ADR-363 之後編號。

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
➕ 不必為了區分草稿與已發布而多一個 state 欄位。**已被 ADR-335 推翻**：briefing 現在有草稿。
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
  `AnnouncementPlacement` enum 擋值，成員名稱就是存的值，所以讀到的 `placement` 可以原樣送回；DB 欄位是
  自由字串，輸出也是字串，沿用 repo 其他欄位的做法。
- 新增時不指定就是 `all`；migration 把既有公告回填成 `all`，所以它們照舊到處都看得到。
- `announcements(placement:)` 預設 `public_page`，回傳 `public_page` 與 `all` 的公告；`admin_page` 回傳
  `admin_page` 與 `all` 的公告；`all` 回傳全部。
- 只要不是 `public_page`，呼叫端就要持有 `announcement.view_admin`（不在 `PUBLIC_PERMS`，匿名與沒有
  grant 的帳號都是 403）。單筆 `announcement(uuid)` 讀到 `admin_page` 的公告時也一樣。
- seed 把 `announcement.view_admin` 給 `data_auditor`、`super_admin`、團隊 `admin` 與 `member`；自行註冊
  拿到的 `user` 沒有。
- 發布或重新啟用 `admin_page` 公告時，通知只送給持有 `announcement.view_admin` 的帳號，標題是「📢 後台公告」，
  內文不帶公告內容；`public_page` 與 `all` 照舊送給所有啟用中的帳號，內文是公告的前 80 字。
- DB 裡若出現這三個值以外的 placement，讀取和通知都當成 `admin_page` 處理，寧可擋錯也不外流。

```
排序（全站一條）           匿名 → 前台               工作人員 → 後台
 1  all          停水通知      1 停水通知              1 停水通知
 2  admin_page   協調會                                2 協調會
 3  public_page  物資站搬遷    3 物資站搬遷
 4  all          道路封閉      4 道路封閉              4 道路封閉
```

**為什麼共用一條排序**：各頁照全站順序過濾，相對順序自然一致，`move`、`setAnnouncementActive`、
`deleteAnnouncement` 一行都不用改。分頁排序得多一個排序欄位，維持連號的邏輯也要跑兩份。管理清單
（`filter: ALL, placement: all`）看得到每一則，管理員在那裡排序就是排全站。
**已被 ADR-363 推翻**：每頁最多一則上線公告，排序拿掉了。

**為什麼另開一個 capability**：任何人都能自己註冊並拿到 `user` 角色，所以只檢查登入擋不住外人，而協調會
這類公告要留在工作人員之間。現有的兩個 key 都不合用：`announcement.view` 是公開的，`announcement.edit`
只有 `super_admin` 有，團隊協調員會被擋在外面。

**為什麼通知要收窄，而且不帶內容**：通知原本帶公告的前 80 字並全站廣播，只擋讀取的話，一般使用者還是會在
通知裡看到內容，所以收件人收窄到持有這個 key 的帳號。但通知送的是帳號，讀取看的是這次登入的身分
（ADR-097）：團隊成員以 `user` 身分登入時讀不到，帳號卻仍持有這個 key。發通知時沒有身分可查，所以通知只說
有新的後台公告，內容一律交給讀取把關，跟站點修改建議、重複標記等通知的做法一樣。

**Consequences**：
➕ 既有的匿名呼叫結果不變，而且永遠拿不到 `admin_page` 的公告。
➕ 排序、啟用、刪除的邏輯完全沒動。
➕ 自行註冊的帳號讀不到 `admin_page` 公告，也收不到它的通知。
◾ 不用 migration：部署時會跑 `seed_rbac.py`，它只補缺少的 grant，新 key 下次部署就會發給上述角色。
➖ 單一頁面上的 `order` 會跳號（上例前台是 1、3、4）；前端要照 `order` 排序，不能把它當名次顯示。
➖ 讀取看的是這次登入的身分（ADR-097），而登入一律先落在 `user`（ADR-290，Spec 019），超管也一樣。前端
  登入不帶 `scope`、也還沒有切換身分的介面，所以補上之前，後台人員都讀不到 `admin_page` 公告，只會收到不帶
  內容的通知。這跟其他後台端點一樣：發布、編輯公告要的 `announcement.publish`、`announcement.edit`，`user`
  也沒有。
➖ 在 `/admin/rbac` 新建的角色要手動給這個 key。
➖ 前端的 `/admin` 仍然只檢查登入。一般使用者打開時，後台公告的查詢會回 403，前端要把它當成空清單。

---

### ADR-335 公告與行前通知都有草稿；行前通知一列一版，公告原地編輯

**白話**：兩邊都能先存草稿、之後再發布。行前通知每次發布都是新的一版，舊版留著；公告只有一列，改了就是改了，
但會記下最後是誰動的。後台看得到作者是誰，前台看不到。

**Context**：後台要顯示「目前這版是誰發布的」，但 GraphQL 只給 `createdBy` 的 UUID，查不到名字。行前通知要能
多人一起改草稿、改好再發布，而 ADR-260 當時認定 briefing 不需要草稿。公告則是一建立就上線並通知全站。

**Decision**：

```
行前通知（每列一版）                          公告（每則一列）
 generateBriefing ─► DRAFT ─► PUBLISHED        createAnnouncement ─► DRAFT ─► ACTIVE ⇄ INACTIVE
                     │ updateBriefing  唯讀                            setAnnouncementActive
                     └ publishBriefing                                 （第一次 true 就是發布）
```

- 草稿用 `published_at IS NULL` 表示，不另開 status 欄位（**行前通知已被 ADR-364 改成 `status` 欄位**）；GraphQL 的 `status` 由它推出來，兩者不會不一致，
  而且是 enum（`BriefingStatus`、`AnnouncementStatus`），前端拼錯值會在型別檢查時被抓到。
  兩張表都有 `published_by`（誰按了發布；公告是最近一次上線的人，下線不清掉）和 `updated_by`（最後一個改動的人，NOT NULL）。
- **行前通知**：`generateBriefing` 一律產生草稿，同一個 `state` 可以同時有多份草稿。`updateBriefing` 只改得動
  草稿；已發布的列是唯讀，要改就開新草稿。`publishBriefing` 把草稿變成該 `state` 的最新版本。
  `briefings(status:)` 預設 `PUBLISHED`（公開），`DRAFT`／`ALL` 要 `pre_departure.edit`；清單先列草稿（最近改的在前），
  再列已發布（`published_at` 新的在前），所以每個 `state` 的第一筆已發布就是目前版本。舊版仍然公開。
- **公告**：`createAnnouncement` 產生不在排序裡、也不發通知的草稿。`setAnnouncementActive(true)` 照舊排到最後、
  發通知，並寫入 `published_at`／`published_by`（最近一次上線的時間與人）。`announcements(filter:)` 多一個 `DRAFT`，與 `ALL` 一樣要
  `announcement.edit`。已上線的公告仍是原地編輯、立即生效。
- **權限**：兩個模組都改成「寫草稿要 `.edit`、上線要 `.publish`」：`generateBriefing`、`createAnnouncement` 從
  `.publish` 改為 `.edit`；`setAnnouncementActive(true)` 從 `.edit` 改為 `.publish`，`false` 維持 `.edit`。
  從 template 產生草稿會複製 template 內容，所以另外要 `pre_departure.publish`（與讀 template 相同）；
  已上線公告的修改（內容或 `placement`）存下去就公開，等於重新發布，所以另外要 `announcement.publish`；
  只有 `.edit` 的人要先把它下線再改。
- **作者資訊**：`creator`／`updater`／`publisher` 回傳 `{ uuid, name }`，只有暱稱、沒有聯絡方式，名字用既有的
  `user_name_by_uuid` DataLoader 一次批次查完。呼叫端沒有該模組的 `.edit` 就回 `null`，不報錯。
  原本公開的 `createdBy` 拿掉：它讓訪客看得出哪幾則出自同一人，編輯者要 UUID 就讀 `creator { uuid }`。
  同理，公告上線的通知不記 `actor_uuid`（收件人讀得到它），發布者本人改由手動排除在收件人之外。
- migration 把既有的列都當成已發布：`published_at = created_at`，`published_by`／`updated_by = created_by`。
  downgrade 會先軟刪除行前通知的草稿，因為舊 schema 把每一列未刪除的 briefing 都公開列出。

**為什麼不開 `/admin/users/{uuid}`**：它要 `user.view`，只有平台管理員有；前端還得一則一則去查。

**為什麼公告不做成一列一版**：排序（`display_order`）屬於那一列，改成多版就得在版本之間搬排序和上線狀態。
（ADR-363 拿掉了排序，上線狀態仍是這個理由。）

**Consequences**：
➕ 公開頁面拿不到草稿：前台的請求以 `user` 身分執行，`user` 沒有 `.edit`。
➕ 刪掉目前版本，上一個已發布版本自動變回目前版本。**已被 ADR-364 推翻**：發布就取代，舊版已下架；只有草稿刪得掉。
➖ 從較舊版本開的草稿一樣能發布並成為目前版本；要不要警告由前端決定。
➖ 已上線公告的修改沒有草稿，存下去就公開，所以只有 `.edit` 的人改不動已上線的公告。
➖ 目前只有 `super_admin` 持有 `.edit` 與 `.publish`，所以權限調整實際上沒有人因此得到或失去權限。

---

### ADR-363 每頁最多一則上線公告，發布就取代；拿掉排序

**白話**：前台一則、管理平台一則；「兩邊都顯示」那則同時佔兩個位置。發一則新的，就把它要佔的位置上原本那則
關掉。公告不再排序。

**Context**：ADR-309 讓好幾則公告同時上線，共用一條排序（`display_order`、`moveAnnouncement`）。產品的決定
相反：原型 EA-FEAT-001 的裁示 D-12 是「每個頻道最多一則，發布＝取代」，Carol 2026-10-21 在 Discord 再確認
（「只能一則」「以最新取代舊的」，跑馬燈的概念），糖也確認。原型的阻斷表要求這條由資料層守住（B-6），而且
取代要在同一個 transaction 裡完成（B-7）。

**Decision**：

```
發布前                       發布                     發布後
前台 A、後台 B          ─►  public_page 的 C   ─►   前台 C、後台 B
前台 A、後台 B          ─►  all 的 C           ─►   前台 C、後台 C
前台 C、後台 C（all）   ─►  admin_page 的 D    ─►   前台空、後台 D
```

- **位置**：`public_page` 佔前台，`admin_page` 佔管理平台，`all` 兩個都佔。三個值以外的 placement 照
  ADR-309 當成 `admin_page`。
- **發布**：`setAnnouncementActive(true)`（第一次發布或重新上線）在同一個 transaction 裡，先把位置重疊、
  正在上線的公告下線（`updated_by` 記成這次的發布者），再讓這則上線。上表第三列就是 D-12 的轉移 3：
  `all` 那則下線，前台跟著變空。
- **改位置**：ADR-335 已把「改已上線公告」當成重新發布、要 `announcement.publish`。所以已上線的公告搬到
  哪一頁，就取代那一頁上線中的公告。
- **併發**：
  - 上線、下線、修改、刪除都先拿 advisory lock（`announcements.live`），再鎖上線中的列，最後鎖目標列。
    同時發布的兩個人會排隊，後發的取代先發的。修改把權限檢查放進鎖裡（`check_live`），所以別人同時把
    草稿發布出去，這次修改仍會被當成改已上線的公告。
  - 資料層防線是兩條 partial unique index，一頁一條：`uq_announcements_live_public_page`
    （`active AND delete_at IS NULL AND placement IN ('public_page', 'all')`）和
    `uq_announcements_live_admin_page`（`... AND placement <> 'public_page'`）。index 建在 `active` 上：
    符合條件的列 `active` 都是 true，所以每條最多容得下一列。`all` 那則同時落在兩條裡，就這樣佔住兩個
    位置。繞過 lock 直接寫 DB 也過不了。
  - 先把要取代的列下線並 flush，再讓新的上線：SQLAlchemy 一次 flush 裡同一張表的 UPDATE 依主鍵排序，新的
    那則可能先寫，就會撞到 index。
- **拿掉排序**：刪掉 `display_order` 欄位、`moveAnnouncement`、`AnnouncementMoveDirection` 與
  `AnnouncementType.order`。清單改成上線中的在前，其餘依建立時間新到舊。前端在同一個 PR 拿掉
  `AdminMoveAnnouncement`、各 operation 選的 `order` 與 `useMoveAnnouncement`。
- **migration `e4b7c2a19d63`**：上線中的公告，只要有一則比它晚發布、位置又重疊的上線公告，就下線。結果等於
  依發布時間一則一則重新發布。接著建兩條 index、刪 `display_order`。downgrade 加回欄位，上線中的依發布時間
  編 1..N；被取代的不會恢復。

**為什麼用兩條 partial unique index，不用 exclusion constraint**：`all` 一則佔兩個位置，一條 unique index
擋不住；拆成一頁一條，每條只管「這一頁最多一列」就擋得住。exclusion constraint 要先把 placement 轉成
range 或陣列再比重疊，讀起來不直覺，也不會多守住什麼。

**為什麼不先 deprecate 排序**：沒有畫面呼叫 `moveAnnouncement`。前端用到的只有一個沒人呼叫的 hook，以及幾個
operation 選的 `order`，在同一個 repo、同一個 PR 就改得完。

**Consequences**：
➕ 「一頁一則」由 DB 擋，不只靠應用程式。
➕ 兩人同時發布不會報錯，後發的取代先發的。
➕ 公告條只要顯示 `announcements(placement:)` 回的那一則；`placement: all` 最多回兩則。
◾ 通知照舊，上線就發；被取代的公告不另發通知。原型裁示 C-2（公告不進收件匣）另案處理。
➖ 被取代和手動下線在資料上分不出來，都是 `active = false`、`updated_by` 是操作的人。原型 A-12 要的
  「被新公告取代」事件類型不在這次範圍。
➖ 後端先部署、管理平台後部署的那幾分鐘，舊的管理平台查 `order` 會被 GraphQL 拒絕，公告條暫時不見。
➖ 前台的 GraphQL 快照（`Frontend/libs/data-access/src/graphql/schema.graphql`）不是從後端匯出的，仍列著
  `moveAnnouncement` 與 `order`。前台目前沒有 operation 讀公告，要用之前先更新快照。
◾ 不在範圍：50 字上限、到期、政府單位發布。

---

### ADR-364 行前通知可以下架：每個 state 一版上線、發布就取代，下架後複製成新草稿再改

**白話**：每個階段（行前／現場／回程後）前台最多一版。發布新版本，舊版自動下架；也可以直接下架目前這版，
前台就完全沒有行前資訊。下架的版本不能改，要改就複製成一份新草稿。

**Context**：後台的行前資訊頁要有「下架」。ADR-335 之後一列一版、發布後唯讀，沒有退回草稿的路；就算刪掉
目前版本，上一個已發布版本也會變回目前版本，前台不會變空。舊版也一直公開。前端提出加一個下架狀態、把下架的
列也回給前台由前端藏起來；但那樣內容仍然公開，任何人直接打 API 都讀得到。

**Decision**：

```
動作                       v1         v2         v3         前台顯示
發布 v1                    published                        v1
發布 v2                    inactive   published             v2
下架 v2                    inactive   inactive              （空）
從 v2 複製出 v3            inactive   inactive   draft      （空）
發布 v3                    inactive   inactive   published  v3
```

- **`status` 欄位**：`briefings.status` 是 `draft`／`published`／`inactive`（`String(20)` + CHECK，同
  `role_requests.status`）。`published_at` 留著記發布時間、清單也用它排序，另一條 CHECK
  `(status = 'draft') = (published_at IS NULL)` 讓兩者不會不一致。`inactive` 和公告同一個字：上線過、現在不在
  前台。不另開 `taken_down_at`／`taken_down_by`：已發布的列唯讀，之後唯一的改動就是不再上線，所以 `inactive` 列的
  `updated_at`／`updated_by` 就是誰、何時讓它不再上線（手動下架，或發布了取代它的版本）。
- **發布就取代**：`publishBriefing` 在同一個 transaction 裡，先把同一個 `state` 上線中的列改成 `inactive`
  （`updated_by` 記成發布者）並 flush，再讓這列上線。先拿 advisory lock（`briefings.live`），同時發布的兩個人會
  排隊，後發的取代先發的。資料層防線是 partial unique index `uq_briefings_live_per_state`
  （`(state) WHERE status = 'published' AND delete_at IS NULL`）。
- **下架**：`takeDownBriefing(uuid)` 把上線中的列改成 `inactive`，權限與公告下線一樣要 `pre_departure.edit`。
  不是上線中的列會回 `Only a published briefing can be taken down`。
- **只有草稿刪得掉**：`deleteBriefing` 鎖住那列再檢查，不是草稿就回 `Only a draft can be deleted`。上線過的每一版
  都留著當發布紀錄，從這些列數出來的版本號也不會倒退；要讓一版離開前台就下架。鎖住那列，和同時進來的發布才會排隊，不會刪到剛上線的版本。
- **再編輯**：`generateBriefing(input: {sourceBriefingUuid})` 把那一版的 `content`、`tags`、`state` 與
  `templateUuid` 複製成新草稿，原本那列不動。來源只能是 `published` 或 `inactive`：草稿本來就能直接改，
  拿來複製會回 `Only a published or inactive briefing can be copied`。輸入另外給的 `content`／`tags`／`state`
  仍然覆蓋複製來的值；`templateUuid` 和 `sourceBriefingUuid` 不能同時給。讀得到任何狀態的 briefing 只要
  `pre_departure.edit`，所以複製不像 template 另外要 `.publish`。
- **前台**：`briefings(status: PUBLISHED)` 與 `briefing(uuid)` 只公開上線中的列；`inactive` 和草稿一樣要
  `pre_departure.edit`。`status: ALL` 列出三種。沒有 `.edit` 的人用 `briefing(uuid)` 讀草稿或 `inactive` 的列
  會拿到 `null`，跟 UUID 不存在一樣，不再回權限錯誤：拿著舊連結的人看到的是「已經沒有了」，也看不出那列還在。
- **錯誤訊息**：發布或修改非草稿的列，改成 `Only a draft can be published`／`Only a draft can be edited`，
  取代原本的 `Briefing is already published`／`Published briefings are read-only`，`inactive` 的列讀起來才對。
- **migration `da152a6a9d7c`**：已發布的列先全部標成 `inactive`，再把每個 `state` 最新、未軟刪的那列標回
  `published`，結果等於依發布時間一版一版重新發布；草稿維持 `draft`。downgrade 先軟刪 `inactive` 的列，因為
  舊 schema 會把每一列已發布的 briefing 都公開列出，被下架的內容會回到前台。

**為什麼由後端過濾，不把下架的列回給前台**：下架的意思是內容不再公開。回給前台再由前端藏，只是畫面上看不到。

**為什麼下架的列不直接退回草稿**：每一版發布後唯讀，才保得住「當時發布了什麼」。退回草稿再改，就把那一版的
紀錄改掉了。

**為什麼複製由後端做**：前端傳 `content`／`tags`／`state` 給既有的 `generateBriefing` 也做得到，但
`templateUuid` 要一起帶就得另外有 `.publish`，複製出來的內容也要靠前端逐欄抄對。後端複製只多一個欄位、十幾行。

**Consequences**：
➕ 「每個 state 最多一版公開」由 DB 擋，不只靠應用程式。
➕ 前台不用改，照舊取每個 state 的第一筆 `PUBLISHED`，沒有就顯示空狀態。
➖ 舊版不再公開，只有編輯者看得到。
➖ 上線中的版本不能刪，只能下架，下架後前台變空，不會再退回上一版（推翻 ADR-335 的「刪掉目前版本，上一個已發布
  版本自動變回目前版本」）。
➖ 被取代和手動下架在資料上分不出來，都是 `inactive`、`updated_by` 是操作的人。
◾ 不在範圍：PRD VB-FEAT-001 依災害類型分四個固定段落的內容結構（ADR-274）。
