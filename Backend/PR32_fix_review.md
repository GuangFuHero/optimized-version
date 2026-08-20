# PR #32 修正回合 Code Review

範圍：`origin/feature/bi-implement` 上針對前一輪 review（H1/H2/H3、M1–M4、兩個 LOW）所做的三個修正 commit：

- `7550989dc` fix(analytics): stop NULL group keys and bad tz from 500ing the charts
- `abfb19f40` fix(stations): validate photo urls, constrain status, stamp only on change
- `d2ee1ddb2` refactor(graphql): share the photo DataLoader, drop dead types.py

（註：#31 已 merge 進 main，此分支 base 較舊所以 diff 仍帶到 #31 的檔案；下面只看這三個修正 commit。）

## 結論

**修正本身都是對的，沒有改壞東西**，48 個相關測試全綠，而且大多是真的回歸測試（把修正還原就會紅）。
有 2 個值得在 merge 前處理的問題（1 個效能沒修乾淨、1 個測試沒測到接線），另外 3 個小提醒。

---

## 驗證方式（可重現）

在 scratchpad worktree 上 checkout `d2ee1ddb2`，`uv sync --all-groups`，DB 用 localhost:5433 的獨立測試庫：

```
TEST_DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/bi_review_test \
TEST_ADMIN_DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/postgres \
.venv/bin/python -m pytest tests/test_analytics_api.py tests/test_ticket_analytics.py \
  tests/test_station_analytics.py tests/test_station_photo_and_status.py -q
→ 48 passed
```

**回歸測試真實性驗證**：把五個修正逐一還原（category coalesce→原欄位、tz 只 catch
`ZoneInfoNotFoundError`、duplicate_count 拿掉必填檢查、`update_station` 改回 key 判斷、
photo.py 拿掉 `validate_photo_url` 呼叫）後重跑：

```
9 failed, 39 passed
FAILED test_analytics_api.py::test_invalid_timezone_is_a_400[] / [/etc/passwd] / [..]
FAILED test_analytics_api.py::test_duplicate_count_requires_a_date_range
FAILED test_ticket_analytics.py::test_ticket_count_category_labels_null_task_type
FAILED test_ticket_analytics.py::test_completion_rate_category_labels_null_task_type
FAILED test_ticket_analytics.py::test_duplicate_count_requires_a_date_range
FAILED test_station_analytics.py::test_station_count_labels_null_type
FAILED test_station_photo_and_status.py::test_update_station_does_not_restamp_an_unchanged_status
```

→ 除了 photo URL 那一項以外，每個修正都有真的回歸測試守著（見下方 F2）。

**Migration 實跑**（乾淨 DB + PostGIS，5433）：`alembic upgrade head` → `downgrade -1` →
`upgrade head` 全部成功，`ck_stations_operational_status` CHECK 確實存在且值域與
`StationOperationalStatus` enum 三個值一致。

---

## 逐項確認：修正是否真的修好

| 項目 | 判定 | 證據 |
|---|---|---|
| **H1 NULL group key** | ✅ 修好且覆蓋完整 | `Tickets.task_type` / `Station.type` 是唯一兩個 nullable 的 category 欄位，都走 `category_expr()` coalesce。`TicketTask.task_type`（ticket_task.py:26）是 `Mapped[str]` 非空，所以 `ticket_analytics.py:290` 直接 group 沒問題；`duplicate_count` 的 category 在 join 條件裡已有 `a.task_type.is_not(None)`（ticket_analytics.py:419），也不會有 NULL。日期側改成濾掉 NULL `completed_at` 也對。 |
| **H2 tz 例外型別** | ✅ 修好 | 實測 `ZoneInfo('')` / `'/etc/passwd'` / `'..'` → `ValueError`；`'Nope/Nope'` / `'UTC '` / `'Asia'`（目錄）→ `ZoneInfoNotFoundError`。兩種都 catch 了，沒有第三種漏網。 |
| **H3 duplicate_count O(n²)** | ⚠️ 只修一半 | 見 F1 |
| **M1 catalog 排序決定性 / 共用 handler** | ✅ | `allowed_x` 改 tuple，`resolve()` 取 `[0]` 已決定性。 |
| **M2 photo URL 驗證** | ✅ 邏輯對，⚠️ 沒測到接線 | 見 F2。`validate_photo_url` 本身正確：`urlparse` 會把 scheme 轉小寫，`http://`（無 host）被 netloc 檢查擋掉，500 字元邊界對齊 `photos.url` String(500)。全庫只有 `photo.py:55` 一處寫入 url，沒有漏掉的寫入路徑。 |
| **M3 只在真的轉換時蓋章** | ✅ 修好 | `station.py:110` 比對舊值；GraphQL 端 `mutations.py:99` 傳的是 `.value`（str），跟 ORM 欄位同型別，比較不會誤判。`create_station` 仍固定蓋章（station.py:76），所以新建即關閉的站點也有日期。 |
| **M4 operational_status 值域** | ✅ 修好（模型有 drift，見 F3） | GraphQL query 參數改 enum，且 `UpdateStationInput.operational_status` default 是 `None` 不是 `UNSET`，所以 mutation 的 `is not None` 判斷不會踩到 `UNSET.value`。CHECK 約束實跑存在。 |
| **LOW: 共用 photo DataLoader** | ✅ | `ref_uuid` 就是 `base_geometries.uuid`，兩個 loader 查詢完全相同，共用一個 instance 正確，快取也真的合併了。 |
| **LOW: 刪掉 dead `graphql/types.py`** | ✅ | 確認 `schema.py` 只 import 子模組，全庫無其他 import。 |

