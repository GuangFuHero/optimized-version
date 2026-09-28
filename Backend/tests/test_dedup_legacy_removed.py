"""Spec 019's scoring path is gone once Spec 020 replaced it (plan Task 13).

Two scoring paths that disagree — one in SQL with pg_trgm, one in the engine — is exactly the
drift the engine boundary exists to prevent, so nothing of the old one may linger.
"""

import importlib

import pytest

from app.repositories.dedup_repository import DedupEntity, dedup_candidate_repository
from app.services import dedup as dedup_service


@pytest.mark.parametrize("module", ["app.services.dedup_scoring", "app.graphql.dedup"])
def test_the_old_modules_are_gone(module):
    """The formula now lives in app.dedup_engine; the standalone GraphQL API is removed (ADR-286)."""
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module(module)


@pytest.mark.parametrize("name", ["find_duplicate_hints", "record_hint_outcome", "_rescore_pair", "_KINDS"])
def test_the_old_service_entry_points_are_gone(name):
    """Only the engine-backed functions remain."""
    assert not hasattr(dedup_service, name)


@pytest.mark.parametrize("name", ["list_nearby_open", "get_candidate_features"])
def test_the_repository_no_longer_scores_text(name):
    """Retrieval returns facts only; no pg_trgm similarity in SQL (ADR-288)."""
    assert not hasattr(dedup_candidate_repository, name)


def test_entities_no_longer_describe_scoring_fields():
    """Which text and category fields count is the engine's business, not the repository's."""
    fields = set(DedupEntity.__dataclass_fields__)
    assert not fields & {"text_fields", "type_field"}
