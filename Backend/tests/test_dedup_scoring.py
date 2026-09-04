"""Tests for the fast-layer dedup scoring formula.

The expected numbers are not re-derived here — they are the values the design workspace's
replay/grid-search harness (`02-evidence/evaluation/evaluate_fast_layer.py`) produces for
the same inputs at the same parameters. If this file starts failing, the port has drifted
from the harness and offline tuning no longer predicts live behaviour.
"""

import pytest

from app.services.dedup_scoring import (
    FAST_LAYER_PARAMETERS,
    DedupCandidate,
    FastLayerParameters,
    rank_candidates,
    score_candidate,
    top_hint,
)

# Harness parameters minus the text signal, so its output is directly comparable.
THREE_SIGNAL = FastLayerParameters(text_weight=0.0)


def _candidate(uuid: str = "a", **overrides) -> DedupCandidate:
    """Build a candidate 100 m away and 60 minutes old, overridable per test."""
    fields = {"distance_m": 100.0, "age_min": 60.0, "task_type": "supply", "text_similarity": None}
    fields.update(overrides)
    return DedupCandidate(ticket_uuid=uuid, **fields)


def test_defaults_are_the_grid_search_values():
    """The shipped parameters are the provisional grid-search winners, unchanged."""
    p = FAST_LAYER_PARAMETERS
    assert (p.distance_half_m, p.time_half_min) == (200.0, 360.0)
    assert (p.distance_weight, p.time_weight, p.task_type_weight) == (2.0, 0.5, 0.5)
    assert p.hint_threshold == 0.8


@pytest.mark.parametrize("query_type,candidate_type,expected", [
    # harness: score_candidate(..., Parameters(200, 360, 2, 0.5, 0.5, 0.8))
    ("supply", "supply", 0.786554307147755),
    ("supply", "rescue", 0.6198876404810882),
    (None, None, 0.7438651685773059),  # task_type unavailable -> dropped from the average
])
def test_three_signal_score_matches_the_harness(query_type, candidate_type, expected):
    """Distance/time/task-type scoring reproduces the harness value exactly."""
    score = score_candidate(
        _candidate(task_type=candidate_type), query_task_type=query_type, parameters=THREE_SIGNAL
    )
    assert score.similarity == pytest.approx(expected, abs=1e-12)


def test_signal_decay_is_halving_at_the_half_life():
    """Each decay signal is worth exactly 0.5 one half-life out — the 2**(-x/half) contract."""
    score = score_candidate(
        _candidate(distance_m=200.0, age_min=360.0), query_task_type="supply", parameters=THREE_SIGNAL
    )
    by_name = {c.name: c.score for c in score.components}
    assert by_name["distance"] == pytest.approx(0.5)
    assert by_name["time"] == pytest.approx(0.5)


def test_identical_place_and_moment_scores_one():
    """Zero distance, zero age and a matching task type is a perfect 1.0."""
    score = score_candidate(
        _candidate(distance_m=0.0, age_min=0.0), query_task_type="supply", parameters=THREE_SIGNAL
    )
    assert score.similarity == pytest.approx(1.0)


def test_unavailable_signals_leave_the_denominator():
    """A dropped signal is absent from the breakdown, not scored zero."""
    score = score_candidate(
        _candidate(task_type=None, text_similarity=None),
        query_task_type=None,
        parameters=FAST_LAYER_PARAMETERS,
    )
    assert [c.name for c in score.components] == ["distance", "time"]
    # Same as the 3-signal 'no type' harness case: task_type simply is not in the average.
    assert score.similarity == pytest.approx(0.7438651685773059, abs=1e-12)


def test_text_signal_joins_the_weighted_average():
    """With text at 1.0 weight, a strong trigram match lifts the same pair over the threshold."""
    candidate = _candidate(text_similarity=0.9)
    without_text = score_candidate(
        _candidate(), query_task_type="supply", parameters=FAST_LAYER_PARAMETERS
    )
    with_text = score_candidate(
        candidate, query_task_type="supply", parameters=FAST_LAYER_PARAMETERS
    )
    # (0.7071067811865476*2 + 0.8908987181403393*0.5 + 1*0.5 + 0.9*1) / 4
    assert with_text.similarity == pytest.approx(0.8149157303608162, abs=1e-12)
    assert without_text.similarity < FAST_LAYER_PARAMETERS.hint_threshold <= with_text.similarity


def test_components_carry_weight_and_baseline_light():
    """Every component reports its weight and whether it cleared the shared baseline."""
    score = score_candidate(
        _candidate(task_type="rescue", text_similarity=0.9),
        query_task_type="supply",
        parameters=FAST_LAYER_PARAMETERS,
    )
    by_name = {c.name: c for c in score.components}
    assert set(by_name) == {"distance", "time", "task_type", "text"}
    assert by_name["distance"].weight == 2.0
    assert by_name["text"].passed is True
    assert by_name["task_type"].passed is False  # 0.0 < component_baseline


def test_all_weights_zero_is_a_configuration_error():
    """A settings object that zeroes every weight raises rather than dividing by zero."""
    dead = FastLayerParameters(
        distance_weight=0.0, time_weight=0.0, task_type_weight=0.0, text_weight=0.0
    )
    with pytest.raises(ValueError):
        score_candidate(_candidate(), query_task_type="supply", parameters=dead)


def test_ranking_is_best_first_and_ties_break_on_uuid():
    """Candidates sort by descending score; equal scores fall back to uuid order."""
    near = _candidate("zzz", distance_m=10.0)
    far = _candidate("aaa", distance_m=400.0)
    tie = _candidate("bbb", distance_m=10.0)
    ranked = rank_candidates([far, near, tie], query_task_type="supply", parameters=THREE_SIGNAL)
    assert [s.candidate.ticket_uuid for s in ranked] == ["bbb", "zzz", "aaa"]


def test_top_hint_returns_only_a_candidate_over_the_threshold():
    """Below the threshold there is no hint; above it, the single best one."""
    weak = _candidate("weak", distance_m=400.0, age_min=2000.0)
    assert top_hint([weak], query_task_type="supply", parameters=THREE_SIGNAL) is None

    strong = _candidate("strong", distance_m=5.0, age_min=5.0)
    hint = top_hint([weak, strong], query_task_type="supply", parameters=THREE_SIGNAL)
    assert hint is not None
    assert hint.candidate.ticket_uuid == "strong"


def test_top_hint_on_no_candidates_is_none():
    """Nothing nearby means no hint, not an error."""
    assert top_hint([], query_task_type="supply") is None
