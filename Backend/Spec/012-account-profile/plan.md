# Account Profile — Implementation Plan

**Goal:** 讓使用者能自助更換 email／手機而不會把自己鎖在門外，且被偷走的 session 無法藉此接管帳號。

**Architecture:** 沿用既有的 verify-then-attach 流程，把「已有同型別 → 409」改為 replace 語意（ADR-098）。分支密集的安全判定抽到 `app/services/auth_contact.py`，endpoint 只留 input parse 與狀態碼對應。step-up 的種類由後端從帳號形狀決定，不看前端送什麼。

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL, Redis, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/012-account-profile/spec.md`（ADR-085~089、098）

**Branch:** `feat/account-profile-backend`（off `main`）

> **⚠️ 本文件為完工後回填（2026-08-20）。** 實作先於 plan 完成，所以這裡的 Task 分解是照實際交付的順序整理的，不是當初的施工單。它的用途是讓 reviewer 有一條可依循的閱讀路線，並記下當時實際踩到的取捨。逐條的「設計 ↔ 程式碼 ↔ 測試」對照在 `spec.md` §10。
>
> 往後的票仍照原流程：grill → ADR + spec → plan → 實作。

---

## Global Constraints

- **不動忘記密碼。** `password.py` 的四個端點已完整實作，本票對它與它的三個測試檔必須是零 diff（`spec.md` §10.2 末列有驗證指令）。
- **不做 migration。** 本票不新增也不修改任何欄位——`user_contacts` 的既有結構足夠，硬刪除由 `audit_logs` 留痕（ADR-087）。
- **只抽 `contacts.py` 一個檔案。** `sso.py`（18 次 repository 直呼）、`password.py`、`register.py`、`session.py` 的既有偏離刻意不碰，避免功能票變成重構票（ADR-088）。
- **不新增端點以外的公開介面。** 端點數只 +1（`DELETE /auth/contacts/{type}`）。

## 範圍

| 納入 | 排除（明確不做） |
|---|---|
| `POST /auth/contacts` 改為 add-or-replace | 同型別多筆 contact + `is_primary`（ADR-098 否決 B 案） |
| step-up：有密碼驗密碼、SSO-only 驗舊管道 | 通用 re-auth 端點與短效憑證（ADR-086 否決） |
| 更換成功後通知舊管道，新值遮蔽 | 更換後撤銷所有 session（ADR-085 否決） |
| `DELETE /auth/contacts/{type}` + 登入管道守門 | 帳號刪除／停用 |
| `GET /users/me` 回 `contacts[]` / `identities[]` | `UserUpdate` 加欄位（ADR-089：電話信箱走 contacts 流程） |
| `app/services/auth_contact.py` | auth 其餘檔案的 service 化 |

---

## File Structure

**Create**
```
app/services/auth_contact.py          use-case 層：add/replace/delete + step-up 判定
tests/test_account_profile.py         16 個案例，覆蓋 spec §9
```

**Modify**
```
app/api/v1/endpoints/auth/contacts.py 瘦身為 parse + 狀態碼；新增 DELETE
app/api/v1/endpoints/users.py         read_user_me 載入 contacts / identities
app/schemas/auth.py                   ContactOut / IdentityOut / StepUp；UserResponse 擴充
app/repositories/auth_repository.py   contact: get_by_user_and_type / list_by_user / count_by_user /
                                      replace_verified / delete_contact；identity: list_by_user /
                                      has_sso_identity
