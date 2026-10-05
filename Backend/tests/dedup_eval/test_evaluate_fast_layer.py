"""The offline evaluation tool scores pairs the way the engine does and counts query-level metrics."""

import pytest

from app.dedup_engine.fast import TITLE_MAX_CHARS, text_similarity
from tools.dedup_eval.evaluate_fast_layer import (
    Parameters,
    evaluate,
    score_candidate,
    text_signal_for,
    validate_dataset,
)


def _query(query_id, query_type, candidates, confirmed, rejected):
    return {
        "query_id": query_id,
        "event_group": "test-event",
        "query_ticket": {
            "ticket_id": f"{query_id}-new",
            "created_at": "2026-07-30T12:00:00+08:00",
            "task_type": query_type,
        },
        "retrieval": {
            "was_executed": True,
            "fail_open_reason": None,
            "candidate_ids": [candidate["ticket_id"] for candidate in candidates],
        },
        "candidates": candidates,
        "ground_truth": {
            "adjudication_complete": True,
            "confirmed_duplicate_candidate_ids": confirmed,
            "rejected_candidate_ids": rejected,
        },
        "provisional_expectation": {"class": "unknown", "duplicate_candidate_ids": [], "source": "unit test"},
        "observed_hint_behavior": {
            "hint_was_shown": None,
            "hinted_candidate_id": None,
            "outcome": "not_observed",
        },
    }


def _candidate(ticket_id, distance_m, age_min, task_type="supply", **fields):
    return {
        "ticket_id": ticket_id,
        "distance_m": distance_m,
        "age_min": age_min,
        "task_type": task_type,
        **fields,
    }


def test_half_life_and_missing_task_type_leave_the_denominator():
    """A signal is worth 0.5 one half-life out; a missing category is dropped, not scored 0."""
    parameters = Parameters(100, 10, 1, 1, 10, 1, 0.5)
    score, signals = score_candidate(
        {"query_ticket": {"task_type": "supply"}}, _candidate("c", 100, 10, task_type=None), parameters
    )
    assert signals["distance_signal"] == pytest.approx(0.5)
    assert signals["time_signal"] == pytest.approx(0.5)
    assert signals["task_type_signal"] is None
    assert signals["text_signal"] is None
    assert score == pytest.approx(0.5)


def test_text_counts_only_when_both_sides_have_text():
    """Text enters the average only when both sides have some; a precomputed value wins."""
    parameters = Parameters(100, 10, 1, 1, 1, 10, 0.5)
    query = {"query_ticket": {"task_type": "supply", "title": "缺水"}}

    score, signals = score_candidate(query, _candidate("c", 100, 10, title="缺水"), parameters)
    assert signals["text_signal"] == pytest.approx(1.0)
    assert score == pytest.approx((0.5 + 0.5 + 1 + 10) / 13)

    no_text = _candidate("c", 100, 10, title=None, description="")
    score, signals = score_candidate(query, no_text, parameters)
    assert signals["text_signal"] is None
    assert score == pytest.approx((0.5 + 0.5 + 1) / 3)

    score, signals = score_candidate(query, {**no_text, "text_similarity": 0.2}, parameters)
    assert signals["text_signal"] == pytest.approx(0.2)
    assert score == pytest.approx((0.5 + 0.5 + 1 + 2) / 13)


def test_text_is_truncated_as_the_engine_truncates():
    """Past the title cap, extra characters change nothing — exactly as in `FastEngine`."""
    title = "缺水" * TITLE_MAX_CHARS
    query_ticket = {"title": title}
    candidate = {"title": title[:TITLE_MAX_CHARS] + "完全不同的尾巴"}
    assert text_signal_for(query_ticket, candidate) == pytest.approx(1.0)
    assert text_signal_for(query_ticket, candidate) == text_similarity(
        (title, None), (candidate["title"], None)
    )


def test_time_weight_zero_drops_the_time_signal():
    """With no time weight (the station parameters) time is not part of the average."""
    parameters = Parameters(100, 10, 1, 0, 1, 1, 0.5)
    score, signals = score_candidate(
        {"query_ticket": {"task_type": "supply"}}, _candidate("c", 100, 10), parameters
    )
    assert signals["time_signal"] is None
    assert score == pytest.approx((0.5 + 1) / 2)


