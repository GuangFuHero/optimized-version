"""Replay and grid-search the fast layer's top-1 ranking on a labelled query dataset.

Scores come from the engine itself: `score_candidate` turns one query/candidate pair into
`app.dedup_engine.fast.Signals` and calls `combine`, and the text signal is `fast.text_similarity`.
So a parameter set tuned here is scored exactly as `FastEngine` scores it in production.

Candidate retrieval is not replayed: each query carries the candidates retrieval returned
(`retrieval.candidate_ids`), so no database is needed. Run from `Backend/`:

    uv run python -m tools.dedup_eval.evaluate_fast_layer path/to/dataset.json --label-set confirmed

The dataset format, label sets and metrics are described in README.md beside this file.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from app.dedup_engine.fast import FastParameters, Signals, combine, text_similarity
from app.dedup_engine.text import trigram_similarity

__all__ = [
    "PARAMETER_FIELDS",
    "Parameters",
    "evaluate",
    "load_dataset",
    "parse_number_list",
    "score_candidate",
    "text_signal_for",
    "trigram_similarity",
    "validate_dataset",
]

EARTH_RADIUS_M = 6_371_008.8
SIGNAL_KEYS = {
    "distance": "distance_signal",
    "time": "time_signal",
    "task_type": "task_type_signal",
    "text": "text_signal",
    "phone": "phone_bonus",
}


@dataclass(frozen=True)
class Parameters:
    """One point of the grid. Field names and meaning are `FastParameters`'.

    `phone_bonus` comes last with the engine's default, so the 7-value form still works.
    """

    distance_half_m: float
    time_half_min: float
    distance_weight: float
    time_weight: float
    task_type_weight: float
    text_weight: float
    hint_threshold: float
    phone_bonus: float = FastParameters.phone_bonus

    def to_fast(self) -> FastParameters:
        """The engine's parameter object for the same values."""
        return FastParameters(**{name: getattr(self, name) for name in PARAMETER_FIELDS})


PARAMETER_FIELDS = (
    "distance_half_m",
    "time_half_min",
    "distance_weight",
    "time_weight",
    "task_type_weight",
    "text_weight",
    "hint_threshold",
    "phone_bonus",
)


def text_signal_for(query_ticket: dict[str, Any], candidate: dict[str, Any]) -> float | None:
    """The text signal for one pair; None when either side has no text.

    A candidate may carry a precomputed `text_similarity` (0–1), which wins. Otherwise `title` and
    `description` play `task_name` and `task_description`.
    """
    precomputed = candidate.get("text_similarity")
    if isinstance(precomputed, int | float):
        return float(precomputed)
    return text_similarity(
        (query_ticket.get("title"), query_ticket.get("description")),
        (candidate.get("title"), candidate.get("description")),
    )


def score_candidate(
    query: dict[str, Any], candidate: dict[str, Any], parameters: Parameters
) -> tuple[float, dict[str, float | None]]:
    """The engine's similarity for one pair, and each signal's 0–1 score (None = not counted).

    Signal scores are `combine`'s breakdown, rounded to 4 places; the similarity is not rounded.
    `phone_bonus` is 1.0 when the bonus was added. A candidate without `same_contact_phone`
    (or with null) earns no bonus, exactly like a pair where either side has no phone.
    """
    query_type = query["query_ticket"].get("task_type")
    candidate_type = candidate.get("task_type")
    signals = Signals(
        distance_m=candidate["distance_m"],
        age_min=candidate["age_min"],
        same_category=None if query_type is None or candidate_type is None else query_type == candidate_type,
        text_similarity=text_signal_for(query["query_ticket"], candidate),
        same_contact_phone=candidate.get("same_contact_phone"),
    )
    similarity, components = combine(signals, parameters.to_fast())
    breakdown: dict[str, float | None] = dict.fromkeys(SIGNAL_KEYS.values())
    for component in components:
        breakdown[SIGNAL_KEYS[component["name"]]] = component["score"]
    return similarity, breakdown


def parse_number_list(raw: str) -> list[float]:
    """Comma-separated numbers, at least one."""
    values = [float(value) for value in raw.split(",") if value.strip()]
    if not values:
        raise argparse.ArgumentTypeError("list must contain at least one number")
    return values