app/repositories/verification_repository.py  舊管道 step-up 的 issue / consume（獨立 key prefix）
app/messaging/email.py                build_contact_changed_email
app/messaging/sms.py                  build_contact_changed_sms
tests/test_add_contact.py             三條斷言從「第二個 email → 409」改寫為「422 要求 step-up」
```

---

## Task 1: repository 補齊取代與計數所需的查詢

**Files:** Modify `app/repositories/auth_repository.py`、`app/repositories/verification_repository.py`

- [x] `contact_repository.get_by_user_and_type()` — step-up 判定與取代都要先知道「現在這型別有沒有東西」
- [x] `contact_repository.replace_verified()` — 同一個 session 內完成換值，**不是先 DELETE 再 INSERT 兩次呼叫**
- [x] `contact_repository.count_by_user()` / `delete_contact()` — 刪除守門要數
- [x] `identity_repository.has_sso_identity()` / `list_by_user()`
- [x] `VerificationRepository.issue_old_channel_step_up()` / `consume_old_channel_step_up()`

**舊管道 step-up 的碼必須用自己的 key prefix。** 取代進行中會有兩個碼同時活著——一個寄到舊地址（證明是本人）、一個寄到新地址（證明新地址是你的）。共用 `PENDING_CONTACT` 前綴會讓兩者互相覆蓋。這條寫在 `verification_repository.py:111` 的註解裡。

## Task 2: service 層——step-up 判定

**Files:** Create `app/services/auth_contact.py`

- [x] 六個 error 型別（`ContactConflict` / `ContactNotFound` / `StepUpRequired` / `StepUpFailed` / `LastLoginChannel`），一個型別對一個 HTTP 狀態
- [x] `_require_step_up()`：先查 password identity，有就驗密碼；沒有就走舊管道發碼／驗碼
- [x] `start_contact_change()`：`is_value_taken` → 查 existing →（有 existing 才）step-up → 發碼到新值

**step-up 擋在發碼之前，不是擋在 verify。** 這是本票真正的安全不變量：攻擊者只有 session 時，**驗證碼從頭到尾不會被送到他控制的地址**，所以 verify 那一步他根本走不到。擋在 verify 也能拒絕，但碼已經寄出去了——那是完全不同的安全性。對應測試 `test_a_code_is_never_issued_to_a_new_address_without_step_up`。

**SSO-only 的第一次呼叫「失敗」是流程的一部分。** 沒帶 `old_channel_code` 時，服務會先把碼寄到舊管道，**然後才** raise `StepUpRequired` 回 422。這讀起來像「失敗路徑做了副作用」，但它就是設計：使用者拿到 422 的同時信箱裡收到碼，第二次呼叫帶上即可。

## Task 3: service 層——commit 與 delete

**Files:** Modify `app/services/auth_contact.py`

- [x] `commit_contact_change()`：衝突檢查 → 查 existing → 消耗驗證碼 → 建立或取代 → 通知舊管道
- [x] `delete_contact()`：查 existing → 數剩餘 contact 與 SSO identity → 放行或 `LastLoginChannel`

**衝突檢查必須排在消耗驗證碼之前。** 順序反過來的話，撞到「這個 email 已被別人用了」的使用者會同時失去手上的碼，得重新發一次。這與 `Spec/010` 的 ADR-096「驗證要排在 `rotate()` 之前」是同一類錯誤——別在還可能拒絕的路徑上先燒掉一次性資源。

## Task 4: endpoint 瘦身與新端點

**Files:** Modify `app/api/v1/endpoints/auth/contacts.py`、`app/schemas/auth.py`

- [x] `_STATUS_BY_ERROR` 表：error 型別 → 狀態碼，是唯一的映射點
- [x] `POST /contacts` / `POST /contacts/verify` 改呼叫 service
- [x] `DELETE /contacts/{type}`，限流 5/60
- [x] `StepUp`（`password` / `old_channel_code` 皆選填）、`AddContactRequest.step_up`

**`step_up` 在 schema 上是選填，在行為上是條件必填。** OpenAPI 表達不了「取代時才必填」，所以驗證放在後端硬性判定，前端帶不帶都不影響安全性（ADR-086 已記下這個取捨）。

## Task 5: `GET /users/me`

**Files:** Modify `app/api/v1/endpoints/users.py`、`app/schemas/auth.py`

- [x] `ContactOut` / `IdentityOut`（後者**只有** `provider`）
- [x] `read_user_me` 逐欄組裝回應

**逐欄組裝而非 `from_orm`。** `UserResponse` 宣告了 `contacts` / `identities`，而 `User` 剛好有同名 relationship——直接讓 Pydantic 從 model 讀會在 async context 外觸發 lazy load，以 `MissingGreenlet` 失敗。這個理由寫在 `users.py:19-24` 的 docstring。（`provider_subject` 不外洩則是靠 `IdentityOut` 只宣告 `provider` 達成，與組裝方式無關。）

## Task 6: 測試

**Files:** Create `tests/test_account_profile.py`；Modify `tests/test_add_contact.py`

- [x] 安全 5 條、功能 8 條、`/users/me` 3 條（逐條對照見 `spec.md` §10.2）
- [x] `test_add_contact.py` 三條既有斷言改寫

**改寫既有測試不是「修測試遷就實作」。** 「第二個 email → 409」是本票刻意要改掉的行為，那三條測的是舊契約。改寫時把斷言重點從「被拒絕」移到「被拒絕的方式」——422 要求 step-up，且**新地址收不到碼**。

---

## 驗收狀態

- [x] `uv run pytest tests/test_account_profile.py tests/test_add_contact.py tests/test_forgot_password.py tests/test_set_password.py tests/test_change_password_identity.py` → **48 passed**（2026-08-20 實跑；本機 db 在 5433，需 `TEST_DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/disaster_rescue_test`）
- [x] 忘記密碼四端點與其三個測試檔零 diff
- [x] `ruff check` 對本票改動的 10 個檔案全綠。**全 repo 仍有 7 個錯誤**，全部落在本票未觸碰的檔案（`alembic/versions/e8b3c5f2a1d4_*.py`、`tests/test_admin_api.py`、`tests/test_suggestion_review_scope.py`），是從 base 繼承的
- [ ] **Docker 完整驗證未執行**（僅跑了上列 5 個測試檔，未跑全套件）— 依既有流程，開 PR 前要補
- [ ] **PR 未開** — 等使用者決定

## 已知缺口

`spec.md` §9 列的「模擬 INSERT 失敗時舊列仍在」沒有對應測試，理由記在 `spec.md` §10.3。
