"""A volunteer claims a need — one `ticket_tasks` row — for themselves (PUB-PS-140).

Service-level (root conftest): the rules live in `assign_task_actor`, so that is where they
are observed. The public site claims per need, never per ticket: 「志工以『需求』為單位承接」.
"""

import asyncio
import contextlib
import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import ticket as ticket_service
from app.services.authz import refresh_actor
from app.services.ticket import assign_task_actor, stop_recruiting, unassign_task_actor, update_ticket_task
from tests.conftest import TEST_DB_URL, acting_as


async def _volunteer(db, name: str = "志工", scope: str = "own") -> User:
    """A signed-in citizen: the platform `user` role's `ticket.assign: own` (seed_rbac.py).

    `scope="all"` makes a coordinator instead, who may assign other people.
    """
    user = User(name=name)
    role = Role(name=f"user-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    permission = (
        await db.execute(select(Permission).where(Permission.key == Perm.TICKET_ASSIGN.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=Perm.TICKET_ASSIGN.value)
        db.add(permission)
        await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _need(db, *, quantity: int | None, status: str = "pending") -> TicketTask:
    """One need on a fresh ticket, created by someone other than the volunteers."""
    requester = User(name="求助者")
    db.add(requester)
    await db.flush()
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(requester.uuid),
        title="需要清淤人力", contact_name="王小姐", status="pending", priority="high",
    )
    db.add(ticket)
    await db.flush()
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="hr",
        task_name="清淤", quantity=quantity, status=status, created_by=str(requester.uuid),
    )
    db.add(task)
    await db.flush()
    return task


async def _claim(db, volunteer: User, task_uuid: str):
    """Claim for oneself. A claim commits, so a volunteer loaded earlier may be expired by now."""
    await refresh_actor(db, volunteer)
    return await assign_task_actor(db, actor=volunteer, task_uuid=task_uuid, actor_uuid=None, role=None)


async def _claims(db, task_uuid: str) -> int:
    return await db.scalar(select(func.count()).where(TaskAssignment.task_uuid == task_uuid))


@pytest.mark.asyncio
async def test_a_full_need_cannot_be_claimed(db):
    """Once as many volunteers have claimed as the need asks for, the next one is turned away."""
    task = await _need(db, quantity=1)
    task_uuid = str(task.uuid)
    first = await _volunteer(db, "先到")
    second = await _volunteer(db, "後到")
    await _claim(db, first, task_uuid)

    with pytest.raises(ValueError, match="Task is full"):
        await _claim(db, second, task_uuid)

    assert await _claims(db, task_uuid) == 1


@pytest.mark.asyncio
async def test_a_coordinator_may_still_send_more_than_the_need_asks_for(db):
    """The cap binds volunteers signing themselves up, not a coordinator assigning others (d847624)."""
    task = await _need(db, quantity=1)
    task_uuid = str(task.uuid)
    first = await _volunteer(db, "先到")
    extra = await _volunteer(db, "加派")
    extra_uuid = str(extra.uuid)
    coordinator = await _volunteer(db, "協調者", scope="all")
    await _claim(db, first, task_uuid)
    await refresh_actor(db, coordinator)

    await assign_task_actor(db, actor=coordinator, task_uuid=task_uuid, actor_uuid=extra_uuid, role=None)

    assert await _claims(db, task_uuid) == 2


@pytest.mark.asyncio
async def test_a_need_without_a_quantity_has_no_cap(db):
    """No quantity means the requester never said how many — so nobody is turned away."""
    task = await _need(db, quantity=None)
    task_uuid = str(task.uuid)
    volunteers = [await _volunteer(db, f"志工{n}") for n in range(3)]

    for volunteer in volunteers:
        await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["fulfilled", "canceled"])
async def test_a_closed_need_cannot_be_claimed(db, status):
    """A need that is done or called off has nothing left to go and do."""
    task = await _need(db, quantity=5, status=status)
    task_uuid = str(task.uuid)
    volunteer = await _volunteer(db)

    with pytest.raises(ValueError, match="Task is no longer open"):
        await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 0


@pytest.mark.asyncio
async def test_a_need_on_a_deleted_ticket_cannot_be_claimed(db):
    """Deleting the ticket takes its needs with it, even though the task rows stay behind."""
    task = await _need(db, quantity=5)
    task_uuid = str(task.uuid)
    ticket = await db.get(Tickets, task.ticket_uuid)
    ticket.delete_at = datetime.now(UTC)
    await db.flush()
    volunteer = await _volunteer(db)

    with pytest.raises(ValueError, match="Ticket task not found"):
        await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["completed", "cancelled"])
