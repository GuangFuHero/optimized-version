"""Notification params for station suggestions, and how the notifications API returns them."""

import pytest
from sqlalchemy import select

from app.models.notification import Notification
from tests.test_graphql.conftest import auth_header, test_db
from tests.test_graphql.test_suggestions import _create, _decide, _merge, _name_station

STATION = {"station_name": "糖廠加水站", "station_type": "shelter"}


async def _sent(kind_like, recipient):
    """(type, body, params) of each notice to `recipient` whose type matches, sorted."""
    async with test_db() as db:
        rows = await db.execute(
            select(Notification.type, Notification.body, Notification.params).where(
                Notification.type.like(kind_like), Notification.recipient_uuid == recipient
            )
        )
    return sorted((tuple(row) for row in rows), key=lambda row: row[:2])


@pytest.mark.asyncio
async def test_a_new_suggestion_names_the_station_and_the_field_label(
    client, auditor_auth, login_user_auth, sample_station, sample_station_property
):
    """The reviewers' notice says which station and which field, and stores both as params."""
    auditor_uuid, _ = auditor_auth
    _, user_token = login_user_auth
    await _name_station(sample_station, "糖廠加水站")
    await _create(client, user_token, "station", sample_station, "operational_status", "temporarily_closed")
    await _create(client, user_token, "station_property", sample_station_property, "quantity", "3")

    assert await _sent("station_suggestion_created", auditor_uuid) == [
        (
            "station_suggestion_created",
            "「糖廠加水站」的「數量」有一筆新的修改建議待審核。",
            {**STATION, "field": "quantity", "property_name": "restroom"},
        ),
        (
            "station_suggestion_created",
            "「糖廠加水站」的「營運狀態」有一筆新的修改建議待審核。",
            {**STATION, "field": "operational_status", "property_name": None},
        ),
    ]


@pytest.mark.asyncio
async def test_a_station_without_a_name_is_left_out_of_the_sentence(
    client, auditor_auth, login_user_auth, sample_station
):
    """No name to quote: the body opens with the field, and the params say the name is null."""
    auditor_uuid, _ = auditor_auth
    _, user_token = login_user_auth
    await _create(client, user_token, "station", sample_station, "op_hour", "24h")

    [(_, body, params)] = await _sent("station_suggestion_created", auditor_uuid)
    assert body == "「服務時間」有一筆新的修改建議待審核。"
    assert params == {
        "station_name": None,
        "station_type": "shelter",
        "field": "op_hour",
        "property_name": None,
    }


@pytest.mark.asyncio
async def test_each_outcome_notice_stores_the_station_and_the_field(
    client, auditor_auth, login_user_auth, sample_station, sample_station_property
):
    """Adopted, adopted with edits and not adopted all carry the station and the field decided."""
    first_uuid, first = login_user_auth
    _, auditor_token = auditor_auth
    await _name_station(sample_station, "糖廠加水站")
    await _create(client, first, "station", sample_station, "op_hour", "8-20")
    await _create(client, first, "station", sample_station, "name", "來亂站")
    await _create(client, first, "station_property", sample_station_property, "quantity", "5")

    await _merge(
        client,
        auditor_token,
        sample_station,
        [
            _decide(sample_station, "op_hour", "08:00-20:00"),
            _decide(sample_station, "name", approve=False),
            _decide(sample_station_property, "quantity", "5"),
        ],
    )

    sent = [(kind, params) for kind, _, params in await _sent("station_suggestion_%adopted%", first_uuid)]
    assert sent == [
        ("station_suggestion_adopted", {**STATION, "field": "quantity", "property_name": "restroom"}),
        ("station_suggestion_adopted_edited", {**STATION, "field": "op_hour", "property_name": None}),
        ("station_suggestion_not_adopted", {**STATION, "field": "name", "property_name": None}),
    ]


@pytest.mark.asyncio
async def test_the_api_returns_params_and_a_row_without_them_still_reads(
    client, auditor_auth, login_user_auth, sample_station
):
    """A notice sent now lists its params; one stored before them has params null and keeps its text."""
    auditor_uuid, auditor_token = auditor_auth
    _, user_token = login_user_auth
    await _name_station(sample_station, "糖廠加水站")
    await _create(client, user_token, "station", sample_station, "operational_status", "temporarily_closed")
    async with test_db() as db:
        db.add(
            Notification(
                recipient_uuid=auditor_uuid,
                type="zone_assigned",
                title="⚠️ 新指派工作區域：大平村",
                body="您的團隊已獲指派負責工作分區「大平村」，請進行評估與派工。",
            )
        )
        await db.commit()

    resp = await client.get("/api/v1/notifications", headers=auth_header(auditor_token))

    assert resp.status_code == 200
    items = {item["type"]: item for item in resp.json()["items"]}
    assert items["station_suggestion_created"]["params"] == {
        **STATION,
        "field": "operational_status",
        "property_name": None,
    }
    assert (
        items["station_suggestion_created"]["body"]
        == "「糖廠加水站」的「營運狀態」有一筆新的修改建議待審核。"
    )
    assert items["zone_assigned"]["params"] is None
    assert items["zone_assigned"]["title"] == "⚠️ 新指派工作區域：大平村"
