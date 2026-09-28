"""Shape of the backend ↔ algorithm contract (Spec 020 §3, §4; ADR-289~292)."""

import dataclasses
import inspect
from datetime import UTC, datetime

import pytest

from app.dedup_engine.contract import (
    Candidate,
    DedupEngine,
    GeoPoint,
    Match,
    RetrievalSpec,
    StationSnapshot,
    TicketSnapshot,
)
from app.dedup_engine.registry import get_engine

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)
# Fields every snapshot must be constructible without; everything else needs a default so
# adding a field never breaks an existing caller (ADR-289 point 4).
REQUIRED = {
    TicketSnapshot: {"uuid", "location", "created_at", "title"},
    StationSnapshot: {"uuid", "location", "created_at"},
}
# Personal or internal-bookkeeping columns that must never reach the algorithm (spec §3).
EXCLUDED = {
    "contact_name",
    "contact_email",
    "contact_phone",
    "review_note",
    "visibility",
    "team_uuid",
    "updated_by",
    "search_text",
}


def _instances():
    ticket = TicketSnapshot(uuid=None, location=HERE, created_at=NOW, title="淹水")
    station = StationSnapshot(uuid="s1", location=HERE, created_at=NOW)
    return [
        HERE,
        ticket,
        station,
        Candidate(snapshot=ticket, distance_m=10.0),
        RetrievalSpec(radius_m=100.0),
        Match(candidate_uuid="t1", similarity=0.9, evidence={}),
    ]


@pytest.mark.parametrize("instance", _instances(), ids=lambda i: type(i).__name__)
def test_contract_types_are_immutable(instance):
    """Neither side can mutate what the other handed over."""
    first_field = dataclasses.fields(instance)[0].name
    with pytest.raises(dataclasses.FrozenInstanceError):
        setattr(instance, first_field, None)


@pytest.mark.parametrize("snapshot_type", [TicketSnapshot, StationSnapshot], ids=lambda t: t.__name__)
def test_only_the_core_fields_are_required(snapshot_type):
    """Every other field has a default, so new fields are additive."""
    required = {
        f.name
        for f in dataclasses.fields(snapshot_type)
        if f.default is dataclasses.MISSING and f.default_factory is dataclasses.MISSING
    }
    assert required == REQUIRED[snapshot_type]


@pytest.mark.parametrize("snapshot_type", [TicketSnapshot, StationSnapshot], ids=lambda t: t.__name__)
def test_snapshots_carry_no_personal_or_internal_fields(snapshot_type):
    """Contact details and internal bookkeeping stay on the backend side (ADR-293)."""
    names = {f.name for f in dataclasses.fields(snapshot_type)}
    assert not names & EXCLUDED


def test_candidate_phone_signal_defaults_to_unknown():
    """No phone information means the signal is unavailable, not 'different phone'."""
    snapshot = TicketSnapshot(uuid="t1", location=HERE, created_at=NOW, title="淹水")
    assert Candidate(snapshot=snapshot, distance_m=5.0).same_contact_phone is None


def test_the_registered_engine_satisfies_the_protocol():
    """The engine the backend gets implements every member of `DedupEngine` with matching parameters."""
    engine = get_engine()
    assert isinstance(engine.version, str)
    for name in ("retrieval", "rank", "score"):
        expected = list(inspect.signature(getattr(DedupEngine, name)).parameters)[1:]  # drop self
        assert list(inspect.signature(getattr(engine, name)).parameters) == expected, name
