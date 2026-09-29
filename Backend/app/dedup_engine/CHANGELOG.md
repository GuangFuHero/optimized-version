# Dedup engine changelog

Every change that makes the same input (database contents + submission + `now`) produce a
different `check` or `score` result gets a new version here, a bump of the engine's `version`,
and a regenerated golden file (`DEDUP_REGEN_GOLDEN=1 uv run pytest tests/dedup_engine/test_golden.py`,
which refuses to overwrite changed outputs under an unchanged version). Refactors, comments and
speed-ups that leave outputs unchanged do not (ADR-297).

Each entry records what changed, the parameters, and the backtest result the change was
accepted on.

---

## fast-v2 — 2026-09-29

Task-level fast layer on the ADR-304 contract (`fast.py`, candidates in `candidates.py`).
Spec 019 moved the unit from tickets to tasks the same day; ADR-304 moved candidate retrieval
into the engine so a change of unit no longer touches the backend.

### What changed from fast-v1

1. **Unit is a ticket task.** Each task draft is compared with open tasks nearby and gets at
   most one suspect; the ticket itself is not compared. Candidate rules are Spec 019's: task not
   fulfilled/canceled and not deleted, under a ticket not deleted and not cancelled (a completed
   ticket stays in).
2. **Signals read task fields**: distance between the tasks' tickets, the candidate task's age,
   `task_type`, and trigram similarity of `task_name` + `task_description` (200 / 2000 chars).
3. **Adding a task to an existing ticket** searches from that ticket and skips its own tasks.
4. **Candidates are the engine's own read-only queries** instead of rows handed over by the
   backend.

Formula, parameters and retrieval radius per kind are fast-v1's (ticket parameters now apply
to tasks). Stations are unchanged. `same_contact_phone`-style phone comparison is still unused.

Golden: `tests/dedup_engine/golden/fast.json`, computed on fixed database contents
(`tests/dedup_engine/golden.py`). fast-v1's snapshot-based golden and its regen script are gone.

### Backtest

待 Chi 補（任務層級的資料集與指標）。

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