def test_top_one_and_query_level_metrics():
    """Only the top candidate counts: a wrong near one outranks the confirmed far one."""
    parameters = Parameters(100, 10, 1, 1, 1, 1, 0.7)
    dataset = {
        "queries": [
            _query(
                "duplicate-query",
                "supply",
                [_candidate("wrong-near", 1, 1), _candidate("confirmed-far", 200, 20)],
                ["confirmed-far"],
                ["wrong-near"],
            ),
            _query("distinct-query", "supply", [_candidate("rejected-near", 1, 1)], [], ["rejected-near"]),
        ]
    }
    metrics = evaluate(dataset, parameters, "confirmed")["metrics"]
    assert metrics["candidate_retrieval_recall"] == 1
    assert metrics["top_1_recall"] == 0
    assert metrics["duplicate_hint_recall"] == 0
    assert metrics["false_hint_rate"] == 1
    assert metrics["wrong_top_hint_rate"] == 1


def test_retrieval_miss_counts_against_recall():
    """A duplicate retrieval never returned can never be hinted."""
    parameters = Parameters(100, 10, 1, 1, 1, 1, 0.5)
    dataset = {
        "queries": [
            _query("miss", "supply", [_candidate("rejected", 10, 2)], ["outside-retrieval"], ["rejected"]),
        ]
    }
    metrics = evaluate(dataset, parameters, "confirmed")["metrics"]
    assert metrics["candidate_retrieval_recall"] == 0
    assert metrics["top_1_recall"] == 0
    assert metrics["duplicate_hint_recall"] == 0


def test_the_same_phone_adds_the_engines_bonus():
    """`same_contact_phone: true` adds `phone_bonus` on top, as `combine` does in production."""
    query = {"query_ticket": {"task_type": "supply"}}
    parameters = Parameters(100, 10, 1, 1, 1, 1, 0.5)
    assert parameters.phone_bonus == pytest.approx(0.10)

    plain, signals = score_candidate(query, _candidate("c", 100, 10), parameters)
    assert signals["phone_bonus"] is None
    bonus, signals = score_candidate(query, _candidate("c", 100, 10, same_contact_phone=True), parameters)
    assert signals["phone_bonus"] == 1.0
    assert bonus == pytest.approx(plain + 0.10)

    zero = Parameters(100, 10, 1, 1, 1, 1, 0.5, 0.0)
    assert score_candidate(query, _candidate("c", 100, 10, same_contact_phone=True), zero)[0] == plain


@pytest.mark.parametrize("same", [False, None], ids=["different", "null"])
def test_a_different_or_null_phone_changes_nothing(same):
    """Never a penalty; a dataset without the field scores as before."""
    query = {"query_ticket": {"task_type": "supply"}}
    parameters = Parameters(100, 10, 1, 1, 1, 1, 0.5)
    assert score_candidate(query, _candidate("c", 100, 10, same_contact_phone=same), parameters) == (
        score_candidate(query, _candidate("c", 100, 10), parameters)
    )


def test_the_phone_bonus_can_turn_a_miss_into_a_hint():
    """The bonus applies before the threshold, so it moves query-level recall."""
    dataset = {
        "queries": [
            _query("q", "supply", [_candidate("dup", 100, 10, same_contact_phone=True)], ["dup"], []),
        ]
    }
    without = evaluate(dataset, Parameters(100, 10, 1, 1, 1, 1, 0.7, 0.0), "confirmed")["metrics"]
    with_bonus = evaluate(dataset, Parameters(100, 10, 1, 1, 1, 1, 0.7, 0.10), "confirmed")["metrics"]
    assert without["duplicate_hint_recall"] == 0
    assert with_bonus["duplicate_hint_recall"] == 1


def test_same_contact_phone_must_be_a_boolean_or_null():
    """A string like "yes" is a dataset error, not a silent no-bonus."""
    dataset = {
        "schema_version": 1,
        "queries": [_query("q", "supply", [_candidate("c", 1, 1, same_contact_phone="yes")], [], ["c"])],
    }
    with pytest.raises(ValueError, match="same_contact_phone"):
        validate_dataset(dataset, "confirmed")
    dataset["queries"][0]["candidates"][0]["same_contact_phone"] = None
    validate_dataset(dataset, "confirmed")
