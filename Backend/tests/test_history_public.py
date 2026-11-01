"""The public timeline of a help request (ADR-421): what happened, to anyone, with nobody's name.

Audit rows are written by hand, as in test_history_endpoints.py: the test database has no triggers, and
writing them pins exactly what each case is about.
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import text, update

from app.core.permissions import Perm
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, AUDITED_TABLES, get_audit_trigger_sql
from app.models.audit import AuditLog
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services import history_public
from app.services.history_fields import FIELD_TIERS, Tier
from tests import test_dedup_resolve as resolving
from tests.test_history_endpoints import _auth, _user_with

URL = "/api/v1/history/tickets/{}/public"

PHONE = "0912345678"
NEW_PHONE = "0987654321"
CONTACT = "王小姐"
NEW_CONTACT = "陳先生"


async def _ticket(db, owner: str) -> str:
    ticket = Tickets(
        uuid=uuidlib.uuid4(),
        property_name="request",
        created_by=owner,
        title="民宅清淤",
        contact_name=CONTACT,
        contact_phone=PHONE,
        status="pending",
        priority="high",
    )
    db.add(ticket)
    await db.flush()
    return str(ticket.uuid)


async def _need(db, ticket: str, owner: str, name="清淤泥", uuid=None) -> str:
    task = TicketTask(
        uuid=uuid or uuidlib.uuid4(),
        ticket_uuid=ticket,
        task_type="cleanup",
        task_name=name,
        quantity=5,
        created_by=owner,
    )
    db.add(task)
    await db.flush()
    return str(task.uuid)


def _row(row_id, table, action, *, by=None, old=None, new=None, minute=0):
    return AuditLog(
        uuid=uuidlib.uuid4(),
        table_name=table,
        action=action,
        row_id=row_id,
        user_uuid=by,
        old_values=old,
        new_values=new,
        created_at=datetime(2026, 10, 28, 9, minute, tzinfo=UTC),
    )


def _filed(ticket: str, need: str, owner: str) -> list[AuditLog]:
    """Filing the ticket with one need, in one transaction."""
    return [
        _row(ticket, "base_geometries", "INSERT", by=owner, new={"uuid": ticket, "geometry": "0101"}),
        _row(
            ticket,
            "tickets",
            "INSERT",
            by=owner,
            new={
                "uuid": ticket,
                "title": "民宅清淤",
                "contact_name": CONTACT,
                "contact_phone": PHONE,
            },
        ),
        _row(
            need,
            "ticket_tasks",
            "INSERT",
            by=owner,
            new={
                "uuid": need,
                "task_name": "清淤泥",
                "quantity": 5,
                "status": "pending",
            },
        ),
    ]


def _claim(need: str, volunteer: str, *, minute: int, action="INSERT") -> AuditLog:
    values = {"task_uuid": need, "actor_uuid": volunteer, "status": "accepted"}
    return _row(
        uuidlib.uuid4(),
        "task_assignments",
        action,
        by=volunteer,
        minute=minute,
        **({"new": values} if action == "INSERT" else {"old": values}),
    )


@pytest.mark.asyncio
async def test_a_guest_reads_what_happened_and_nobody_s_name(client, db_session, redis):
    """Who acted is a role and a claim is a count: no uuid, no nickname, newest first."""
    owner = await _user_with(db_session, redis, "建單的人")
    volunteer = await _user_with(db_session, redis, "去幫忙的人")
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    db_session.add_all(
        [
            *_filed(ticket, need, owner),
            _claim(need, volunteer, minute=1),
            _row(
                ticket,
                "tickets",
                "UPDATE",
                by=owner,
                minute=2,
                old={"title": f"民宅清淤 {PHONE}"},
                new={"title": "民宅一樓清淤"},
            ),
        ]
    )
    await db_session.commit()

    resp = await client.get(URL.format(ticket))

    assert resp.status_code == 200
    events = resp.json()["data"]
    assert [(e["kind"], e["actor_role"]) for e in events] == [
        ("ticket_updated", "requester"),
        ("volunteer_joined", "volunteer"),
        ("ticket_created", "requester"),
    ]
    # Free text: an old title may hold what the edit took out.
    assert events[0]["changes"] == [{"field": "title", "before": None, "after": None, "changed": True}]
    assert events[1]["need"] == {"name": "清淤泥", "matched": 1, "required": 5}
    assert events[2]["needs"] == [{"name": "清淤泥", "matched": 0, "required": 5}]
    for secret in (owner, volunteer, "建單的人", "去幫忙的人", PHONE, "民宅一樓清淤"):
        assert secret not in resp.text


@pytest.mark.asyncio
async def test_a_signed_in_account_never_reads_the_contact_details(client, db_session, redis):
    """A plain account holds ticket.view_pii at `all` (ADR-286); the public timeline still tells no contact.

    Not filed with them, not changed to them: that the contact changed is told, to a guest and to an account
    alike, and never what it was or became. Nor are the triage answers.
    """
    owner = await _user_with(db_session, redis, "建單者")
    reader = await _user_with(
        db_session, redis, "一般帳號", Perm.TICKET_VIEW, Perm.TICKET_VIEW_PII, Perm.TICKET_VIEW_DETAIL
    )
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    db_session.add_all(
        [
            *_filed(ticket, need, owner),
            _row(
                ticket,
                "tickets",
                "UPDATE",
                by=owner,
                minute=1,
                old={"contact_name": CONTACT, "contact_phone": PHONE, "person_trapped_reported": None},
                new={
                    "contact_name": NEW_CONTACT,
                    "contact_phone": NEW_PHONE,
                    "person_trapped_reported": True,
                },
            ),
        ]
    )
    await db_session.commit()

    for headers in ({}, _auth(reader)):
        resp = await client.get(URL.format(ticket), headers=headers)

        assert resp.status_code == 200
        updated, created = resp.json()["data"]
        assert (updated["kind"], created["kind"]) == ("ticket_updated", "ticket_created")
        # The name and the phone are one change.
        assert updated["changes"] == [
            {"field": "contact", "before": None, "after": None, "changed": True},
            {"field": "person_trapped", "before": None, "after": None, "changed": True},
        ]
        for contact in (PHONE, NEW_PHONE, CONTACT, NEW_CONTACT):
            assert contact not in resp.text


@pytest.mark.asyncio
async def test_stopping_recruiting_is_told_apart_from_filling_up(client, db_session, redis):
    """Both end the need fulfilled; only stopping by hand stamps recruiting_stopped_at."""
    owner = await _user_with(db_session, redis, "建單者")
    volunteer = await _user_with(db_session, redis, "志工")
    ticket = await _ticket(db_session, owner)
    filled = await _need(db_session, ticket, owner, name="搬家具")
    stopped = await _need(db_session, ticket, owner)
    db_session.add_all(
        [
            _row(filled, "ticket_tasks", "INSERT", by=owner, new={"task_name": "搬家具", "quantity": 1}),
            _claim(filled, volunteer, minute=1),
            _row(
                filled,
                "ticket_tasks",
                "UPDATE",
                by=volunteer,
                minute=1,
                old={"status": "pending"},
                new={"status": "fulfilled"},
            ),
            _row(
                stopped,
                "ticket_tasks",
                "UPDATE",
                by=owner,
                minute=2,
                old={
                    "task_name": "清淤泥",
                    "status": "pending",
                    "quantity": 5,
                    "recruiting_stopped_at": None,
                },
                new={
                    "task_name": "清淤泥",
                    "status": "fulfilled",
                    "quantity": 0,
                    "recruiting_stopped_at": "2026-10-28T09:02:00+00:00",
                },
            ),
        ]
    )
    await db_session.commit()

    events = (await client.get(URL.format(ticket))).json()["data"]

    assert [(e["kind"], e["need"]["name"], e["actor_role"]) for e in events] == [
        ("need_stopped", "清淤泥", "requester"),
        # The claim and the need it filled are one transaction; newest first, the outcome reads on top,
        # done by the volunteer who claimed, not by staff for want of an assignment row of its own.
        ("need_filled", "搬家具", "volunteer"),
        ("volunteer_joined", "搬家具", "volunteer"),
        ("need_added", "搬家具", "requester"),
    ]
    assert events[1]["need"] == {"name": "搬家具", "matched": 1, "required": 1}


@pytest.mark.asyncio
async def test_a_volunteer_giving_a_place_back_reopens_the_need(client, db_session, redis):
    """Released claims count down, and a need that was full opens again."""
    owner = await _user_with(db_session, redis, "建單者")
    volunteer = await _user_with(db_session, redis, "志工")
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    claim = _claim(need, volunteer, minute=1)
    release = _row(
        claim.row_id,
        "task_assignments",
        "DELETE",
        by=volunteer,
        minute=2,
        old={"task_uuid": need, "actor_uuid": volunteer},
    )
    db_session.add_all(
        [
            *_filed(ticket, need, owner),
            claim,
            release,
            _row(
                need,
                "ticket_tasks",
                "UPDATE",
                by=volunteer,
                minute=2,
                old={"status": "fulfilled"},
                new={"status": "pending"},
            ),
        ]
    )
    await db_session.commit()

    events = (await client.get(URL.format(ticket))).json()["data"]

    assert [(e["kind"], e["need"] and e["need"]["matched"], e["actor_role"]) for e in events] == [
        ("need_reopened", 0, "volunteer"),
        ("volunteer_left", 0, "volunteer"),
        ("volunteer_joined", 1, "volunteer"),
        ("ticket_created", None, "requester"),
    ]


@pytest.mark.asyncio
async def test_a_renamed_need_is_named_as_it_is_now_in_every_event(client, db_session, redis):
    """A need's name is free text: its rename is told without values, and earlier events take the new name.

    Headcounts stay those of the time.
    """
    owner = await _user_with(db_session, redis, "建單者")
    volunteer = await _user_with(db_session, redis, "志工")
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    old_name = f"清淤泥 找王小姐 {PHONE}"
    db_session.add_all(
        [
            _row(ticket, "tickets", "INSERT", by=owner, new={"uuid": ticket, "title": "民宅清淤"}),
            _row(
                need,
                "ticket_tasks",
                "INSERT",
                by=owner,
                new={"uuid": need, "task_name": old_name, "quantity": 5, "status": "pending"},
            ),
            _claim(need, volunteer, minute=1),
            _row(
                need,
                "ticket_tasks",
                "UPDATE",
                by=owner,
                minute=2,
                old={"task_name": old_name},
                new={"task_name": "清淤泥"},
            ),
        ]
    )
    await db_session.commit()

    resp = await client.get(URL.format(ticket))

    renamed, joined, created = resp.json()["data"]
    assert renamed["changes"] == [{"field": "name", "before": None, "after": None, "changed": True}]
    assert renamed["need"] == {"name": "清淤泥", "matched": 1, "required": 5}
    assert joined["need"] == {"name": "清淤泥", "matched": 1, "required": 5}
    assert created["needs"] == [{"name": "清淤泥", "matched": 0, "required": 5}]
    for secret in (PHONE, CONTACT):
        assert secret not in resp.text


@pytest.mark.asyncio
async def test_the_needs_a_ticket_is_filed_with_come_in_the_site_s_order(client, db_session, redis):
    """By `created_at`, then uuid, as the site lists them, not as fetched.

    Filing a help request stamps its needs a microsecond apart in the order the requester listed them; here
    their uuids sort the other way round.
    """
    owner = await _user_with(db_session, redis, "建單者")
    ticket = await _ticket(db_session, owner)
    listed = ("搬家具", "清淤泥", "送水")
    needs = [
        await _need(db_session, ticket, owner, name=name, uuid=uuidlib.UUID(int=len(listed) - i))
        for i, name in enumerate(listed)
    ]
    filed = [
        _row(
            uuid,
            "ticket_tasks",
            "INSERT",
            by=owner,
            new={
                "uuid": uuid,
                "task_name": name,
                "quantity": 1,
                "created_at": f"2026-10-28T09:00:00.00000{i + 1}+00:00",
            },
        )
        for i, (uuid, name) in enumerate(zip(needs, listed, strict=True))
    ]
    db_session.add_all([_row(ticket, "tickets", "INSERT", by=owner, new={"uuid": ticket}), *filed])
    await db_session.commit()

    [created] = (await client.get(URL.format(ticket))).json()["data"]

    assert [need["name"] for need in created["needs"]] == list(listed)
    assert sorted(needs) == needs[::-1]


def test_every_column_the_staff_timeline_classifies_is_told_or_left_out_on_purpose():
    """A column history_fields.py adds or demotes forces a decision here, rather than going public or silent.

    Each is told with its value (public tier only), told as changed, or left out with a reason (`_NOT_TOLD`).
    """
    told = {
        "tickets": (history_public._TICKET_FIELDS, history_public._TICKET_FACTS),
        "ticket_tasks": (history_public._NEED_FIELDS, history_public._NEED_FACTS),
        "task_properties": ((), dict.fromkeys(history_public._PROPERTY_COLUMNS, "properties")),
    }
    for table, (values, facts) in told.items():
        tiers = FIELD_TIERS[("ticket", table)]
        not_told = history_public._NOT_TOLD.get(table, {})
        for column in tiers:
            assert (column in values) + (column in facts) + (column in not_told) == 1, (table, column)
        for column in values:
            assert tiers[column].tier == Tier.PUBLIC, (table, column)
        assert set(values) | set(facts) | set(not_told) <= set(tiers), table


@pytest.mark.asyncio
async def test_the_place_and_the_description_are_told_as_changed_without_their_values(
    client, db_session, redis
):
    """One save that moves the point, corrects the address and rewrites the description is one event."""
    owner = await _user_with(db_session, redis, "建單者")
    ticket = await _ticket(db_session, owner)
    address = SecondaryLocation(uuid=uuidlib.uuid4(), geometry_uuid=ticket, location_type="address")
    db_session.add(address)
    await db_session.flush()
    db_session.add_all(
        [
            _row(
                ticket,
                "base_geometries",
                "UPDATE",
                by=owner,
                minute=1,
                old={"geometry": "0101aa"},
                new={"geometry": "0101bb"},
            ),
            _row(
                address.uuid,
                "secondary_locations",
                "UPDATE",
                by=owner,
                minute=1,
                old={"geometry_uuid": ticket, "road": "中正路"},
                new={"geometry_uuid": ticket, "road": "中山路"},
            ),
            _row(
                ticket,
                "tickets",
                "UPDATE",
                by=owner,
                minute=1,
                old={"description": "門牌 12 號"},
                new={"description": "門牌 21 號"},
            ),
        ]
    )
    await db_session.commit()

    resp = await client.get(URL.format(ticket))

    [event] = resp.json()["data"]
    assert event["kind"] == "ticket_updated"
    assert sorted((c["field"], c["changed"]) for c in event["changes"]) == [
        ("description", True),
        ("location", True),
    ]
    for value in ("中正路", "中山路", "門牌"):
        assert value not in resp.text


@pytest.mark.asyncio
async def test_a_need_s_progress_note_and_details_are_told_as_changed_without_their_values(
    client, db_session, redis
):
    """A save that rewrites the note and a detail is one event for the need; a detail added alone, another."""
    owner = await _user_with(db_session, redis, "建單者")
    coordinator = await _user_with(db_session, redis, "協調員")
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    tools = TaskProperty(uuid=uuidlib.uuid4(), task_uuid=need, property_name="工具", property_value="水桶")
    gloves = TaskProperty(uuid=uuidlib.uuid4(), task_uuid=need, property_name="手套", property_value="10 雙")
    db_session.add_all([tools, gloves])
    await db_session.flush()
    db_session.add_all(
        [
            *_filed(ticket, need, owner),
            _row(
                need,
                "ticket_tasks",
                "UPDATE",
                by=coordinator,
                minute=1,
                old={"task_name": "清淤泥", "progress_note": "已聯絡建單者"},
                new={"task_name": "清淤泥", "progress_note": "明早八點到"},
            ),
            _row(
                tools.uuid,
                "task_properties",
                "UPDATE",
                by=coordinator,
                minute=1,
                old={"task_uuid": need, "property_name": "工具", "property_value": "鏟子"},
                new={"task_uuid": need, "property_name": "工具", "property_value": "水桶"},
            ),
            _row(
                gloves.uuid,
                "task_properties",
                "INSERT",
                by=coordinator,
                minute=2,
                new={"task_uuid": need, "property_name": "手套", "property_value": "10 雙"},
            ),
        ]
    )
    await db_session.commit()

    resp = await client.get(URL.format(ticket))

    events = resp.json()["data"]
    assert [(e["kind"], e["actor_role"], [c["field"] for c in e["changes"]]) for e in events] == [
        ("need_updated", "staff", ["properties"]),
        ("need_updated", "staff", ["progress_note", "properties"]),
        ("ticket_created", "requester", []),
    ]
    assert events[0]["need"] == {"name": "清淤泥", "matched": 0, "required": 5}
    assert all(c["changed"] and c["after"] is None for e in events for c in e["changes"])
    for value in ("已聯絡", "八點", "鏟子", "水桶", "10 雙"):
        assert value not in resp.text


@pytest.mark.asyncio
async def test_a_detail_taken_off_and_what_a_fill_or_reopen_also_changed_are_told(client, db_session, redis):
    """A detail taken off is a soft delete; a save that fills or reopens a need tells what else it changed."""
    owner = await _user_with(db_session, redis, "建單者")
    coordinator = await _user_with(db_session, redis, "協調員")
    volunteer = await _user_with(db_session, redis, "志工")
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    tools = TaskProperty(uuid=uuidlib.uuid4(), task_uuid=need, property_name="工具", property_value="水桶")
    gloves = TaskProperty(uuid=uuidlib.uuid4(), task_uuid=need, property_name="手套", property_value="10 雙")
    db_session.add_all([tools, gloves])
    await db_session.flush()

    def detail(prop, minute, old, new):
        base = {"task_uuid": need, "property_name": prop.property_name, "property_value": prop.property_value}
        return _row(
            prop.uuid,
            "task_properties",
            "UPDATE",
            by=coordinator,
            minute=minute,
            old={**base, **old},
            new={**base, **new},
        )

    db_session.add_all(
        [
            *_filed(ticket, need, owner),
            _claim(need, volunteer, minute=1),
            detail(tools, 2, {"delete_at": None}, {"delete_at": "2026-10-28T09:02:00+00:00"}),
            # Lowered to whoever is coming and renamed, with a detail rewritten: full in the same save.
            _row(
                need,
                "ticket_tasks",
                "UPDATE",
                by=coordinator,
                minute=3,
                old={
                    "task_name": "清淤泥",
                    "quantity": 5,
                    "status": "pending",
                    "recruiting_stopped_at": None,
                },
                new={
                    "task_name": "一樓清淤",
                    "quantity": 1,
                    "status": "fulfilled",
                    "recruiting_stopped_at": None,
                },
            ),
            detail(gloves, 3, {}, {"property_value": "20 雙"}),
            _row(
                need,
                "ticket_tasks",
                "UPDATE",
                by=coordinator,
                minute=4,
                old={"quantity": 1, "status": "fulfilled"},
                new={"quantity": 3, "status": "pending"},
            ),
        ]
    )
    await db_session.commit()

    resp = await client.get(URL.format(ticket))

    events = resp.json()["data"]
    assert [(e["kind"], e["actor_role"], [c["field"] for c in e["changes"]]) for e in events] == [
        ("need_reopened", "staff", ["quantity"]),
        ("need_filled", "staff", ["quantity", "name", "properties"]),
        ("need_updated", "staff", ["properties"]),
        ("volunteer_joined", "volunteer", []),
        ("ticket_created", "requester", []),
    ]
    reopened, filled = events[0], events[1]
    assert (reopened["changes"][0]["before"], reopened["changes"][0]["after"]) == (1, 3)
    assert filled["need"] == {"name": "一樓清淤", "matched": 1, "required": 1}
    for value in ("水桶", "10 雙", "20 雙"):
        assert value not in resp.text


async def _as(db, user_uuid: str) -> None:
    """Who the audit trigger writes down for the rest of this transaction, as the app sets it per request."""
    await db.execute(text("SELECT set_config('app.current_user_id', :user, true)"), {"user": user_uuid})


@pytest.mark.asyncio
async def test_a_merge_tells_this_ticket_s_part_and_the_merge_itself(db):
    """A duplicate-review merge, resolved for real under the audit triggers, read on the ticket kept.

    The ticket folded in is test_dedup_resolve's B, into A: its 清淤 and 飲用水 fold into A's, its 便當
    moves over. What B's needs and claims went through on B stays B's: B's requester raising the 便當, a
    fifth volunteer joining B's 清淤, and the 便當 being filed with B. The merge is one event on A, listing
    the needs it brought, with the headcounts after it; what it changed on A's needs is told as any save's.
    """
    await db.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    for table in AUDITED_TABLES:
        await db.execute(text(get_audit_trigger_sql(table)))
    reviewer, ids = await resolving._world(db)
    reviewer_uuid = str(reviewer.uuid)
    await db.commit()
    await _as(db, ids["owner_b"])
    await db.execute(update(TicketTask).where(TicketTask.uuid == ids["b3"]).values(quantity=4))
    await db.commit()
    v5 = str((await resolving._user(db, "志工 5")).uuid)
    await _as(db, v5)
    db.add(TaskAssignment(task_uuid=ids["b1"], actor_uuid=v5))
    await db.commit()

    await _as(db, reviewer_uuid)
    await resolving._resolve(db, reviewer, ids)
    timeline = await history_public.load_public_timeline(db, uuid=ids["a"], limit=50, offset=0)

    *updated, merged, created = timeline.events
    assert sorted((e["kind"], e["need"]["name"], [c["field"] for c in e["changes"]]) for e in updated) == [
        ("need_updated", "清淤", ["quantity", "properties"]),
        ("need_updated", "飲用水", ["quantity"]),
    ]
    assert (merged["kind"], merged["actor_role"]) == ("ticket_merged", "staff")
    # Filed together, so by uuid; 清淤 counts v1, v2 once, v3 and v5.
    after = {
        ids["a1"]: {"name": "清淤", "matched": 4, "required": 7},
        ids["a2"]: {"name": "飲用水", "matched": 0, "required": 6},
        ids["b3"]: {"name": "便當", "matched": 1, "required": 4},
    }
    assert merged["needs"] == [after[uuid] for uuid in sorted(after)]
    assert created["kind"] == "ticket_created"
    assert sorted(need["name"] for need in created["needs"]) == ["清淤", "飲用水"]


@pytest.mark.asyncio
async def test_the_data_check_and_the_ticket_status_are_not_told(client, db_session, redis):
    """An edit with nothing the public may read is left out, rather than shown empty."""
    owner = await _user_with(db_session, redis, "建單者")
    auditor = await _user_with(db_session, redis, "檢核員")
    ticket = await _ticket(db_session, owner)
    db_session.add_all(
        [
            _row(
                ticket,
                "tickets",
                "UPDATE",
                by=auditor,
                minute=1,
                old={"audit_status": "unchecked"},
                new={"audit_status": "issue", "audit_note": "地址不明"},
            ),
            _row(
                ticket,
                "tickets",
                "UPDATE",
                by=None,
                minute=2,
                old={"status": "pending", "priority": "medium"},
                new={"status": "in_progress", "priority": "high"},
            ),
        ]
    )
    await db_session.commit()

    resp = await client.get(URL.format(ticket))

    [event] = resp.json()["data"]
    assert (event["actor_role"], event["changes"]) == (
        "system",
        [{"field": "priority", "before": "medium", "after": "high", "changed": None}],
    )
    assert "地址不明" not in resp.text


@pytest.mark.asyncio
async def test_someone_other_than_the_requester_is_staff(client, db_session, redis):
    """A coordinator's edit is told as staff's, by no name."""
    owner = await _user_with(db_session, redis, "建單者")
    coordinator = await _user_with(db_session, redis, "協調員")
    ticket = await _ticket(db_session, owner)
    db_session.add(
        _row(
            ticket,
            "tickets",
            "UPDATE",
            by=coordinator,
            minute=1,
            old={"priority": "medium"},
            new={"priority": "critical"},
        )
    )
    await db_session.commit()

    [event] = (await client.get(URL.format(ticket))).json()["data"]

    assert event["actor_role"] == "staff"


@pytest.mark.asyncio
async def test_a_page_says_how_many_there_are(client, db_session, redis):
    """Paged after telling, so `total` counts public events, not audit rows."""
    owner = await _user_with(db_session, redis, "建單者")
    ticket = await _ticket(db_session, owner)
    need = await _need(db_session, ticket, owner)
    db_session.add_all(
        [
            *_filed(ticket, need, owner),
            *[
                _row(
                    ticket,
                    "tickets",
                    "UPDATE",
                    by=owner,
                    minute=m,
                    old={"priority": "medium"},
                    new={"priority": "high"},
                )
                for m in (1, 2)
            ],
        ]
    )
    await db_session.commit()

    body = (await client.get(URL.format(ticket), params={"limit": 2, "offset": 1})).json()

    assert body["meta"] == {"total": 3, "truncated": False, "limit": 2, "offset": 1}
    assert [e["kind"] for e in body["data"]] == ["ticket_updated", "ticket_created"]


@pytest.mark.asyncio
async def test_a_deleted_or_unknown_ticket_is_not_found(client, db_session, redis):
    """As on the site: a deleted ticket has no timeline anyone can read here."""
    owner = await _user_with(db_session, redis, "建單者")
    ticket = await _ticket(db_session, owner)
    row = await db_session.get(Tickets, uuidlib.UUID(ticket))
    row.delete_at = datetime(2026, 10, 28, tzinfo=UTC)
    await db_session.commit()

    assert (await client.get(URL.format(ticket))).status_code == 404
    assert (await client.get(URL.format(uuidlib.uuid4()))).status_code == 404
