"""Resolving a duplicate pair card (Spec 028 §3.5, ADR-365–375): the service, on a real database.

What a request means is tested without a database in test_dedup_resolve_plan.py; this checks that
the plan lands — tickets, needs, items, claims, the card and its event — and the guards around it.
"""

import asyncio
import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, AUDITED_TABLES, get_audit_trigger_sql
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import BaseGeometry
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.schemas.duplicate_pair import ResolveRequest
from app.services import dedup_resolve, dedup_review
from app.services.dedup_resolve_plan import ResolveRefused
from app.services.dedup_review import DuplicatePairConflictError
from tests.conftest import TEST_DB_URL
from tests.test_dedup_review_read import _actor

pytestmark = pytest.mark.asyncio

LON, LAT = 121.43, 23.67


async def _user(db, name: str) -> User:
    user = User(name=name)
    db.add(user)
    await db.flush()
    return user


async def _ticket(db, owner, title: str) -> Tickets:
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title=title,
        status="pending",
        priority="high",
        contact_name="李",
        contact_phone="0912345678",
        disaster_types=[],
        created_by=owner.uuid,
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _need(db, owner, ticket, task_type: str, name: str, quantity: int, status="pending") -> TicketTask:
    task = TicketTask(
        ticket_uuid=ticket.uuid,
        task_type=task_type,
        task_name=name,
        quantity=quantity,
        status=status,
        created_by=owner.uuid,
    )
    db.add(task)
    await db.flush()
    return task


async def _item(db, task, name: str) -> TaskProperty:
    prop = TaskProperty(task_uuid=task.uuid, property_name=name, property_value="5", quantity=5)
    db.add(prop)
    await db.flush()
    return prop


async def _on(db, task, *people) -> None:
    for person in people:
        db.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=person.uuid))
    await db.flush()


async def _world(db, *, a1_status="pending"):
    """A: human 2 (item 手套), water 1. B: human 5 (item 鏟子), water 5, food 3. A card between a1 and b1.

    Volunteers: v1 on a1; v2 on a1 and b1; v3 on b1; v4 on b3.
    """
    owner_a, owner_b = await _user(db, "A 的開單者"), await _user(db, "B 的開單者")
    v1, v2, v3, v4 = [await _user(db, f"志工 {n}") for n in range(1, 5)]
    a, b = await _ticket(db, owner_a, "A 一樓淹水"), await _ticket(db, owner_b, "B 一樓淹水")
    a1 = await _need(db, owner_a, a, "hr", "清淤", 2, status=a1_status)
    a2 = await _need(db, owner_a, a, "supply", "飲用水", 1)
    b1 = await _need(db, owner_b, b, "hr", "清淤", 5)
    b2 = await _need(db, owner_b, b, "supply", "飲用水", 5)
    b3 = await _need(db, owner_b, b, "supply", "便當", 3)
    pa1, pb1 = await _item(db, a1, "手套"), await _item(db, b1, "鏟子")
    await _on(db, a1, v1, v2)
    await _on(db, b1, v2, v3)
    await _on(db, b3, v4)
    low, high = sorted([a1.uuid, b1.uuid], key=str)
    pair = DuplicatePair(
        entity_kind="ticket_task",
        low_uuid=low,
        high_uuid=high,
        evidence={"stub": True},
        method="fast_rule",
        engine_version="fast-v4",
        source_layer="fast",
        status="dup_ignored",
    )
    db.add(pair)
    await db.flush()
    reviewer = await _actor(db, Perm.AI_DUP_VIEW, Perm.AI_DUP_REVIEW)
    ids = {
        name: str(row.uuid)
        for name, row in dict(
            a=a,
            b=b,
            a1=a1,
            a2=a2,
            b1=b1,
            b2=b2,
            b3=b3,
            pa1=pa1,
            pb1=pb1,
            pair=pair,
            v1=v1,
            v2=v2,
            v3=v3,
            v4=v4,
            owner_a=owner_a,
            owner_b=owner_b,
        ).items()
    }
    ids["a_is_low"] = str(low) == ids["a1"]
    return reviewer, ids


