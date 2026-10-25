"""POST /admin/duplicate-pairs/{uuid}/resolve is wired to the service (Spec 028 §3, ADR-365/366).

Wiring only: what a resolve writes is observed at the service (tests/test_dedup_resolve.py).
Roles come straight from `scripts/seed_rbac.py`, so who may resolve is what production grants.
"""

import pytest

from tests.test_dedup_resolve import _example_one, _world
from tests.test_dedup_review_api import URL, _headers

pytestmark = pytest.mark.asyncio


async def _seen(client, headers, ids) -> dict:
    """The versions the reviewer reads off the detail, as the admin page does."""
    tickets = (await client.get(f"{URL}/{ids['pair']}", headers=headers)).json()["tickets"]
    return {"low": tickets["low"]["version"], "high": tickets["high"]["version"]}


async def _setup(db_session):
    _, ids = await _world(db_session)
    await db_session.commit()
    return ids


@pytest.mark.parametrize("role_name", ["super_admin", "data_auditor"])
async def test_the_seeded_reviewers_resolve(client, db_session, redis, role_name):
    """ADR-366: both roles holding ai_duplicate.review resolve; the answer is the card as it now stands."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, role_name)
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)

    response = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert response.status_code == 200, response.text
    card = response.json()
    assert card["status"] == "confirmed"
    assert card["events"][-1]["event_type"] == "merged"
    tickets = card["tickets"]
    kept, gone = ("low", "high") if ids["a_is_low"] else ("high", "low")
    assert tickets[gone] is None
    quantities = {task["uuid"]: task["quantity"] for task in tickets[kept]["tasks"]}
    assert quantities == {ids["a1"]: 7, ids["a2"]: 6, ids["b3"]: 3}


@pytest.mark.parametrize("role_name", ["user", "admin", "member"])
async def test_everyone_else_is_refused(client, db_session, redis, role_name):
    """No other identity holds ai_duplicate.review."""
    ids = await _setup(db_session)
    reviewer = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, reviewer, ids)).model_dump(mode="json", exclude_unset=True)
    headers = await _headers(db_session, redis, role_name)

    response = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert response.status_code == 403


@pytest.mark.parametrize(
    "broken",
    [
        lambda body: body.pop("primary"),
        lambda body: body["primary_tasks"][0].update(action="merge"),
        lambda body: body.update(secondary_ticket="keep"),
        lambda body: body["primary_tasks"][0]["values"].update(quantity="seven"),
    ],
    ids=["no primary", "unknown action", "unknown field", "quantity not a number"],
)
async def test_a_malformed_request_is_unprocessable(client, db_session, redis, broken):
    """The schema refuses it before the service runs."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)
    broken(body)

    response = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert response.status_code == 422


async def test_a_request_the_plan_refuses_is_unprocessable(client, db_session, redis):
    """ADR-370: 3 people on a need of 2 is the reviewer's to fix, not a conflict."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)
    body["primary_tasks"][0]["values"]["quantity"] = 2

    response = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert response.status_code == 422
    assert "more than the quantity" in response.json()["detail"]


async def test_a_stale_version_is_a_conflict(client, db_session, redis):
    """ADR-374: the page reloads and the reviewer compares again."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, {"low": "stale", "high": "stale"}).model_dump(mode="json", exclude_unset=True)

    response = await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)

    assert response.status_code == 409


async def test_a_missing_card_is_not_found(client, db_session, redis):
    """An unknown card uuid answers 404, as for every other card action."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "data_auditor")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)

    response = await client.post(
        f"{URL}/00000000-0000-0000-0000-000000000000/resolve", json=body, headers=headers
    )

    assert response.status_code == 404


async def test_a_resolved_card_cannot_be_revoked(client, db_session, redis):
    """ADR-376 through REST: the revoke answers 409."""
    ids = await _setup(db_session)
    headers = await _headers(db_session, redis, "super_admin")
    body = _example_one(ids, await _seen(client, headers, ids)).model_dump(mode="json", exclude_unset=True)
    assert (await client.post(f"{URL}/{ids['pair']}/resolve", json=body, headers=headers)).status_code == 200

    response = await client.post(f"{URL}/{ids['pair']}/revoke", headers=headers)

    assert response.status_code == 409
