"""Fixed inputs whose outputs are pinned in golden/<engine>.json (ADR-297).

Any change to what an engine returns for these inputs must come with a version bump. Add
cases freely; changing or removing one changes the golden file and so needs a bump too.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.dedup_engine.contract import Candidate, GeoPoint, SnapshotEngine, StationSnapshot, TicketSnapshot

GOLDEN_DIR = Path(__file__).resolve().parent / "golden"
NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)
PRECISION = 6  # float tails must not make the golden test flaky


def golden_path(engine: SnapshotEngine) -> Path:
    """golden/fast.json for fast-v1, fast-v2, …: one file per engine family."""
    return GOLDEN_DIR / f"{engine.version.rsplit('-v', 1)[0]}.json"


def _ticket(uuid=None, *, minutes_ago=0.0, **fields) -> TicketSnapshot:
    base = {
        "title": "民生街三段淹水需要抽水機",
        "description": "一樓積水到膝蓋，需要抽水機",
        "task_type": "rescue",
    }
    return TicketSnapshot(
        uuid=uuid, location=HERE, created_at=NOW - timedelta(minutes=minutes_ago), **(base | fields)
    )


def _station(uuid=None, *, minutes_ago=0.0, **fields) -> StationSnapshot:
    base = {"name": "光復國小臨時收容所", "description": "可收容 200 人，有熱食", "type": "shelter"}
    return StationSnapshot(
        uuid=uuid, location=HERE, created_at=NOW - timedelta(minutes=minutes_ago), **(base | fields)
    )


def _c(snapshot, distance_m, phone=None) -> Candidate:
    return Candidate(snapshot=snapshot, distance_m=distance_m, same_contact_phone=phone)


CASES: dict[str, tuple[Any, list[Candidate]]] = {
    "ticket_near_identical": (_ticket(), [_c(_ticket("t-near", minutes_ago=12), 8.0)]),
    "ticket_far_unrelated": (
        _ticket(),
        [
            _c(
                _ticket(
                    "t-far",
                    minutes_ago=4000,
                    title="需要志工搬物資",
                    description="倉庫缺人手",
                    task_type="hr",
                ),
                450,
            )
        ],
    ),
    "ticket_on_the_boundary": (_ticket(), [_c(_ticket("t-edge"), 147.3931188332412)]),
    "ticket_just_beyond_the_boundary": (_ticket(), [_c(_ticket("t-out"), 148.5)]),
    "ticket_same_place_different_type": (_ticket(), [_c(_ticket("t-type", task_type="medical"), 5.0)]),
    "ticket_submission_without_type": (_ticket(task_type=None), [_c(_ticket("t-a"), 30.0)]),
    "ticket_candidate_without_text": (_ticket(), [_c(_ticket("t-blank", title="", description=None), 10.0)]),
    "ticket_submission_punctuation_only": (
        _ticket(title="！！！", description="？"),
        [_c(_ticket("t-b"), 10.0)],
    ),
    "ticket_old_candidate": (_ticket(), [_c(_ticket("t-old", minutes_ago=2880), 10.0)]),
    "ticket_candidate_in_the_future": (_ticket(), [_c(_ticket("t-skew", minutes_ago=-30), 10.0)]),
    "ticket_similar_wording": (
        _ticket(title="民生街淹水 需要抽水機", description="積水"),
        [_c(_ticket("t-sim", minutes_ago=45), 60.0)],
    ),
    "ticket_english_text": (
        _ticket(title="Flooded basement, need pump", description=None, task_type=None),
        [_c(_ticket("t-en", title="need a pump: basement flooded", description=None, task_type=None), 20.0)],
    ),
    "ticket_long_text_truncated": (
        _ticket(title="抽水機" + "x" * 300, description="淹水" * 3000 + "甲"),
        [_c(_ticket("t-long", title="抽水機" + "x" * 300, description="淹水" * 3000 + "乙"), 15.0)],
    ),
    "ticket_same_phone_flag": (_ticket(), [_c(_ticket("t-phone", minutes_ago=200), 90.0, phone=True)]),
    "ticket_ranking_and_ties": (
        _ticket(),
        [
            _c(_ticket("t-3"), 60.0),
            _c(_ticket("t-2"), 5.0),
            _c(_ticket("t-1"), 5.0),
            _c(_ticket("t-weak", title="完全不同", description=None, task_type="hr"), 120.0),
        ],
    ),
    "ticket_no_candidates": (_ticket(), []),
    "station_near_identical": (_station(), [_c(_station("s-near", minutes_ago=10), 12.0)]),
    "station_ancient_is_not_penalised": (_station(), [_c(_station("s-old", minutes_ago=10_000_000), 12.0)]),
    "station_different_type": (_station(), [_c(_station("s-type", type="supply"), 12.0)]),
    "station_just_beyond_the_boundary": (_station(), [_c(_station("s-out"), 125.0)]),
    "station_without_name": (_station(name=None), [_c(_station("s-a", name=None), 20.0)]),
}


def compute(engine: SnapshotEngine) -> dict[str, Any]:
    """Every case's `rank` and per-candidate `score`, rounded for a stable comparison."""

    def dump(match) -> dict[str, Any]:
        return {
            "candidate_uuid": match.candidate_uuid,
            "similarity": round(match.similarity, PRECISION),
            "evidence": match.evidence,
        }

    return {
        name: {
            "rank": [dump(m) for m in engine.rank(submission, candidates, NOW)],
            "score": [dump(engine.score(submission, c, NOW)) for c in candidates],
        }
        for name, (submission, candidates) in CASES.items()
    }
