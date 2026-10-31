"""Previewing a resolve: the same checks and plan as the resolve itself, with nothing saved.

The world is test_dedup_resolve.py's: v2 is on both a1 and b1, so folding b1 into a1 counts them once.
"""

import uuid as uuid_mod

import pytest
from sqlalchemy import func, select

from app.models.audit import AuditLog
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.notification import Notification
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services import dedup_resolve
from tests.test_dedup_resolve import _example_one, _resolve, _versions, _world
from tests.test_dedup_resolve_api import _seen, _setup
from tests.test_dedup_review_api import URL, _headers

pytestmark = pytest.mark.asyncio


async def _preview(db, reviewer, ids, request=None):
    request = request or _example_one(ids, await _versions(db, reviewer, ids))
    await db.refresh(reviewer)
    return await dedup_resolve.preview(
        db, actor=reviewer, pair_uuid=uuid_mod.UUID(ids["pair"]), request=request
    )


def _kept(plan) -> dict:
    return {k.uuid: (k.headcount, k.quantity) for k in plan.kept_tasks}


async def test_a_person_on_two_merged_needs_counts_once(db):
    """a1 (v1, v2) absorbs b1 (v2, v3): three people, not four; b3 moves with v4."""
    reviewer, ids = await _world(db)

    plan = await _preview(db, reviewer, ids)

    assert _kept(plan) == {ids["a1"]: (3, 7), ids["a2"]: (0, 6), ids["b3"]: (1, 3)}


async def test_the_preview_matches_the_resolve(db):
    """The same body gives the same headcounts and quantities when it is carried out."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))

    previewed = await _preview(db, reviewer, ids, request)
    resolved = await _resolve(db, reviewer, ids, request)

    assert _kept(previewed) == _kept(resolved.outcome.plan)
    assert previewed == resolved.outcome.plan


async def _counts(db) -> dict:
    models = (Tickets, TicketTask, TaskProperty, TaskAssignment, DedupAuditEvent, Notification, AuditLog)
    counts = {model.__name__: await db.scalar(select(func.count()).select_from(model)) for model in models}
    counts["live needs"] = await db.scalar(
        select(func.count()).select_from(TicketTask).where(TicketTask.delete_at.is_(None))
    )
    return counts


async def test_a_preview_writes_nothing(db):
    """No row, event, notice or audit entry; the card and both tickets read as before."""
    reviewer, ids = await _world(db)
    before = await _counts(db), await _versions(db, reviewer, ids)

    await _preview(db, reviewer, ids)

    assert (await _counts(db), await _versions(db, reviewer, ids)) == before
    pair = await db.get(DuplicatePair, uuid_mod.UUID(ids["pair"]))
    await db.refresh(pair)
    assert (pair.status, pair.reviewed_by) == ("dup_ignored", None)
    assert not db.new and not db.dirty and not db.deleted


# --- through REST ---------------------------------------------------------------------------


async def test_the_preview_answers_the_merged_needs(client, db_session, redis):
    """A data auditor previews; the answer names what the primary keeps and what is cancelled."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)

    response = await client.post(f"{URL}/{ids['pair']}/resolve/preview", json=body, headers=headers)

    assert response.status_code == 200, response.text
    preview = response.json()
    assert (preview["primary_uuid"], preview["secondary_uuid"]) == (ids["a"], ids["b"])
    assert preview["canceled_tasks"] == []
    a1 = next(task for task in preview["kept_tasks"] if task["uuid"] == ids["a1"])
    assert a1 == {
        "uuid": ids["a1"],
        "task_type": "hr",
        "quantity": 7,
        "headcount": 3,
        "absorbed": [ids["b1"]],
        "moved": False,
    }
    b3 = next(task for task in preview["kept_tasks"] if task["uuid"] == ids["b3"])
    assert (b3["headcount"], b3["moved"]) == (1, True)
    card = (await client.get(f"{URL}/{ids['pair']}", headers=headers)).json()
    assert card["status"] == "dup_ignored"
    assert [event["event_type"] for event in card["events"]] == []


def _too_many(body, ids):
    body["primary_tasks"][0]["values"]["quantity"] = 2


def _stale(body, ids):
    body["expected_versions"] = {"low": "stale", "high": "stale"}


def _no_primary(body, ids):
    body.pop("primary")


def _long_note(body, ids):
    body["note"] = "長" * 1001


def _unnamed_need(body, ids):
    body["secondary_tasks"] = []


@pytest.mark.parametrize(
    ("broken", "code"),
    [(_too_many, 422), (_stale, 409), (_no_primary, 422), (_long_note, 422), (_unnamed_need, 422)],
    ids=["more people than the quantity", "stale version", "no primary", "note too long", "need left out"],
)
async def test_a_refused_body_is_refused_the_same_way(client, db_session, redis, broken, code):
    """Whatever the resolve refuses, the preview refuses with the same status and reason."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)
    broken(body, ids)

    previewed = await client.post(f"{URL}/{ids['pair']}/resolve/preview", json=body, headers=headers)
    resolved = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert previewed.status_code == resolved.status_code == code
    assert previewed.json() == resolved.json()


async def test_a_missing_card_is_not_found(client, db_session, redis):
    """An unknown card uuid answers 404, as the resolve does."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)

    response = await client.post(
        f"{URL}/00000000-0000-0000-0000-000000000000/resolve/preview", json=body, headers=headers
    )

    assert response.status_code == 404


async def test_a_resolved_card_is_a_conflict(client, db_session, redis):
    """Once resolved there is nothing left to preview."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "super_admin")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)
    assert (await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)).status_code == 200

    response = await client.post(f"{URL}/{ids['pair']}/resolve/preview", json=body, headers=headers)

    assert response.status_code == 409


@pytest.mark.parametrize("role_name", ["user", "admin", "member"])
async def test_everyone_who_cannot_resolve_is_refused(client, db_session, redis, role_name):
    """The preview takes ai_duplicate.review, as the resolve does."""
    ids = await _setup(db_session)
    reviewer = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, reviewer, ids)).model_dump(mode="json", exclude_unset=True)
    headers = await _headers(db_session, redis, role_name)

    response = await client.post(f"{URL}/{ids['pair']}/resolve/preview", json=body, headers=headers)

    assert response.status_code == 403


async def test_a_guest_is_unauthorized(client, db_session, redis):
    """Without a login the preview answers 401."""
    ids = await _setup(db_session)
    reviewer = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, reviewer, ids)).model_dump(mode="json", exclude_unset=True)

    response = await client.post(f"{URL}/{ids['pair']}/resolve/preview", json=body)

    assert response.status_code == 401