def parse_timestamp(raw: str) -> datetime:
    """ISO 8601, `Z` included."""
    return datetime.fromisoformat(raw)


def haversine_m(first: list[float], second: list[float]) -> float:
    """Great-circle distance in metres between two [lon, lat] points."""
    lon1, lat1 = map(math.radians, first)
    lon2, lat2 = map(math.radians, second)
    value = (
        math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(value))


def legacy_fixture_queries(payload: dict[str, Any], include_text: bool = False) -> dict[str, Any]:
    """Adapt pair fixtures without upgrading their labels to ground truth.

    The pair fixtures' ticket rows do carry title/description, but they are hand-authored and were
    never written with a text signal in mind, so they are dropped unless `include_text` is set.
    """
    queries: list[dict[str, Any]] = []
    for case in payload["cases"]:
        geometries = {row["uuid"]: row for row in case["rows"]["base_geometries"]}
        tickets = {row["uuid"]: row for row in case["rows"]["tickets"]}
        ordered = sorted(
            geometries.values(), key=lambda row: (parse_timestamp(row["created_at"]), row["uuid"])
        )
        if len(ordered) != 2:
            raise ValueError(f"{case['case_id']}: legacy adapter requires exactly two geometries")
        candidate_geometry, query_geometry = ordered
        candidate_id = candidate_geometry["uuid"]
        query_id = query_geometry["uuid"]
        age_min = (
            parse_timestamp(query_geometry["created_at"]) - parse_timestamp(candidate_geometry["created_at"])
        ).total_seconds() / 60
        distance_m = haversine_m(
            query_geometry["geometry"]["coordinates"], candidate_geometry["geometry"]["coordinates"]
        )
        old_expectation = case["expectation"]["layer"]
        provisional = "distinct" if old_expectation == "no_trigger" else "duplicate"
        queries.append(
            {
                "query_id": case["case_id"],
                "event_group": "legacy-hand-authored-fixtures",
                "query_ticket": {
                    "ticket_id": query_id,
                    "created_at": query_geometry["created_at"],
                    "task_type": tickets[query_id].get("task_type"),
                    **text_fields(tickets[query_id], include_text),
                },
                "retrieval": {
                    "was_executed": True,
                    "fail_open_reason": None,
                    "candidate_ids": [candidate_id],
                },
                "candidates": [
                    {
                        "ticket_id": candidate_id,
                        "distance_m": distance_m,
                        "age_min": age_min,
                        "task_type": tickets[candidate_id].get("task_type"),
                        **text_fields(tickets[candidate_id], include_text),
                    }
                ],
                "ground_truth": {
                    "adjudication_complete": False,
                    "confirmed_duplicate_candidate_ids": [],
                    "rejected_candidate_ids": [],
                },
                "provisional_expectation": {
                    "class": provisional,
                    "duplicate_candidate_ids": [candidate_id] if provisional == "duplicate" else [],
                    "source": f"legacy {case['case_id']} expectation.layer",
                    "legacy_expected_behavior": old_expectation,
                },
                "observed_hint_behavior": {
                    "hint_was_shown": None,
                    "hinted_candidate_id": None,
                    "outcome": "not_observed",
                },
            }
        )
    return {"schema_version": 1, "dataset_id": "legacy-fixtures-provisional", "queries": queries}


def text_fields(ticket: dict[str, Any], include_text: bool) -> dict[str, Any]:
    """A fixture ticket's title/description, or nothing when text is off."""
    if not include_text:
        return {}
    return {"title": ticket.get("title"), "description": ticket.get("description")}


def load_dataset(path: Path, legacy: bool, legacy_include_text: bool = False) -> dict[str, Any]:
    """Read a query-level dataset, or adapt the old pair fixtures when `legacy`."""
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if legacy:
        return legacy_fixture_queries(payload, include_text=legacy_include_text)
    return payload