async def _versions(db, reviewer, ids) -> dict:
    await db.refresh(reviewer)  # a commit earlier in the test expires it; a request reads it once
    detail = await dedup_review.get_pair(db, actor=reviewer, pair_uuid=uuid_mod.UUID(ids["pair"]))
    low, high = detail.tickets
    return {"low": low.version, "high": high.version}


def _example_one(ids, versions, **overrides) -> ResolveRequest:
    """B folds into A whole: human 2+5 → 7, water 1+5 → 6, food moves over."""
    body = {
        "primary": "low" if ids["a_is_low"] else "high",
        "expected_versions": versions,
        "primary_tasks": [
            {
                "task": ids["a1"],
                "action": "keep",
                "absorb": [ids["b1"]],
                "values": {"quantity": 7},
                "properties": [
                    {"property": ids["pa1"], "action": "keep"},
                    {"property": ids["pb1"], "action": "keep", "values": {"quantity": 3}},
                ],
            },
            {
                "task": ids["a2"],
                "action": "keep",
                "absorb": [ids["b2"]],
                "values": {"quantity": 6},
                "properties": [],
            },
        ],
        "secondary_tasks": [{"task": ids["b3"], "action": "move", "properties": []}],
        "note": "電話確認是同一戶",
    }
    body.update(overrides)
    return ResolveRequest.model_validate(body)


async def _resolve(db, reviewer, ids, request=None):
    request = request or _example_one(ids, await _versions(db, reviewer, ids))
    await db.refresh(reviewer)
    return await dedup_resolve.resolve(
        db, actor=reviewer, pair_uuid=uuid_mod.UUID(ids["pair"]), request=request
    )


async def _row(db, model, uuid: str):
    return (
        await db.execute(select(model).where(model.uuid == uuid).execution_options(populate_existing=True))
    ).scalar_one()


async def _people(db, task_uuid: str) -> set[str]:
    rows = await db.scalars(select(TaskAssignment.actor_uuid).where(TaskAssignment.task_uuid == task_uuid))
    return {str(p) for p in rows.all()}


# --- what lands -----------------------------------------------------------------------------


async def test_example_one_folds_b_into_a(db):
    """A ends with human 7, water 6 and the food; B and its folded needs are cancelled and point at A."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    a1, a2, b3 = [await _row(db, TicketTask, ids[k]) for k in ("a1", "a2", "b3")]
    assert (a1.quantity, a2.quantity) == (7, 6)
    assert str(b3.ticket_uuid) == ids["a"]
    b = await _row(db, Tickets, ids["b"])
    assert (b.status, b.delete_at is not None, str(b.replaced_by_uuid)) == ("cancelled", True, ids["a"])
    for folded, into in (("b1", "a1"), ("b2", "a2")):
        task = await _row(db, TicketTask, ids[folded])
        assert (task.status, task.delete_at is not None, str(task.merged_into_uuid)) == (
            "canceled",
            True,
            ids[into],
        )
    assert (await _row(db, Tickets, ids["a"])).delete_at is None


async def test_the_people_on_a_folded_need_move_and_count_once(db):
    """v2 was on a1 and b1: one assignment on a1 remains. v3 moves over. v4 moves with b3 (ADR-369)."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    assert await _people(db, ids["a1"]) == {ids["v1"], ids["v2"], ids["v3"]}
    assert await _people(db, ids["b1"]) == set()
    assert await _people(db, ids["b3"]) == {ids["v4"]}