async def test_a_need_on_a_closed_ticket_cannot_be_claimed(db, status):
    """Closing a ticket leaves its needs pending, but a done or withdrawn request has nothing left to do."""
    task = await _need(db, quantity=5)
    task_uuid = str(task.uuid)
    ticket = await db.get(Tickets, task.ticket_uuid)
    ticket.status = status
    await db.flush()
    volunteer = await _volunteer(db)

    with pytest.raises(ValueError, match="Task is no longer open"):
        await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 0


@pytest.mark.asyncio
async def test_a_need_on_a_ticket_in_progress_can_still_be_claimed(db):
    """`in_progress` means someone has started on the ticket, not that it is done — it still takes people."""
    task = await _need(db, quantity=5)
    task_uuid = str(task.uuid)
    ticket = await db.get(Tickets, task.ticket_uuid)
    ticket.status = "in_progress"
    await db.flush()
    volunteer = await _volunteer(db)

    await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 1


@pytest.mark.asyncio
async def test_a_need_awaiting_review_can_be_claimed(db):
    """`pending_review` needs are already on the public site; blocking them would strand them."""
    task = await _need(db, quantity=2)
    assert task.moderation_status == "pending_review"
    task_uuid = str(task.uuid)
    volunteer = await _volunteer(db)

    await _claim(db, volunteer, task_uuid)

    assert await _claims(db, task_uuid) == 1


@pytest.mark.asyncio
async def test_two_volunteers_racing_for_the_last_place_get_one_claim(db, monkeypatch):
    """The need row is locked while counting, so the last place is given out once.

    Same recipe as the station reassignment race: two real connections, with a rendezvous
    between the count and the insert. Unlocked, both count zero and both insert. Locked, the
    second waits for the first commit, the first times out of the rendezvous alone, and the
    second then counts one and is turned away.
    """
    task = await _need(db, quantity=1)
    first = await _volunteer(db, "甲")
    second = await _volunteer(db, "乙")
    identities = {str(first.uuid): first.active_identity, str(second.uuid): second.active_identity}
    task_uuid = str(task.uuid)
    await db.commit()

    arrived, both_arrived = [], asyncio.Event()
    real_add = ticket_service.task_assignment_repository.add

    async def rendezvous(*args, **kwargs):
        """Hold each insert until the other has counted too, or give up waiting."""
        arrived.append(None)
        if len(arrived) == 2:
            both_arrived.set()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(both_arrived.wait(), timeout=1)
        return await real_add(*args, **kwargs)

    monkeypatch.setattr(ticket_service.task_assignment_repository, "add", rendezvous)

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:
        async def claim(session, user_uuid):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identities[user_uuid]
            await assign_task_actor(session, actor=actor, task_uuid=task_uuid, actor_uuid=None, role=None)

        outcomes = await asyncio.gather(
            *(claim(session, uid) for session, uid in zip(sessions, identities, strict=True)),
            return_exceptions=True,
        )
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, ValueError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    assert "Task is full" in str(refused[0])
    assert await _claims(db, task_uuid) == 1


# --- the lock order every writer keeps: the ticket, then its need (spec Q44) ---


async def _waits_for_the_ticket(ticket_uuid: str, action) -> None:
    """Run `action(session)` on one connection while another holds the ticket FOR UPDATE.

    A ticket's status is worked out from all of its needs, so whatever changes a need locks the
    ticket first and the need second; one fixed order makes a claim and a delete of the whole
    ticket queue behind each other instead of deadlocking. The holder stands in for such a
    writer: the action must still be waiting a second later, and finish once it lets go.
    """
    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    holder, other = (sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines)
    try:
        await holder.execute(select(Tickets).where(Tickets.uuid == ticket_uuid).with_for_update())
        running = asyncio.create_task(action(other))
        done, _ = await asyncio.wait({running}, timeout=1)
        if done:
            running.result()  # a failure is the real story; re-raise it
            pytest.fail("finished while another connection held the ticket: it never asked for the ticket")
        await holder.rollback()
        await running
    finally:
        await holder.close()
        await other.close()
        for engine in engines:
            await engine.dispose()


@pytest.mark.asyncio
async def test_a_claim_waits_for_whoever_holds_the_ticket(db):
    """A claim takes the ticket's lock before the need's, so it queues behind the ticket's holder."""
    task = await _need(db, quantity=2)
    volunteer = await _volunteer(db)
    volunteer_uuid, identity = str(volunteer.uuid), volunteer.active_identity
    task_uuid, ticket_uuid = str(task.uuid), task.ticket_uuid
    await db.commit()

    async def claim(session):
        actor = await session.get(User, volunteer_uuid)
        actor.active_identity = identity
        await assign_task_actor(session, actor=actor, task_uuid=task_uuid, actor_uuid=None, role=None)

    await _waits_for_the_ticket(ticket_uuid, claim)

    assert await _claims(db, task_uuid) == 1


