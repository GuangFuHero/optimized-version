"""The detail endpoint carries the card's two whole tickets (Spec 028 §2, ADR-372).

Wiring only: what goes into a ticket and its version is observed at the service
(tests/test_dedup_review_tickets.py). Everyone but the two seeded reviewers is already refused the
detail in test_dedup_review_api.py.
"""

import pytest

from tests.test_dedup_review_api import URL, _card, _headers

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("role_name", ["super_admin", "data_auditor"])
async def test_the_detail_carries_both_tickets_with_contacts(client, db_session, redis, role_name):
    """Both reviewers see each side's whole ticket, its contact and its needs, plus a version."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, role_name)

    response = await client.get(f"{URL}/{card['pair']}", headers=headers)

    assert response.status_code == 200, response.text
    tickets = response.json()["tickets"]
    low, high = tickets["low"], tickets["high"]
    assert {low["title"], high["title"]} == {"一樓淹水", "二樓淹水"}
    assert (low["contact_name"], high["contact_name"]) == ("李", "李")
    assert [task["uuid"] for task in low["tasks"]] == [card["low"]]
    assert [task["uuid"] for task in high["tasks"]] == [card["high"]]
    assert (low["tasks"][0]["claim_count"], low["tasks"][0]["properties"]) == (0, [])
    assert isinstance(low["version"], str) and low["version"] != ""


async def test_the_listing_has_no_tickets(client, db_session, redis):
    """Only the detail loads whole tickets (ADR-372)."""
    await _card(db_session)
    headers = await _headers(db_session, redis, "super_admin")

    response = await client.get(URL, headers=headers)

    assert "tickets" not in response.json()["items"][0]
