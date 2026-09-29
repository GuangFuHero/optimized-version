"""fast-v2: the fast layer at task level, on the ADR-304 contract.

Same formula and parameters as fast-v1 (`fast.combine`); what changed:

- The unit is a ticket task (Spec 019, 2026-09-29). Each task draft is compared with open
  tasks nearby and gets at most one suspect; the ticket itself is not compared.
- Distance is between the tickets the tasks belong to; age is the candidate task's; category
  is `task_type`; text is `task_name` + `task_description`.
- Adding a task to an existing ticket searches from that ticket and skips its own tasks.
- Candidates come from this package's own read-only queries (`candidates.py`).

Stations are compared as in fast-v1 (no time signal).
"""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine import candidates
from app.dedup_engine.contract import (
    GeoPoint,
    NewStation,
    NewTask,
    NewTicket,
    RelatedKind,
    StationDraft,
    Submission,
    Suspect,
    TaskDraft,
    kind_of_ref,
    task_ref,
)
from app.dedup_engine.fast import (
    DESCRIPTION_MAX_CHARS,
    RETRIEVAL_SAFETY_FACTOR,
    STATION_PARAMETERS,
    TICKET_PARAMETERS,
    TITLE_MAX_CHARS,
    FastParameters,
    Signals,
    combine,
    max_hint_distance_m,
)
from app.dedup_engine.text import set_similarity, trigrams
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask


class FastEngine:
    """The task-level fast layer as a `DedupEngine`."""

    version = "fast-v2"

    def __init__(self, parameters: dict[RelatedKind, FastParameters] | None = None):
        """Use the shipped per-kind parameters unless others are given."""
        self._parameters = parameters or {"ticket_task": TICKET_PARAMETERS, "station": STATION_PARAMETERS}

    def radius_m(self, kind: RelatedKind) -> float:
        """How far to look: the hint boundary plus a rounding margin."""
        return max_hint_distance_m(self._parameters[kind]) * RETRIEVAL_SAFETY_FACTOR

    async def check(self, db: AsyncSession, submission: Submission, now: datetime) -> list[Suspect]:
        """At most one suspect per task draft (or per station)."""
        if isinstance(submission, NewStation):
            rows = await candidates.open_stations_near(
                db, at=submission.station.location, radius_m=self.radius_m("station"), now=now
            )
            best = self._best_station(submission.station, rows, now)
            return [best] if best else []

        drafts, at, exclude = await self._task_context(db, submission)
        if not drafts or at is None:
            return []
        rows = await candidates.open_tasks_near(
            db, at=at, radius_m=self.radius_m("ticket_task"), exclude_ticket_uuid=exclude
        )
        suspects = (self._best_task(task_ref(i), draft, rows, now) for i, draft in enumerate(drafts))
        return [s for s in suspects if s is not None]

    async def score(
        self,
        db: AsyncSession,
        submission: Submission,
        draft_ref: str,
        related_kind: RelatedKind,
        related_uuid: str,
        now: datetime,
    ) -> Suspect | None:
        """One named pair, no threshold. None if the draft, the kind or the related entity does not fit."""
        try:
            if kind_of_ref(draft_ref) != related_kind:
                return None
        except ValueError:
            return None

        if isinstance(submission, NewStation):
            found = await candidates.station_with_distance(
                db, station_uuid=related_uuid, at=submission.station.location
            )
            return None if found is None else self._station_suspect(submission.station, *found, now)

        drafts, at, _ = await self._task_context(db, submission)
        index = int(draft_ref.partition(":")[2])
        if at is None or index >= len(drafts):
            return None
        found = await candidates.task_with_distance(db, task_uuid=related_uuid, at=at)
        return None if found is None else self._task_suspect(draft_ref, drafts[index], *found, now)

    async def _task_context(
        self, db: AsyncSession, submission: NewTicket | NewTask
    ) -> tuple[tuple[TaskDraft, ...], GeoPoint | None, str | None]:
        """The task drafts, where to search from, and which ticket's tasks to skip."""
        if isinstance(submission, NewTicket):
            return submission.tasks, submission.ticket.location, None
        at = await candidates.ticket_location(db, submission.ticket_uuid)
        return (submission.task,), at, submission.ticket_uuid

    def _best_task(
        self, draft_ref: str, draft: TaskDraft, rows: list[tuple[TicketTask, Tickets, float]], now: datetime
    ) -> Suspect | None:
        threshold = self._parameters["ticket_task"].hint_threshold
        hits = [
            s
            for s in (self._task_suspect(draft_ref, draft, *row, now) for row in rows)
            if s.similarity >= threshold
        ]
        return min(hits, key=lambda s: (-s.similarity, s.related_uuid), default=None)

    def _task_suspect(
        self,
        draft_ref: str,
        draft: TaskDraft,
        task: TicketTask,
        ticket: Tickets,
        distance_m: float,
        now: datetime,
    ) -> Suspect:
        signals = Signals(
            distance_m=distance_m,
            age_min=_age_min(task.created_at, now),
            same_category=draft.task_type == task.task_type if draft.task_type and task.task_type else None,
            text_similarity=_text_similarity(
                (draft.task_name, draft.task_description), (task.task_name, task.task_description)
            ),
        )
        similarity, components = combine(signals, self._parameters["ticket_task"])
        return Suspect(
            draft_ref=draft_ref,
            related_kind="ticket_task",
            related_uuid=str(task.uuid),
            related_ticket_uuid=str(ticket.uuid),
            similarity=similarity,
            evidence={"components": components},
        )

    def _best_station(
        self, draft: StationDraft, rows: list[tuple[Station, float]], now: datetime
    ) -> Suspect | None:
        threshold = self._parameters["station"].hint_threshold
        hits = [
            s for s in (self._station_suspect(draft, *row, now) for row in rows) if s.similarity >= threshold
        ]
        return min(hits, key=lambda s: (-s.similarity, s.related_uuid), default=None)

    def _station_suspect(
        self, draft: StationDraft, station: Station, distance_m: float, now: datetime
    ) -> Suspect:
        signals = Signals(
            distance_m=distance_m,
            age_min=_age_min(station.created_at, now),
            same_category=draft.type == station.type if draft.type and station.type else None,
            text_similarity=_text_similarity(
                (draft.name, draft.description), (station.name, station.description)
            ),
        )
        similarity, components = combine(signals, self._parameters["station"])
        return Suspect(
            draft_ref="station",
            related_kind="station",
            related_uuid=str(station.uuid),
            similarity=similarity,
            evidence={"components": components},
        )


def _age_min(created_at: datetime | None, now: datetime) -> float:
    return 0.0 if created_at is None else max(0.0, (now - created_at).total_seconds() / 60)


def _text(first: str | None, second: str | None) -> str:
    parts = ((first or "")[:TITLE_MAX_CHARS], (second or "")[:DESCRIPTION_MAX_CHARS])
    return " ".join(part for part in parts if part).strip()


def _text_similarity(
    mine: tuple[str | None, str | None], theirs: tuple[str | None, str | None]
) -> float | None:
    """Trigram similarity of the two texts, or None when either side has none."""
    a, b = _text(*mine), _text(*theirs)
    return set_similarity(trigrams(a), trigrams(b)) if a and b else None
