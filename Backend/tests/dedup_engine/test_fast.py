"""The fast layer's formula: parameters, `combine`, and the hint boundary.

Expected numbers are the offline tuning harness's own output for the same inputs; a failure here
means the formula has drifted from it. The engine around the formula — candidates, per-draft
suspects — is tested in test_fast_engine.py.
"""

import math

import pytest

from app.dedup_engine.fast import (
    STATION_PARAMETERS,
    TICKET_PARAMETERS,
    FastParameters,
    Signals,
    combine,
    max_hint_distance_m,
)

# Harness parameters minus the text signal, so its output is directly comparable.
THREE_SIGNAL = FastParameters(text_weight=0.0)


def _signals(**overrides) -> Signals:
    """A candidate 100 m away and 60 minutes old, same category, no text — overridable."""
    fields = {"distance_m": 100.0, "age_min": 60.0, "same_category": True, "text_similarity": None}
    return Signals(**(fields | overrides))


# --- parameters ------------------------------------------------------------------------


def test_defaults_are_the_grid_search_values():
    """The shipped parameters are the provisional grid-search winners, unchanged from Spec 019."""
    p = TICKET_PARAMETERS
    assert (p.distance_half_m, p.time_half_min) == (200.0, 360.0)
    assert (p.distance_weight, p.time_weight, p.task_type_weight, p.text_weight) == (2.0, 0.5, 0.5, 1.0)
    assert (p.hint_threshold, p.component_baseline) == (0.8, 0.5)


def test_station_parameters_are_the_ticket_parameters_without_time():
    """A station's age says nothing about duplication; nothing else differs."""
    assert FastParameters(time_weight=0.0) == STATION_PARAMETERS


# --- the formula (combine) -------------------------------------------------------------


@pytest.mark.parametrize(
    ("same_category", "expected"),
    [
        # harness: score_candidate(..., Parameters(200, 360, 2, 0.5, 0.5, 0.8))
        (True, 0.786554307147755),
        (False, 0.6198876404810882),
        (None, 0.7438651685773059),  # category unavailable -> dropped from the average
    ],
)
def test_three_signal_score_matches_the_harness(same_category, expected):
    """Distance/time/category scoring reproduces the harness value exactly."""
    similarity, _ = combine(_signals(same_category=same_category), THREE_SIGNAL)
    assert similarity == pytest.approx(expected, abs=1e-12)


def test_signal_decay_is_halving_at_the_half_life():
    """Each decay signal is worth exactly 0.5 one half-life out."""
    _, components = combine(_signals(distance_m=200.0, age_min=360.0), THREE_SIGNAL)
    by_name = {c["name"]: c["score"] for c in components}
    assert by_name["distance"] == pytest.approx(0.5)
    assert by_name["time"] == pytest.approx(0.5)


def test_identical_place_and_moment_scores_one():
    """Zero distance, zero age and the same category is a perfect 1.0."""
    similarity, _ = combine(_signals(distance_m=0.0, age_min=0.0), THREE_SIGNAL)
    assert similarity == pytest.approx(1.0)


def test_text_signal_joins_the_weighted_average():
    """With text at weight 1.0, a strong trigram match lifts the same pair over the threshold."""
    without_text, _ = combine(_signals(), TICKET_PARAMETERS)
    with_text, _ = combine(_signals(text_similarity=0.9), TICKET_PARAMETERS)
    # (0.7071067811865476*2 + 0.8908987181403393*0.5 + 1*0.5 + 0.9*1) / 4
    assert with_text == pytest.approx(0.8149157303608162, abs=1e-12)
    assert without_text < TICKET_PARAMETERS.hint_threshold <= with_text


def test_components_carry_weight_and_baseline_light():
    """Every component reports its weight and whether it cleared the shared baseline."""
    _, components = combine(_signals(same_category=False, text_similarity=0.9), TICKET_PARAMETERS)
    by_name = {c["name"]: c for c in components}
    assert list(by_name) == ["distance", "time", "task_type", "text"]
    assert by_name["distance"]["weight"] == 2.0
    assert by_name["text"]["passed"] is True
    assert by_name["task_type"]["passed"] is False  # 0.0 < component_baseline


def test_all_weights_zero_is_a_configuration_error():
    """Parameters that zero every weight raise rather than divide by zero."""
    dead = FastParameters(distance_weight=0.0, time_weight=0.0, task_type_weight=0.0, text_weight=0.0)
    with pytest.raises(ValueError):
        combine(_signals(), dead)


def test_a_missing_signal_leaves_the_average():
    """An unavailable signal is absent from the breakdown, not scored zero."""
    similarity, components = combine(_signals(same_category=None), TICKET_PARAMETERS)
    assert [c["name"] for c in components] == ["distance", "time"]
    assert similarity == pytest.approx(0.7438651685773059, abs=1e-12)


def test_a_zero_time_weight_drops_the_time_component():
    """A zero-weight signal is left out rather than reported as a fake light."""
    _, components = combine(_signals(text_similarity=0.9), STATION_PARAMETERS)
    assert [c["name"] for c in components] == ["distance", "task_type", "text"]


# --- the hint boundary -----------------------------------------------------------------


def test_the_hint_boundary_is_where_a_perfect_candidate_scores_exactly_the_threshold():
    """`max_hint_distance_m` is the exact inverse of the formula."""
    boundary = max_hint_distance_m(TICKET_PARAMETERS)
    assert boundary == pytest.approx(147.3931188332412, abs=1e-9)
    perfect = _signals(distance_m=boundary, age_min=0.0, text_similarity=1.0)
    assert combine(perfect, TICKET_PARAMETERS)[0] == pytest.approx(TICKET_PARAMETERS.hint_threshold)
    beyond = _signals(distance_m=boundary + 1, age_min=0.0, text_similarity=1.0)
    assert combine(beyond, TICKET_PARAMETERS)[0] < TICKET_PARAMETERS.hint_threshold


def test_the_boundary_is_widest_when_every_signal_is_available():
    """Fewer signals means a tighter boundary, so the all-four radius covers every ticket."""
    all_four = max_hint_distance_m(TICKET_PARAMETERS)
    assert max_hint_distance_m(FastParameters(text_weight=0.0)) < all_four
    assert max_hint_distance_m(FastParameters(task_type_weight=0.0)) < all_four


@pytest.mark.parametrize(
    ("parameters", "expected"),
    [
        (FastParameters(distance_weight=0.0), math.inf),  # distance can never rule anything out
        (FastParameters(hint_threshold=0.5), math.inf),  # the other three alone reach 0.5
        (FastParameters(hint_threshold=1.0), 0.0),  # only distance 0 is perfect
    ],
)
def test_degenerate_parameters_give_a_degenerate_boundary(parameters, expected):
    """The two edges are answered honestly rather than with a made-up number."""
    assert max_hint_distance_m(parameters) == expected


def test_the_boundary_scales_with_the_distance_half_life():
    """Doubling `distance_half_m` doubles the reach."""
    assert max_hint_distance_m(FastParameters(distance_half_m=400.0)) == pytest.approx(
        2 * max_hint_distance_m(TICKET_PARAMETERS)
    )


def test_the_station_boundary_is_tighter():
    """Without time the boundary shrinks."""
    assert max_hint_distance_m(STATION_PARAMETERS) == pytest.approx(124.29767534925406, abs=1e-9)
    assert max_hint_distance_m(STATION_PARAMETERS) < max_hint_distance_m(TICKET_PARAMETERS)
