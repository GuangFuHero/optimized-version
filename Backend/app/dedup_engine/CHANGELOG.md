# Dedup engine changelog

Every change that makes the same input (snapshots + `now`) produce a different `rank` or
`score` result gets a new version here, a bump of the engine's `version`, and a regenerated
golden file (`PYTHONPATH=. uv run python scripts/regen_dedup_golden.py`). Refactors, comments
and speed-ups that leave outputs unchanged do not (ADR-297).

Each entry records what changed, the parameters, and the backtest result the change was
accepted on.

---

## fast-v1 — 2026-09-28

Spec 019's fast layer (PR #46 / #59), moved behind the Spec 020 contract.

### Formula

    distance  = 2 ** (-distance_m / distance_half_m)
    time      = 2 ** (-age_min / time_half_min)          (skipped when time_weight is 0)
    task_type = 1.0 if both categories match else 0.0     (skipped if either side is unknown)
    text      = trigram similarity of (title|name) + description   (skipped if either side has none)
    similarity = Σ(signal × weight) / Σ(weight of available signals)

Hint when the best candidate's similarity ≥ `hint_threshold`. Retrieval radius = the distance
at which a candidate perfect on every other signal scores exactly the threshold, × 1.1.

### Parameters（暫定值，不是建議值）

| Parameter | Ticket | Station | Source |
|---|---|---|---|
| `distance_half_m` | 200 | 200 | grid search winner over 13 hand-written fixtures |
| `time_half_min` | 360 | 360 | same |
| `distance_weight` | 2.0 | 2.0 | same |
| `time_weight` | 0.5 | **0.0** | same; stations: a station's age says nothing about duplication |
| `task_type_weight` | 0.5 | 0.5 | same |
| `text_weight` | 1.0 | 1.0 | judgement, never in the grid |
| `hint_threshold` | 0.8 | 0.8 | grid search winner |
| `component_baseline` | 0.5 | 0.5 | judgement, drives the per-component `passed` light only |
| retrieval radius | 162.1 m | 136.7 m | derived |

### Differences from Spec 019

1. **Text similarity is computed in Python** (`text.py`), not by pg_trgm in SQL (ADR-288).
   `tests/test_dedup_trgm_parity.py` checks it equals `similarity()` on the database.
2. **Candidate text is truncated too** (title 200, description 2000 characters). Spec 019
   truncated only the submission's text.
3. `Candidate.same_contact_phone` is available but **not used** in fast-v1.

The formula itself is unchanged: 40,000 random signal combinations scored identically by
Spec 019's `score_candidate` and fast-v1's `combine` (max difference 0.0).

### Backtest

待 Chi 補：資料集名稱、門檻 0.80 下的 precision / recall、提示率。

Spec 019's PR #46 reported, on 292 geocoded 2025 Guangfu tickets with 100 human verdicts,
counting only the one hint a submitter sees: at 0.80, 7 of 8 hints right but 7/26 duplicates
hinted; at 0.65, 18/26 hinted, 19 of 37 hints wrong, ~24% of submissions see a hint.
