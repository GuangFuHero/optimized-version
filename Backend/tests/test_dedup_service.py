"""Tests for the fast-layer dedup service's threshold and fail-open behaviour.

Candidate retrieval is stubbed out here on purpose: the point under test is what the service
does with what the database hands back (hint / no hint / swallow the error), and stubbing it
is the only way to exercise the "the database blew up" branch at all. The SQL itself is
covered end to end in tests/test_graphql/test_dedup.py.
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

    def __init__(self):
        """Start with no rollback recorded."""
        self.rolled_back = False

    async def rollback(self):
        """Record that the caller rolled the (aborted) transaction back."""
        self.rolled_back = True


@pytest.fixture
def db():
    """A stand-in session; the query path only ever touches it through the repository."""
    return FakeSession()


@pytest.fixture
def stub_candidates(monkeypatch):
    """Replace candidate retrieval with a canned answer (or a raised error)."""
    def _install(result):
        async def _fake(_db, **_kwargs):
            if isinstance(result, Exception):
                raise result
            return result

        monkeypatch.setattr(
            dedup_repository.dedup_candidate_repository, "list_nearby_open", _fake
        )
    return _install


async def _check(db, **overrides):
    """Run the pre-submit check with a fixed query ticket."""
    fields = {
        "geometry": POINT,
        "title": "民生街淹水需要抽水機", "description": "一樓積水", "task_type": "rescue",
    }
    fields.update(overrides)
    return await dedup_service.find_duplicate_hints(db, **fields)


async def test_hint_returned_when_the_best_candidate_clears_the_threshold(stub_candidates, db):
    """Same spot, minutes apart, same task type and near-identical wording -> one hint."""
    stub_candidates([
        DedupCandidate("near", distance_m=8.0, age_min=12.0, task_type="rescue", text_similarity=0.85),
    ])
    hints = await _check(db)
    assert len(hints) == 1
    assert hints[0].candidate.ticket_uuid == "near"
    assert hints[0].similarity >= FAST_LAYER_PARAMETERS.hint_threshold
    assert {c.name for c in hints[0].components} == {"distance", "time", "task_type", "text"}


async def test_only_the_top_candidate_is_returned(stub_candidates, db):
    """Several candidates over the line still produce exactly one hint — top-1 by design."""
    stub_candidates([
        DedupCandidate("good", distance_m=30.0, age_min=30.0, task_type="rescue", text_similarity=0.8),
        DedupCandidate("best", distance_m=2.0, age_min=2.0, task_type="rescue", text_similarity=0.95),
    ])
    hints = await _check(db)
    assert [h.candidate.ticket_uuid for h in hints] == ["best"]


async def test_no_hint_when_the_best_candidate_is_below_the_threshold(stub_candidates, db):
    """A merely-nearby ticket is not worth interrupting the submitter for."""
    stub_candidates([
        DedupCandidate("far", distance_m=420.0, age_min=3000.0, task_type="supply", text_similarity=0.1),
    ])
    assert await _check(db) == []


async def test_no_candidates_means_no_hint(stub_candidates, db):
    """Nothing open nearby -> empty, not an error."""
    stub_candidates([])
    assert await _check(db) == []


async def test_retrieval_failure_fails_open(stub_candidates, db, caplog):
    """A database error returns an empty list, and rolls back so siblings can still query."""
    stub_candidates(RuntimeError("function similarity(text, unknown) does not exist"))
    assert await _check(db) == []
    assert "fail-open" in caplog.text
    assert db.rolled_back is True


@pytest.mark.parametrize("bad", [
    "POINT(121.5 25.0)",                                  # a string, not a GeoJSON mapping
    None,
    {"type": "Point"},                                    # no coordinates at all
    {"type": "Point", "coordinates": []},
    {"type": "Point", "coordinates": [121.5]},            # one-dimensional
    {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [0, 0]]]},   # not a Point
    {"type": "Point", "coordinates": [999.0, 25.0]},      # off the planet
])
async def test_unusable_geometry_returns_no_hint(stub_candidates, db, bad):
    """Geometry the check cannot read is fail-open, never a 500 in front of a submission."""
    stub_candidates([DedupCandidate("near", distance_m=1.0, age_min=1.0)])
    assert await _check(db, geometry=bad) == []


async def test_oversized_text_is_truncated_not_refused(stub_candidates, db, monkeypatch):
    """A giant description still gets a hint — the text handed to pg_trgm is just bounded."""
    seen = {}

    async def _fake(_db, **kwargs):
        seen["query_text"] = kwargs["query_text"]
        return [DedupCandidate("near", distance_m=1.0, age_min=1.0, text_similarity=0.9)]

    monkeypatch.setattr(dedup_repository.dedup_candidate_repository, "list_nearby_open", _fake)
    hints = await _check(db, title="淹" * 500, description="水" * 9000)
    assert len(hints) == 1
    assert len(seen["query_text"]) == (
        dedup_service.TITLE_MAX_CHARS + 1 + dedup_service.DESCRIPTION_MAX_CHARS
    )


async def test_scoring_failure_fails_open(stub_candidates, db, monkeypatch):
    """A bad settings object is a fail-open case too, not a 500 at submission time."""
    stub_candidates([DedupCandidate("near", distance_m=1.0, age_min=1.0)])

    def _boom(*_args, **_kwargs):
        raise ValueError("at least one available signal must have positive weight")

    monkeypatch.setattr(dedup_service, "top_hint", _boom)
    assert await _check(db) == []


@pytest.fixture
def capture_retrieval(monkeypatch):
    """Record the keyword arguments retrieval is called with."""
    seen = {}

    async def _fake(_db, **kwargs):
        seen.update(kwargs)
        return []

    monkeypatch.setattr(dedup_repository.dedup_candidate_repository, "list_nearby_open", _fake)
    return seen


async def test_the_search_radius_is_derived_from_the_scoring_parameters(db, capture_retrieval):
    """The only boundary retrieval gets is the distance past which a hint is impossible."""
    await _check(db)
    expected = max_hint_distance_m() * dedup_service.RETRIEVAL_RADIUS_SAFETY_FACTOR
    assert capture_retrieval["radius_m"] == pytest.approx(expected)
    # No row cap: a `LIMIT` would drop candidates for a reason the formula never asked for.
    assert "limit" not in capture_retrieval


async def test_tuning_a_parameter_moves_the_radius_with_it(db, capture_retrieval):
    """Doubling the distance half-life doubles the search radius — one number, not two."""
    await _check(db, parameters=FastLayerParameters(distance_half_m=400.0))
    assert capture_retrieval["radius_m"] == pytest.approx(
        2 * max_hint_distance_m() * dedup_service.RETRIEVAL_RADIUS_SAFETY_FACTOR
    )


async def test_an_unbounded_radius_is_clamped_and_reported(db, capture_retrieval, caplog):
    """Parameters where distance rules nothing out are a misconfiguration, not a licence to scan.

    At a 0.5 threshold the other three signals already clear it on their own, so the derived
    boundary is infinite. Retrieval clamps, and says so — the settings need looking at, not
    the data.
    """
    await _check(db, parameters=FastLayerParameters(hint_threshold=0.5))
    assert capture_retrieval["radius_m"] == dedup_service.MAX_CANDIDATE_RADIUS_M
    assert "clamping retrieval" in caplog.text
