"""Fixed database contents and submissions whose fast-v2 outputs are pinned (ADR-297, ADR-304).

Everything is deterministic: fixed uuids, fixed timestamps relative to NOW. Add cases freely;
changing or removing one changes the golden file and so needs a version bump.
"""

import json
import uuid as uuid_mod
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.dedup_engine.contract import (
    GeoPoint,
    NewStation,
    NewTask,
    NewTicket,
    StationDraft,
    TaskDraft,
    TicketDraft,
)
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

GOLDEN = Path(__file__).resolve().parent / "golden" / "fast.json"
NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)
DEG_100M = 0.00098
PRECISION = 6


def _u(n: int) -> uuid_mod.UUID:
    return uuid_mod.UUID(f"00000000-0000-0000-0000-{n:012d}")


OWNER = _u(1)
T_FLOOD, T_DONE, T_FAR, T_CANCELLED = _u(10), _u(11), _u(12), _u(13)


async def seed(db) -> None:
    """The fixed world every case runs against."""
    db.add(User(uuid=OWNER, name="golden"))
    await db.flush()

    def ticket(uuid, east_deg, **extra):
        fields = {
            "title": "淹水",
            "status": "pending",
            "priority": "high",
            "visibility": "public",
            "contact_name": "王",
        }
        return Tickets(
            uuid=uuid,
            geometry=from_shape(Point(HERE.lon + east_deg, HERE.lat), srid=4326),
            created_by=OWNER,
            **(fields | extra),
        )

    def task(uuid, ticket_uuid, minutes_ago, **extra):
        fields = {
            "task_type": "rescue",
            "task_name": "一樓淹水需要抽水機",
            "task_description": "水深及膝",
            "status": "pending",
        }
        return TicketTask(
            uuid=uuid,
            ticket_uuid=ticket_uuid,
            created_by=OWNER,
            created_at=NOW - timedelta(minutes=minutes_ago),
            **(fields | extra),
        )

    db.add_all(
        [
            ticket(T_FLOOD, 0.0),
            ticket(T_DONE, DEG_100M * 0.5, status="completed"),
            ticket(T_FAR, DEG_100M * 3),
            ticket(T_CANCELLED, 0.0, status="cancelled"),
        ]
    )
    await db.flush()
    db.add_all(
        [
            task(_u(100), T_FLOOD, 15),
            task(
                _u(101), T_FLOOD, 30, task_type="supply", task_name="需要飲用水", task_description="二十人份"
            ),
            task(_u(102), T_DONE, 120, task_name="淹水 需要抽水機"),
            task(_u(103), T_FAR, 5),
            task(_u(104), T_CANCELLED, 5),
            task(_u(105), T_FLOOD, 5, status="fulfilled"),
        ]
    )
    db.add(
        Station(
            uuid=_u(200),
            geometry=from_shape(Point(HERE.lon, HERE.lat), srid=4326),
            name="光復國小臨時收容所",
            description="可收容 200 人",
            type="shelter",
            level=0,
            visibility="public",
            operational_status="active",
            created_by=OWNER,
        )
    )
    await db.flush()


PUMP = TaskDraft(task_type="rescue", task_name="一樓淹水需要抽水機", task_description="水深及膝")
WATER = TaskDraft(task_type="supply", task_name="需要飲用水", task_description="二十人份")
MOVE = TaskDraft(task_type="hr", task_name="搬運物資", task_description=None)

CASES: dict[str, Any] = {
    "new_ticket_three_tasks": NewTicket(
        ticket=TicketDraft(location=HERE, title="民生街淹水"), tasks=(PUMP, WATER, MOVE)
    ),
    "new_ticket_no_tasks": NewTicket(ticket=TicketDraft(location=HERE, title="民生街淹水")),
    "new_ticket_far_away": NewTicket(
        ticket=TicketDraft(location=GeoPoint(HERE.lon + DEG_100M * 30, HERE.lat), title="x"), tasks=(PUMP,)
    ),
    "add_task_to_the_flood_ticket": NewTask(ticket_uuid=str(T_FLOOD), task=PUMP),
    "add_task_to_a_missing_ticket": NewTask(ticket_uuid=str(_u(999)), task=PUMP),
    "new_station": NewStation(
        station=StationDraft(
            location=HERE, name="光復國小臨時收容所", description="可收容 200 人", type="shelter"
        )
    ),
    "new_station_other_type": NewStation(station=StationDraft(location=HERE, name="光復國小", type="supply")),
}
SCORED = {
    "score_far_task": ("new_ticket_three_tasks", "task:2", "ticket_task", str(_u(103))),
    "score_closed_task": ("new_ticket_three_tasks", "task:0", "ticket_task", str(_u(105))),
}


def _dump(suspect) -> dict[str, Any] | None:
    if suspect is None:
        return None
    return {
        "draft_ref": suspect.draft_ref,
        "related_kind": suspect.related_kind,
        "related_uuid": suspect.related_uuid,
        "related_ticket_uuid": suspect.related_ticket_uuid,
        "similarity": round(suspect.similarity, PRECISION),
        "evidence": suspect.evidence,
    }


async def compute(engine, db) -> dict[str, Any]:
    """Every case's `check`, and the named pairs' `score`, as plain JSON."""
    out: dict[str, Any] = {}
    for name, submission in CASES.items():
        out[name] = [_dump(s) for s in await engine.check(db, submission, NOW)]
    for name, (case, ref, kind, uuid) in SCORED.items():
        out[name] = _dump(await engine.score(db, CASES[case], ref, kind, uuid, NOW))
    return json.loads(json.dumps(out, ensure_ascii=False))


def write_golden(path: Path, version: str, cases: dict[str, Any]) -> str:
    """Write the golden file unless outputs changed under the same version. Returns what happened."""
    new = {"version": version, "cases": cases}
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
        if old == new:
            return "unchanged"
        if old["version"] == version:
            return "refused: outputs changed but the version did not — bump it and add a CHANGELOG entry"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(new, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return "written"
