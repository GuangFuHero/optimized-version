# 給 Chi 的交接訊息（2026-09-29）

> 對應 plan Task 0。以下是傳給 Chi 的原文。

---

Chi 你好，我把你的 dedup 快層包成後端服務了（Spec 020）。branch 是 `feat/dedup-engine-interface`，base 在你的 #59 上。PR 還沒開，想先跟你確認幾件事。

完整的驗證結果和速度實測在 branch 上的 `Backend/Spec/020-dedup-engine-interface/verification.md`。建議先看 §2（誰負責什麼）、§4（index 問題）、§6（需要你回覆的事），§7 是怎麼自己跑測試。

**誰負責什麼（ADR-304、306）**

- **你負責**：`app/dedup_engine/` 這個資料夾。
  - 要從 DB 撈哪些資料來比對（`candidates.py`，只能讀、不能寫）。
  - 比對的對象是工單還是任務、用哪些 signals、分數怎麼算、threshold 多少。
  - 以後改這些都不用動後端。
  - 演算法的測試（`test_fast.py`、`test_text.py`、golden test）和 `CHANGELOG.md` 也是你的。
- **後端負責**：
  - 什麼時候跑 dedup：新開單（連同任務）、替已經存在的單加任務、登記站點，固定這三個地方。
  - 權限檢查、transaction、timeout 和出錯時的處理（engine 出錯或太慢，就當作沒有重複、照常建立）。
  - 把結果寫進 DB（`duplicate_pairs`、audit log）、GraphQL API。
  - **所有 DB 結構的東西：model、migration、index。** 你改了查詢寫法、需要新的 index，跟我說一聲；或者 `tests/dedup_engine/test_candidates.py` 裡檢查 index 的測試紅了，我這邊來補。
- **`registry.py` 由後端管**：它決定線上實際用哪一版 engine。你可以寫新的 engine class，要不要上線、切到哪一版由我來改。
- **後端寫的檢查測試**（`test_contract.py`、`test_core_isolation.py`、`test_candidates.py` 裡檢查 index 的那兩條）：你的改動讓它們失敗的話，可以在你的 PR 裡一起調整，但這部分我會 review。
- **`contract.py`** 是我們兩邊說好的介面（engine 收什麼、回什麼）。要改欄位得兩邊都同意，並把 `CONTRACT_VERSION` 加 1。

**要跟你確認的**

1. `contract.py` 裡的資料型別（`TicketDraft`、`TaskDraft`、`StationDraft`、`Suspect`）和 `check`、`score` 兩個 method，夠不夠你用？
2. 你離線調參數用的工具（拿一批標好「哪些是重複」的舊資料跑演算法、算 precision／recall 來決定 threshold 的那個）：以前 engine 只要餵「新送出的單＋一串附近的資料」就能算分數，不需要 DB。現在 engine 會自己去 DB 撈附近的資料，所以要跑完整的 engine，得準備一個有同樣資料表的 Postgres（含 PostGIS），把那批資料灌進去。如果只想調分數公式，也可以直接呼叫 `fast.py` 裡算分數的部分（`Signals`、`combine`），不用 DB，但這樣就測不到「撈哪些資料」那一段。這對你調參數的流程有影響嗎？你打算用哪種方式？
3. 速度標準和 timeout 我這邊用實測數字定了（ADR-307）：
   - 測試標準：DB 裡總共 2 萬筆任務、送出地點附近 500 筆，送一張帶 5 個任務的新單，`check` 要在 200 ms 內跑完。
   - timeout：後端最多等 engine 2 秒，超過就當作沒有重複、照常建立。
   - 實測最慢的情況：附近有 2000 筆、送 5 個任務，整個 request 最慢的 1%（p99）約 245 ms，離 2 秒很遠。
   - 任務越多越慢的原因：附近的資料只查一次，但每個任務都要跟每一筆算一次分數。

   你覺得哪裡不合理再跟我說。
4. `app/dedup_engine/CHANGELOG.md` 每一版都要記「用哪批資料驗證、準確度多少（precision、recall）」。fast-v2 這格麻煩你補，fast-v1 那格也還空著。

**動到你的東西**

1. **我改了 #46 的 migration `d4c8b1e07a92`**。它還沒 merge，直接改比另外新開一個 migration 乾淨。改的內容：
   - 欄位 `score_components` 改名為 `evidence`
   - 加上 `engine_version` 欄位
   - audit log 的事件類型加上 `hint_shown`
   - 加了一個給站點查詢用的 index

   所以 merge 順序必須是 #46 → #59 → 這個 branch。
2. **index 沒被用到的問題**：驗證時發現，撈附近資料的查詢從 #46 開始就一直沒用到 `ix_base_geometries_geography` 這個 index。
   - 原因：geoalchemy2 的 `cast(x, Geography)` 產生的 SQL 是 `geography(GEOMETRY,-1)`，跟建 index 時寫的 `::geography` 不一樣，Postgres 就不會用那個 index。站點則是用中心點（centroid）算距離，本來就沒有對應的 index。
   - 影響：DB 有 2 萬筆時，在資料密集的地點送一張單要約 2 秒，剛好碰到 timeout。修好之後約 40 ms。
   - 已經在這個 branch 修好（ADR-305）。算出來的距離不變，golden test 的結果也沒變。
   - 以後在 `candidates.py` 寫距離條件時，cast 請用檔案裡的 `_GEOGRAPHY`。

> **golden test 是什麼**：用一組固定的測試資料跑 engine，把結果（誰被判重複、分數多少）存成 `tests/dedup_engine/golden/fast.json`。之後每次跑測試都拿現在的結果跟它比，不一樣就失敗。你故意改了演算法的話，就把 engine 的 `version` 往上加（例如 `fast-v2` → `fast-v3`）、寫進 CHANGELOG，再重新產生這個檔案。這樣分數就不會在沒人知道的情況下悄悄改變。

---

## Chi 的回覆

（待填）
