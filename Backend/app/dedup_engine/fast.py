"""The fast layer (current version: fast-v3). It finds duplicates at task level with fixed rules.

The engine changes each signal to a score from 0 to 1. The similarity is the weighted average of
the available signals:

    distance  = 2 ** (-distance_m / distance_half_m)          between the tickets of the two tasks
    time      = 2 ** (-age_min / time_half_min)                the age of the candidate; not used at weight 0
    task_type = 1.0 if both categories match else 0.0          not used if one side is unknown
    text      = trigram similarity of name + description       not used if one side has no text

A missing signal does not get a score of 0. It is not part of the average. Thus, an empty
optional field never pushes a candidate below the threshold.

Then the engine adds a pure bonus (fast-v3). If both tickets have a contact phone and the two
phones are the same number, the engine adds `phone_bonus`. The maximum similarity is 1.
A different phone or a missing phone changes nothing. Different people often report the same
need, and many people do not give a phone. Thus, neither one shows that the need is different.
The engine adds the bonus to each candidate before it selects the best candidate and compares
it with the threshold.

The offline evaluation tool (`tools/dedup_eval/`) also scores with `combine` and
`text_similarity`. Thus, the tool and the engine give the same scores.

The unit is a ticket task (Spec 019, 2026-09-29). The engine compares each task draft with open
tasks nearby. Each task draft gets a maximum of one suspect. The engine does not compare the
ticket itself. For a new task on a ticket that exists, the engine searches from that ticket and
skips the tasks of that ticket. The engine compares stations only with stations, without the
time signal and without the phone bonus. The candidates come from `candidates.py` (read-only,
ADR-304).

The module has four layers:

- Parameters: `FastParameters`, `TICKET_TASK_PARAMETERS`, `STATION_PARAMETERS` and the
  module constants.
- Formula: `Signals`, `combine` and `max_hint_distance_m`. These do not use the database.
- Measurements: `_age_min`, `text_similarity`, `phone_key` and `same_contact_phone`. These
  change raw data to signals.
- Flow: `FastEngine`. It finds candidates, scores them with the formula and gives suspects
  to the backend.

⚠️ 參數是暫定值，不是建議值：13 筆手寫 fixture 的 grid search 第一名，沒有正式資料的
ground truth；`text_weight` 與 `component_baseline` 沒跑過 grid。`phone_bonus` 0.10 來自 2025 光復
舊平台資料 100 筆人工裁決的 proxy backtest（5-fold）。見 CHANGELOG.md。
"""

import contextlib
import functools
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

# 200 is the width of `ticket_tasks.task_name`. Descriptions do not have a length limit, so 2000
# is a selected limit. The limits keep the text comparison fast for very long input.
TITLE_MAX_CHARS = 200
DESCRIPTION_MAX_CHARS = 2000
# Float rounding must not remove a candidate whose score is exactly on the threshold.
RETRIEVAL_SAFETY_FACTOR = 1.1
_NON_DIGIT = re.compile(r"\D")


@dataclass(frozen=True)
class FastParameters:
    """The values that tune the score. The engine adds `phone_bonus` after the weighted average.

    `phone_bonus` is not part of the average.
    """

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
# The age of a station does not show if a new station is a duplicate of it. The research for the
# phone bonus used only tickets.
STATION_PARAMETERS = replace(TICKET_TASK_PARAMETERS, time_weight=0.0, phone_bonus=0.0)


@dataclass(frozen=True)
class Signals:
    """The raw measurements between a submission and one candidate.

    None means that the engine cannot measure the signal, because data is missing.
    """

    distance_m: float
    age_min: float
    same_category: bool | None
    text_similarity: float | None
    same_contact_phone: bool | None = None