@pytest.mark.asyncio
async def test_a_release_waits_for_whoever_holds_the_ticket(db):
    """Releasing a place keeps the same order as claiming one: the ticket first, then the need."""
    task = await _need(db, quantity=2)
    volunteer = await _volunteer(db)
    volunteer_uuid, identity = str(volunteer.uuid), volunteer.active_identity
    task_uuid, ticket_uuid = str(task.uuid), task.ticket_uuid
    assignment = await _claim(db, volunteer, task_uuid)
    assignment_uuid = str(assignment.uuid)
    await db.commit()

    async def release(session):
        actor = await session.get(User, volunteer_uuid)
        actor.active_identity = identity
        await unassign_task_actor(session, actor=actor, uuid=assignment_uuid)

    await _waits_for_the_ticket(ticket_uuid, release)

    assert await _claims(db, task_uuid) == 0


# --- who hears about a claim (spec Q18; prototype site-actions.jsx:473-496) ---


async def _notices(db, recipient: str, event_type: str) -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(Notification.recipient_uuid == recipient, Notification.type == event_type)
    )
    return list(rows.scalars().all())


@pytest.mark.asyncio
async def test_the_requester_hears_who_claimed_their_need(db):
    """The requester is told a volunteer is coming, and who — not just that a count moved."""
    task = await _need(db, quantity=3)
    task_uuid, requester = str(task.uuid), str(task.created_by)
    volunteer = await _volunteer(db, "陳志工")

    await _claim(db, volunteer, task_uuid)

    [notice] = await _notices(db, requester, "task_claimed")
    assert notice.title == "陳志工 承接了你的「清淤」"
    assert notice.body == "需要清淤人力　目前 1/3 人"


@pytest.mark.asyncio
async def test_the_requester_hears_who_a_coordinator_sent(db):
    """Someone is coming either way: a coordinator's assignment names the person sent."""
    task = await _need(db, quantity=3)
    task_uuid, requester = str(task.uuid), str(task.created_by)
    sent = await _volunteer(db, "林志工")
    sent_uuid = str(sent.uuid)
    coordinator = await _volunteer(db, "協調者", scope="all")

    await assign_task_actor(db, actor=coordinator, task_uuid=task_uuid, actor_uuid=sent_uuid, role=None)

    [notice] = await _notices(db, requester, "task_claimed")
    assert notice.title == "林志工 承接了你的「清淤」"
    assert notice.body == "需要清淤人力　目前 1/3 人"


@pytest.mark.asyncio
async def test_a_ticket_without_a_requester_tells_nobody(db):
    """`tickets.created_by` is nullable (e.g. an import); there is then nobody to tell."""
    task = await _need(db, quantity=3)
    task_uuid = str(task.uuid)
    ticket = await db.get(Tickets, task.ticket_uuid)
    ticket.created_by = None
    await db.flush()
    volunteer = await _volunteer(db)

    await _claim(db, volunteer, task_uuid)

    claimed_notices = await db.scalar(
        select(func.count()).select_from(Notification).where(Notification.type == "task_claimed")
    )
    assert claimed_notices == 0


@pytest.mark.asyncio
async def test_a_requester_claiming_their_own_need_is_not_told_about_it(db):
    """A village chief who asks for help and also brings people does not notify themselves."""
    task = await _need(db, quantity=3)
    task_uuid, requester_uuid = str(task.uuid), str(task.created_by)
    requester = await db.get(User, requester_uuid)
    role = Role(name="self-claim", kind="platform")
    db.add(role)
    await db.flush()
    permission = (
        await db.execute(select(Permission).where(Permission.key == Perm.TICKET_ASSIGN.value))
    ).scalar_one_or_none() or Permission(key=Perm.TICKET_ASSIGN.value)
    db.add(permission)
    await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="own"))
    db.add(UserRoleAssign(user_uuid=requester.uuid, role_uuid=role.uuid))
    await db.flush()
    acting_as(requester, role)

    await _claim(db, requester, task_uuid)

    assert await _notices(db, requester_uuid, "task_claimed") == []


