"""The fast layer: finds likely duplicates with fixed rules, one task draft at a time.

Each signal becomes a score from 0 to 1, and the similarity is the weighted average of the
signals that can be measured:

    distance  = 2 ** (-distance_m / distance_half_m)          between the tickets of the two tasks
    time      = 2 ** (-age_min / time_half_min)                age of the candidate; skipped at weight 0
    task_type = 1.0 if both categories match else 0.0          skipped if either side is unknown
    text      = trigram similarity of name + description       skipped if either side has no text

A signal that cannot be measured is left out of the average rather than scored 0, so an empty
optional field never pushes a candidate below the threshold.

Same contact phone on both tickets adds `phone_bonus` on top (capped at 1). A different or missing
phone changes nothing: different people often report the same need, and many give no phone. A
phone the backend's E.164 parser rejects counts as missing, so a shared placeholder such as
`0000000000` earns nothing. The bonus is added before picking the best candidate.

Each task draft is compared with open tasks nearby and gets at most one suspect; the ticket itself
is never compared. A task added to an existing ticket searches from that ticket and skips its own
tasks. Stations are compared only with stations, without the time signal or the phone bonus.
Candidates come from the read-only queries in `candidates.py`.

The offline evaluation tool (`tools/dedup_eval/`) scores with the same `combine` and
`text_similarity`, so offline and online scores match.

Layout: parameters (`FastParameters` and the constants) → formula (`Signals`, `combine`,
`max_hint_distance_m`; no database) → measurements (`text_similarity`, `phone_key`,
`same_contact_phone`) → flow (`FastEngine`).

The parameters are provisional. The weights and threshold won a grid search over 13 hand-written
cases; `text_weight` and `component_baseline` are judgement calls. `phone_bonus` 0.10 comes from
a backtest on 100 hand-labelled pairs from the 2025 Guangfu platform. Version history and
backtest numbers: `Spec/020-dedup-engine-interface/spec.md` §11.
"""

import math
import re
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.normalize import normalize_phone
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

# 200 is the width of `ticket_tasks.task_name`; descriptions have no limit, so 2000 is a chosen cap.
# Both keep text comparison fast on very long input.
TITLE_MAX_CHARS = 200
DESCRIPTION_MAX_CHARS = 2000
# Float rounding must not remove a candidate whose score is exactly on the threshold.
RETRIEVAL_SAFETY_FACTOR = 1.1
_NON_DIGIT = re.compile(r"\D")


@dataclass(frozen=True)
class FastParameters:
    """The values that tune the score. `phone_bonus` is added after the weighted average."""

    distance_half_m: float = 200.0
    time_half_min: float = 360.0
    distance_weight: float = 2.0
    time_weight: float = 0.5
    task_type_weight: float = 0.5
    text_weight: float = 1.0
    hint_threshold: float = 0.8
    component_baseline: float = 0.5
    phone_bonus: float = 0.10


TICKET_TASK_PARAMETERS = FastParameters()
# A station's age says nothing about whether a new one duplicates it, and the phone bonus was
# only researched on tickets.
STATION_PARAMETERS = replace(TICKET_TASK_PARAMETERS, time_weight=0.0, phone_bonus=0.0)


@dataclass(frozen=True)
class Signals:
    """Raw measurements between a submission and one candidate. None means data is missing."""

    distance_m: float
    age_min: float
    same_category: bool | None
    text_similarity: float | None
    same_contact_phone: bool | None = None