def validate_dataset(dataset: dict[str, Any], label_set: str) -> None:  # noqa: C901
    """Raise ValueError (TypeError for a wrong shape) on anything the evaluation would miscount."""
    if dataset.get("schema_version") != 1:
        raise ValueError("schema_version must be 1")
    queries = dataset.get("queries")
    if not isinstance(queries, list) or not queries:
        raise ValueError("queries must be a non-empty array")
    seen_query_ids: set[str] = set()
    for query in queries:
        query_id = query.get("query_id")
        if not isinstance(query_id, str) or not query_id:
            raise ValueError("each query must have a non-empty query_id")
        if query_id in seen_query_ids:
            raise ValueError(f"duplicate query_id: {query_id}")
        seen_query_ids.add(query_id)
        candidate_ids = query.get("retrieval", {}).get("candidate_ids")
        if not isinstance(candidate_ids, list):
            raise TypeError(f"{query_id}: retrieval.candidate_ids must be an array")
        candidates = query.get("candidates")
        if not isinstance(candidates, list):
            raise TypeError(f"{query_id}: candidates must be an array")
        indexed_ids = {candidate.get("ticket_id") for candidate in candidates}
        if len(indexed_ids) != len(candidates) or None in indexed_ids:
            raise ValueError(f"{query_id}: candidate ticket_ids must be unique strings")
        if not set(candidate_ids).issubset(indexed_ids):
            raise ValueError(f"{query_id}: every retrieved candidate needs feature data in candidates")
        for candidate in candidates:
            if candidate["ticket_id"] not in candidate_ids:
                continue
            for key in ("distance_m", "age_min"):
                value = candidate.get(key)
                if not isinstance(value, int | float) or value < 0:
                    raise ValueError(f"{query_id}/{candidate['ticket_id']}: {key} must be >= 0")
            same_phone = candidate.get("same_contact_phone")
            if same_phone is not None and not isinstance(same_phone, bool):
                raise ValueError(
                    f"{query_id}/{candidate['ticket_id']}: same_contact_phone must be true, false or null"
                )
            precomputed = candidate.get("text_similarity")
            if precomputed is not None and (
                not isinstance(precomputed, int | float) or not 0 <= precomputed <= 1
            ):
                raise ValueError(
                    f"{query_id}/{candidate['ticket_id']}: text_similarity must be null or within [0, 1]"
                )
            for record in (candidate, query.get("query_ticket", {})):
                for key in ("title", "description"):
                    if record.get(key) is not None and not isinstance(record[key], str):
                        raise ValueError(f"{query_id}: {key} must be a string or null")
        truth = query.get("ground_truth", {})
        confirmed = set(truth.get("confirmed_duplicate_candidate_ids", []))
        rejected = set(truth.get("rejected_candidate_ids", []))
        if confirmed & rejected:
            raise ValueError(f"{query_id}: an id cannot be confirmed and rejected")
        if truth.get("adjudication_complete") and not indexed_ids.issubset(confirmed | rejected):
            raise ValueError(
                f"{query_id}: adjudication_complete requires a decision for every candidate with feature data"
            )
        if label_set == "provisional":
            provisional_class = query.get("provisional_expectation", {}).get("class")
            if provisional_class not in {"duplicate", "distinct", "unknown"}:
                raise ValueError(f"{query_id}: provisional_expectation.class is invalid")


def labels_for(query: dict[str, Any], label_set: str) -> tuple[str | None, set[str]]:
    """The query's class ("duplicate"/"distinct", None = skip) and its duplicate candidate ids."""
    if label_set == "confirmed":
        truth = query["ground_truth"]
        if not truth.get("adjudication_complete"):
            return None, set()
        duplicate_ids = set(truth.get("confirmed_duplicate_candidate_ids", []))
        return ("duplicate" if duplicate_ids else "distinct"), duplicate_ids
    provisional = query["provisional_expectation"]
    query_class = provisional["class"]
    duplicate_ids = set(provisional.get("duplicate_candidate_ids", []))
    return (None if query_class == "unknown" else query_class), duplicate_ids


def safe_ratio(numerator: int, denominator: int) -> float | None:
    """The ratio, or None when the denominator is zero (nothing was measured)."""
    return numerator / denominator if denominator else None


