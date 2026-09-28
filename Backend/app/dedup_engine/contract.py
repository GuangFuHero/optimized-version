"""The contract between the backend and the dedup algorithm (Spec 020 §3–§4, ADR-289~292).

Both sides depend on this module and on nothing else of each other. The backend builds
snapshots and candidates out of the database; the algorithm turns them into matches.

Changing this module needs both owners to agree. New fields are added with a default, so no
existing caller breaks; renaming, removing or changing what a field means bumps
SNAPSHOT_SCHEMA_VERSION.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol

SNAPSHOT_SCHEMA_VERSION = 1

EntityKind = Literal["ticket", "station"]


@dataclass(frozen=True)
class GeoPoint:
    """A WGS84 point."""

    lon: float
    lat: float


@dataclass(frozen=True)
class TicketSnapshot:
    """Facts about one ticket: raw column values, never derived scores (ADR-289).

    The ticket being submitted has no `uuid` or `status` yet, and its `created_at` is the
    request time. Contact details are deliberately absent; see `Candidate.same_contact_phone`.
    """

    uuid: str | None
    location: GeoPoint
    created_at: datetime
    title: str
    description: str | None = None
    task_type: str | None = None
    priority: str | None = None
    status: str | None = None
    disaster_types: tuple[str, ...] = ()
    person_trapped_reported: str | None = None
    immediate_danger_reported: str | None = None
    verification_status: str | None = None


@dataclass(frozen=True)
class StationSnapshot:
    """Facts about one station. `location` is always a point (ADR-298)."""

    uuid: str | None
    location: GeoPoint
    created_at: datetime
    name: str | None = None
    description: str | None = None
    type: str | None = None
    operational_status: str | None = None
    is_temporary: bool = False
    expires_at: datetime | None = None
    is_official: bool = False
    op_hour: str | None = None
    level: int = 0
    source: str | None = None


Snapshot = TicketSnapshot | StationSnapshot


@dataclass(frozen=True)
class Candidate:
    """An existing entity plus facts about how it relates to the submission.

    `distance_m` and `same_contact_phone` describe the pair, not either entity, so they live
    here rather than on a snapshot. `same_contact_phone` is None when either side has no
    usable number: the signal is unavailable, which is not the same as "different" (ADR-293).
    """

    snapshot: Snapshot
    distance_m: float
    same_contact_phone: bool | None = None


@dataclass(frozen=True)
class RetrievalSpec:
    """How far the backend must look for candidates. New fields come with defaults."""

    radius_m: float


@dataclass(frozen=True)
class Match:
    """One scored candidate.

    The backend reads only `candidate_uuid` and `similarity`. `evidence` is stored as-is and
    never interpreted; it must be JSON-serializable and must not echo snapshot text (ADR-295).
    """

    candidate_uuid: str
    similarity: float
    evidence: Mapping[str, Any]


class DedupEngine(Protocol):
    """What the backend calls. Implementations are pure: no I/O, no clock (ADR-287, ADR-290)."""

    version: str

    def retrieval(self, kind: EntityKind) -> RetrievalSpec:
        """The search area for `kind`; no candidate outside it can reach the threshold."""
        ...

    def rank(self, submission: Snapshot, candidates: Sequence[Candidate], now: datetime) -> Sequence[Match]:
        """Candidates that reach the threshold, best first."""
        ...

    def score(self, submission: Snapshot, candidate: Candidate, now: datetime) -> Match:
        """One candidate's score with no threshold applied."""
        ...