@pytest.mark.asyncio
async def test_the_claim_that_fills_a_need_tells_the_others_already_on_it(db):
    """Only at the moment the need fills: everyone already signed up hears they are complete."""
    task = await _need(db, quantity=2)
    task_uuid, requester = str(task.uuid), str(task.created_by)
    first = await _volunteer(db, "先到")
    last = await _volunteer(db, "補滿")
    first_uuid, last_uuid = str(first.uuid), str(last.uuid)

    await _claim(db, first, task_uuid)
    assert await _notices(db, first_uuid, "task_full") == []
    await _claim(db, last, task_uuid)

    [notice] = await _notices(db, first_uuid, "task_full")
    assert notice.title == "「清淤」已經湊齊人了"
    assert notice.body == "需要清淤人力　你仍然在名單上，時間到請照常前往。"
    assert await _notices(db, last_uuid, "task_full") == []
    assert await _notices(db, requester, "task_full") == []


@pytest.mark.asyncio
async def test_a_need_without_a_quantity_never_fills(db):
    """No cap means no moment of filling up, so nobody is told the need is complete."""
    task = await _need(db, quantity=None)
    task_uuid, requester = str(task.uuid), str(task.created_by)
    first = await _volunteer(db, "先到")
    second = await _volunteer(db, "後到")
    first_uuid = str(first.uuid)

    await _claim(db, first, task_uuid)
    await _claim(db, second, task_uuid)

    assert await _notices(db, first_uuid, "task_full") == []
    requester_notices = await _notices(db, requester, "task_claimed")
    assert [n.body for n in requester_notices] == ["需要清淤人力　目前 1 人", "需要清淤人力　目前 2 人"]


# --- the requester stops recruiting (spec Q17/Q21) ---


