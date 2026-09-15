# 行前通知（briefings）— ADR 全集（ADR-259~262）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號從 259 起跳，避開 `Spec/018-ticket-disaster-fields/decisions.md` 已佔用但尚未合併的 ADR-244~258。

四條都源自 PR #49 的 review。

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