def evaluate(dataset: dict[str, Any], parameters: Parameters, label_set: str) -> dict[str, Any]:
    """Score every query's retrieved candidates, keep the top one, and count the metrics."""
    duplicate_queries = 0
    distinct_queries = 0
    retrieved_duplicates = 0
    correct_top_ones = 0
    correct_duplicate_hints = 0
    false_hints = 0
    hinted_queries = 0
    wrong_top_hints = 0
    evaluated_queries = 0
    rows: list[dict[str, Any]] = []

    for query in dataset["queries"]:
        query_class, duplicate_ids = labels_for(query, label_set)
        if query_class is None:
            continue
        evaluated_queries += 1
        retrieved_ids = set(query["retrieval"]["candidate_ids"])
        if query_class == "duplicate":
            duplicate_queries += 1
            if duplicate_ids & retrieved_ids:
                retrieved_duplicates += 1
        else:
            distinct_queries += 1

        candidate_by_id = {candidate["ticket_id"]: candidate for candidate in query["candidates"]}
        scored = [
            (score_candidate(query, candidate_by_id[candidate_id], parameters)[0], candidate_id)
            for candidate_id in sorted(retrieved_ids)
        ]
        scored.sort(key=lambda item: (-item[0], item[1]))
        top = scored[0] if scored else None
        top_is_duplicate = bool(top and top[1] in duplicate_ids)
        if query_class == "duplicate" and top_is_duplicate:
            correct_top_ones += 1
        hint_shown = bool(top and top[0] >= parameters.hint_threshold)
        if hint_shown:
            hinted_queries += 1
            if not top_is_duplicate:
                wrong_top_hints += 1
            if query_class == "distinct":
                false_hints += 1
            elif top_is_duplicate:
                correct_duplicate_hints += 1
        rows.append(
            {
                "query_id": query["query_id"],
                "class": query_class,
                "top_candidate_id": top[1] if top else None,
                "top_score": top[0] if top else None,
                "top_is_duplicate": top_is_duplicate,
                "hint_shown": hint_shown,
            }
        )

    return {
        "counts": {
            "evaluated_queries": evaluated_queries,
            "duplicate_queries": duplicate_queries,
            "distinct_queries": distinct_queries,
            "hinted_queries": hinted_queries,
        },
        "metrics": {
            "candidate_retrieval_recall": safe_ratio(retrieved_duplicates, duplicate_queries),
            "top_1_recall": safe_ratio(correct_top_ones, duplicate_queries),
            "duplicate_hint_recall": safe_ratio(correct_duplicate_hints, duplicate_queries),
            "false_hint_rate": safe_ratio(false_hints, distinct_queries),
            "wrong_top_hint_rate": safe_ratio(wrong_top_hints, hinted_queries),
        },
        "query_results": rows,
    }


def parameter_grid(args: argparse.Namespace) -> Iterable[Parameters]:
    """Every combination of the grid flags that has some positive weight."""
    for values in itertools.product(
        args.distance_half_m,
        args.time_half_min,
        args.distance_weight,
        args.time_weight,
        args.task_type_weight,
        args.text_weight,
        args.hint_threshold,
        args.phone_bonus,
    ):
        parameters = Parameters(*values)
        weights = (
            parameters.distance_weight,
            parameters.time_weight,
            parameters.task_type_weight,
            parameters.text_weight,
        )
        if sum(weights) > 0:
            yield parameters


def metric_for_sort(value: float | None, default: float) -> float:
    """A metric, or `default` when it could not be measured."""
    return default if value is None else value


def grid_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
    """Recall first; at equal hint recall, fewer false and wrong hints; then deterministic ties."""
    metrics = item["result"]["metrics"]
    return (
        -metric_for_sort(metrics["duplicate_hint_recall"], -1),
        metric_for_sort(metrics["false_hint_rate"], 1),
        metric_for_sort(metrics["wrong_top_hint_rate"], 1),
        -metric_for_sort(metrics["top_1_recall"], -1),
        *(item["parameters"][name] for name in PARAMETER_FIELDS),
    )


def serialise_parameters(parameters: Parameters) -> dict[str, float]:
    """Parameters as a JSON object."""
    return {name: getattr(parameters, name) for name in PARAMETER_FIELDS}


