"""fast-v1: the rule-based fast layer, ported from Spec 019's services/dedup_scoring.py.

Each signal is normalised to 0–1 and the similarity is their weighted average over the signals
that are available:

    distance  = 2 ** (-distance_m / distance_half_m)
    time      = 2 ** (-age_min / time_half_min)          (skipped when time_weight is 0)
    task_type = 1.0 if both categories match else 0.0     (skipped if either side is unknown)
    text      = trigram similarity of title/name + description  (skipped if either side has none)

A missing signal leaves the average instead of scoring 0, so an empty optional field never
pushes a candidate below the threshold. `combine` is the formula the offline tuning harness
uses; `measure` turns snapshots into its inputs.

⚠️ 參數是暫定值，不是建議值：13 筆手寫 fixture 的 grid search 第一名，沒有正式資料的
ground truth；`text_weight` 與 `component_baseline` 沒跑過 grid。見 CHANGELOG.md。
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

from app.dedup_engine.contract import (
    Candidate,
    EntityKind,
    Match,
    RetrievalSpec,
    Snapshot,
    TicketSnapshot,
)
from app.dedup_engine.text import trigram_similarity

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


class FastEngine:
    """The fast layer as a `DedupEngine`."""

    version = "fast-v1"

    def __init__(self, parameters: dict[EntityKind, FastParameters] | None = None):
        """Use the shipped per-kind parameters unless others are given."""
        self._parameters = parameters or {"ticket": TICKET_PARAMETERS, "station": STATION_PARAMETERS}

    def retrieval(self, kind: EntityKind) -> RetrievalSpec:
        """The hint boundary for `kind` plus a rounding margin."""
        return RetrievalSpec(radius_m=max_hint_distance_m(self._parameters[kind]) * RETRIEVAL_SAFETY_FACTOR)

    def score(self, submission: Snapshot, candidate: Candidate, now: datetime) -> Match:
        """Score one candidate, no threshold. Raises ValueError if no signal has weight."""
        similarity, components = combine(measure(submission, candidate, now), self._params(submission))
        return Match(
            candidate_uuid=str(candidate.snapshot.uuid),
            similarity=similarity,
            evidence={"components": components},
        )

    def rank(self, submission: Snapshot, candidates: Sequence[Candidate], now: datetime) -> list[Match]:
        """Candidates reaching the threshold, best first; ties break on uuid."""
        threshold = self._params(submission).hint_threshold
        hits = [m for m in (self.score(submission, c, now) for c in candidates) if m.similarity >= threshold]
        return sorted(hits, key=lambda m: (-m.similarity, m.candidate_uuid))

    def _params(self, snapshot: Snapshot) -> FastParameters:
        return self._parameters["ticket" if isinstance(snapshot, TicketSnapshot) else "station"]


def measure(submission: Snapshot, candidate: Candidate, now: datetime) -> Signals:
    """Turn a submission and a candidate into the formula's inputs."""
    other = candidate.snapshot
    mine, theirs = _category(submission), _category(other)
    text_a, text_b = _text(submission), _text(other)
    return Signals(
        distance_m=candidate.distance_m,
        age_min=max(0.0, (now - other.created_at).total_seconds() / 60),
        same_category=None if mine is None or theirs is None else mine == theirs,
        text_similarity=trigram_similarity(text_a, text_b) if text_a and text_b else None,
    )


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


def _category(snapshot: Snapshot) -> str | None:
    return snapshot.task_type if isinstance(snapshot, TicketSnapshot) else snapshot.type


def _text(snapshot: Snapshot) -> str:
    first = snapshot.title if isinstance(snapshot, TicketSnapshot) else snapshot.name
    parts = ((first or "")[:TITLE_MAX_CHARS], (snapshot.description or "")[:DESCRIPTION_MAX_CHARS])
    return " ".join(part for part in parts if part).strip()
