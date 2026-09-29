"""The fast layer (current version: fast-v2) — rule-based dedup at task level.

Each signal is normalised to 0–1 and the similarity is their weighted average over the signals
that are available:

    distance  = 2 ** (-distance_m / distance_half_m)          between the tasks' tickets
    time      = 2 ** (-age_min / time_half_min)                the candidate's age; skipped at weight 0
    task_type = 1.0 if both categories match else 0.0          skipped if either side is unknown
    text      = trigram similarity of name + description       skipped if either side has none

A missing signal leaves the average instead of scoring 0, so an empty optional field never
pushes a candidate below the threshold. `combine` is the formula the offline tuning harness uses.

The unit is a ticket task (Spec 019, 2026-09-29): each task draft is compared with open tasks
nearby and gets at most one suspect; the ticket itself is not compared. Adding a task to an
existing ticket searches from that ticket and skips its own tasks. Stations are compared as
stations, without the time signal. Candidates come from `candidates.py` (read-only, ADR-304).

⚠️ 參數是暫定值，不是建議值：13 筆手寫 fixture 的 grid search 第一名，沒有正式資料的
ground truth；`text_weight` 與 `component_baseline` 沒跑過 grid。見 CHANGELOG.md。
"""

import math
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

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
from app.dedup_engine.text import set_similarity, trigrams
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

# 200 is the width of `tickets.title`; descriptions are unbounded, so 2000 is a chosen cap.
TITLE_MAX_CHARS = 200
DESCRIPTION_MAX_CHARS = 2000
# Float rounding must not drop a candidate that scores exactly on the threshold.
RETRIEVAL_SAFETY_FACTOR = 1.1


@dataclass(frozen=True)
class FastParameters:
    """Tuning knobs for fast-v1."""

    distance_half_m: float = 200.0
    time_half_min: float = 360.0
    distance_weight: float = 2.0
    time_weight: float = 0.5
    task_type_weight: float = 0.5
    text_weight: float = 1.0
    hint_threshold: float = 0.8
    component_baseline: float = 0.5


TICKET_PARAMETERS = FastParameters()
# A station's age says nothing about whether it duplicates one being registered now.
STATION_PARAMETERS = replace(TICKET_PARAMETERS, time_weight=0.0)


@dataclass(frozen=True)
class Signals:
    """The raw measurements between a submission and one candidate. None = unavailable."""

    distance_m: float
    age_min: float
    same_category: bool | None
    text_similarity: float | None


def combine(signals: Signals, p: FastParameters) -> tuple[float, list[dict[str, Any]]]:
    """The weighted average over available signals, and the per-signal breakdown.

    Raises:
        ValueError: when no available signal has positive weight.
    """
    parts = [("distance", 2 ** (-signals.distance_m / p.distance_half_m), p.distance_weight)]
    if p.time_weight > 0:
        parts.append(("time", 2 ** (-signals.age_min / p.time_half_min), p.time_weight))
    if signals.same_category is not None:
        parts.append(("task_type", float(signals.same_category), p.task_type_weight))
    if signals.text_similarity is not None:
        parts.append(("text", signals.text_similarity, p.text_weight))

    total_weight = sum(weight for _, _, weight in parts)
    if total_weight <= 0:
        raise ValueError("at least one available signal must have positive weight")
    similarity = sum(score * weight for _, score, weight in parts) / total_weight
    components = [
        {"name": name, "score": round(score, 4), "weight": weight, "passed": score >= p.component_baseline}
        for name, score, weight in parts
    ]
    return similarity, components


def max_hint_distance_m(p: FastParameters) -> float:
    """The distance past which no candidate can reach `hint_threshold`.

    Every other signal is taken at 1.0. Solving the formula for distance, with W the sum of
    all four weights:

        d_signal = 1 + W · (threshold − 1) / distance_weight
        distance = −distance_half_m · log2(d_signal)

    All four weights give the widest boundary: a missing signal shrinks W and tightens it.
    Returns `math.inf` when distance alone can never rule a candidate out, and 0.0 when even
    a candidate at the same point cannot qualify.
    """
    total_weight = p.distance_weight + p.time_weight + p.task_type_weight + p.text_weight
    if p.distance_weight <= 0 or total_weight <= 0:
        return math.inf
    required_signal = 1 + total_weight * (p.hint_threshold - 1) / p.distance_weight
    if required_signal <= 0:
        return math.inf
    if required_signal >= 1:
        return 0.0
    return -p.distance_half_m * math.log2(required_signal)


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
