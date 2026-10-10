"""The contract between the backend and the dedup engine (Spec 020 §2–§4, ADR-304).

The backend sends what is being submitted (validated drafts) from one of three fixed triggers
and gets back suspects; the engine finds and scores candidates itself, reading the database
through the session it is handed. Both sides depend on this module and nothing else of each
other.

Changing it needs both owners to agree. New fields come with a default, so no caller breaks;
renaming, removing or changing what a field means bumps CONTRACT_VERSION.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal, Protocol

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

CONTRACT_VERSION = 2


@dataclass(frozen=True)
class GeoPoint:
    """A WGS84 point."""

    lon: float
    lat: float


RelatedKind = Literal["ticket", "ticket_task", "station"]


@dataclass(frozen=True)
class TicketDraft:
    """A ticket being submitted, after validation. No uuid yet."""

    location: GeoPoint
    title: str
    description: str | None = None
    task_type: str | None = None
    priority: str | None = None
    disaster_types: tuple[str, ...] = ()
    person_trapped_reported: str | None = None
    immediate_danger_reported: str | None = None
    contact_phone: str | None = None  # E.164; how (or whether) to compare it is the engine's call


@dataclass(frozen=True)
class TaskDraft:
    """A ticket task being submitted, after validation."""

    task_type: str
    task_name: str
    task_description: str | None = None
    quantity: int | None = None


@dataclass(frozen=True)
class StationDraft:
    """A station being registered, after validation."""

    location: GeoPoint
    name: str | None = None
    description: str | None = None
    type: str | None = None
    operational_status: str | None = None
    op_hour: str | None = None
    level: int = 0
    source: str | None = None
    contact_phone: str | None = None


@dataclass(frozen=True)
class NewTicket:
    """A new ticket with its tasks. `draft_ref`: "ticket", and "task:i" for tasks[i]."""

    ticket: TicketDraft
    tasks: tuple[TaskDraft, ...] = ()


@dataclass(frozen=True)
class NewTask:
    """A task added to an existing ticket. `draft_ref`: "task:0"."""

    ticket_uuid: str
    task: TaskDraft


@dataclass(frozen=True)
class NewStation:
    """A station being registered. `draft_ref`: "station"."""

    station: StationDraft


Submission = NewTicket | NewTask | NewStation


@dataclass(frozen=True)
class Suspect:
    """One part of a submission that looks like something already there.

    At most one per `draft_ref`. `related_kind` must be the kind `draft_ref` names — a task is
    compared with tasks — because the pair card the backend writes joins two things of one kind.
    The backend reads everything but `evidence`, which it stores untouched; `evidence` must be
    JSON-serializable and must not echo submitted text (ADR-295).
    """

    draft_ref: str
    related_kind: RelatedKind
    related_uuid: str
    similarity: float
    evidence: Mapping[str, Any]
    related_ticket_uuid: str | None = None  # a matched task's ticket, for display


def task_ref(index: int) -> str:
    """The `draft_ref` of the task at `index`."""
    return f"task:{index}"


def kind_of_ref(draft_ref: str) -> RelatedKind:
    """What kind of thing a `draft_ref` names. Raises ValueError for anything else."""
    if draft_ref in ("ticket", "station"):
        return draft_ref
    prefix, _, index = draft_ref.partition(":")
    if prefix == "task" and index.isdigit():
        return "ticket_task"
    raise ValueError(f"unknown draft_ref: {draft_ref!r}")


class DedupEngine(Protocol):
    """What the backend calls (ADR-304).

    The engine may run any read-only query on `db`; it must not add, flush or commit. The backend
    calls it inside a savepoint it always rolls back, under a timeout, and treats any failure as
    "no suspects" (fail-open). `now` comes from the backend (ADR-290).
    """

    version: str

    async def check(self, db: "AsyncSession", submission: Submission, now: datetime) -> Sequence[Suspect]:
        """Parts of `submission` that look like something already there."""
        ...

    async def score(
        self,
        db: "AsyncSession",
        submission: Submission,
        draft_ref: str,
        related_kind: RelatedKind,
        related_uuid: str,
        now: datetime,
    ) -> Suspect | None:
        """Score one named pair, no threshold, for a duplicate the submitter acknowledged.

        None when the related entity is gone.
        """
        ...
