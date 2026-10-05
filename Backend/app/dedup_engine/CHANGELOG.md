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

Proxy backtest on the 2025 Guangfu old platform's `human_resources` backup of 2026-02-08:
355 clean records, 292 with trusted coordinates. Each record is one ticket with one task (the
role name and notes play `task_name` and `task_description`). Each record is a query against all
earlier records: 42,486 pairs. 100 pairs adjudicated (80 from early hints, 20 from a
missed-duplicate sample), relabelled 2026-10-03: 54 duplicate, 46 distinct. Only the top-1 hint a
submitter sees is counted.

| Threshold | Precision | Recall | Hint rate |
|---|---|---|---|
| **0.80 (shipped)** | 9/10 | 9/54 | 16/292 |
| 0.70 | 19/27 | 19/54 | 46/292 |
| 0.65 | 25/40 | 25/54 | 70/292 |

A parameter scan with 5-fold validation kept the shipped parameters.

Read with these notes:

1. **Recall is low by construction.** For 45 of the 54 duplicates, the older record was already
   completed (the old platform closed a request once fully staffed) before the newer one came
   in. Production compares open tasks only, so it should not hint those. Only 9 pairs test missed
   duplicates; 4/9 were hinted at 0.80 — direction only.
2. **The hint rate overstates production.** Pairs were not filtered to records still open;
   counting only pairs whose older record was still open, the hint rate is 8/292.
3. **One task per ticket.** Per-task suspects on multi-task tickets and adding a task to an
   existing ticket are not exercised.
4. **Coordinates are Google geocodes** of the original addresses (rooftop or range-interpolated
   only), not points users placed, and labelled pairs skew close in distance and time. The
   retrieval radius and `distance_half_m` stay as shipped.
5. **Labels answer "same need or not"** regardless of the older record's status. Pairs come from
   early hints and a suspicious-pair sample, so these are not population rates.

Reproduce with `tools/dedup_eval/`; the data stays off the repo.

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

Same proxy backtest as fast-v2 (in that data every ticket has exactly one task, so fast-v1 and
fast-v2 score every pair identically): at 0.80, precision 9/10, recall 9/54, hint rate 16/292.
See fast-v2 for the notes.

PR #46's earlier figures (7 of 8 hints right, 7/26 duplicates hinted at 0.80) used the labels
before the 2026-10-03 relabel and are superseded.