async def test_items_follow_the_plan(db):
    """B's item hangs under a1 with its new quantity; A's stays."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    pb1 = await _row(db, TaskProperty, ids["pb1"])
    assert (str(pb1.task_uuid), pb1.quantity, pb1.delete_at) == (ids["a1"], 3, None)
    assert str((await _row(db, TaskProperty, ids["pa1"])).task_uuid) == ids["a1"]


async def test_example_two_cancels_what_was_not_chosen(db):
    """Only b1 folds in; b2 and a2 are cancelled with their item; b3 moves; B is still cancelled."""
    reviewer, ids = await _world(db)
    versions = await _versions(db, reviewer, ids)
    request = _example_one(
        ids,
        versions,
        primary_tasks=[
            {
                "task": ids["a1"],
                "action": "keep",
                "absorb": [ids["b1"]],
                "values": {"quantity": 7},
                "properties": [
                    {"property": ids["pa1"], "action": "keep"},
                    {"property": ids["pb1"], "action": "cancel"},
                ],
            },
            {"task": ids["a2"], "action": "cancel"},
        ],
        secondary_tasks=[
            {"task": ids["b2"], "action": "cancel"},
            {"task": ids["b3"], "action": "move", "properties": []},
        ],
    )

    await _resolve(db, reviewer, ids, request)

    for gone in ("a2", "b2"):
        task = await _row(db, TicketTask, ids[gone])
        assert (task.status, task.merged_into_uuid) == ("canceled", None)
    assert (await _row(db, TaskProperty, ids["pb1"])).delete_at is not None
    assert (await _row(db, Tickets, ids["b"])).status == "cancelled"


async def test_the_primary_tickets_fields_change(db):
    """Fields sent change, contacts included; fields left out stay."""
    reviewer, ids = await _world(db)
    versions = await _versions(db, reviewer, ids)
    request = _example_one(ids, versions, ticket={"title": "A＋B 一樓淹水", "contact_phone": " 0987654321 "})

    await _resolve(db, reviewer, ids, request)

    a = await _row(db, Tickets, ids["a"])
    assert (a.title, a.contact_phone, a.priority) == ("A＋B 一樓淹水", "0987654321", "high")


async def test_an_unknown_disaster_type_is_refused(db):
    """The vocabulary check needs the database, so it runs in the service (422)."""
    reviewer, ids = await _world(db)
    versions = await _versions(db, reviewer, ids)

    with pytest.raises(ValueError, match="災害型別"):
        await _resolve(
            db, reviewer, ids, _example_one(ids, versions, ticket={"disaster_types": ["no-such-type"]})
        )


async def test_the_card_is_confirmed_with_a_merged_event(db):
    """The card is confirmed by the reviewer; the event holds both tickets as they were (ADR-375)."""
    reviewer, ids = await _world(db)
    reviewer_uuid = str(reviewer.uuid)

    await _resolve(db, reviewer, ids)

    pair = await _row(db, DuplicatePair, ids["pair"])
    assert (pair.status, str(pair.reviewed_by)) == ("confirmed_duplicate", reviewer_uuid)
    (event,) = (await db.scalars(select(DedupAuditEvent).where(DedupAuditEvent.event_type == "merged"))).all()
    assert (str(event.primary_uuid), str(event.duplicate_uuid)) == (ids["a"], ids["b"])
    assert (event.reversible, event.decision_reason, event.source_layer) == (
        False,
        "電話確認是同一戶",
        "manual",
    )
    before = event.before_state["tickets"]
    a_before = before["low" if ids["a_is_low"] else "high"]
    a1_before = next(t for t in a_before["tasks"] if t["uuid"] == ids["a1"])
    assert (a1_before["quantity"], sorted(a1_before["people"])) == (2, sorted([ids["v1"], ids["v2"]]))
    assert event.affected_refs["absorbed"] == {ids["b1"]: ids["a1"], ids["b2"]: ids["a2"]}
    assert event.affected_refs["dropped_assignments"] == [[ids["b1"], ids["v2"]]]
    assert event.after_state["ticket"]["uuid"] == ids["a"]


async def test_both_tickets_show_the_merge_as_their_last_update(db):
    """A merge changes both tickets, so each one's updated_at becomes the time of the merge."""
    reviewer, ids = await _world(db)
    geometries = BaseGeometry.__table__
    await db.execute(
        update(geometries)
        .where(geometries.c.uuid.in_([ids["a"], ids["b"]]))
        .values(updated_at=datetime(2026, 1, 1, tzinfo=UTC))
    )

    await _resolve(db, reviewer, ids)

    (event,) = (await db.scalars(select(DedupAuditEvent).where(DedupAuditEvent.event_type == "merged"))).all()
    for ticket in ("a", "b"):
        assert (await _row(db, Tickets, ids[ticket])).updated_at == event.created_at


