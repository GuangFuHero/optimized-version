"""Contract tests every ADR-304 engine must pass (Spec 020 §8), against a real database.

Owned by the backend: they check what the backend relies on — shapes, determinism, read-only,
evidence hygiene, speed — not whether the algorithm is any good.
"""

import os

os.environ["ENV"] = "testing"

import json
import math
import re
import time
import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select, text

from app.dedup_engine.contract import (
    GeoPoint,
    NewStation,
    NewTask,
    NewTicket,
    StationDraft,
    TaskDraft,
    TicketDraft,
    kind_of_ref,
)
from app.dedup_engine.fast import FastEngine
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

pytestmark = pytest.mark.asyncio

ENGINES = [FastEngine()]
PERF_BUDGET_MS = 200  # provisional (spec §9, plan Task 0)
PERF_CANDIDATES = 500
NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)
MARK = "⟦MARK-7f3a⟧"


@pytest.fixture(params=ENGINES, ids=lambda e: e.version)
def engine(request):
    """Each engine under contract."""
    return request.param


async def _world(db, *, tasks_per_ticket=2, tickets=10, text="一樓淹水需要抽水機") -> Tickets:
    """Open tickets and tasks spread around HERE, plus a station; returns one ticket."""
    owner = User(name=f"contract-{uuid_mod.uuid4().hex[:6]}")
    db.add(owner)
    await db.flush()
    first = None
    for i in range(tickets):
        ticket = Tickets(
            geometry=from_shape(Point(HERE.lon + 0.00003 * i, HERE.lat), srid=4326),
            title="淹水",
            status="pending",
            priority="high",
            visibility="public",
            contact_name="王",
            created_by=owner.uuid,
        )
        db.add(ticket)
        await db.flush()
        first = first or ticket
        for j in range(tasks_per_ticket):
            db.add(
                TicketTask(
                    ticket_uuid=ticket.uuid,
                    task_type="rescue",
                    task_name=f"{text}{j}",
                    task_description="水深及膝",
                    status="pending",
                    created_by=owner.uuid,
                    created_at=NOW - timedelta(minutes=5 + i),
                )
            )
    db.add(
        Station(
            geometry=from_shape(Point(HERE.lon, HERE.lat), srid=4326),
            name="光復國小臨時收容所",
            type="shelter",
            level=0,
            visibility="public",
            operational_status="active",
            created_by=owner.uuid,
        )
    )
    await db.flush()
    return first


def _submissions(ticket_uuid: str):
    pump = TaskDraft(task_type="rescue", task_name="一樓淹水需要抽水機0", task_description="水深及膝")
    return [
        NewTicket(ticket=TicketDraft(location=HERE, title="淹水"), tasks=(pump, pump, pump)),
        NewTask(ticket_uuid=ticket_uuid, task=pump),
        NewStation(station=StationDraft(location=HERE, name="光復國小臨時收容所", type="shelter")),
    ]


async def _counts(db) -> dict[str, int]:
    models = (Tickets, TicketTask, Station, DuplicatePair, DedupAuditEvent, User)
    return {m.__name__: (await db.execute(select(func.count()).select_from(m))).scalar_one() for m in models}


async def test_suspect_shapes(db, engine):
    """Items 1: similarity in [0,1], at most one suspect per draft, kind matches the draft."""
    ticket = await _world(db)
    for submission in _submissions(str(ticket.uuid)):
        suspects = await engine.check(db, submission, NOW)
        refs = [s.draft_ref for s in suspects]
        assert len(refs) == len(set(refs)), refs
        for s in suspects:
            assert 0.0 <= s.similarity <= 1.0
            assert s.related_kind == kind_of_ref(s.draft_ref)
            assert s.related_ticket_uuid is None or s.related_kind == "ticket_task"


async def test_deterministic(db, engine):
    """Item 2: same data, same submission, same answer."""
    ticket = await _world(db)
    for submission in _submissions(str(ticket.uuid)):
        assert await engine.check(db, submission, NOW) == await engine.check(db, submission, NOW)


async def test_empty_database_means_no_suspects(db, engine):
    """Item 3."""
    for submission in _submissions(str(uuid_mod.uuid4())):
        assert list(await engine.check(db, submission, NOW)) == []


async def _wrote_anything(db) -> bool:
    """Whether this transaction has written, even if the write was later rolled back.

    Postgres assigns a transaction id on the first write only, so a read-only transaction has
    none. Checking the session alone is not enough: an engine's own query autoflushes whatever it
    added, which empties `session.new`, and the savepoint rollback then hides it from row counts.
    """
    return (await db.execute(text("SELECT pg_current_xact_id_if_assigned()"))).scalar() is not None


async def test_read_only(db, engine):
    """Item 4: the engine never writes — no transaction id assigned, nothing pending, nothing left."""
    ticket_uuid = str((await _world(db)).uuid)  # before the commit expires it
    await db.commit()
    before = await _counts(db)
    for submission in _submissions(ticket_uuid):
        assert not await _wrote_anything(db)
        savepoint = await db.begin_nested()
        for s in await engine.check(db, submission, NOW):
            await engine.score(db, submission, s.draft_ref, s.related_kind, s.related_uuid, NOW)
        assert not (db.new or db.dirty or db.deleted)
        assert not await _wrote_anything(db), f"{engine.version} wrote during {type(submission).__name__}"
        await savepoint.rollback()
    assert await _counts(db) == before


async def test_evidence_is_json_and_echoes_no_text(db, engine):
    """Item 5 (ADR-295)."""
    ticket = await _world(db, text=f"{MARK}淹水")
    draft = TaskDraft(task_type="rescue", task_name=f"{MARK}淹水0", task_description="水深及膝")
    submissions = [
        NewTicket(ticket=TicketDraft(location=HERE, title=MARK), tasks=(draft,)),
        NewTask(str(ticket.uuid), draft),
    ]
    seen = 0
    for submission in submissions:
        for s in await engine.check(db, submission, NOW):
            assert MARK not in json.dumps(s.evidence, ensure_ascii=False)
            seen += 1
    assert seen, "the fixture should produce suspects to inspect"


async def test_empty_optional_fields(db, engine):
    """Item 6: drafts with every optional field empty still check and score."""
    ticket = await _world(db)
    bare_task = TaskDraft(task_type="rescue", task_name="")
    for submission in (
        NewTicket(ticket=TicketDraft(location=HERE, title=""), tasks=(bare_task,)),
        NewTask(str(ticket.uuid), bare_task),
        NewStation(StationDraft(location=HERE)),
    ):
        await engine.check(db, submission, NOW)


async def test_fast_enough(db, engine):
    """Item 7: PERF_CANDIDATES nearby open tasks checked within the budget (best of three)."""
    await _world(db, tickets=PERF_CANDIDATES // 5, tasks_per_ticket=5)
    await db.commit()
    submission = NewTicket(
        ticket=TicketDraft(location=HERE, title="淹水"),
        tasks=(TaskDraft(task_type="rescue", task_name="一樓淹水需要抽水機0", task_description="水深及膝"),),
    )
    best = math.inf
    for _ in range(3):
        start = time.perf_counter()
        await engine.check(db, submission, NOW)
        best = min(best, (time.perf_counter() - start) * 1000)
    assert best < PERF_BUDGET_MS, f"{best:.0f} ms for {PERF_CANDIDATES} candidates"


def test_version_format(engine):
    """Item 8 (ADR-297)."""
    assert re.fullmatch(r"[a-z]+-v[1-9][0-9]*", engine.version)