async def _may_edit_own_tickets(db, user: User) -> User:
    """Act as the platform `user` role's `ticket.edit: own` (seed_rbac.py)."""
    role = Role(name=f"editor-{uuidlib.uuid4().hex[:8]}", kind="platform")
    db.add(role)
    await db.flush()
    permission = (
        await db.execute(select(Permission).where(Permission.key == Perm.TICKET_EDIT.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=Perm.TICKET_EDIT.value)
        db.add(permission)
        await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="own"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _requester_of(db, task_uuid: str) -> User:
    """The requester of the need's ticket, signed in."""
    task = await db.get(TicketTask, task_uuid)
    return await _may_edit_own_tickets(db, await db.get(User, task.created_by))


async def _second_need(db, first: TicketTask, name: str, status: str = "pending") -> TicketTask:
    """Another need on the same ticket as `first`."""
    task = TicketTask(
        uuid=uuidlib.uuid4(), ticket_uuid=first.ticket_uuid, task_type="hr", task_name=name,
        quantity=5, status=status, created_by=first.created_by,
    )
    db.add(task)
    await db.flush()
    return task


async def _statuses(db, ticket_uuid: str) -> dict[str, str]:
    rows = await db.execute(
        select(TicketTask.task_name, TicketTask.status).where(TicketTask.ticket_uuid == ticket_uuid)
    )
    return dict(rows.all())


@pytest.mark.asyncio
async def test_stopping_recruitment_cancels_every_open_need(db):
    """Pending and in-progress needs close; one already fulfilled keeps its outcome."""
    first = await _need(db, quantity=5)
    await _second_need(db, first, "搬家具", status="in_progress")
    await _second_need(db, first, "送水", status="fulfilled")
    ticket_uuid, first_uuid = str(first.ticket_uuid), str(first.uuid)
    requester = await _requester_of(db, first_uuid)

    await stop_recruiting(db, actor=requester, ticket_uuid=ticket_uuid)

    assert await _statuses(db, ticket_uuid) == {"清淤": "canceled", "搬家具": "canceled", "送水": "fulfilled"}
    canceled_at = await db.scalar(select(TicketTask.canceled_at).where(TicketTask.uuid == first_uuid))
    assert canceled_at is not None


@pytest.mark.asyncio
async def test_each_volunteer_hears_once_that_they_need_not_go(db):
    """One notice per person, naming every need of theirs that closed — not one per need."""
    first = await _need(db, quantity=5)
    second = await _second_need(db, first, "搬家具")
    ticket_uuid, first_uuid, second_uuid = str(first.ticket_uuid), str(first.uuid), str(second.uuid)
    both = await _volunteer(db, "兩筆都接")
    one = await _volunteer(db, "只接一筆")
    both_uuid, one_uuid = str(both.uuid), str(one.uuid)
    await _claim(db, both, first_uuid)
    await _claim(db, both, second_uuid)
    await _claim(db, one, second_uuid)
    requester = await _requester_of(db, first_uuid)

    await stop_recruiting(db, actor=requester, ticket_uuid=ticket_uuid)

    [to_both] = await _notices(db, both_uuid, "ticket_recruiting_stopped")
    # Needs are named in the order they were filed, then by name; both were filed in this
    # test's one transaction, so the name decides.
    assert to_both.title == "你承接的「搬家具」、「清淤」已經取消"
    assert to_both.body == "需要清淤人力　建立者停止招募了，不用前往了。"
    [to_one] = await _notices(db, one_uuid, "ticket_recruiting_stopped")
    assert to_one.title == "你承接的「搬家具」已經取消"


@pytest.mark.asyncio
async def test_only_someone_who_may_edit_the_ticket_can_stop_it(db):
    """ticket.edit on the ticket: a volunteer cannot call off someone else's request."""
    task = await _need(db, quantity=5)
    ticket_uuid = str(task.ticket_uuid)
    stranger = User(name="路人")
    db.add(stranger)
    await db.flush()
    stranger = await _may_edit_own_tickets(db, stranger)

    with pytest.raises(HTTPException) as exc:
        await stop_recruiting(db, actor=stranger, ticket_uuid=ticket_uuid)

    assert exc.value.status_code == 403
    assert await _statuses(db, ticket_uuid) == {"清淤": "pending"}


@pytest.mark.asyncio
async def test_a_ticket_with_nothing_open_changes_nothing(db):
    """Stopping twice, or after everything was done, is a quiet no-op."""
    task = await _need(db, quantity=5, status="fulfilled")
    ticket_uuid, task_uuid = str(task.ticket_uuid), str(task.uuid)
    requester = await _requester_of(db, task_uuid)

    stopped = await stop_recruiting(db, actor=requester, ticket_uuid=ticket_uuid)

    assert stopped == []
    assert await _statuses(db, ticket_uuid) == {"清淤": "fulfilled"}


@pytest.mark.asyncio
async def test_a_deleted_ticket_cannot_be_stopped(db):
    """A deleted ticket is gone, like everywhere else."""
    task = await _need(db, quantity=5)
    ticket_uuid, task_uuid = str(task.ticket_uuid), str(task.uuid)
    requester = await _requester_of(db, task_uuid)
    ticket = await db.get(Tickets, task.ticket_uuid)
    ticket.delete_at = datetime.now(UTC)
    await db.flush()

    with pytest.raises(ValueError, match="Ticket not found"):
        await stop_recruiting(db, actor=requester, ticket_uuid=ticket_uuid)


# --- the per-task notices speak Chinese, not enum values (spec Q22) ---


async def _claimed_by_one(db) -> tuple[str, str, User]:
    """A need one volunteer claimed; returns (task_uuid, volunteer_uuid, signed-in requester)."""
    task = await _need(db, quantity=5)
    task_uuid = str(task.uuid)
    volunteer = await _volunteer(db, "陳志工")
    volunteer_uuid = str(volunteer.uuid)
    await _claim(db, volunteer, task_uuid)
    return task_uuid, volunteer_uuid, await _requester_of(db, task_uuid)


@pytest.mark.asyncio
async def test_canceling_a_need_tells_its_volunteers_they_need_not_go(db):
    """The one change a volunteer must not miss reads like the stop-recruiting notice."""
    task_uuid, volunteer_uuid, requester = await _claimed_by_one(db)

    await update_ticket_task(db, actor=requester, uuid=task_uuid, changes={"status": "canceled"})

    [notice] = await _notices(db, volunteer_uuid, "ticket_task_status_update")
    assert notice.title == "你承接的「清淤」已經取消"
    assert notice.body == "「清淤」已取消，不用前往了。"
    assert notice.priority == "high"  # same weight as stop_recruiting's 不用前往了


@pytest.mark.asyncio
async def test_other_status_changes_name_the_status_in_chinese(db):
    """「處理中」, not 【in_progress】: the reader is a volunteer, not the database."""
    task_uuid, volunteer_uuid, requester = await _claimed_by_one(db)

    await update_ticket_task(db, actor=requester, uuid=task_uuid, changes={"status": "in_progress"})

    [notice] = await _notices(db, volunteer_uuid, "ticket_task_status_update")
    assert notice.body == "工單任務「清淤」狀態已變更為【處理中】。"
    assert notice.priority == "medium"


@pytest.mark.asyncio
async def test_moderation_changes_name_the_outcome_in_chinese(db):
    """「已通過」, not 【approved】 — same words the site uses (待審核／已通過／已退回)."""
    task_uuid, volunteer_uuid, requester = await _claimed_by_one(db)

    await update_ticket_task(db, actor=requester, uuid=task_uuid, changes={"moderation_status": "approved"})

    [notice] = await _notices(db, volunteer_uuid, "ticket_task_moderation_update")
    assert notice.body == "工單任務「清淤」審核狀態已變更為【已通過】。"