# --- need status (ADR-370) ----------------------------------------------------------------


async def test_a_need_full_after_the_merge_is_fulfilled(db):
    """Three people on a need of three: fulfilled, with its completion time."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    request.primary_tasks[0].values.quantity = 3

    await _resolve(db, reviewer, ids, request)

    a1 = await _row(db, TicketTask, ids["a1"])
    assert (a1.status, a1.completed_at is not None) == ("fulfilled", True)


async def test_a_full_need_given_room_opens_again(db):
    """a1 was full at 2; at 7 with 3 people it recruits again."""
    reviewer, ids = await _world(db, a1_status="fulfilled")
    await db.execute(
        update(TicketTask).where(TicketTask.uuid == ids["a1"]).values(completed_at=datetime.now(UTC))
    )

    await _resolve(db, reviewer, ids)

    a1 = await _row(db, TicketTask, ids["a1"])
    assert (a1.status, a1.completed_at) == ("pending", None)


async def test_a_need_stopped_by_hand_stays_stopped(db):
    """Its requester stopped recruiting: it stays fulfilled however much room the merge makes."""
    reviewer, ids = await _world(db, a1_status="fulfilled")
    await db.execute(
        update(TicketTask).where(TicketTask.uuid == ids["a1"]).values(recruiting_stopped_at=datetime.now(UTC))
    )

    await _resolve(db, reviewer, ids)

    assert (await _row(db, TicketTask, ids["a1"])).status == "fulfilled"


async def test_the_primary_ticket_status_is_worked_out_again(db):
    """People are on A's needs and one is open: in progress."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    assert (await _row(db, Tickets, ids["a"])).status == "in_progress"


async def test_an_audited_primary_goes_back_to_no_audit(db):
    """Its content changed, so the verdict given on the old content no longer holds (PR #84)."""
    reviewer, ids = await _world(db)
    a = await _row(db, Tickets, ids["a"])
    a.audit_status, a.audited_content = "audited", {"ticket": {"title": a.title}}
    await db.flush()

    await _resolve(db, reviewer, ids)

    assert (await _row(db, Tickets, ids["a"])).audit_status == "no_audit"


# --- guards -------------------------------------------------------------------------------


async def test_a_changed_ticket_is_refused_with_a_conflict(db):
    """ADR-374: the reviewer compared an older A."""
    reviewer, ids = await _world(db)
    versions = await _versions(db, reviewer, ids)
    await db.execute(update(TicketTask).where(TicketTask.uuid == ids["a2"]).values(quantity=4))

    with pytest.raises(DuplicatePairConflictError, match="changed"):
        await _resolve(db, reviewer, ids, _example_one(ids, versions))


async def test_a_resolved_card_cannot_be_resolved_again(db):
    """A second resolve on the same card is refused, with the card's own reason."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    await _resolve(db, reviewer, ids, request)

    with pytest.raises(DuplicatePairConflictError, match="cannot be resolved"):
        await _resolve(db, reviewer, ids, request)


async def test_a_resolved_card_cannot_be_revoked(db):
    """ADR-376: no undo; the merged event is what a person restores from."""
    reviewer, ids = await _world(db)
    await _resolve(db, reviewer, ids)

    await db.refresh(reviewer)
    with pytest.raises(DuplicatePairConflictError, match="resolved"):
        await dedup_review.revoke(db, actor=reviewer, pair_uuid=uuid_mod.UUID(ids["pair"]))


async def test_a_rejected_card_cannot_be_resolved(db):
    """Not a duplicate is final until revoked: there is nothing to resolve."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    await db.refresh(reviewer)
    await dedup_review.reject(db, actor=reviewer, pair_uuid=uuid_mod.UUID(ids["pair"]), note=None)

    with pytest.raises(DuplicatePairConflictError):
        await _resolve(db, reviewer, ids, request)