def combine(signals: Signals, p: FastParameters) -> tuple[float, list[dict[str, Any]]]:
    """Return the similarity and its per-signal breakdown.

    A phone bonus shows in the breakdown as a "phone" component with score 1.0 and weight = bonus.

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
    if signals.same_contact_phone and p.phone_bonus > 0:
        similarity = min(1.0, similarity + p.phone_bonus)
        components.append({"name": "phone", "score": 1.0, "weight": p.phone_bonus, "passed": True})
    return similarity, components


def max_hint_distance_m(p: FastParameters) -> float:
    """The distance beyond which no candidate can reach `hint_threshold`.

    Assumes the best case: every other signal is 1.0 and the phone bonus applies, so the average
    only has to reach `threshold − phone_bonus`. With W = the sum of all four weights:

        d_signal = 1 + W · (threshold − phone_bonus − 1) / distance_weight
        distance = −distance_half_m · log2(d_signal)

    Counting all four weights gives the largest distance; a missing signal only shrinks it.
    Returns `math.inf` if distance alone can never rule a candidate out, and 0.0 if even a
    candidate at the same point cannot reach the threshold.
    """
    total_weight = p.distance_weight + p.time_weight + p.task_type_weight + p.text_weight
    if p.distance_weight <= 0 or total_weight <= 0:
        return math.inf
    needed_average = p.hint_threshold - max(p.phone_bonus, 0.0)
    required_signal = 1 + total_weight * (needed_average - 1) / p.distance_weight
    if required_signal <= 0:
        return math.inf
    if required_signal >= 1:
        return 0.0
    return -p.distance_half_m * math.log2(required_signal)


class FastEngine:
    """The fast layer as a `DedupEngine`."""

    version = "fast-v4"

    def __init__(self, parameters: dict[RelatedKind, FastParameters] | None = None):
        """`parameters` per kind; defaults to the shipped ones."""
        self._parameters = parameters or {
            "ticket_task": TICKET_TASK_PARAMETERS,
            "station": STATION_PARAMETERS,
        }

    def radius_m(self, kind: RelatedKind) -> float:
        """Search radius: the hint boundary plus a margin for float rounding."""
        return max_hint_distance_m(self._parameters[kind]) * RETRIEVAL_SAFETY_FACTOR

    async def check(self, db: AsyncSession, submission: Submission, now: datetime) -> list[Suspect]:
        """Find suspects. Each task draft (or station) gets a maximum of one suspect."""
        if isinstance(submission, NewStation):
            rows = await candidates.open_stations_near(
                db, at=submission.station.location, radius_m=self.radius_m("station"), now=now
            )
            best = self._best_station(submission.station, rows, now)
            return [best] if best else []

        drafts, at, phone, exclude = await self._task_context(db, submission)
        if not drafts or at is None:
            return []
        rows = await candidates.open_tasks_near(
            db, at=at, radius_m=self.radius_m("ticket_task"), exclude_ticket_uuid=exclude
        )
        same_phones = _same_phones(phone, rows)
        suspects = (
            self._best_task(task_ref(i), draft, rows, same_phones, now) for i, draft in enumerate(drafts)
        )
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
        """Score one named pair, with no threshold. None if the draft, kind or entity does not fit."""
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

        if related_kind != "ticket_task":
            return None  # only tasks are compared, never the ticket itself
        drafts, at, phone, _ = await self._task_context(db, submission)
        index = int(draft_ref.partition(":")[2])
        if at is None or index >= len(drafts):
            return None
        found = await candidates.task_with_distance(db, task_uuid=related_uuid, at=at)
        if found is None:
            return None
        task, ticket, distance_m = found
        same_phone = same_contact_phone(phone, ticket.contact_phone)
        return self._task_suspect(draft_ref, drafts[index], same_phone, task, ticket, distance_m, now)

    async def _task_context(
        self, db: AsyncSession, submission: NewTicket | NewTask
    ) -> tuple[tuple[TaskDraft, ...], GeoPoint | None, str | None, str | None]:
        """The task drafts, the search point, the submitting ticket's phone, and the ticket to skip."""
        if isinstance(submission, NewTicket):
            return submission.tasks, submission.ticket.location, submission.ticket.contact_phone, None
        anchor = await candidates.ticket_anchor(db, submission.ticket_uuid)
        if anchor is None:
            return (submission.task,), None, None, submission.ticket_uuid
        return (submission.task,), anchor.location, anchor.contact_phone, submission.ticket_uuid

    def _best_task(
        self,
        draft_ref: str,
        draft: TaskDraft,
        rows: list[tuple[TicketTask, Tickets, float]],
        same_phones: list[bool | None],
        now: datetime,
    ) -> Suspect | None:
        threshold = self._parameters["ticket_task"].hint_threshold
        hits = [
            s
            for s in (
                self._task_suspect(draft_ref, draft, same_phone, *row, now)
                for row, same_phone in zip(rows, same_phones, strict=True)
            )
            if s.similarity >= threshold
        ]
        return max(hits, key=lambda s: (s.similarity, s.related_uuid), default=None)

    def _task_suspect(
        self,
        draft_ref: str,
        draft: TaskDraft,
        same_phone: bool | None,
        task: TicketTask,
        ticket: Tickets,
        distance_m: float,
        now: datetime,
    ) -> Suspect:
        signals = Signals(
            distance_m=distance_m,
            age_min=_age_min(task.created_at, now),
            same_category=draft.task_type == task.task_type if draft.task_type and task.task_type else None,
            text_similarity=text_similarity(
                (draft.task_name, draft.task_description), (task.task_name, task.task_description)
            ),
            same_contact_phone=same_phone,
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
        return max(hits, key=lambda s: (s.similarity, s.related_uuid), default=None)

    def _station_suspect(
        self, draft: StationDraft, station: Station, distance_m: float, now: datetime
    ) -> Suspect:
        signals = Signals(
            distance_m=distance_m,
            age_min=_age_min(station.created_at, now),
            same_category=draft.type == station.type if draft.type and station.type else None,
            text_similarity=text_similarity(
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


def text_similarity(
    mine: tuple[str | None, str | None], theirs: tuple[str | None, str | None]
) -> float | None:
    """Trigram similarity of the two texts, or None if either side has none."""
    a, b = _text(*mine), _text(*theirs)
    return set_similarity(trigrams(a), trigrams(b)) if a and b else None


def phone_key(phone: str | None) -> str | None:
    """The digits of the phone's E.164 form, or None if there is none or the parser rejects it.

    Submissions arrive in E.164 (`+886912345678`) but `tickets.contact_phone` is stored as typed
    (`0912-345-678`), so both sides go through the backend's parser. A rejected placeholder such
    as `0000000000` must not count as a shared phone.
    """
    if not phone:
        return None
    try:
        return _NON_DIGIT.sub("", normalize_phone(phone)) or None
    except ValueError:
        return None


def same_contact_phone(mine: str | None, theirs: str | None) -> bool | None:
    """Whether the two phones are the same number; None if either side has no usable phone."""
    return _same_key(phone_key(mine), phone_key(theirs))


def _same_key(mine: str | None, theirs: str | None) -> bool | None:
    return None if mine is None or theirs is None else mine == theirs


def _same_phones(phone: str | None, rows: list[tuple[TicketTask, Tickets, float]]) -> list[bool | None]:
    """Compare the submission's phone with each candidate's.

    Done once per `check` rather than once per task draft, because parsing a phone is slow.
    """
    mine = phone_key(phone)
    if mine is None:
        return [None] * len(rows)
    return [_same_key(mine, phone_key(ticket.contact_phone)) for _, ticket, _ in rows]
