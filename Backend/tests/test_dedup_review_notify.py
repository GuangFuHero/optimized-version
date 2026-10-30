"""Reviewers hear about new pair cards (Spec 025 §3, ADR-345): one notice per submission.

A stub engine suspects every draft of being `RELATED`, and each "create anyway" names it, so each
one leaves a dup_ignored card (ADR-400).
"""

import logging
import uuid as uuid_mod

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.dedup_engine import registry
from app.dedup_engine.contract import NewStation, NewTicket, Suspect, task_ref
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.services.dedup_submission import (
    SubmissionCreated,
    TaskSubmission,
    submit_new_station,
    submit_new_task,
    submit_new_ticket,
)
from app.services.notification_service import NotificationService
from tests.dedup_helpers import AsyncStubEngine, actor_with

pytestmark = pytest.mark.asyncio

POINT = {"type": "Point", "coordinates": [121.5601, 23.6701]}
TICKET = {
    "geometry": POINT,
    "title": "民生街淹水",
    "description": "一樓積水",
    "contact_name": "王小明",
    "contact_email": None,
    "task_type": "rescue",
    "contact_phone": "0912345678",
    "priority": "high",
    "disaster_types": ["flood"],
}


STATION = {
    "geometry": POINT,
    "type": "shelter",
    "name": "光復國小收容所",
    "description": None,
    "op_hour": None,
    "level": 0,
    "comment": None,
    "visibility": "public",
}


RELATED = str(uuid_mod.uuid4())


def _every_draft_like_related(submission) -> list[Suspect]:
    if isinstance(submission, NewStation):
        return [Suspect("station", "station", RELATED, 0.9, {})]
    drafts = submission.tasks if isinstance(submission, NewTicket) else (submission.task,)
    return [Suspect(task_ref(i), "ticket_task", RELATED, 0.9, {}) for i in range(len(drafts))]


@pytest.fixture(autouse=True)
def engine(monkeypatch) -> AsyncStubEngine:
    """Suspects every draft of being `RELATED`, so an acknowledgement naming it is carded."""
    stub = AsyncStubEngine(suspects=_every_draft_like_related)
    monkeypatch.setattr(registry, "_ENGINE", stub)
    return stub


@pytest.fixture
def sent(monkeypatch):
    """Record every notice instead of sending it."""
    calls = []

    async def record(db_, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(NotificationService, "dispatch", record)
    return calls


def _pending(calls) -> list[dict]:
    return [c for c in calls if c["event_type"] == "dedup_review_pending"]


def _task(name="抽水", ack=None) -> TaskSubmission:
    return TaskSubmission(task_type="rescue", task_name=name, acknowledged_duplicate_of=ack)


async def test_one_created_anyway_task_sends_one_notice(db, sent):
    """One card, one notice pointing at the queue."""
    actor = await actor_with(db, Perm.TICKET_ADD)

    await submit_new_ticket(db, actor=actor, tasks=[_task(ack=RELATED)], **TICKET)

    (notice,) = _pending(sent)
    assert "1 筆" in notice["title"]
    assert (notice["ref_type"], notice["ref_uuid"]) == ("dedup_review", None)
    assert notice["priority"] == "medium"


async def test_three_cards_in_one_submission_send_one_notice(db, sent):
    """Bundled per submission (DEDUP-009), so a ticket with many tasks does not flood the reviewers."""
    actor = await actor_with(db, Perm.TICKET_ADD)

    await submit_new_ticket(
        db, actor=actor, tasks=[_task(n, ack=RELATED) for n in ("抽水", "送水", "搬運")], **TICKET
    )

    (notice,) = _pending(sent)
    assert "3 筆" in notice["title"]


async def test_a_submission_without_cards_sends_none(db, engine, sent):
    """No create-anyway, no card, no notice."""
    engine.suspects = ()
    actor = await actor_with(db, Perm.TICKET_ADD)

    await submit_new_ticket(db, actor=actor, tasks=[_task(), _task("送水")], **TICKET)

    assert _pending(sent) == []


async def test_an_added_task_created_anyway_sends_one_notice(db, sent):
    """The createTicketTask path notifies too."""
    actor = await actor_with(db, Perm.TICKET_ADD, Perm.TICKET_EDIT)
    created = await submit_new_ticket(db, actor=actor, tasks=[], **TICKET)
    ticket_uuid = str(created.entity.uuid)
    await db.refresh(actor)

    result = await submit_new_task(db, actor=actor, ticket_uuid=ticket_uuid, task=_task(ack=RELATED))

    assert isinstance(result, SubmissionCreated)
    assert len(_pending(sent)) == 1


async def test_a_station_created_anyway_sends_one_notice_beside_the_station_notice(db, sent):
    """The createStation path notifies too, and keeps its own station notice."""
    actor = await actor_with(db, Perm.STATION_ADD)

    await submit_new_station(db, actor=actor, acknowledged_duplicate_of=RELATED, **STATION)

    assert len(_pending(sent)) == 1
    assert [c["event_type"] for c in sent].count("resource_station_updated") == 1


async def test_a_failing_notice_does_not_undo_the_create(db, monkeypatch, caplog):
    """The notice goes out after the commit; a failure is logged and the ticket stays."""
    actor = await actor_with(db, Perm.TICKET_ADD)

    async def explode(db_, **kwargs):
        raise RuntimeError("notification store is down")

    monkeypatch.setattr(NotificationService, "dispatch", explode)
    with caplog.at_level(logging.ERROR):
        result = await submit_new_ticket(db, actor=actor, tasks=[_task(ack=RELATED)], **TICKET)

    assert isinstance(result, SubmissionCreated)
    ticket_uuid = result.entity.uuid  # still readable: refreshed after the failed notice
    await db.rollback()
    assert await db.get(Tickets, ticket_uuid) is not None
    assert "dedup review notice" in caplog.text


async def _holder(db, name, *perms) -> str:
    """A committed user acting as a new platform role holding `perms`; returns the user uuid."""
    user = User(name=name)
    role = Role(name=f"role-{name}-{uuid_mod.uuid4().hex[:4]}", kind="platform")
    db.add_all([user, role])
    await db.flush()
    for perm in perms:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, role_kind="platform"))
    uid = str(user.uuid)
    await db.commit()
    return uid


async def test_the_notice_reaches_review_holders_only(db):
    """Recipients are whoever holds ai_duplicate.review (super_admin and data_auditor by seed)."""
    reviewer = await _holder(db, "檢核員", Perm.AI_DUP_VIEW, Perm.AI_DUP_REVIEW)
    viewer = await _holder(db, "只能看", Perm.AI_DUP_VIEW)
    actor = await actor_with(db, Perm.TICKET_ADD)
    actor_uuid = str(actor.uuid)

    await submit_new_ticket(db, actor=actor, tasks=[_task(ack=RELATED)], **TICKET)

    rows = (
        await db.execute(
            select(Notification.recipient_uuid).where(Notification.type == "dedup_review_pending")
        )
    ).scalars()
    recipients = {str(r) for r in rows}
    assert reviewer in recipients
    assert viewer not in recipients
    assert actor_uuid not in recipients
