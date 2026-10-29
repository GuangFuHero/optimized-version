"""The public timeline of a help request (ADR-421): what happened, to anyone, with nobody's name.

Audit rows are written by hand, as in test_history_endpoints.py: the test database has no triggers, and
writing them pins exactly what each case is about.
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest

from app.core.permissions import Perm
from app.models.audit import AuditLog
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TaskProperty, TicketTask
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


async def _need(db, ticket: str, owner: str, name="清淤泥") -> str:
    task = TicketTask(
        uuid=uuidlib.uuid4(),
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
                old={"title": "民宅清淤"},
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
    assert events[0]["changes"] == [
        {"field": "title", "before": "民宅清淤", "after": "民宅一樓清淤", "changed": None}
    ]
    assert events[1]["need"] == {"name": "清淤泥", "matched": 1, "required": 5}
    assert events[2]["needs"] == [{"name": "清淤泥", "matched": 0, "required": 5}]
    for secret in (owner, volunteer, "建單的人", "去幫忙的人"):
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

    assert [(e["kind"], e["need"]["name"]) for e in events] == [
        ("need_stopped", "清淤泥"),
        # The claim and the need it filled are one transaction; newest first, the outcome reads on top.
        ("need_filled", "搬家具"),
        ("volunteer_joined", "搬家具"),
        ("need_added", "搬家具"),
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

    assert [(e["kind"], e["need"] and e["need"]["matched"]) for e in events] == [
        ("need_reopened", 0),
        ("volunteer_left", 0),
        ("volunteer_joined", 1),
        ("ticket_created", None),
    ]


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
