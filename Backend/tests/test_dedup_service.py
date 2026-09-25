"""Tests for the dedup service's threshold, radius and fail-open behaviour.

Candidate retrieval is stubbed, which is the only way to exercise "the database failed". The
SQL itself is covered in tests/test_graphql/test_dedup.py.
"""

import pytest

from app.repositories import dedup_repository
from app.services import dedup as dedup_service
from app.services.dedup_scoring import (
    FAST_LAYER_PARAMETERS,
    DedupCandidate,
    FastLayerParameters,
    max_hint_distance_m,
)

pytestmark = pytest.mark.asyncio

POINT = {"type": "Point", "coordinates": [121.5, 25.0]}


class FakeSession:
    """Stands in for the AsyncSession, recording whether the fail-open path rolled back."""

    rolled_back = False

    async def rollback(self):
        """Record the rollback."""
        self.rolled_back = True


class FakeRetrieval:
    """Replaces candidate retrieval: returns `result` (or raises it) and records the call."""

    def __init__(self):
        """Start with no candidates."""
        self.result: list[DedupCandidate] | Exception = []
        self.kwargs: dict = {}

    async def __call__(self, _db, **kwargs):
        """Record the call and return or raise the canned result."""
        self.kwargs = kwargs
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def retrieval(monkeypatch):
    """The installed fake retrieval."""
    fake = FakeRetrieval()
    monkeypatch.setattr(dedup_repository.dedup_candidate_repository, "list_nearby_open", fake)
    return fake


async def _check(db=None, **overrides):
    """Run the pre-submit check with a fixed query ticket."""
    fields = {
        "geometry": POINT,
        "title": "民生街淹水需要抽水機",
        "description": "一樓積水",
        "task_type": "rescue",
    }
    return await dedup_service.find_duplicate_hints(db or FakeSession(), **(fields | overrides))


async def test_hint_returned_when_the_best_candidate_clears_the_threshold(retrieval):
    """Same spot, minutes apart, same task type and near-identical wording -> one hint."""
    retrieval.result = [
        DedupCandidate("near", distance_m=8.0, age_min=12.0, task_type="rescue", text_similarity=0.85)
    ]
    hints = await _check()
    assert [h.candidate.entity_uuid for h in hints] == ["near"]
    assert hints[0].similarity >= FAST_LAYER_PARAMETERS.hint_threshold
    assert {c.name for c in hints[0].components} == {"distance", "time", "task_type", "text"}


async def test_only_the_top_candidate_is_returned(retrieval):
    """Several candidates over the line still produce exactly one hint."""
    retrieval.result = [
        DedupCandidate("good", distance_m=30.0, age_min=30.0, task_type="rescue", text_similarity=0.8),
        DedupCandidate("best", distance_m=2.0, age_min=2.0, task_type="rescue", text_similarity=0.95),
    ]
    assert [h.candidate.entity_uuid for h in await _check()] == ["best"]


@pytest.mark.parametrize(
    "candidates",
    [
        [DedupCandidate("far", distance_m=420.0, age_min=3000.0, task_type="supply", text_similarity=0.1)],
        [],
    ],
)
async def test_no_hint_below_the_threshold_or_with_no_candidates(retrieval, candidates):
    """A merely-nearby ticket, or nothing at all, returns an empty list."""
    retrieval.result = candidates
    assert await _check() == []


async def test_retrieval_failure_fails_open(retrieval, caplog):
    """A database error returns an empty list, and rolls back so siblings can still query."""
    retrieval.result = RuntimeError("function similarity(text, unknown) does not exist")
    db = FakeSession()
    assert await _check(db) == []
    assert "fail-open" in caplog.text
    assert db.rolled_back is True


async def test_scoring_failure_fails_open(retrieval, monkeypatch):
    """A bad settings object is a fail-open case too, not a 500 at submission time."""
    retrieval.result = [DedupCandidate("near", distance_m=1.0, age_min=1.0)]

    def _boom(*_args, **_kwargs):
        raise ValueError("at least one available signal must have positive weight")

    monkeypatch.setattr(dedup_service, "top_hint", _boom)
    assert await _check() == []


@pytest.mark.parametrize(
    "bad",
    [
        "POINT(121.5 25.0)",  # a string, not a GeoJSON mapping
        None,
        {"type": "Point"},  # no coordinates at all
        {"type": "Point", "coordinates": []},
        {"type": "Point", "coordinates": [121.5]},  # one-dimensional
        {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [0, 0]]]},  # not a Point
        {"type": "Point", "coordinates": [999.0, 25.0]},  # off the planet
    ],
)
async def test_unusable_geometry_returns_no_hint(retrieval, bad):
    """Geometry the check cannot read is fail-open, never a 500 in front of a submission."""
    retrieval.result = [DedupCandidate("near", distance_m=1.0, age_min=1.0)]
    assert await _check(geometry=bad) == []


async def test_oversized_text_is_truncated_not_refused(retrieval):
    """A giant description still gets a hint — the text handed to pg_trgm is just bounded."""
    retrieval.result = [DedupCandidate("near", distance_m=1.0, age_min=1.0, text_similarity=0.9)]
    hints = await _check(title="淹" * 500, description="水" * 9000)
    assert len(hints) == 1
    assert (
        len(retrieval.kwargs["query_text"])
        == dedup_service.TITLE_MAX_CHARS + 1 + dedup_service.DESCRIPTION_MAX_CHARS
    )


@pytest.mark.parametrize(
    "parameters,expected_radius",
    [
        (FAST_LAYER_PARAMETERS, max_hint_distance_m() * dedup_service.RETRIEVAL_RADIUS_SAFETY_FACTOR),
        # Doubling the distance half-life doubles the radius: one number, not two.
        (
            FastLayerParameters(distance_half_m=400.0),
            2 * max_hint_distance_m() * dedup_service.RETRIEVAL_RADIUS_SAFETY_FACTOR,
        ),
    ],
)
async def test_the_search_radius_is_derived_from_the_parameters(retrieval, parameters, expected_radius):
    """Retrieval's only boundary is the distance past which a hint is impossible; no row limit."""
    await _check(parameters=parameters)
    assert retrieval.kwargs["radius_m"] == pytest.approx(expected_radius)
    assert "limit" not in retrieval.kwargs


async def test_an_unbounded_radius_is_clamped_and_reported(retrieval, caplog):
    """At a 0.5 threshold distance rules nothing out; retrieval clamps and logs a warning."""
    await _check(parameters=FastLayerParameters(hint_threshold=0.5))
    assert retrieval.kwargs["radius_m"] == dedup_service.MAX_CANDIDATE_RADIUS_M
    assert "clamping retrieval" in caplog.text
