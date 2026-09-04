"""Fast-layer dedup scoring — pure functions, no DB, no I/O.

Ported from the replay/grid-search harness the design workspace uses to tune the fast
layer (`02-evidence/evaluation/evaluate_fast_layer.py`), so the same formula decides a live
hint and scores an offline replay. Three signals come straight from the harness (distance,
time, task type); `text` is new here and is computed upstream by Postgres `pg_trgm`
(`similarity()`), which is why this module takes it as a plain 0–1 number.

Formula, unchanged from the harness:

    distance_signal = 2 ** (-distance_m / distance_half_m)
    time_signal     = 2 ** (-age_min / time_half_min)
    task_type_signal= 1.0 if the two task types match else 0.0 (skipped if either is unknown)
    text_signal     = pg_trgm similarity (skipped when either side has no text)
    similarity      = Σ(signal × weight) / Σ(weight over the *available* signals)

Skipping an unavailable signal from the denominator (rather than scoring it 0) is
deliberate: a ticket with no `task_type` should not be pushed below the hint threshold for
a field it was never asked to fill in.
"""

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class FastLayerParameters:
    """The fast layer's tuning knobs.

    ⚠️ **暫定值，出自 grid search 第一名，不是建議值。** They come from the audit report's
    grid run over 13 hand-authored fixtures with no production ground truth
    (`02-evidence/evaluation/audit-report.md`, which says so in as many words: at 100%
    recall the best false-hint rate was still 66.7%). They are here so the prototype runs
    end to end, not because anyone believes them. Re-run the harness on real submissions
    before these reach production.

    `text_weight` is worse than provisional: the grid has never included a text signal at
    all, so 1.0 is a judgement call — it sits between distance (2, the dominant signal) and
    time/task_type (0.5, the tie-breakers), which is where a "same words, same place" signal
    intuitively belongs. **未跑過 grid。**

    Per-component baselines (the `passed` light on each component) get the same treatment:
    the frozen contract stores one baseline per component in `dedup_score_components`, a
    slow-layer table that this slice does not create, so one shared provisional value stands
    in for all four. **暫定，未跑過 grid。**
    """

    distance_half_m: float = 200.0
    time_half_min: float = 360.0
    distance_weight: float = 2.0
    time_weight: float = 0.5
    task_type_weight: float = 0.5
    text_weight: float = 1.0
    hint_threshold: float = 0.8
    component_baseline: float = 0.5


# The single settings object the service layer reads. When `dedup_settings` /
# `dedup_rule_versions` land (slow layer), this becomes the fallback for a scope with no
# stored rule version rather than the only source.
FAST_LAYER_PARAMETERS = FastLayerParameters()


@dataclass(frozen=True)
class DedupCandidate:
    """One nearby, still-open ticket, with its features already measured against the query.

    `distance_m` / `age_min` / `text_similarity` are all *relative to the ticket being
    submitted* and are computed in SQL (PostGIS + pg_trgm) by the repository, so this module
    stays free of DB concerns and is directly unit-testable.
    """

    ticket_uuid: str
    distance_m: float
    age_min: float
    task_type: str | None = None
    text_similarity: float | None = None


@dataclass(frozen=True)
class ScoreComponent:
    """One signal's contribution — the exact shape the frozen contract exposes."""

    name: str
    score: float
    weight: float
    passed: bool


@dataclass(frozen=True)
class CandidateScore:
    """A scored candidate: the weighted total plus the per-signal breakdown."""

    candidate: DedupCandidate
    similarity: float
    components: tuple[ScoreComponent, ...] = field(default_factory=tuple)


def _component(name: str, score: float, weight: float, parameters: FastLayerParameters) -> ScoreComponent:
    """Build one component row, applying the shared provisional baseline for `passed`."""
    return ScoreComponent(
        name=name, score=score, weight=weight, passed=score >= parameters.component_baseline
    )


def score_candidate(
    candidate: DedupCandidate,
    *,
    query_task_type: str | None,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> CandidateScore:
    """Score one candidate against the ticket being submitted.

    Raises:
        ValueError: if no available signal carries positive weight (every weight zeroed out
            in the settings object) — the same guard the harness has.
    """
    components = [
        _component(
            "distance",
            2 ** (-candidate.distance_m / parameters.distance_half_m),
            parameters.distance_weight,
            parameters,
        ),
        _component(
            "time",
            2 ** (-candidate.age_min / parameters.time_half_min),
            parameters.time_weight,
            parameters,
        ),
    ]
    if query_task_type is not None and candidate.task_type is not None:
        components.append(
            _component(
                "task_type",
                float(query_task_type == candidate.task_type),
                parameters.task_type_weight,
                parameters,
            )
        )
    if candidate.text_similarity is not None:
        components.append(
            _component("text", candidate.text_similarity, parameters.text_weight, parameters)
        )

    denominator = sum(c.weight for c in components)
    if denominator <= 0:
        raise ValueError("at least one available signal must have positive weight")
    similarity = sum(c.score * c.weight for c in components) / denominator
    return CandidateScore(candidate=candidate, similarity=similarity, components=tuple(components))


def rank_candidates(
    candidates: list[DedupCandidate],
    *,
    query_task_type: str | None,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> list[CandidateScore]:
    """Score every candidate and sort best-first.

    Ties break on `ticket_uuid` so a query is reproducible — same tie-break as the harness.
    """
    scored = [
        score_candidate(c, query_task_type=query_task_type, parameters=parameters)
        for c in candidates
    ]
    scored.sort(key=lambda s: (-s.similarity, s.candidate.ticket_uuid))
    return scored


def top_hint(
    candidates: list[DedupCandidate],
    *,
    query_task_type: str | None,
    parameters: FastLayerParameters = FAST_LAYER_PARAMETERS,
) -> CandidateScore | None:
    """Return the single best candidate if it clears `hint_threshold`, else None.

    Top-1 only, by decision: the submitter gets one "did you mean this one?" prompt, not a
    list to triage. Everything below the line is the slow layer's problem.
    """
    scored = rank_candidates(candidates, query_task_type=query_task_type, parameters=parameters)
    if not scored:
        return None
    best = scored[0]
    return best if best.similarity >= parameters.hint_threshold else None


def max_hint_distance_m(parameters: FastLayerParameters = FAST_LAYER_PARAMETERS) -> float:
    """The distance beyond which no candidate can clear `hint_threshold`, whatever else it is.

    The inverse of the scoring formula, solved for distance with every other signal at its
    maximum. Retrieval uses it as the candidate boundary so that the only thing ever excluded
    is what is *arithmetically* incapable of producing a hint — never a guess about how much
    work the database should do. Change any parameter and the boundary moves with it.

        similarity = (d_signal·w_d + Σ other signals·their weights) / Σ weights

    At the boundary every other signal is 1.0, so with W = Σ weights::

        threshold = (d_signal·w_d + (W − w_d)) / W
        d_signal  = 1 + W·(threshold − 1) / w_d
        distance  = −distance_half_m · log2(d_signal)

    W is taken over *all four* signals, which is the widest the boundary ever gets: a signal
    that turns out to be unavailable leaves the average, shrinking W, and a smaller W makes
    the required distance signal larger, not smaller (`threshold − 1` is negative). So a
    radius computed this way covers every candidate no matter which of its fields are filled
    in — for the shipped parameters, 147.4 m.

    Returns `math.inf` when distance can never rule a candidate out on its own (no distance
    weight, or a threshold so low the other signals alone clear it), and 0.0 when even a
    candidate at the same coordinates cannot clear the threshold. Callers are expected to
    clamp the infinite case — see `_retrieval_radius_m` in services/dedup.py.
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
