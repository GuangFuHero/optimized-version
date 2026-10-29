# Plan: 029-identity-reset

**Spec**: `spec.md`　**Decisions**: `decisions.md`（ADR-402～405、415）
**Branch**: `feat/identity-reset`（從 `origin/main` @ `48c3edaaf` 開）。

> 2026-10-28：本 Spec 先在一支同時含停用帳號的分支上實作，Carol 確定停用帳號暫時不做後拆開。
> 這支只帶身分收回的部分；完整版保留在 `feat/account-disable`。

每個 Task：先寫會失敗的測試（RED）→ 實作（GREEN）→ 全套件不比基準差 → 單獨 commit。
測試環境：專屬 DB（h3 image）與 redis，`TEST_REDIS_URL` 一定要設，不能碰 6379（enerlyzer 的）。

## 新增與修改的檔案

| 檔案 | 內容 |
|---|---|
| `app/core/api_errors.py` | `IDENTITY_RESET` |
| `app/services/identity_reset.py`（新） | 「改 session 為預設身分 ＋ 組 `identity_reset` 錯誤」，請求路徑與 refresh 共用 |
| `app/core/security.py` | `get_current_user`：身分失效改走 reset |
| `app/services/auth_session.py` | `refresh_session`：失效身分改走 reset，只認現役 token、只回 session 自己的身分（ADR-415） |
| `app/repositories/session_repository.py` | `is_current`：送來的 refresh token 是不是 session 目前那一把 |
| `app/services/admin.py` | `set_team_status` 暫停後通知全隊 |

---

## Task 0：基準

- [x] main @ `48c3edaaf`：2974 passed、0 failed，覆蓋率 96%（`pytest -n 4`，10 分鐘）。

## Task 1：錯誤碼（ADR-402、404）

- [x] 測試：`ErrorCode.IDENTITY_RESET == "identity_reset"`，不在 `_SIGNED_OUT`（`tests/test_identity_reset_code.py`）。

## Task 2：身分失效 → `identity_reset`（一般請求）（ADR-402、404）

- [x] 測試（`tests/test_identity_reset.py`）：團隊暫停、移出團隊後，舊 token 的下一個請求回 401 `identity_reset`、
  `revoked_identity` 正確、session 已改成預設身分；cookie 沒被清；角色被刪時 `role` 為 `null`；
  同一把舊 token 再打一次是 `access_token_stale`；`PATCH /users/me` 沒有被執行；
  後台兩隊成員，一隊暫停後 refresh，後台改用另一隊身分；
  另外走真正的 API 撤銷團隊角色、把平台角色換回 `user`，都回 `identity_reset`。
- [x] 改既有測試 6 處：原本期待 `identity_revoked` 加清 cookie，改成 `identity_reset`、cookie 保留。

## Task 3：refresh 遇到失效身分（ADR-403、415）

- [x] 測試：瀏覽器 refresh 先回 `identity_reset`、不清 cookie、不 rotate，同一把 cookie 再 refresh 成功。
- [x] 測試：Bearer 帶失效身分一直回 `identity_reset`，session 沒被撤銷；不帶身分就落在預設身分。
- [x] 測試（ADR-415）：帶別隊 uuid 查不到名稱、不改 session；換發過的舊 token 交給 `rotate()`：
  寬限期外撤銷 session、寬限期內拿到新 token（身分還在就保留，失效才落在預設）。
- [x] 測試：改 session 時 Redis 連不上 → 503 `session_store_unavailable`、不清 cookie（請求與 refresh 兩條路）。

## Task 4：團隊暫停通知（ADR-405）

- [x] 測試：隊員與隊長各收一則 `team_suspended`（一人兩個角色只收一則）；操作的超管在隊上也不收；
  恢復、重複暫停不發；通知失敗時暫停照樣成功（原本 main 上申請人通知失敗會 500）；
  申請人通知失敗時隊員照樣收到、隊員通知失敗時申請人照樣收到（各自一個 try，#154 review）。

## Task 5：ADR 標註、合約檔與文件

- [x] ADR-096（Spec 010）、ADR-328（Spec 023）、ADR-357（Spec 026）標「部分取代」。
- [x] `Spec/Docs/identity-switching.md`、`Spec/Docs/er-diagram.md`（`team_suspended`）。
- [ ] `pnpm schemas:generate`。

## Task 6：Docker 從零完整驗證

- [ ] 從零起 stack，migration、seed，容器裡跑全套件。
- [ ] 實際打 API：兩隊成員在瀏覽器登入、切到甲隊 → 超管暫停甲隊 → 收到 `identity_reset`、cookie 沒清 →
  refresh 後後台改用乙隊 → 通知裡有 `team_suspended`。

---

## 交給前端的 API 變更

1. **新錯誤碼 `identity_reset`（401）**：cookie 沒清。收到時：
   - 讀 `revoked_identity.role`、`revoked_identity.team`，顯示「你的 <團隊><角色>身分已被收回」。`role` 是內部代號（`member`、`admin`、`data_auditor`…），要轉成畫面上的名稱。兩欄可能是 `null`（角色已刪除，或後端判斷不該透露），這時顯示「你目前使用的身分已被收回」。
   - 丟掉記住的身分，refresh（瀏覽器版 `POST /auth/session/refresh` 直接打就好；Bearer 版不要帶 `identity`）。
   - **不要自動重送**原本的請求，讓使用者自己決定。
   - **同一次收回只提示一次**：同時送出的幾個請求（或 refresh）可能都收到 `identity_reset`，不能每個回應提示一次。
   - refresh 後畫面要**明確顯示現在用的是哪個身分**：後台會自動換成他的另一個後台身分（例如乙隊），使用者沒注意到就會用錯的身分做事。
   - 後台 refresh 後如果收到 403 `back_office_identity_required`，顯示既有的「沒有管理權限」頁。
2. **五種情況都會收到 `identity_reset`**：團隊暫停、被移出團隊、平台角色被換、角色被撤銷、角色被刪除。
   只有團隊暫停另外發通知，其他四種只能靠這個錯誤碼提示。
3. **`identity_revoked` 不會再出現**：現有處理可以留著，下一版再拿掉。
   **現在的前端會把 `identity_reset` 當成登出**（`apps/admin/src/app/providers.tsx` 的 401 一律 `endExpiredSession()`），
   但 cookie 沒被清，重新載入後又是登入狀態、身分變成預設，畫面沒有說明。
4. **改回預設身分時 Redis 連不上會回 503 `session_store_unavailable`**：照既有處理，稍後重試，不要當成登出。
5. **新通知類型 `team_suspended`**：`ref_type = "team"`，暫停時該隊全員各收一則（操作的超管除外）。
6. **前台 server 端的 refresh 會把 `identity_reset` 當成登出**：`libs/modules/src/server/session-refresh.ts` 把 refresh 的 401 一律當成 `refused`，
   `libs/modules/src/session/shared-refresh.ts` 再把這個結果快取 30 秒。閒置後回來的人，如果第一個碰到收回身分的是 refresh，
   這 30 秒內的請求都會被當成登出，畫面可能被反覆重新載入。這兩處要把 `identity_reset` 跟登出分開。
   **後端最好跟這個前端改動同一次部署**，不要後端先上。
