"""Tests for the fast-layer dedup service's threshold and fail-open behaviour.

Candidate retrieval is stubbed out here on purpose: the point under test is what the service
does with what the database hands back (hint / no hint / swallow the error), and stubbing it
is the only way to exercise the "the database blew up" branch at all. The SQL itself is
covered end to end in tests/test_graphql/test_dedup.py.
"""

import pytest

from app.repositories import dedup_repository
from app.services import dedup as dedup_service
from app.services.dedup_scoring import FAST_LAYER_PARAMETERS, DedupCandidate

pytestmark = pytest.mark.asyncio


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


async def _check(**overrides):
    """Run the pre-submit check with a fixed query ticket."""
    fields = {
        "longitude": 121.5, "latitude": 25.0,
        "title": "民生街淹水需要抽水機", "description": "一樓積水", "task_type": "rescue",
    }
    fields.update(overrides)
    return await dedup_service.find_duplicate_hints(None, **fields)


async def test_hint_returned_when_the_best_candidate_clears_the_threshold(stub_candidates):
    """Same spot, minutes apart, same task type and near-identical wording -> one hint."""
    stub_candidates([
        DedupCandidate("near", distance_m=8.0, age_min=12.0, task_type="rescue", text_similarity=0.85),
    ])
    hints = await _check()
    assert len(hints) == 1
    assert hints[0].candidate.ticket_uuid == "near"
    assert hints[0].similarity >= FAST_LAYER_PARAMETERS.hint_threshold
    assert {c.name for c in hints[0].components} == {"distance", "time", "task_type", "text"}


async def test_only_the_top_candidate_is_returned(stub_candidates):
    """Several candidates over the line still produce exactly one hint — top-1 by design."""
    stub_candidates([
        DedupCandidate("good", distance_m=30.0, age_min=30.0, task_type="rescue", text_similarity=0.8),
        DedupCandidate("best", distance_m=2.0, age_min=2.0, task_type="rescue", text_similarity=0.95),
    ])
    hints = await _check()
    assert [h.candidate.ticket_uuid for h in hints] == ["best"]


async def test_no_hint_when_the_best_candidate_is_below_the_threshold(stub_candidates):
    """A merely-nearby ticket is not worth interrupting the submitter for."""
    stub_candidates([
        DedupCandidate("far", distance_m=420.0, age_min=3000.0, task_type="supply", text_similarity=0.1),
    ])
    assert await _check() == []


async def test_no_candidates_means_no_hint(stub_candidates):
    """Nothing open nearby -> empty, not an error."""
    stub_candidates([])
    assert await _check() == []


async def test_retrieval_failure_fails_open(stub_candidates, caplog):
    """A database error returns an empty list so it can never block a submission."""
    stub_candidates(RuntimeError('function similarity(text, unknown) does not exist'))
    assert await _check() == []
    assert "fail-open" in caplog.text


async def test_scoring_failure_fails_open(stub_candidates, monkeypatch):
    """A bad settings object is a fail-open case too, not a 500 at submission time."""
    stub_candidates([DedupCandidate("near", distance_m=1.0, age_min=1.0)])

    def _boom(*_args, **_kwargs):
        raise ValueError("at least one available signal must have positive weight")

    monkeypatch.setattr(dedup_service, "top_hint", _boom)
    assert await _check() == []