**額外主動查核（都沒問題）**：
- `layout_overrides` 的 XSS 疑慮 → 實測 plotly `to_html` 會把 `<` `/` 轉成 `</`，`</script><img onerror=...>` 無法逃逸出 script 標籤。docstring 說「Plotly figure 是純 JSON 所以安全」是成立的。
- 9 種畸形 `layout_overrides`（未知 key、型別錯、巢狀值錯、假 template…）實測全部丟 `ValueError` → 400，不會 500。非 dict 的 JSON 也在 `analytics.py:128` 擋掉了。
- `tz.key` 是走 bind param 進 `timezone()`，沒有 SQL injection。

---

## 需要處理

### F1 [MEDIUM] duplicate_count 的 self-join 只綁住了一邊，效能沒真的收斂
`app/services/ticket_analytics.py:455-464`

強制帶日期只加在 `a` 上，`b` 完全沒有範圍條件。實際編出來的 SQL：

```
WHERE anon_2.created_at >= '2026-08-01…' AND anon_2.created_at < '2026-08-11…'
-- anon_3（b 側）只有 join 條件，沒有任何日期 where
```

所以複雜度從 N×N 變成 K×N，不是 K×K；`abs(extract(epoch from a.created_at - b.created_at)) <= 86400`
這個條件不可 sargable，planner 無法用它剪掉 b。資料量大的時候這仍然是全表掃。

修法很簡單且語意等價（pair condition 已經保證 |Δt| ≤ 24h，所以 b 不可能落在
`[lower-24h, upper+24h]` 之外）：

```python
flagged = flagged.where(b.created_at >= lower - timedelta(hours=DUPLICATE_TIME_WINDOW_HOURS))
flagged = flagged.where(b.created_at <  upper + timedelta(hours=DUPLICATE_TIME_WINDOW_HOURS))
```

順帶：commit message 寫「Bounding the input is the only fix that works」— 只綁一邊的話這句話還沒兌現。

### F2 [MEDIUM] photo URL 驗證有測到函式、沒測到「service 真的有呼叫它」
`app/services/photo.py:47`、`tests/test_station_photo_and_status.py:63-89`

三個測試都是直接呼叫 `validate_photo_url(...)` 的單元測試。我把 `photo.py:47` 那行
`validate_photo_url(url)` 整行刪掉重跑，**48 個測試依然全綠** — 也就是說 M2 真正要修的那個
bug（`attach_photo_to_geometry` 存 verbatim URL 導致 500）沒有任何測試守著，下次有人重構
service 把這行弄掉不會有人發現。

建議補一個走 service 或 GraphQL mutation 的測試：`attach_photo_to_geometry(..., url="x"*501)`
應該拿到 `ValueError`，而不是 asyncpg 的 `StringDataRightTruncationError`。

### F3 [LOW] CHECK 約束只寫在 migration，模型沒有 → 測試環境根本沒有這個約束
`app/models/geo.py:69` / `alembic/versions/a1b2c3d4e5f6_*.py`

conftest 是用 `create_all()` 由模型建表的。實際查測試 DB：

```
select conname from pg_constraint where conrelid='stations'::regclass;
→ 只有 stations_pkey / stations_uuid_fkey / stations_child_station_uuid_fkey / stations_updated_by_fkey
```

M4 說的「integrity backstop」在測試環境完全不存在，也沒有測試能驗證它。建議在
`Station.__table_args__` 加上同名 `CheckConstraint`，模型與 migration 才不會漂移。

### F4 [LOW] 已經跑過 a1b2c3d4e5f6 的環境不會補跑 backfill 與 CHECK
這一輪是「就地改舊 migration」而不是新增一支。任何在修正前就 `upgrade head` 過的環境
（例如作者自己的 dev DB）alembic 不會重跑，`completed_at` backfill 和 CHECK 都不會有。
目前無正式使用者，處理方式是 `downgrade -1` 再 `upgrade head` 即可，但 merge 前要記得講一聲。

### F5 [INFO] analytics 端點只做 checkpoint-1 權限，忽略 scope
`app/api/v1/endpoints/analytics.py` 用 `has_permission(Perm.TICKET_VIEW / STATION_VIEW)`，
拿到 Scope 後沒有做任何 row-level 過濾。目前 `seed_rbac.py` 裡 `ticket.view` / `station.view`
全部角色都是 `:all`，所以現在沒有實害。但如果日後有人把某個角色收窄成 `own`/`zone`，
GraphQL 那邊會過濾、analytics 聚合不會，等於從彙總數字洩漏範圍外資料。至少在端點註解裡
寫清楚「這裡刻意只做 checkpoint 1，前提是 view 權限恆為 :all」。

---

## 建議

F1、F2 在 merge 前修（都是幾行的事），F3 順手補，F4 是部署提醒，F5 寫個註解或開 issue 追。
其餘修正品質很好 — 特別是三個 commit message 都把「為什麼這樣修、為什麼不那樣修」講清楚了，
而且測試確實是回歸測試不是事後補的 test-of-the-fix（已用還原法驗證）。
