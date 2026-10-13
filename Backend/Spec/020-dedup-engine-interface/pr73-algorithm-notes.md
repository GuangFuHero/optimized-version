# PR #73 審查時看到的演算法相關現象（給 Chi 參考）

> 2026-10-13，後端審查 PR #73 時順帶量到的。`app/dedup_engine/` 的演算法歸 Chi（ADR-306），以下只是把觀察和證據交給你，
> **要不要處理、怎麼處理由你決定**，後端不會改你的檔案邏輯。後端自己的問題已在本票修掉（ADR-313，見 `decisions.md`）。
>
> 每一條都標了證據等級：**實測**＝實際跑出來的；**文件**＝依文件原文；**讀程式碼**＝看程式碼確認，沒實際跑。

---

## 1. fast-v3 在資料密集的地點變慢很多（實測）

**白話**：電話加分讓搜尋半徑從 162.1 m 變成 290.8 m（CHANGELOG 有記）。面積大約 3.2 倍，撈回的候選也多約 3.2 倍；
但實測最差情況慢了約 6.6 倍，多出來的時間大約一半來自比對電話。

**怎麼量**：同一個 test DB，2 萬筆分散全台的背景任務，再在一個地點周圍 330 m 內**均勻**放任務（每張單 1 個任務、各一支不同的手機號碼）。
fast-v2（`835bbeaff` 的原始碼）和 fast-v3（PR head）在同一個 process 裡**交錯**呼叫後端的 `check_submission`，各 3 次 warm-up、30 次計時。
（`verification.md` §5 的舊實測把 2000 筆塞在 ±60 m 內，半徑變大也撈不到更多，所以看不出這次的影響。）

| 舊半徑內筆數 | 撈回的候選 v2 → v3 | 1 個任務 p50 v2 → v3 | 5 個任務 p50 v2 → v3 | 5 個任務 p95 v2 → v3 |
|---|---|---|---|---|
| 約 500 | 522 → 1647 | 16.0 → 41.9 ms | 33.8 → 98.8 ms | 50.9 → 156.6 ms |
| 約 2000 | 2009 → 6444 | 57.1 → 249.8 ms | 126.9 → **834.1 ms** | 347.5 → 983.0 ms（最慢 1033 ms） |

量的時候同一台 DB 伺服器上還在跑全套測試，所以絕對數字偏高；兩版是交錯跑的，倍數可以比。都還在後端的 2 秒 timeout 內，不會讓建立失敗。

**為什麼電話比對變慢**：

- `fast.py` 的 `phone_key` 有 `lru_cache(maxsize=4096)`。
- 但同一次 `check` 裡，每個任務草稿都會把每個候選的電話再比一次（`_task_suspect` → `same_contact_phone`）。
- 候選的不同電話超過 4096 支時，依序存取會把快取整個洗掉，每次都 miss，等於每次都重新 parse。

| 量什麼 | 結果 | 等級 |
|---|---|---|
| 單獨呼叫 `same_contact_phone`：1647 支電話 × 5 個任務 | 21 ms，miss 1648 次（幾乎全命中） | 實測 |
| 單獨呼叫 `same_contact_phone`：6444 支電話 × 5 個任務 | **354 ms**，miss 32221 次 | 實測 |
| 同一份資料（約 2000 筆密度、5 個任務），只把快取改成 65536、其他不動，交錯各 20 次 | p50 **867 → 467 ms** | 實測 |

**可能的方向（參考）**：每次 `check` 對每個候選只比一次電話（在任務迴圈外先算好），就不依賴快取大小。

**跟速度測試有關的兩點**：

- `test_contract.py::test_fast_enough` 的資料沒有電話，所以抓不到這部分的成本。（讀程式碼：`test_contract.py` 裡完全沒有 `contact_phone`）
- 這個測試的 500 筆候選排在一條約 300 m 長的線上（`test_contract.py:68`，每張單往東 0.00003°≈3.06 m，100 張單 × 5 個任務）。
  用同樣資料實際查：fast-v2 半徑內 265/500、fast-v3 半徑內 480/500。也就是 fast-v2 時其實沒有測到「半徑內 500 筆」。（實測）

