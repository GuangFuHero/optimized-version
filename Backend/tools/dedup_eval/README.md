# dedup engine 離線評估工具

拿一批人工裁決過的查詢，重播快層的 top-1 排序，算出 recall、誤報等指標，也可以做參數的 grid search。

分數直接用 engine 的程式算：`score_candidate` 把每一對轉成 `app.dedup_engine.fast.Signals`，再交給 `combine`；文字訊號用 `fast.text_similarity`（截短規則也一樣）。所以在這裡調出來的參數，算分方式跟線上的 `FastEngine` 完全相同。`fast.py` 一改，這裡跟著變；engine 升版時要重跑評估、更新 `app/dedup_engine/CHANGELOG.md` 的 backtest。

撈候選（`candidates.py`）不重播：每筆資料自帶當時撈回的候選清單，所以不需要 DB。

資料不進 repo。真資料放在本機，用 repo 外的腳本產生資料集，再呼叫這個工具。

## 評估單位與分數

一筆資料代表「送出一個任務時的一次查詢」。`retrieval.candidate_ids` 是撈候選實際撈回的集合；工具替集合內每個候選算分數：

```text
distance_signal  = 2 ** (-distance_m / distance_half_m)
time_signal      = 2 ** (-age_min / time_half_min)          time_weight 為 0 時不計入
task_type_signal = 1（相同）/ 0（不同）/ 不計入（任一邊沒有）
text_signal      = fast.text_similarity((title, description), …) / 不計入（任一邊沒文字）

similarity = Σ(signal × weight) / Σ(這次可用 signal 的 weight)
```

`title`、`description` 對應任務的 `task_name`、`task_description`。候選也可以直接帶算好的 `text_similarity`（0–1），有的話優先使用。舊的 pair fixture 雖然有 title／description，預設不帶入，要看文字的效果得明確加上 `--legacy-include-text`。

每個查詢只取分數第一名，再用 `hint_threshold` 判斷會不會跳提示。同分時用 `ticket_id` 排序，讓結果可以重現；這個排序只給評估用，不是產品決定。

資料格式見 `query-evaluation.schema.json`，空白範本見 `query-evaluation.template.json`。

## Label 與使用者行為要分開

- `ground_truth.confirmed_duplicate_candidate_ids`：只放已確認的重複配對。
- `ground_truth.rejected_candidate_ids`：只放已駁回的配對。
- `provisional_expectation`：手寫 fixture 或研究者的假設，只能拿來診斷。
- `observed_hint_behavior`：實際有沒有跳提示，以及使用者接受或忽略提示。這不是 ground truth。

正式調參數用預設的 `--label-set confirmed`。舊 fixture 沒有人工裁決，要明確加上 `--label-set provisional --legacy-fixtures`，輸出會附 warning。

## 指標

- `candidate_retrieval_recall`：有重複的查詢中，撈候選至少撈回一個重複的比例。
- `top_1_recall`：有重複的查詢中，第一名就是重複的比例；沒撈回也算漏掉。
- `duplicate_hint_recall`：有重複的查詢中，第一名正確而且過門檻的比例。
- `false_hint_rate`：裁決完成、確定沒有重複的查詢中，仍然跳提示的比例。
- `wrong_top_hint_rate`：所有跳出的提示中，第一名不是重複的比例（1 − precision）。它同時抓「沒有重複卻提示」和「有重複但提示錯對象」。

分母是零時輸出 `null`，不用 0 假裝量過。

## 執行

在 `Backend/` 底下：

```bash
# 只重播一組參數（順序：D_HALF,T_HALF,D_WEIGHT,T_WEIGHT,TYPE_WEIGHT,TEXT_WEIGHT,THRESHOLD）
uv run python -m tools.dedup_eval.evaluate_fast_layer path/to/dataset.json --evaluate 200,360,2,0.5,0.5,1,0.8

# grid search
uv run python -m tools.dedup_eval.evaluate_fast_layer path/to/dataset.json --label-set confirmed --top 10

# 舊 fixture 的診斷
uv run python -m tools.dedup_eval.evaluate_fast_layer path/to/dedup-test-cases.json \
  --legacy-fixtures --label-set provisional --top 10
```

grid 用 `--distance-half-m`、`--time-half-min`、四個 `--*-weight`（`--text-weight` 預設只有 `1`，就是 engine 現在的值）和 `--hint-threshold`，各自傳入逗號分隔的數列。排序規則是先讓 `duplicate_hint_recall` 最大，再依序壓低 `false_hint_rate`、`wrong_top_hint_rate`。資料要切 train／validation 時，必須按 `event_group` 整組切，不能讓同一個事件的相似單分到兩邊。

repo 外的腳本要 import 這個工具時，把 `Backend/` 和 `Backend/tools/dedup_eval/` 加進 `sys.path`，並用這個 Backend 的 uv 環境來跑。

測試：`uv run pytest tests/dedup_eval`。
