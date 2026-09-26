"""Fast-layer dedup scoring: pure functions, no database, no framework.

    from app.services.dedup_scoring import DedupCandidate, top_hint

    nearby = [DedupCandidate("uuid-1", distance_m=40, age_min=15, task_type="rescue", text_similarity=0.7)]
    hint = top_hint(nearby, query_task_type="rescue")  # CandidateScore or None
    if hint:
        print(hint.similarity, [(c.name, c.score) for c in hint.components])

Each signal is normalised to 0–1 and the similarity is their weighted average over the
signals that are available:

    distance  = 2 ** (-distance_m / distance_half_m)
    time      = 2 ** (-age_min / time_half_min)
    task_type = 1.0 if both types match else 0.0   (skipped if either side is unknown)
    text      = pg_trgm similarity                  (skipped if either side has no text)

A missing signal leaves the average instead of scoring 0, so an empty optional field never
pushes a candidate below the threshold. The formula matches the offline tuning harness.
"""

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class FastLayerParameters:
    """Tuning knobs for the fast layer.

    ⚠️ **暫定值，不是建議值。** The defaults are the top grid-search result over 13
    hand-written fixtures with no production ground truth. `text_weight` and
    `component_baseline` were never in the grid.
    """

    distance_half_m: float = 200.0
    time_half_min: float = 360.0
    distance_weight: float = 2.0
    time_weight: float = 0.5
    task_type_weight: float = 0.5
    text_weight: float = 1.0
    hint_threshold: float = 0.8
    component_baseline: float = 0.5


FAST_LAYER_PARAMETERS = FastLayerParameters()


@dataclass(frozen=True)
class DedupCandidate:
    """An existing entity, measured against the one being submitted."""

    entity_uuid: str
    distance_m: float
    age_min: float
    task_type: str | None = None
    text_similarity: float | None = None


@dataclass(frozen=True)
class ScoreComponent:
    """One signal's contribution; `passed` is `score >= component_baseline`."""

    name: str
    score: float
    weight: float
    passed: bool


@dataclass(frozen=True)
class CandidateScore:
    """A candidate with its weighted similarity and per-signal breakdown."""

    candidate: DedupCandidate
    similarity: float
    components: tuple[ScoreComponent, ...]


def score_candidate(
    candidate: DedupCandidate,
    *,
    query_task_type: str | None,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> CandidateScore:
    """Score one candidate. Raises ValueError if no available signal has positive weight."""
    p = parameters
    signals = [
        ("distance", 2 ** (-candidate.distance_m / p.distance_half_m), p.distance_weight),
        ("time", 2 ** (-candidate.age_min / p.time_half_min), p.time_weight),
    ]
    if query_task_type is not None and candidate.task_type is not None:
        signals.append(("task_type", float(query_task_type == candidate.task_type), p.task_type_weight))
    if candidate.text_similarity is not None:
        signals.append(("text", candidate.text_similarity, p.text_weight))

    total_weight = sum(weight for _, _, weight in signals)
    if total_weight <= 0:
        raise ValueError("at least one available signal must have positive weight")
    components = tuple(
        ScoreComponent(name, score, weight, passed=score >= p.component_baseline)
        for name, score, weight in signals
    )
    similarity = sum(c.score * c.weight for c in components) / total_weight
    return CandidateScore(candidate, similarity, components)


def top_hint(
    candidates: list[DedupCandidate],
    *,
    query_task_type: str | None,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> CandidateScore | None:
    """The best candidate if it reaches `hint_threshold`, else None. Ties break on uuid."""
    scores = [score_candidate(c, query_task_type=query_task_type, parameters=parameters) for c in candidates]
    best = min(scores, key=lambda s: (-s.similarity, s.candidate.entity_uuid), default=None)
    return best if best and best.similarity >= parameters.hint_threshold else None


def max_hint_distance_m(parameters: FastLayerParameters = FAST_LAYER_PARAMETERS) -> float:
    """The distance past which no candidate can reach `hint_threshold`.

    Every other signal is taken at 1.0. Solving the formula for distance, with W the sum of all four weights:

        d_signal = 1 + W · (threshold − 1) / distance_weight
        distance = −distance_half_m · log2(d_signal)

    Using all four weights gives the widest boundary: a missing signal shrinks W and so
    tightens it. Returns `math.inf` when distance alone can never rule a candidate out, and
    0.0 when even a candidate at the same point cannot qualify.
    """
    total_weight = (
        parameters.distance_weight
        + parameters.time_weight
        + parameters.task_type_weight
        + parameters.text_weight
    )
    if parameters.distance_weight <= 0 or total_weight <= 0:
        return math.inf
    required_signal = 1 + total_weight * (parameters.hint_threshold - 1) / parameters.distance_weight
    if required_signal <= 0:
        return math.inf
    if required_signal >= 1:
        return 0.0
    return -parameters.distance_half_m * math.log2(required_signal)