def combine(signals: Signals, p: FastParameters) -> tuple[float, list[dict[str, Any]]]:
    """Calculate the similarity and its breakdown.

    The similarity is the weighted average of the available signals, plus the phone bonus.
    The phone bonus is not part of the average. When the engine adds the bonus, the breakdown
    shows it as a "phone" component. Its score is 1.0 and its weight is the bonus.

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
    """Calculate the distance after which no candidate can get to `hint_threshold`.

    The calculation uses the best case: all other signals are 1.0, and the candidate gets the
    phone bonus. Thus, the weighted average must get to only `threshold − phone_bonus`.
    W is the sum of all four weights. The formula, solved for distance, is:

        d_signal = 1 + W · (threshold − phone_bonus − 1) / distance_weight
        distance = −distance_half_m · log2(d_signal)

    All four weights give the largest distance. If a signal is missing, W becomes smaller and
    the distance becomes smaller.
    Returns `math.inf` if distance alone can never remove a candidate.
    Returns 0.0 if a candidate at the same point cannot get to the threshold.
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
    """The fast layer at task level. It is a `DedupEngine`."""

    version = "fast-v3"

    def __init__(self, parameters: dict[RelatedKind, FastParameters] | None = None):
        """Use the default parameters for each kind, if the caller does not give other parameters."""
        self._parameters = parameters or {
            "ticket_task": TICKET_TASK_PARAMETERS,
            "station": STATION_PARAMETERS,
        }

    def radius_m(self, kind: RelatedKind) -> float:
        """Calculate the search radius: the hint boundary plus a margin for float rounding."""
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
        suspects = (self._best_task(task_ref(i), draft, phone, rows, now) for i, draft in enumerate(drafts))
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
        """Score one pair that the caller names. Do not apply a threshold.

        Returns None if the draft, the kind or the related entity does not fit.
        """
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

        drafts, at, phone, _ = await self._task_context(db, submission)
        index = int(draft_ref.partition(":")[2])
        if at is None or index >= len(drafts):
            return None
        found = await candidates.task_with_distance(db, task_uuid=related_uuid, at=at)
        return None if found is None else self._task_suspect(draft_ref, drafts[index], phone, *found, now)

    async def _task_context(
        self, db: AsyncSession, submission: NewTicket | NewTask
    ) -> tuple[tuple[TaskDraft, ...], GeoPoint | None, str | None, str | None]:
        """Prepare the search: the task drafts, the start point, the phone and the ticket to skip.

        The phone is the contact phone of the ticket that the user submits to.
        """
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
        phone: str | None,
        rows: list[tuple[TicketTask, Tickets, float]],
        now: datetime,
    ) -> Suspect | None:
        threshold = self._parameters["ticket_task"].hint_threshold
        hits = [
            s
            for s in (self._task_suspect(draft_ref, draft, phone, *row, now) for row in rows)
            if s.similarity >= threshold
        ]
        return max(hits, key=lambda s: (s.similarity, s.related_uuid), default=None)

    def _task_suspect(
        self,
        draft_ref: str,
        draft: TaskDraft,
        phone: str | None,
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
            same_contact_phone=same_contact_phone(phone, ticket.contact_phone),
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
    """Calculate the trigram similarity of the two texts. Returns None if one side has no text."""
    a, b = _text(*mine), _text(*theirs)
    return set_similarity(trigrams(a), trigrams(b)) if a and b else None


@functools.lru_cache(maxsize=4096)  # pure; the submission's phone is parsed once per candidate otherwise
def phone_key(phone: str | None) -> str | None:
    """Make the form of a phone that the engine compares: its digits, after E.164 if possible.

    The phone of the submission comes in E.164 (`+886912345678`). But `tickets.contact_phone`
    keeps the phone as the user typed it (`0912-345-678`). Thus, the engine sends both sides
    through the E.164 parser of the backend first. If the parser rejects a phone, the engine
    uses only its digits. Returns None if there is no phone.
    """
    if not phone:
        return None
    with contextlib.suppress(ValueError):
        phone = normalize_phone(phone)
    return _NON_DIGIT.sub("", phone) or None


def same_contact_phone(mine: str | None, theirs: str | None) -> bool | None:
    """Return True if the two phones are the same number. Returns None if one side has no phone."""
    a, b = phone_key(mine), phone_key(theirs)
    return None if a is None or b is None else a == b