async def test_a_confirmed_card_can_still_be_resolved(db):
    """ADR-365: a card confirmed through Spec 025 needs no revoke first."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    await db.refresh(reviewer)
    await dedup_review.confirm(db, actor=reviewer, pair_uuid=uuid_mod.UUID(ids["pair"]), note=None)

    await _resolve(db, reviewer, ids, request)

    assert (await _row(db, Tickets, ids["b"])).status == "cancelled"


async def test_a_card_whose_ticket_was_cancelled_is_refused(db):
    """A side cancelled meanwhile leaves no ticket to fold (ADR-378)."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    b = await _row(db, Tickets, ids["b"])
    b.status, b.delete_at = "cancelled", datetime.now(UTC)
    await db.flush()

    with pytest.raises(DuplicatePairConflictError, match="cancelled"):
        await _resolve(db, reviewer, ids, request)


async def test_more_people_than_the_quantity_is_refused(db):
    """ADR-370: 3 people on a1 after the merge, quantity 2."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    request.primary_tasks[0].values.quantity = 2

    with pytest.raises(ResolveRefused, match="more than the quantity"):
        await _resolve(db, reviewer, ids, request)


async def test_review_alone_is_enough(db):
    """ADR-366: the reviewer holds no ticket.edit or ticket.delete, and still resolves."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    assert (await _row(db, Tickets, ids["b"])).status == "cancelled"


async def test_without_review_it_is_forbidden(db):
    """ai_duplicate.view alone reads the card but cannot resolve it."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    viewer = await _actor(db, Perm.AI_DUP_VIEW)

    with pytest.raises(HTTPException) as caught:
        await dedup_resolve.resolve(db, actor=viewer, pair_uuid=uuid_mod.UUID(ids["pair"]), request=request)
    assert caught.value.status_code == 403


async def test_a_failure_part_way_leaves_everything_as_it_was(db, monkeypatch):
    """One transaction: if writing the event fails, no ticket, need or claim has changed."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    await db.commit()

    def boom(*args, **kwargs):
        raise RuntimeError("event store down")

    monkeypatch.setattr(dedup_resolve, "_merged_event", boom)
    with pytest.raises(RuntimeError):
        await _resolve(db, reviewer, ids, request)
    await db.rollback()

    assert (await _row(db, Tickets, ids["b"])).status == "pending"
    assert (await _row(db, TicketTask, ids["a1"])).quantity == 2
    assert await _people(db, ids["b1"]) == {ids["v2"], ids["v3"]}
    assert (await _row(db, DuplicatePair, ids["pair"])).status == "dup_ignored"


async def test_audit_logs_record_every_row_that_changed(db):
    """The audit trigger sees the resolve like any write: the tickets and needs it touched."""
    await db.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    for table in AUDITED_TABLES:
        await db.execute(text(get_audit_trigger_sql(table)))
    reviewer, ids = await _world(db)
    await db.commit()

    await _resolve(db, reviewer, ids)

    rows = await db.execute(text("SELECT table_name, row_id::text FROM audit_logs WHERE action = 'UPDATE'"))
    updated = {(table, row) for table, row in rows.all()}
    for table, key in (
        ("tickets", "b"),
        ("ticket_tasks", "a1"),
        ("ticket_tasks", "b1"),
        ("ticket_tasks", "b3"),
    ):
        assert (table, ids[key]) in updated, (table, key)