def build_parser() -> argparse.ArgumentParser:
    """The command-line flags."""
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument(
        "--legacy-fixtures",
        action="store_true",
        help="adapt the old pair fixtures as provisional labels in memory",
    )
    parser.add_argument(
        "--legacy-include-text",
        action="store_true",
        help="with --legacy-fixtures, also carry the fixtures' title/description into the text signal",
    )
    parser.add_argument("--label-set", choices=("confirmed", "provisional"), default="confirmed")
    parser.add_argument("--distance-half-m", type=parse_number_list, default=[25, 50, 100, 200])
    parser.add_argument("--time-half-min", type=parse_number_list, default=[5, 15, 60, 360])
    parser.add_argument("--distance-weight", type=parse_number_list, default=[0.5, 1, 2])
    parser.add_argument("--time-weight", type=parse_number_list, default=[0.5, 1, 2])
    parser.add_argument("--task-type-weight", type=parse_number_list, default=[0, 0.5, 1, 2])
    parser.add_argument(
        "--text-weight",
        "--text-weights",
        dest="text_weight",
        type=parse_number_list,
        default=[1],
        help="text signal weight(s); default 1 is the engine's value. Irrelevant when no query carries text.",
    )
    parser.add_argument(
        "--hint-threshold", type=parse_number_list, default=[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    )
    parser.add_argument(
        "--phone-bonus",
        type=parse_number_list,
        default=[FastParameters.phone_bonus],
        help="phone bonus value(s); default is the engine's. Irrelevant without same_contact_phone: true.",
    )
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument(
        "--evaluate",
        metavar="D_HALF,T_HALF,D_WEIGHT,T_WEIGHT,TYPE_WEIGHT,TEXT_WEIGHT,THRESHOLD[,PHONE_BONUS]",
        help="evaluate one parameter set instead of grid-searching; PHONE_BONUS defaults to the engine's",
    )
    return parser


def _evaluate_one(dataset: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    values = parse_number_list(args.evaluate)
    if len(values) not in (len(PARAMETER_FIELDS) - 1, len(PARAMETER_FIELDS)):
        count = len(PARAMETER_FIELDS)
        raise ValueError(f"--evaluate requires {count - 1} or {count} comma-separated values")
    parameters = Parameters(*values)
    return {
        "dataset_id": dataset.get("dataset_id"),
        "label_set": args.label_set,
        "warning": (
            "provisional fixture expectations are not production ground truth"
            if args.label_set == "provisional"
            else None
        ),
        "parameters": serialise_parameters(parameters),
        "result": evaluate(dataset, parameters, args.label_set),
    }


def _grid_search(dataset: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    results = [
        {"parameters": serialise_parameters(p), "result": evaluate(dataset, p, args.label_set)}
        for p in parameter_grid(args)
    ]
    results.sort(key=grid_sort_key)
    label_counts = (
        results[0]["result"]["counts"]
        if results
        else {"evaluated_queries": 0, "duplicate_queries": 0, "distinct_queries": 0}
    )
    grid_comparable = bool(label_counts["duplicate_queries"] and label_counts["distinct_queries"])
    warnings = []
    if args.label_set == "provisional":
        warnings.append("provisional fixture expectations are not production ground truth")
    if not grid_comparable:
        warnings.append(
            "grid ranking requires at least one fully labeled duplicate query "
            "and one fully labeled distinct query"
        )
    return {
        "dataset_id": dataset.get("dataset_id"),
        "label_set": args.label_set,
        "warnings": warnings,
        "label_counts": label_counts,
        "grid_comparable": grid_comparable,
        "production_tuning_ready": args.label_set == "confirmed" and grid_comparable,
        "grid_size": len(results),
        "ranking_policy": (
            "maximize duplicate_hint_recall, then minimize false_hint_rate "
            "and wrong_top_hint_rate; remaining ties are deterministic only"
        ),
        "top_results": results[: max(args.top, 0)] if grid_comparable else [],
    }


def main() -> int:
    """Evaluate one parameter set (`--evaluate`) or grid-search, printing JSON."""
    args = build_parser().parse_args()
    try:
        dataset = load_dataset(args.dataset, args.legacy_fixtures, args.legacy_include_text)
        validate_dataset(dataset, args.label_set)
        output = _evaluate_one(dataset, args) if args.evaluate else _grid_search(dataset, args)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
