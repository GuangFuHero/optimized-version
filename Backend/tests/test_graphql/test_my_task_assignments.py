"""「我的任務 › 我承接的」: every need the caller claimed, with where to go (spec Q16).

One row per claim, carrying the claim, the need and its ticket, so the drawer can show
「在哪裡、聯絡誰」 without a query per row. Newest first, no paging. A need that was canceled
or fulfilled stays on the list — that is how the volunteer learns 不用去了 — while one whose
task or ticket was deleted drops off. The ticket keeps its usual masking.
"""

from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import update

from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header, test_db

MY_CLAIMS = """
query {
    myTaskAssignments {
        assignment { uuid }
        task { taskName status }
        ticket { title contactName }
    }
}
"""

CLAIM = """
mutation($taskUuid: UUID!) { assignTaskActor(taskUuid: $taskUuid) { uuid } }
"""


async def _ticket_with_needs(requester_uuid: str, title: str, needs: list[str]) -> dict[str, str]:
    """A ticket filed by `requester_uuid` with one task per name; returns name -> task uuid."""
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=requester_uuid,
            title=title, contact_name="王小姐", status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        tasks = {}
        for name in needs:
            task = TicketTask(
                ticket_uuid=str(ticket.uuid), task_type="hr", task_name=name, quantity=5,
                source="user", visibility="public", created_by=requester_uuid,
            )
            db.add(task)
            await db.flush()
            tasks[name] = str(task.uuid)
        return tasks


async def _claim(client, token: str, task_uuid: str) -> str:
    res = await client.post(
        "/graphql", json={"query": CLAIM, "variables": {"taskUuid": task_uuid}}, headers=auth_header(token)
    )
    assert "errors" not in res.json(), res.json()
    return res.json()["data"]["assignTaskActor"]["uuid"]


async def _my_claims(client, token: str | None) -> dict:
    headers = auth_header(token) if token else {}
    return (await client.post("/graphql", json={"query": MY_CLAIMS}, headers=headers)).json()


@pytest.mark.asyncio
async def test_a_volunteer_lists_their_claims_newest_first(client, redis):
    """Each row is one claim with its need and ticket; the latest claim leads."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    _, volunteer_token = await _create_user_with_role(redis, "Login User")
    tasks = await _ticket_with_needs(requester_uuid, "需要清淤人力", ["清淤", "搬家具"])
    first = await _claim(client, volunteer_token, tasks["清淤"])
    second = await _claim(client, volunteer_token, tasks["搬家具"])

    body = await _my_claims(client, volunteer_token)

    assert "errors" not in body, body
    rows = body["data"]["myTaskAssignments"]
    assert [r["assignment"]["uuid"] for r in rows] == [second, first]
    assert [r["task"]["taskName"] for r in rows] == ["搬家具", "清淤"]
    assert {r["ticket"]["title"] for r in rows} == {"需要清淤人力"}


@pytest.mark.asyncio
async def test_only_the_callers_own_claims_are_listed(client, redis):
    """Someone else's claim on the same ticket is not mine to see here."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    _, volunteer_token = await _create_user_with_role(redis, "Login User")
    _, other_token = await _create_user_with_role(redis, "Login User")
    tasks = await _ticket_with_needs(requester_uuid, "需要物資", ["送水", "送米"])
    mine = await _claim(client, volunteer_token, tasks["送水"])
    await _claim(client, other_token, tasks["送米"])

    rows = (await _my_claims(client, volunteer_token))["data"]["myTaskAssignments"]

    assert [r["assignment"]["uuid"] for r in rows] == [mine]


@pytest.mark.asyncio
async def test_a_canceled_need_stays_listed_with_its_status(client, redis):
    """Seeing 已取消 on the list is how the volunteer learns they need not go."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    _, volunteer_token = await _create_user_with_role(redis, "Login User")
    tasks = await _ticket_with_needs(requester_uuid, "需要清淤人力", ["清淤"])
    await _claim(client, volunteer_token, tasks["清淤"])
    async with test_db() as db:
        await db.execute(update(TicketTask).where(TicketTask.uuid == tasks["清淤"]).values(status="canceled"))

    rows = (await _my_claims(client, volunteer_token))["data"]["myTaskAssignments"]

    assert [r["task"]["status"] for r in rows] == ["canceled"]


@pytest.mark.asyncio
@pytest.mark.parametrize("deleted", ["task", "ticket"])
async def test_a_claim_on_a_deleted_need_or_ticket_drops_off(client, redis, deleted):
    """Deleted means gone: there is nothing left to show where to go."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    _, volunteer_token = await _create_user_with_role(redis, "Login User")
    tasks = await _ticket_with_needs(requester_uuid, "需要清淤人力", ["清淤"])
    await _claim(client, volunteer_token, tasks["清淤"])
    async with test_db() as db:
        task = await db.get(TicketTask, tasks["清淤"])
        target = task if deleted == "task" else await db.get(Tickets, task.ticket_uuid)
        target.delete_at = datetime.now(UTC)

    rows = (await _my_claims(client, volunteer_token))["data"]["myTaskAssignments"]

    assert rows == []


@pytest.mark.asyncio
async def test_the_ticket_keeps_its_contact_masking(client, redis):
    """Claiming does not unlock the requester's contact details (spec Q12, still masked)."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    _, volunteer_token = await _create_user_with_role(redis, "Login User")
    tasks = await _ticket_with_needs(requester_uuid, "需要清淤人力", ["清淤"])
    await _claim(client, volunteer_token, tasks["清淤"])

    [row] = (await _my_claims(client, volunteer_token))["data"]["myTaskAssignments"]

    assert row["ticket"]["contactName"] == "王◯◯"


@pytest.mark.asyncio
async def test_a_guest_has_no_claims_to_list(client):
    """There is no "me" without signing in."""
    body = await _my_claims(client, None)

    # The sign-in wall itself, not just any error (require_authenticated's 401 detail).
    assert [e["message"] for e in body["errors"]] == ["401: Could not validate credentials"]
