"""fast-v1, the rule-based fast layer (ported from Spec 019's dedup_scoring.py).

The formula tests call `combine` with signals fixed by hand, so their expected numbers are the
offline tuning harness's own output for the same inputs; a failure there means the port has
drifted. The engine tests go through snapshots, the way the backend calls it.
"""

import json
import math
from datetime import UTC, datetime, timedelta

import pytest

from app.dedup_engine.contract import Candidate, GeoPoint, StationSnapshot, TicketSnapshot
from app.dedup_engine.fast import (
    STATION_PARAMETERS,
    TICKET_PARAMETERS,
    FastEngine,
    FastParameters,
    Signals,
    combine,
    max_hint_distance_m,
    measure,
)

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)
# Harness parameters minus the text signal, so its output is directly comparable.
THREE_SIGNAL = FastParameters(text_weight=0.0)


def _signals(**overrides) -> Signals:
    """A candidate 100 m away and 60 minutes old, same category, no text — overridable."""
    fields = {"distance_m": 100.0, "age_min": 60.0, "same_category": True, "text_similarity": None}
    return Signals(**(fields | overrides))


def _ticket(uuid=None, *, minutes_ago=0.0, **fields) -> TicketSnapshot:
    base = {"title": "民生街三段淹水需要抽水機", "description": "一樓積水到膝蓋", "task_type": "rescue"}
    return TicketSnapshot(
        uuid=uuid, location=HERE, created_at=NOW - timedelta(minutes=minutes_ago), **(base | fields)
    )


def _station(uuid=None, *, minutes_ago=0.0, **fields) -> StationSnapshot:
    base = {"name": "光復國小臨時收容所", "description": "可收容 200 人", "type": "shelter"}
    return StationSnapshot(
        uuid=uuid, location=HERE, created_at=NOW - timedelta(minutes=minutes_ago), **(base | fields)
    )


def _near(snapshot, distance_m=8.0) -> Candidate:
    return Candidate(snapshot=snapshot, distance_m=distance_m)


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


# --- measuring snapshots ---------------------------------------------------------------


def test_measure_reads_facts_off_the_snapshots():
    """Distance from the candidate, age from created_at, category and text from the fields."""
    signals = measure(_ticket(), _near(_ticket("c1", minutes_ago=30.0), distance_m=42.0), NOW)
    assert signals.distance_m == 42.0
    assert signals.age_min == pytest.approx(30.0)
    assert signals.same_category is True
    assert signals.text_similarity == pytest.approx(1.0)


def test_a_candidate_newer_than_now_has_age_zero():
    """Clock skew never produces a negative age."""
    assert measure(_ticket(), _near(_ticket("c1", minutes_ago=-5.0)), NOW).age_min == 0.0


@pytest.mark.parametrize(
    ("mine", "theirs"),
    [("rescue", None), (None, "rescue"), (None, None)],
)
def test_a_missing_category_is_unavailable(mine, theirs):
    """Either side not filling it in means no category signal."""
    signals = measure(_ticket(task_type=mine), _near(_ticket("c1", task_type=theirs)), NOW)
    assert signals.same_category is None


def test_empty_text_on_either_side_is_unavailable():
    """No text is an unavailable signal, not a score of 0."""
    empty = _ticket("c1", title="", description=None)
    assert measure(_ticket(), _near(empty), NOW).text_similarity is None
    assert measure(_ticket(title="", description=""), _near(_ticket("c1")), NOW).text_similarity is None


def test_station_text_is_name_and_description_and_category_is_type():
    """Stations compare `name`+`description` and `type`."""
    signals = measure(_station(), _near(_station("s1", type="supply")), NOW)
    assert signals.text_similarity == pytest.approx(1.0)
    assert signals.same_category is False


def test_long_text_is_truncated_on_both_sides():
    """Title 200 and description 2000 characters, on the submission and the candidate alike."""
    long_tail = "淹水" * 5000
    a = _ticket(title="抽水機" + "x" * 300, description=long_tail + "甲")
    b = _ticket("c1", title="抽水機" + "x" * 300, description=long_tail + "乙")
    assert measure(a, _near(b), NOW).text_similarity == pytest.approx(1.0)


