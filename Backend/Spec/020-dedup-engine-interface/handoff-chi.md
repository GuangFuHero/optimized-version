# 給 Chi 的交接訊息（2026-09-29）

> 對應 plan Task 0。以下是傳給 Chi 的原文。

---

Chi 你好，Spec 020（把你的去重快層包成後端服務）推上去了：`feat/dedup-engine-interface`，疊在你的 #59 上。PR 還沒開，想先跟你確認幾件事。

完整的驗證和延遲報告在分支上的 `Backend/Spec/020-dedup-engine-interface/verification.md`。重點是 §2 分工、§4 index、§6 待你回覆的事，也有怎麼自己跑測試（§7）。

**分工（ADR-304、306）**
- **你那邊**：`app/dedup_engine/` 歸你。撈哪些候選（`candidates.py`，只能讀 DB）、比對單位是工單還是任務、訊號、分數、門檻，都由你決定，以後改這些不用動後端。演算法測試（`test_fast.py`、`test_text.py`、golden）和 `CHANGELOG.md` 也歸你。
- **後端這邊**：三個觸發點（新開單帶任務、替既有的單加任務、登記站點）、權限、transaction、逾時和 fail-open、寫配對卡和 audit、GraphQL，還有**所有 DB 的東西（model、migration、index）**。你改了查詢寫法、需要新的 index，跟我說一聲，或者 `tests/dedup_engine/test_candidates.py` 的 index 測試紅了，由我這邊補。
- **`registry.py` 歸後端**：它決定線上用哪個 engine。你可以新增 engine class，要不要上線、切到哪一個由我來改。
- **守門測試**（`test_contract.py`、`test_core_isolation.py`、`test_candidates.py` 的 index 測試）：你的改動讓它們紅了，可以在你的 PR 裡調整，但這部分我會 review。
- **`contract.py`** 是我們雙方的合約，改欄位要雙方同意，並遞增 `CONTRACT_VERSION`。

**要跟你確認的**
1. `app/dedup_engine/contract.py` 的欄位（`TicketDraft`、`TaskDraft`、`StationDraft`、`Suspect`）和 `check`、`score` 兩個介面，夠不夠你用？
2. 你的離線 harness 現在需要一個 DB，因為 engine 會自己查資料。這樣可以嗎？
3. 效能門檻和逾時我這邊依實測定了（ADR-307）：
   - contract test：全表 2 萬筆、半徑內 500 筆、帶 5 個任務的新開單，`check` 要在 200 ms 內。
   - 後端等 engine 的逾時維持 2 秒。
   - 實測最差的情況是半徑內 2000 筆、5 個任務，整個請求 p99 約 245 ms。候選只查一次，任務數增加的成本來自每個任務都要跟全部候選算分數。

   你覺得哪裡不合理再跟我說。
4. `app/dedup_engine/CHANGELOG.md` 的回測欄位（fast-v2 的資料集、precision、recall）麻煩你補，fast-v1 那格也還空著。

**動到你的東西**
1. **#46 的 migration `d4c8b1e07a92` 我改了**。它還沒合併，直接改比新開一個 migration 乾淨。改的內容：
   - `score_components` 改名為 `evidence`
   - 加上 `engine_version`
   - audit 加入 `hint_shown`
   - 加了一個站點用的 index

   所以合併順序必須是 #46 → #59 → 本分支。
2. **index 的問題**：驗證時發現，候選查詢從 #46 開始就一直沒用到 `ix_base_geometries_geography`。
   - 原因：geoalchemy2 的 `cast(x, Geography)` 產生的是 `geography(GEOMETRY,-1)`，跟 index 對不上；站點用 centroid 量距離，也沒有對應的 index。
   - 影響：表裡有 2 萬筆時，密集地點送一筆要約 2 秒，剛好碰到逾時。修正後大約 40 ms。
   - 已經在這個分支修好（ADR-305），算出來的距離不變，golden 也沒動。
   - 以後在 `candidates.py` 寫距離條件時，cast 請沿用 `_GEOGRAPHY`。

---

## Chi 的回覆

（待填）
