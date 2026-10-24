"""The notices a resolve sends after it commits (Spec 028 §6, ADR-378).

Built on the world of test_dedup_resolve.py: v1 and v2 on a1, v2 and v3 on b1, v4 on b3.
"""

import logging

import pytest
from sqlalchemy import select

from app.models.notification import Notification
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment
from app.services.notification_service import NotificationService
from tests.test_dedup_resolve import _example_one, _resolve, _versions, _world
from tests.test_dedup_resolve_api import _seen, _setup
from tests.test_dedup_review_api import URL, _headers

pytestmark = pytest.mark.asyncio


async def _sent(db) -> dict[str, set[str]]:
    """Recipients of each dedup notice type."""
    rows = await db.execute(
        select(Notification.type, Notification.recipient_uuid).where(Notification.type.like("dedup_%"))
    )
    sent: dict[str, set[str]] = {}
    for kind, recipient in rows.all():
        sent.setdefault(kind, set()).add(str(recipient))
    return sent


async def _all(db) -> list[Notification]:
    return list((await db.scalars(select(Notification).where(Notification.type.like("dedup_%")))).all())


async def test_example_one_tells_the_moved_people_and_both_owners(db):
    """v3 moved with b1 and v4 with b3; v2 was already on a1 and is told nothing new."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    assert await _sent(db) == {
        "dedup_task_merged": {ids["v3"], ids["v4"]},
        "dedup_ticket_merged": {ids["owner_b"]},
        "dedup_ticket_updated": {ids["owner_a"]},
    }


async def test_every_notice_points_at_the_kept_ticket(db):
    """The cancelled ticket is not shown any more, so every notice opens the primary one."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    assert {(n.ref_type, str(n.ref_uuid)) for n in await _all(db)} == {("ticket", ids["a"])}


async def test_people_on_a_cancelled_need_are_told_it_is_cancelled(db):
    """b2 is cancelled rather than folded: whoever was on it hears so."""
    reviewer, ids = await _world(db)
    db.add(TaskAssignment(task_uuid=ids["b2"], actor_uuid=ids["v1"]))
    await db.flush()
    request = _example_one(ids, await _versions(db, reviewer, ids))
    request.primary_tasks[1].absorb = []
    request.primary_tasks[1].values.quantity = 1
    request.secondary_tasks.append(type(request.secondary_tasks[0])(task=ids["b2"], action="cancel"))

    await _resolve(db, reviewer, ids, request)

    assert (await _sent(db))["dedup_task_canceled"] == {ids["v1"]}


async def test_one_notice_of_a_kind_per_person(db):
    """v3 on both folded needs hears once."""
    reviewer, ids = await _world(db)
    db.add(TaskAssignment(task_uuid=ids["b2"], actor_uuid=ids["v3"]))
    await db.flush()

    await _resolve(db, reviewer, ids)

    merged = [n for n in await _all(db) if n.type == "dedup_task_merged"]
    assert sorted(str(n.recipient_uuid) for n in merged) == sorted([ids["v3"], ids["v4"]])


async def test_the_reviewer_is_not_told_of_their_own_resolve(db):
    """The reviewer owning A gets no `dedup_ticket_updated`."""
    reviewer, ids = await _world(db)
    a = await db.get(Tickets, ids["a"])
    a.created_by = reviewer.uuid  # on base_geometries, so not through a bulk update of Tickets
    await db.flush()

    await _resolve(db, reviewer, ids)

    assert "dedup_ticket_updated" not in await _sent(db)


async def test_the_notices_carry_no_contact_details(db):
    """Contacts may change again; the notice says where to look, not what they are."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids), ticket={"contact_phone": "0987654321"})

    await _resolve(db, reviewer, ids, request)

    for notice in await _all(db):
        assert "0912345678" not in f"{notice.title}{notice.body}"
        assert "0987654321" not in f"{notice.title}{notice.body}"


async def test_the_other_owner_hears_what_went_where(db):
    """B's owner is told B is folded into A and which needs went over."""
    reviewer, ids = await _world(db)

    await _resolve(db, reviewer, ids)

    (notice,) = [n for n in await _all(db) if n.type == "dedup_ticket_merged"]
    assert "A 一樓淹水" in notice.title and "B 一樓淹水" in notice.title
    assert "清淤" in notice.body and "便當" in notice.body


async def test_a_failing_notice_does_not_undo_the_resolve(db, monkeypatch, caplog):
    """Notices go after the commit; a failure is logged and the resolve stands."""
    reviewer, ids = await _world(db)
    request = _example_one(ids, await _versions(db, reviewer, ids))

    async def explode(*args, **kwargs):
        raise RuntimeError("notification store is down")

    monkeypatch.setattr(NotificationService, "dispatch", explode)
    with caplog.at_level(logging.ERROR):
        result = await _resolve(db, reviewer, ids, request)

    assert result.detail.item.pair.status == "confirmed"
    assert (await db.get(Tickets, ids["b"], populate_existing=True)).status == "cancelled"
    assert "dedup resolve notices failed" in caplog.text


async def test_a_failing_notice_still_answers_through_rest(client, db_session, redis, monkeypatch):
    """The rollback after a failed notice expires the session; the response must not break."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)

    async def explode(*args, **kwargs):
        raise RuntimeError("notification store is down")

    monkeypatch.setattr(NotificationService, "dispatch", explode)
    response = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "confirmed"
