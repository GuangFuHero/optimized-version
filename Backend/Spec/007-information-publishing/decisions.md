# 行前通知（briefings）— ADR 全集（ADR-259~262、ADR-273）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號從 259 起跳，避開 `Spec/018-ticket-disaster-fields/decisions.md` 已佔用但尚未合併的 ADR-244~258。

ADR-259~262 源自 PR #49 第一輪 review；ADR-273 源自第二輪。
273 起跳是避開 PR #50 已佔用的 ADR-263~272。

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