---

## 2. 「替既有的單加任務」時，佔位電話會被當成同一支（實測）

**白話**：`tickets.contact_phone` 存的是使用者打的原字串（後端只去掉前後空白、限長度，不檢查格式）。
`phone_key` 解析失敗時退回「只留數字」，所以兩張單都填 `0000000000` 這類佔位號碼，會被當成同一支電話而加 0.10。

- **新開單**：送出方的電話後端會先轉 E.164，不合法就不送（`dedup_snapshot.e164_or_none`），所以碰不到。
- **替既有的單加任務**：電話是 engine 自己讀現有工單的原字串（`candidates.ticket_anchor`），會碰到。

**實測**（真的 `FastEngine`；工單 A 有一個「抽水」任務，工單 B 在東邊 200 m，對 B 用 `submit_new_task` 加同樣的「抽水」）：

| A 的電話 | B 的電話 | 結果 | similarity |
|---|---|---|---|
| `0000000000` | `0000000000` | **被擋下（提示疑似重複）** | 0.8499（含電話加分） |
| `0912345678` | `0912-345-678` | 被擋下 | 0.8499（真的同一支，本來就該加分） |
| `0912345678` | `0987654321` | 照常建立 | 0.7499 |
| 沒填 | 沒填 | 照常建立 | 0.7499 |
| 新開單、同樣位置、填 `0000000000` | — | 照常建立 | （新開單那條路碰不到） |

---

## 3. 回測和 engine 比電話的方式不一樣（一半實測、一半文件）

- `CHANGELOG.md` 的 fast-v3 回測寫「phone equality on digits only」（只留數字比對）。（文件）
- engine 是先用後端的 E.164 parser 轉換再比，所以 `+886912345678` 和 `0912-345-678` 會被當成同一支。（實測：`same_contact_phone('+886912345678', '0912-345-678') == True`）
- 只留數字的話這兩個是 `886912345678` 和 `0912345678`，不相同。所以線上加分的次數可能比回測多一點。回測資料不在 repo 裡，這部分沒辦法實際跑。

---

## 4. `FastEngine.score` 收到工單層級的確認時會丟例外，不是回 None（實測）

- `contract.py` 說 `score` 在對方找不到時回 `None`。
- `FastEngine.score` 只處理 `"task:i"` 和 `"station"`；收到 `draft_ref="ticket"`（`createTicket` 帶工單本身的 `acknowledgedDuplicateOf`）時，
  `int(draft_ref.partition(":")[2])` 會丟 `ValueError: invalid literal for int() with base 10: ''`（`fast.py` 的 `score`）。
- **後端已經不受影響**：ADR-313 之後，`score` 失敗時後端自己查對方存在才寫卡，所以不會再寫出指向不存在東西的配對卡。
  只是每次都會在 log 留一條 `dedup scoring failed` 的 ERROR。要不要讓它照契約回 `None`，由你決定。

---

## 5. 上線時機（文件）

- `CHANGELOG.md` 的 fast-v3 寫著「Pending confirmation with Carol (team) before shipping」。
- `registry.py` 現在登記的是 `FastEngine()`，也就是 fast-v3；PR #73 合併就等於 fast-v3 上線。
- 照 ADR-306，`registry.py` 由後端改。如果 fast-v3 要等 Carol 確認後才上線，跟我說，我在合併前把 registry 指回 fast-v2 的 class，或你提供一個 fast-v2 的 engine class。

---

## 6. 動到你檔案的地方（只有註解）

ADR 改號（`decisions.md` 開頭有對照表：286~294 → 314~322、300 → 323，原號跟其他 PR 撞號）。下列你的檔案裡只改了引用的 ADR 號碼，邏輯沒動：

- `app/dedup_engine/CHANGELOG.md`、`app/dedup_engine/contract.py`、`app/dedup_engine/text.py`
- `tests/dedup_engine/test_text.py`、`tests/dedup_engine/test_contract_types.py`
