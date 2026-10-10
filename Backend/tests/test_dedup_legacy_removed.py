"""Superseded dedup code stays gone (Spec 020 plan Tasks 13 and 23).

Two scoring paths, or two contracts, that could disagree is exactly the drift the engine
boundary exists to prevent, so nothing of Spec 019's path or of Phase 1's snapshot contract
may linger once ADR-304 replaced them.
"""

import importlib

import pytest

from app.dedup_engine import contract, registry
from app.repositories import dedup_repository
from app.services import dedup as dedup_service
from app.services import dedup_snapshot, dedup_submission

GONE_MODULES = [
    "app.services.dedup_scoring",  # Spec 019's formula, now app.dedup_engine.fast
    "app.graphql.dedup",  # the standalone dedup API (ADR-286)
    "app.dedup_engine.fast_v2",  # merged back into fast.py
]
GONE_ATTRIBUTES = {
    contract: ["TicketSnapshot", "StationSnapshot", "Candidate", "Match", "RetrievalSpec", "SnapshotEngine"],
    registry: ["get_submission_engine", "_SUBMISSION_ENGINE"],
    dedup_repository: ["DEDUP_ENTITIES", "DedupCandidateRepository", "dedup_candidate_repository"],
    dedup_service: [
        "find_duplicate_hints",
        "record_hint_outcome",
        "find_match",
        "record_hint_shown",
        "record_acknowledged",
        "MAX_CANDIDATE_RADIUS_M",
    ],
    dedup_snapshot: [
        "ticket_snapshot",
        "station_snapshot",
        "ticket_submission",
        "to_candidate",
        "same_contact_phone",
    ],
    dedup_submission: ["submit_ticket", "submit_station", "Created", "Suspected"],
}


@pytest.mark.parametrize("module", GONE_MODULES)
def test_superseded_modules_are_gone(module):
    """Importing them fails."""
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module(module)


@pytest.mark.parametrize(
    ("module", "name"),
    [(module, name) for module, names in GONE_ATTRIBUTES.items() for name in names],
    ids=lambda value: value if isinstance(value, str) else value.__name__.rsplit(".", 1)[-1],
)
def test_superseded_names_are_gone(module, name):
    """Only the ADR-304 contract, engine registry and service functions remain."""
    assert not hasattr(module, name)


def test_the_backend_no_longer_queries_candidates():
    """Candidate retrieval belongs to the engine (ADR-304); the repository keeps only its own tables."""
    public = {name for name in vars(dedup_repository) if not name.startswith("_")}
    assert {"duplicate_pair_repository", "dedup_audit_event_repository"} <= public
    assert not {name for name in public if "candidate" in name.lower() or "nearby" in name.lower()}