async def test_two_reviewers_resolving_at_once_leave_one_resolution(db):
    """Two real connections resolve the same card; the lock lets one through, the other is refused."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    user_uuid, identity = reviewer.uuid, reviewer.active_identity
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def attempt(session):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identity
            return await dedup_resolve.resolve(
                session, actor=actor, pair_uuid=uuid_mod.UUID(ids["pair"]), request=request
            )

        outcomes = await asyncio.gather(*(attempt(s) for s in sessions), return_exceptions=True)
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, DuplicatePairConflictError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    events = (await db.scalars(select(DedupAuditEvent).where(DedupAuditEvent.event_type == "merged"))).all()
    assert len(events) == 1


async def test_a_reject_and_a_resolve_at_once_leave_one_decision(db):
    """The card's lock: one of the two goes through, the other is refused, and the card agrees."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))
    user_uuid, identity = reviewer.uuid, reviewer.active_identity
    pair_uuid = uuid_mod.UUID(ids["pair"])
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def as_reviewer(session):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identity
            return actor

        async def resolving(session):
            return await dedup_resolve.resolve(
                session, actor=await as_reviewer(session), pair_uuid=pair_uuid, request=request
            )

        async def rejecting(session):
            return await dedup_review.reject(
                session, actor=await as_reviewer(session), pair_uuid=pair_uuid, note=None
            )

        outcomes = await asyncio.gather(
            resolving(sessions[0]), rejecting(sessions[1]), return_exceptions=True
        )
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, DuplicatePairConflictError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    db.expire_all()
    pair = await db.get(DuplicatePair, pair_uuid)
    b = await _row(db, Tickets, ids["b"])
    assert (pair.status, b.status) in {("confirmed_duplicate", "cancelled"), ("not_duplicate", "pending")}


# --- code review round: photos, answers (ADR-384, 385) ------------------------------------


async def _photos_and_answers(db, ids):
    """B: two photos and an answer; A: one photo and its own answer."""
    from app.models.photo import Photo
    from app.models.ticket_disaster_detail import TicketDisasterDetail

    made = {}
    for key, ticket in (("pA", "a"), ("pB", "b"), ("pB2", "b")):
        photo = Photo(
            ref_uuid=ids[ticket],
            ref_type="geometry",
            url=f"https://example.com/{key}.jpg",
            created_by=ids["owner_a"],
        )
        db.add(photo)
        await db.flush()
        made[key] = str(photo.uuid)
    db.add(TicketDisasterDetail(ticket_uuid=ids["a"], property_name="power_outage", value="no"))
    db.add(TicketDisasterDetail(ticket_uuid=ids["b"], property_name="utility_hazards", value="gas"))
    await db.flush()
    return made


async def test_photos_and_answers_land_on_the_primary(db):
    """B's kept photo hangs under A, the cancelled one is soft-deleted; A's answers are replaced whole."""
    from app.models.photo import Photo
    from app.models.ticket_disaster_detail import TicketDisasterDetail

    reviewer, ids = await _world(db)
    photos = await _photos_and_answers(db, ids)
    request = _example_one(
        ids,
        await _versions(db, reviewer, ids),
        photos=[
            {"photo": photos["pA"], "action": "keep"},
            {"photo": photos["pB"], "action": "keep"},
            {"photo": photos["pB2"], "action": "cancel"},
        ],
        disaster_details={"power_outage": ["yes"], "utility_hazards": ["gas"]},
    )

    await _resolve(db, reviewer, ids, request)

    rows = {
        str(p.uuid): p
        for p in (await db.scalars(select(Photo).execution_options(populate_existing=True))).all()
    }
    assert (str(rows[photos["pA"]].ref_uuid), rows[photos["pA"]].delete_at) == (ids["a"], None)
    assert (str(rows[photos["pB"]].ref_uuid), rows[photos["pB"]].delete_at) == (ids["a"], None)
    assert rows[photos["pB2"]].delete_at is not None
    answers = await db.execute(
        select(
            TicketDisasterDetail.ticket_uuid, TicketDisasterDetail.property_name, TicketDisasterDetail.value
        )
    )
    assert sorted((str(t), n, v) for t, n, v in answers.all()) == sorted(
        [
            (ids["a"], "power_outage", "yes"),
            (ids["a"], "utility_hazards", "gas"),
            (ids["b"], "utility_hazards", "gas"),
        ]
    )


async def test_the_other_tickets_answers_must_be_decided(db):
    """ADR-385 through the service: B has answers, the request says nothing, the resolve is refused."""
    reviewer, ids = await _world(db)
    photos = await _photos_and_answers(db, ids)
    request = _example_one(
        ids,
        await _versions(db, reviewer, ids),
        photos=[{"photo": p, "action": "keep"} for p in photos.values()],
    )

    with pytest.raises(ResolveRefused, match="disaster_details"):
        await _resolve(db, reviewer, ids, request)
