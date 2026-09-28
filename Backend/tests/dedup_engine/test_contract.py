"""Contract tests every dedup engine must pass (Spec 020 §8, items 1–9).

Owned by the backend. They check what the backend relies on — ranges, ordering, determinism,
the retrieval promise, evidence hygiene, speed — and nothing about whether the algorithm is
any good; that is the algorithm owner's own test suite.
"""

import json
import math
import re
import time
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.dedup_engine.contract import Candidate, GeoPoint, StationSnapshot, TicketSnapshot
from app.dedup_engine.fast import FastEngine

ENGINES = [FastEngine()]
# Provisional: spec §10 leaves the budget to be agreed with the algorithm owner (plan Task 0).
PERF_BUDGET_MS = 200
PERF_CANDIDATES = 500
MARK = "⟦MARK-7f3a⟧"  # a string no evidence may echo back
NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)


@pytest.fixture(params=ENGINES, ids=lambda e: e.version)
def engine(request):
    """Each engine under contract."""
    return request.param


def _ticket(uuid=None, **fields) -> TicketSnapshot:
    base = {"title": "民生街三段淹水需要抽水機", "description": "一樓積水", "task_type": "rescue"}
    return TicketSnapshot(uuid=uuid, location=HERE, created_at=NOW, **(base | fields))


def _station(uuid=None, **fields) -> StationSnapshot:
    base = {"name": "光復國小臨時收容所", "description": "可收容 200 人", "type": "shelter"}
    return StationSnapshot(uuid=uuid, location=HERE, created_at=NOW, **(base | fields))


def _spread(make, n=40) -> list[Candidate]:
    """Candidates at a range of distances, ages and wordings, some matching and some not."""
    return [
        Candidate(
            snapshot=replace(
                make(f"c{i:03d}"),
                created_at=NOW - timedelta(minutes=i * 37),
                description=None if i % 5 == 0 else f"第{i}號 一樓積水",
            ),
            distance_m=float(i * 7),
            same_contact_phone=(None, True, False)[i % 3],
        )
        for i in range(n)
    ]


@pytest.mark.parametrize("make", [_ticket, _station], ids=["ticket", "station"])
def test_similarity_is_in_unit_range_and_rank_is_descending(engine, make):
    """Item 1: every score is 0–1 and `rank` is best first."""
    candidates = _spread(make)
    scores = [engine.score(make(), c, NOW).similarity for c in candidates]
    assert all(0.0 <= s <= 1.0 for s in scores)
    ranked = [m.similarity for m in engine.rank(make(), candidates, NOW)]
    assert ranked == sorted(ranked, reverse=True)


@pytest.mark.parametrize("make", [_ticket, _station], ids=["ticket", "station"])
def test_deterministic(engine, make):
    """Item 2: the same input gives the same output."""
    candidates = _spread(make)
    assert engine.rank(make(), candidates, NOW) == engine.rank(make(), candidates, NOW)
    assert [engine.score(make(), c, NOW) for c in candidates] == [
        engine.score(make(), c, NOW) for c in candidates
    ]


def test_no_candidates_no_matches(engine):
    """Item 3: nothing nearby is an empty result, not an error."""
    assert list(engine.rank(_ticket(), [], NOW)) == []
    assert list(engine.rank(_station(), [], NOW)) == []


@pytest.mark.parametrize(("kind", "make"), [("ticket", _ticket), ("station", _station)])
def test_nothing_outside_the_retrieval_radius_can_match(engine, kind, make):
    """Item 4: the radius is finite and a candidate just outside it never matches, however alike."""
    radius = engine.retrieval(kind).radius_m
    assert 0 < radius < math.inf
    twin = replace(make(), uuid="twin")  # same text, category, instant — every other signal maxed
    outside = Candidate(snapshot=twin, distance_m=radius * 1.001, same_contact_phone=True)
    assert list(engine.rank(make(), [outside], NOW)) == []


def test_evidence_is_json_and_echoes_no_snapshot_text(engine):
    """Item 5: evidence serialises and never carries the submitted text (ADR-295)."""
    sub = _ticket(title=f"{MARK}淹水", description=f"{MARK}一樓")
    other = Candidate(_ticket("c1", title=f"{MARK}淹水", description=f"{MARK}一樓"), distance_m=3.0)
    for match in (engine.score(sub, other, NOW), *engine.rank(sub, [other], NOW)):
        assert MARK not in json.dumps(match.evidence, ensure_ascii=False)


def test_empty_optional_fields_do_not_raise(engine):
    """Item 6: every optional field empty, on both sides, still scores."""
    bare_ticket = TicketSnapshot(uuid=None, location=HERE, created_at=NOW, title="")
    bare_station = StationSnapshot(uuid=None, location=HERE, created_at=NOW)
    for sub in (bare_ticket, bare_station):
        other = Candidate(replace(sub, uuid="c1", description=""), distance_m=0.0, same_contact_phone=None)
        assert 0.0 <= engine.score(sub, other, NOW).similarity <= 1.0
        engine.rank(sub, [other], NOW)


def test_a_submission_without_uuid_or_status_scores(engine):
    """Item 7: the entity being submitted has no uuid and no status yet."""
    sub = _ticket(uuid=None, status=None)
    assert (
        engine.score(sub, Candidate(_ticket("c1", status="pending"), distance_m=5.0), NOW).candidate_uuid
        == "c1"
    )


@pytest.mark.parametrize("make", [_ticket, _station], ids=["ticket", "station"])
def test_fast_enough(engine, make):
    """Item 8: PERF_CANDIDATES candidates with long descriptions rank within the budget."""
    long_text = "淹水抽水機沙包" * 280  # ~2000 characters, the description cap
    sub = replace(make(), description=long_text)
    candidates = [
        Candidate(replace(make(f"c{i}"), description=f"{long_text}{i}"), distance_m=float(i % 150))
        for i in range(PERF_CANDIDATES)
    ]
    best = math.inf
    for _ in range(3):  # best of three: CI noise should not fail the contract
        start = time.perf_counter()
        engine.rank(sub, candidates, NOW)
        best = min(best, (time.perf_counter() - start) * 1000)
    assert best < PERF_BUDGET_MS, f"{best:.1f} ms for {PERF_CANDIDATES} candidates"


def test_version_format(engine):
    """Item 9: `<family>-v<positive integer>` (ADR-297)."""
    assert re.fullmatch(r"[a-z]+-v[1-9][0-9]*", engine.version)