# --- the engine ------------------------------------------------------------------------


def test_engine_version():
    """The first shipped version (ADR-297)."""
    assert FastEngine().version == "fast-v1"


def test_rank_returns_a_near_identical_open_ticket():
    """Same spot, minutes apart, same type and wording -> a match over the threshold."""
    matches = FastEngine().rank(_ticket(), [_near(_ticket("near", minutes_ago=12.0))], NOW)
    assert [m.candidate_uuid for m in matches] == ["near"]
    assert matches[0].similarity >= TICKET_PARAMETERS.hint_threshold


def test_rank_drops_candidates_under_the_threshold():
    """A different problem far away and long ago is not a match."""
    weak = Candidate(
        _ticket("weak", minutes_ago=4000.0, title="需要志工搬物資", description="倉庫缺人手", task_type="hr"),
        distance_m=400.0,
    )
    assert FastEngine().rank(_ticket(), [weak], NOW) == []


def test_rank_is_best_first_and_breaks_ties_on_uuid():
    """Highest score first; equal scores in uuid order."""
    close_b = _near(_ticket("bbb"), distance_m=5.0)
    close_a = _near(_ticket("aaa"), distance_m=5.0)
    farther = _near(_ticket("ccc"), distance_m=60.0)
    matches = FastEngine().rank(_ticket(), [farther, close_b, close_a], NOW)
    assert [m.candidate_uuid for m in matches] == ["aaa", "bbb", "ccc"]


def test_score_applies_no_threshold():
    """`score` answers for any candidate, even one `rank` would drop."""
    far = Candidate(_ticket("far", title="完全不同", description=None, task_type="hr"), distance_m=900.0)
    match = FastEngine().score(_ticket(), far, NOW)
    assert match.candidate_uuid == "far"
    assert match.similarity < TICKET_PARAMETERS.hint_threshold


def test_station_matches_carry_no_time_component():
    """Stations are scored without the time signal, however old."""
    match = FastEngine().score(_station(), _near(_station("s1", minutes_ago=10_000_000.0)), NOW)
    assert [c["name"] for c in match.evidence["components"]] == ["distance", "task_type", "text"]
    assert match.similarity >= STATION_PARAMETERS.hint_threshold


def test_same_contact_phone_is_not_used_by_fast_v1():
    """fast-v1 keeps Spec 019's behaviour; the phone signal is available for a later version."""
    engine = FastEngine()
    base = _ticket("c1", minutes_ago=90.0)
    unknown = engine.score(_ticket(), Candidate(base, distance_m=80.0), NOW)
    same = engine.score(_ticket(), Candidate(base, distance_m=80.0, same_contact_phone=True), NOW)
    assert unknown == same


def test_evidence_holds_the_components_and_no_text():
    """Evidence is the per-signal breakdown; it never echoes snapshot text (ADR-295)."""
    marker = "⟦MARK-7f3a⟧"
    sub = _ticket(title=f"{marker}淹水", description=f"{marker}一樓")
    other = _ticket("c1", title=f"{marker}淹水", description=f"{marker}一樓")
    match = FastEngine().score(sub, _near(other), NOW)
    dumped = json.dumps(match.evidence, ensure_ascii=False)
    assert marker not in dumped
    assert {c["name"] for c in match.evidence["components"]} == {"distance", "time", "task_type", "text"}


def test_retrieval_radius_is_the_boundary_plus_the_safety_margin():
    """Radius = hint boundary × 1.1, per entity kind."""
    engine = FastEngine()
    assert engine.retrieval("ticket").radius_m == pytest.approx(147.3931188332412 * 1.1)
    station_boundary = max_hint_distance_m(STATION_PARAMETERS)
    assert engine.retrieval("station").radius_m == pytest.approx(station_boundary * 1.1)
