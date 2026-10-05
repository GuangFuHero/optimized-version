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
    phone_key,
    same_contact_phone,
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
    assert p.phone_bonus == 0.10


def test_station_parameters_are_the_ticket_parameters_without_time_or_phone():
    """A station's age says nothing about duplication; the phone bonus was researched on tickets only."""
    assert FastParameters(time_weight=0.0, phone_bonus=0.0) == STATION_PARAMETERS


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


# --- the phone bonus (fast-v3) ---------------------------------------------------------


def test_the_same_phone_adds_the_bonus_outside_the_average():
    """+0.10 on top of the weighted average, reported as its own component."""
    plain, plain_components = combine(_signals(text_similarity=0.5), TICKET_PARAMETERS)
    bonus, components = combine(_signals(text_similarity=0.5, same_contact_phone=True), TICKET_PARAMETERS)
    assert bonus == pytest.approx(plain + 0.10, abs=1e-12)
    assert components[:-1] == plain_components
    assert components[-1] == {"name": "phone", "score": 1.0, "weight": 0.10, "passed": True}


@pytest.mark.parametrize("same", [False, None], ids=["different", "missing"])
def test_a_different_or_missing_phone_changes_nothing(same):
    """Never a penalty, and no component either."""
    assert combine(_signals(same_contact_phone=same), TICKET_PARAMETERS) == combine(
        _signals(), TICKET_PARAMETERS
    )


def test_the_bonus_is_capped_at_one():
    """A perfect pair stays 1.0."""
    perfect = _signals(distance_m=0.0, age_min=0.0, text_similarity=1.0, same_contact_phone=True)
    assert combine(perfect, TICKET_PARAMETERS)[0] == 1.0


def test_stations_get_no_phone_bonus():
    """`phone_bonus` is 0 for stations, so the same phone adds nothing and reports nothing."""
    with_phone = combine(_signals(text_similarity=0.5, same_contact_phone=True), STATION_PARAMETERS)
    assert with_phone == combine(_signals(text_similarity=0.5), STATION_PARAMETERS)


@pytest.mark.parametrize(
    ("raw", "key"),
    [
        ("+886912345678", "886912345678"),  # E.164, as the backend sends the submission's
        ("0912-345-678", "886912345678"),  # as typed into tickets.contact_phone
        ("+886 912 345 678", "886912345678"),
        ("12-34", "1234"),  # not a valid number: bare digits
        ("", None),
        (None, None),
        ("無", None),
    ],
)
def test_phone_key(raw, key):
    """Both sides are compared as digits after E.164, so stored and submitted forms agree."""
    assert phone_key(raw) == key


def test_same_contact_phone():
    """None when either side has no phone, else whether the keys match."""
    assert same_contact_phone("+886912345678", "0912 345 678") is True
    assert same_contact_phone("+886912345678", "0922000111") is False
    assert same_contact_phone(None, "0912345678") is None
    assert same_contact_phone("+886912345678", "") is None


# --- the hint boundary -----------------------------------------------------------------


def test_the_hint_boundary_is_where_a_perfect_candidate_scores_exactly_the_threshold():
    """`max_hint_distance_m` is the exact inverse of the formula, with the phone bonus earned."""
    boundary = max_hint_distance_m(TICKET_PARAMETERS)
    assert boundary == pytest.approx(-200 * math.log2(0.4), abs=1e-9)  # 264.4 m; 147.4 m without the bonus
    perfect = _signals(distance_m=boundary, age_min=0.0, text_similarity=1.0, same_contact_phone=True)
    assert combine(perfect, TICKET_PARAMETERS)[0] == pytest.approx(TICKET_PARAMETERS.hint_threshold)
    beyond = _signals(distance_m=boundary + 1, age_min=0.0, text_similarity=1.0, same_contact_phone=True)
    assert combine(beyond, TICKET_PARAMETERS)[0] < TICKET_PARAMETERS.hint_threshold


def test_without_the_bonus_the_boundary_is_fast_v2s():
    """With `phone_bonus` 0 the boundary is the fast-v1/v2 one."""
    assert max_hint_distance_m(FastParameters(phone_bonus=0.0)) == pytest.approx(147.3931188332412, abs=1e-9)


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
        (FastParameters(hint_threshold=1.1), 0.0),  # even distance 0 plus the bonus falls short
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
