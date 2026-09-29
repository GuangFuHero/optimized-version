"""The GraphQL suite's dedup engine switch (Spec 020 plan Task 12).

If the autouse stub leaked into the real-engine tests, they would pass by never suspecting
anything; if it did not apply elsewhere, unrelated tests would start getting DuplicateSuspected.
"""

import pytest

from app.dedup_engine.fast import FastEngine
from app.dedup_engine.fast_v2 import FastEngine as FastEngineV2
from app.dedup_engine.registry import get_engine, get_submission_engine


def test_unmarked_tests_get_the_never_matching_engines():
    """The default for every GraphQL test."""
    assert (get_engine().version, get_submission_engine().version) == ("stub-v1", "stub-v2")


@pytest.mark.real_dedup
def test_marked_tests_get_the_real_engines():
    """What test_create_dedup.py runs against."""
    assert isinstance(get_engine(), FastEngine)
    assert isinstance(get_submission_engine(), FastEngineV2)
