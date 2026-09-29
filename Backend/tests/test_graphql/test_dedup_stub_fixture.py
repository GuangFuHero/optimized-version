"""The GraphQL suite's dedup engine switch (Spec 020 plan Task 12).

If the autouse stub leaked into the real-engine tests, they would pass by never suspecting
anything; if it did not apply elsewhere, unrelated tests would start getting DuplicatesSuspected.
"""

import pytest

from app.dedup_engine.fast import FastEngine
from app.dedup_engine.registry import get_engine


def test_unmarked_tests_get_the_never_suspecting_engine():
    """The default for every GraphQL test."""
    assert get_engine().version == "stub-v2"


@pytest.mark.real_dedup
def test_marked_tests_get_the_real_engine():
    """What test_create_dedup.py runs against."""
    assert isinstance(get_engine(), FastEngine)
