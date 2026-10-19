"""A ticket's data check: who gives the verdict, what voids it, and who hears about an issue.

Every ticket starts at no_audit. An auditor's verdict (audited, or audit_issue with a note) holds
for the content it was given on; a change to that content sends the ticket back to no_audit, while
the handling of the request (sign-ups, a need taken off, priority, progress notes) does not. The
scan's need_audit flag stands through content changes until somebody audits the ticket.
"""

import asyncio
import uuid as uuidlib
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, AUDITED_TABLES, get_audit_trigger_sql
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services import ticket as ticket_service
from app.services import ticket_audit
from tests.conftest import TEST_DB_URL, acting_as, seed_disaster_types
from tests.test_add_ticket_task import _need, _requester, _stranger, _ticket


async def _acting_with(db, user: User, grants: dict[Perm, str]) -> User:
    """Act as holding exactly `grants`."""
    role = Role(name=f"holder-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add(role)
    await db.flush()
    for perm, scope in grants.items():
        permission = await db.scalar(select(Permission).where(Permission.key == perm.value))
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _auditor(db) -> User:
    return await _stranger(db, Perm.TICKET_AUDIT, "all")


async def _operator(db) -> User:
    """Back-office staff who can do everything to a ticket but audit it."""
    user = User(name="協調者")
    db.add(user)
    await db.flush()
    return await _acting_with(
        db,
        user,
        {
            Perm.TICKET_ADD: "all",
            Perm.TICKET_EDIT: "all",
            Perm.TICKET_DELETE: "all",
            Perm.TICKET_ASSIGN: "all",
        },
    )


async def _state(db, ticket_uuid: str) -> Tickets:
    return await db.get(Tickets, ticket_uuid, populate_existing=True)


async def _give(db, *, actor: User, uuid: str, status: str, note: str | None) -> Tickets:
    """Give a verdict the way the admin page does: on the version just read."""
    seen = ticket_audit.content_hash(await ticket_audit.content_of(db, await _state(db, uuid)))
    return await ticket_audit.audit_ticket(
        db, actor=actor, uuid=uuid, status=status, note=note, seen_hash=seen
    )


async def _audited_ticket(db) -> tuple[str, str]:
    """A ticket with one need, audited; returns (ticket_uuid, need_uuid)."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    need = TicketTask(
        uuid=uuidlib.uuid4(),
        ticket_uuid=ticket_uuid,
        task_type="hr",
        task_name="清淤",
        quantity=3,
        created_by=ticket.created_by,
    )
    db.add(need)
    await db.flush()
    need_uuid = str(need.uuid)
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None)
    return ticket_uuid, need_uuid


# --- the verdict ---


@pytest.mark.asyncio
async def test_a_ticket_starts_at_no_audit(db):
    """Nobody has checked a new ticket."""
    ticket = await _ticket(db)

    assert (await _state(db, str(ticket.uuid))).audit_status == "no_audit"


@pytest.mark.asyncio
async def test_an_auditor_marks_a_ticket_audited_and_it_records_who_when_and_what(db):
    """The verdict keeps its auditor, its time and the content it was given on."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    auditor = await _auditor(db)
    auditor_uuid = str(auditor.uuid)

    await _give(db, actor=auditor, uuid=ticket_uuid, status="audited", note=None)

    audited = await _state(db, ticket_uuid)
    assert (audited.audit_status, audited.audit_note, str(audited.audited_by)) == (
        "audited",
        None,
        auditor_uuid,
    )
    assert audited.audited_at is not None
    assert audited.audited_content["ticket"]["title"] == "一樓客廳積泥需要幫忙清"


@pytest.mark.asyncio
@pytest.mark.parametrize("note", [None, "", "   "], ids=["none", "empty", "blank"])
async def test_an_issue_must_say_what_is_wrong(db, note):
    """An issue without a note is refused, and the ticket stays as it was."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    auditor = await _auditor(db)

    with pytest.raises(ValueError, match="audit_note is required"):
        await _give(db, actor=auditor, uuid=ticket_uuid, status="audit_issue", note=note)

    assert (await _state(db, ticket_uuid)).audit_status == "no_audit"


@pytest.mark.asyncio
async def test_the_database_refuses_an_issue_without_a_note(db):
    """Enforced below the service too, so no other writer can mark an issue silently."""
    ticket = await _ticket(db)
    ticket.audit_status = "audit_issue"

    with pytest.raises(Exception, match="ck_tickets_audit_issue_note"):
        await db.flush()


@pytest.mark.asyncio
async def test_need_audit_is_not_an_auditors_verdict(db):
    """need_audit is the scan's to set."""
    ticket = await _ticket(db)

    with pytest.raises(ValueError, match="Unknown audit verdict"):
        await _give(db, actor=await _auditor(db), uuid=str(ticket.uuid), status="need_audit", note=None)


@pytest.mark.asyncio
async def test_a_requester_cannot_audit_their_own_ticket(db):
    """ticket.edit `own` reaches what they filed, not the verdict on it."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    requester = await _requester(db, ticket)

    with pytest.raises(HTTPException) as refused:
        await _give(db, actor=requester, uuid=ticket_uuid, status="audited", note=None)

    assert refused.value.status_code == 403
    assert (await _state(db, ticket_uuid)).audit_status == "no_audit"


@pytest.mark.asyncio
async def test_an_auditor_cannot_rewrite_what_was_filed(db):
    """Auditing is all ticket.audit writes: content takes ticket.edit."""
    ticket = await _ticket(db)
    auditor = await _auditor(db)

    with pytest.raises(HTTPException) as refused:
        await ticket_service.update_ticket(db, actor=auditor, uuid=str(ticket.uuid), changes={"title": "改"})

    assert refused.value.status_code == 403


@pytest.mark.asyncio
async def test_staff_may_audit_a_ticket_they_edited_themselves(db):
    """Editing and auditing the same ticket is allowed."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    user = User(name="隊員")
    db.add(user)
    await db.flush()
    member = await _acting_with(db, user, {Perm.TICKET_EDIT: "all", Perm.TICKET_AUDIT: "all"})

    await ticket_service.update_ticket(db, actor=member, uuid=ticket_uuid, changes={"title": "新的標題"})
    await db.refresh(member)  # the test session expires everything on commit
    await _give(db, actor=member, uuid=ticket_uuid, status="audited", note=None)

    assert (await _state(db, ticket_uuid)).audit_status == "audited"


# --- what voids a verdict ---


async def _change_title(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(db, actor=actor, uuid=ticket_uuid, changes={"title": "改過的標題"})


async def _same_title(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(
        db, actor=actor, uuid=ticket_uuid, changes={"title": "一樓客廳積泥需要幫忙清"}
    )


async def _change_priority(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(db, actor=actor, uuid=ticket_uuid, changes={"priority": "critical"})


async def _add_address(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(
        db,
        actor=actor,
        uuid=ticket_uuid,
        changes={},
        secondary_location={"location_type": "address", "county": "花蓮縣", "no": "45"},
    )


async def _answer_disaster_field(db, actor, ticket_uuid, need_uuid):
    await ticket_service.set_ticket_disaster_details(
        db, actor=actor, ticket_uuid=ticket_uuid, details={"water_depth": ["knee"]}
    )


async def _add_need(db, actor, ticket_uuid, need_uuid):
    await ticket_service.create_ticket_task(
        db,
        actor=actor,
        ticket_uuid=ticket_uuid,
        task_type="supply",
        task_name="飲用水",
        task_description=None,
        quantity=2,
        source="user",
        route_uuid=None,
    )


async def _add_property(db, actor, ticket_uuid, need_uuid):
    await ticket_service.create_task_property(
        db,
        actor=actor,
        task_uuid=need_uuid,
        property_name="tool",
        property_value="鏟子",
        quantity=None,
        comment=None,
    )


async def _write_progress_note(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket_task(
        db, actor=actor, uuid=need_uuid, changes={"progress_note": "兩人已到場"}
    )


async def _sign_up(db, actor, ticket_uuid, need_uuid):
    await ticket_service.assign_task_actor(db, actor=actor, task_uuid=need_uuid, actor_uuid=None, role=None)


async def _take_need_off(db, actor, ticket_uuid, need_uuid):
    await ticket_service.delete_ticket_task(db, actor=actor, uuid=need_uuid)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change, status",
    [
        (_change_title, "no_audit"),
        (_add_address, "no_audit"),
        (_answer_disaster_field, "no_audit"),
        (_add_need, "no_audit"),
        (_add_property, "no_audit"),
        (_same_title, "audited"),
        (_change_priority, "audited"),
        (_write_progress_note, "audited"),
        (_sign_up, "audited"),
        (_take_need_off, "audited"),
    ],
    ids=lambda value: value.__name__.strip("_") if callable(value) else value,
)
async def test_what_voids_a_verdict(db, change, status):
    """Content voids a verdict; the handling of the request does not."""
    ticket_uuid, need_uuid = await _audited_ticket(db)
    operator = await _operator(db)

    await change(db, operator, ticket_uuid, need_uuid)

    assert (await _state(db, ticket_uuid)).audit_status == status


async def _add_empty_address(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(
        db, actor=actor, uuid=ticket_uuid, changes={}, secondary_location={"location_type": "address"}
    )


async def _clear_the_empty_description(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(db, actor=actor, uuid=ticket_uuid, changes={"description": None})


async def _save_the_blank_description_as_empty(db, actor, ticket_uuid, need_uuid):
    await ticket_service.update_ticket(db, actor=actor, uuid=ticket_uuid, changes={"description": ""})


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change, voids, new_version",
    [
        (_change_title, True, True),
        (_add_address, True, True),
        (_add_empty_address, True, True),
        (_answer_disaster_field, True, True),
        (_add_need, True, True),
        (_add_property, True, True),
        (_same_title, False, False),
        (_clear_the_empty_description, False, False),
        (_save_the_blank_description_as_empty, False, False),
        (_change_priority, False, False),
        (_write_progress_note, False, False),
        (_sign_up, False, False),
        # Stricter on purpose: the hash names a version, so it cannot skip a removal the way
        # voiding does, and an auditor who read the need reloads rather than audit unseen content.
        (_take_need_off, False, True),
    ],
    ids=lambda value: value.__name__.strip("_") if callable(value) else str(value),
)
async def test_the_version_check_never_lets_a_change_through_unseen(db, change, voids, new_version):
    """Whatever voids a verdict also refuses a verdict on the version before it."""
    ticket_uuid, need_uuid = await _audited_ticket(db)
    before = await ticket_audit.content_of(db, await _state(db, ticket_uuid))

    await change(db, await _operator(db), ticket_uuid, need_uuid)

    after = await ticket_audit.content_of(db, await _state(db, ticket_uuid))
    assert bool(ticket_audit.content_changes(before, after, ticket_uuid=ticket_uuid)) is voids
    assert (ticket_audit.content_hash(before) != ticket_audit.content_hash(after)) is new_version
    assert ((await _state(db, ticket_uuid)).audit_status == "no_audit") is voids


@pytest.mark.asyncio
async def test_the_same_disaster_types_in_another_order_are_no_change(db):
    """A row written out of order, as seed data can be, then saved through the form in order."""
    seed_disaster_types(db)
    ticket = await _ticket(db)
    ticket.disaster_types = ["landslide", "flood"]
    ticket_uuid = str(ticket.uuid)
    await db.flush()
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None)

    await ticket_service.update_ticket(
        db, actor=await _operator(db), uuid=ticket_uuid, changes={"disaster_types": ["flood", "landslide"]}
    )

    assert (await _state(db, ticket_uuid)).audit_status == "audited"


@pytest.mark.asyncio
async def test_saving_an_address_member_blank_is_no_change(db):
    """The form leaves a member out once and sends it blank the next time: the same address."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    operator = await _operator(db)
    address = {"location_type": "address", "county": "花蓮縣"}
    await ticket_service.update_ticket(
        db, actor=operator, uuid=ticket_uuid, changes={}, secondary_location=address
    )
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None)
    await db.refresh(operator)  # the test session expires everything on commit

    await ticket_service.update_ticket(
        db, actor=operator, uuid=ticket_uuid, changes={}, secondary_location={**address, "lane": " "}
    )

    assert (await _state(db, ticket_uuid)).audit_status == "audited"


@pytest.mark.asyncio
async def test_an_issue_is_voided_like_any_verdict_and_its_note_kept(db):
    """The last note and its time survive, so the next auditor sees what was found."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audit_issue", note="地址與照片不符")

    await _change_title(db, await _operator(db), ticket_uuid, None)

    voided = await _state(db, ticket_uuid)
    assert (voided.audit_status, voided.audit_note) == ("no_audit", "地址與照片不符")
    assert voided.audited_at is not None, "when it was last checked survives the change"


@pytest.mark.asyncio
async def test_answering_the_disaster_fields_again_the_same_way_is_no_change(db):
    """The form sends every answer back on each save, in whatever order."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    operator = await _operator(db)
    await ticket_service.set_ticket_disaster_details(
        db, actor=operator, ticket_uuid=ticket_uuid, details={"needs": ["food", "water"]}
    )
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None)
    await db.refresh(operator)  # the test session expires everything on commit

    await ticket_service.set_ticket_disaster_details(
        db, actor=operator, ticket_uuid=ticket_uuid, details={"needs": ["water", "food"]}
    )

    assert (await _state(db, ticket_uuid)).audit_status == "audited"


@pytest.mark.asyncio
async def test_a_property_quantity_is_no_change_but_its_value_is(db):
    """A need's numbers are handling; what it asks for is content."""
    ticket_uuid, need_uuid = await _audited_ticket(db)
    operator = await _operator(db)
    prop = TaskProperty(task_uuid=need_uuid, property_name="tool", property_value="鏟子")
    db.add(prop)
    await db.flush()
    prop_uuid = str(prop.uuid)
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None)

    await db.refresh(operator)  # the test session expires everything on commit
    await ticket_service.update_task_property(db, actor=operator, uuid=prop_uuid, changes={"quantity": 5})
    assert (await _state(db, ticket_uuid)).audit_status == "audited"
    await db.refresh(operator)

    await ticket_service.update_task_property(
        db, actor=operator, uuid=prop_uuid, changes={"property_value": "推車"}
    )
    assert (await _state(db, ticket_uuid)).audit_status == "no_audit"


@pytest.mark.asyncio
async def test_the_scans_flag_stands_through_a_content_change(db):
    """A flagged ticket still needs checking after it changes."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await ticket_audit.flag_need_audit(db, [ticket_uuid])

    await _change_title(db, await _operator(db), ticket_uuid, None)

    assert (await _state(db, ticket_uuid)).audit_status == "need_audit"


@pytest.mark.asyncio
async def test_a_verdict_on_a_version_that_has_since_changed_is_refused(db):
    """The auditor read one version and the requester edited it before the click."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    seen = ticket_audit.content_hash(await ticket_audit.content_of(db, ticket))
    await _change_title(db, await _operator(db), ticket_uuid, None)

    with pytest.raises(ValueError, match="changed since it was loaded"):
        await ticket_audit.audit_ticket(
            db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None, seen_hash=seen
        )

    assert (await _state(db, ticket_uuid)).audit_status == "no_audit"


@pytest.mark.asyncio
async def test_a_change_to_the_handling_does_not_stop_a_verdict(db):
    """Priority is not content, so the version the auditor read still stands."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    seen = ticket_audit.content_hash(await ticket_audit.content_of(db, ticket))
    await _change_priority(db, await _operator(db), ticket_uuid, None)

    await ticket_audit.audit_ticket(
        db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None, seen_hash=seen
    )

    assert (await _state(db, ticket_uuid)).audit_status == "audited"


@pytest.mark.asyncio
async def test_a_verdict_waits_for_an_edit_in_flight_and_then_sees_it(db):
    """The verdict takes the ticket's lock before reading it, so an uncommitted edit is not missed.

    Reading first would see the old title, match the auditor's version, and commit `audited` on
    content the ticket no longer has once the edit lands.
    """
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    seen = ticket_audit.content_hash(await ticket_audit.content_of(db, ticket))
    auditor = await _auditor(db)
    await db.commit()

    engine = create_async_engine(TEST_DB_URL)
    editor = sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)()
    try:
        tickets = Tickets.__table__
        await editor.execute(tickets.update().where(tickets.c.uuid == ticket_uuid).values(title="改過的標題"))
        await db.refresh(auditor)
        running = asyncio.create_task(
            ticket_audit.audit_ticket(
                db, actor=auditor, uuid=ticket_uuid, status="audited", note=None, seen_hash=seen
            )
        )
        done, _ = await asyncio.wait({running}, timeout=1)
        assert not done, "the verdict did not wait for the edit holding the ticket"
        await editor.commit()
        with pytest.raises(ValueError, match="changed since it was loaded"):
            await running
    finally:
        await editor.close()
        await engine.dispose()

    assert (await _state(db, ticket_uuid)).audit_status == "no_audit"


# --- the scan ---


@pytest.mark.asyncio
async def test_the_scan_flags_unchecked_and_audited_tickets_only(db):
    """An issue already waits on somebody, and a deleted ticket is skipped."""
    statuses = {}
    for status, note in (
        ("no_audit", None),
        ("audited", None),
        ("audit_issue", "不符"),
        ("need_audit", None),
    ):
        ticket = await _ticket(db)
        ticket.audit_status, ticket.audit_note = status, note
        statuses[str(ticket.uuid)] = status
    deleted = await _ticket(db, deleted=True)
    statuses[str(deleted.uuid)] = "no_audit"
    await db.flush()

    flagged = await ticket_audit.flag_need_audit(db, list(statuses))

    assert flagged == 2
    after = {uuid: (await _state(db, uuid)).audit_status for uuid in statuses}
    assert after == {
        **statuses,
        **{uuid: "need_audit" for uuid, status in statuses.items() if status in ("no_audit", "audited")},
        str(deleted.uuid): "no_audit",
    }


# --- who hears about an issue ---


async def _notices(db, event_type: str = "ticket_audit_issue") -> dict[str, str]:
    rows = await db.execute(select(Notification).where(Notification.type == event_type))
    return {str(n.recipient_uuid): n.body for n in rows.scalars().all()}


@pytest.mark.asyncio
async def test_an_issue_is_told_to_the_requester_and_the_volunteers_without_the_note(db):
    """Each hears it in their own words; only staff read the note."""
    ticket = await _ticket(db)
    ticket_uuid, requester_uuid = str(ticket.uuid), str(ticket.created_by)
    await _need(db, ticket, claims=1)
    volunteer_uuid = str(
        await db.scalar(
            select(TaskAssignment.actor_uuid)
            .join(TicketTask, TicketTask.uuid == TaskAssignment.task_uuid)
            .where(TicketTask.ticket_uuid == ticket_uuid)
        )
    )

    await _give(
        db, actor=await _auditor(db), uuid=ticket_uuid, status="audit_issue", note="電話打不通，地址不存在"
    )

    notices = await _notices(db)
    assert set(notices) == {requester_uuid, volunteer_uuid}
    assert "請確認資料是否正確" in notices[requester_uuid]
    assert "您報名的求助單" in notices[volunteer_uuid]
    assert not any("電話打不通" in body for body in notices.values())


@pytest.mark.asyncio
async def test_an_audited_verdict_tells_nobody(db):
    """Only an issue is worth a notice."""
    ticket = await _ticket(db)
    await _need(db, ticket, claims=1)

    await _give(db, actor=await _auditor(db), uuid=str(ticket.uuid), status="audited", note=None)

    assert await _notices(db) == {}


@pytest.mark.asyncio
async def test_an_issue_notice_does_not_name_the_auditor(db):
    """Who audited is staff-only, and the notice reaches the requester."""
    ticket = await _ticket(db)
    await _need(db, ticket, claims=1)

    await _give(db, actor=await _auditor(db), uuid=str(ticket.uuid), status="audit_issue", note="不符")

    rows = (await db.execute(select(Notification).where(Notification.type == "ticket_audit_issue"))).scalars()
    actors = [notice.actor_uuid for notice in rows]
    assert actors and all(actor is None for actor in actors)


@pytest.mark.asyncio
async def test_an_auditor_who_filed_the_ticket_is_not_told_about_their_own_verdict(db):
    """Without an actor on the notice, the auditor is left out by hand."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    requester = await _acting_with(db, await db.get(User, ticket.created_by), {Perm.TICKET_AUDIT: "all"})

    await _give(db, actor=requester, uuid=ticket_uuid, status="audit_issue", note="不符")

    assert await _notices(db) == {}


# --- comparing with what was audited ---


@pytest.mark.asyncio
async def test_a_ticket_never_audited_has_nothing_to_compare_with(db):
    """No verdict, no audited content."""
    ticket = await _ticket(db)

    assert await ticket_audit.changes_since_audit(db, await _state(db, str(ticket.uuid))) is None


@pytest.mark.asyncio
async def test_the_changes_since_the_audit_name_each_field_and_its_two_values(db):
    """Each change carries its audited and current value; a need taken off is left out."""
    ticket_uuid, need_uuid = await _audited_ticket(db)
    operator = await _operator(db)
    for change in (_change_title, _add_need, _take_need_off):
        await change(db, operator, ticket_uuid, need_uuid)
        await db.refresh(operator)  # the test session expires everything on commit

    changes = await ticket_audit.changes_since_audit(db, await _state(db, ticket_uuid))

    by_field = {(c["entity"], c["field"]): c for c in changes}
    title = by_field[("ticket", "title")]
    assert (title["audited_value"], title["current_value"]) == ("一樓客廳積泥需要幫忙清", "改過的標題")
    added = by_field[("task", "task_name")]
    assert (added["audited_value"], added["current_value"]) == (None, "飲用水")
    assert not any(c["entity_uuid"] == need_uuid for c in changes), "a need taken off is no change"


@pytest.mark.asyncio
async def test_a_new_verdict_starts_the_comparison_over(db):
    """The new verdict's content is what later changes are compared with."""
    ticket_uuid, need_uuid = await _audited_ticket(db)
    await _change_title(db, await _operator(db), ticket_uuid, need_uuid)

    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audited", note=None)

    assert await ticket_audit.changes_since_audit(db, await _state(db, ticket_uuid)) == []


# --- the audit history, from the change log ---


@pytest_asyncio.fixture
async def audit_triggers(db):
    """The change log's triggers, which `create_all` does not install."""
    await db.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    for table in AUDITED_TABLES:
        await db.execute(text(get_audit_trigger_sql(table)))
    await db.commit()


@pytest.mark.asyncio
async def test_the_history_tells_verdicts_scan_flags_and_voiding_apart(db, audit_triggers):
    """Read from the change log, newest first."""
    ticket = await _ticket(db)
    ticket_uuid = str(ticket.uuid)
    await db.commit()
    await ticket_audit.flag_need_audit(db, [ticket_uuid])
    await _give(db, actor=await _auditor(db), uuid=ticket_uuid, status="audit_issue", note="照片與地址不符")
    await _change_title(db, await _operator(db), ticket_uuid, None)

    history = await ticket_audit.audit_history(db, ticket_uuid)

    assert [(e["kind"], e["status"], e["note"]) for e in history] == [
        ("content_change", "no_audit", None),
        ("verdict", "audit_issue", "照片與地址不符"),
        ("scan", "need_audit", None),
    ]
    assert all(isinstance(e["at"], datetime) and e["at"].tzinfo is not None for e in history)
    assert datetime.now(UTC) >= history[0]["at"]
