"""The schema masks unexpected errors but not domain ones (app/graphql/schema.py).

Every short column reachable from a Strawberry input used to leak. asyncpg's truncation error
quotes the whole failing statement, and a Strawberry `str` input carries no length constraint
(its pydantic counterpart in app/schemas/ carries `max_length`, which is why only GraphQL was
exposed). Length-checking each column in its service closes one hole; `MaskErrors` closes the
class, so these tests pin the boundary rather than the individual fields.

The pass-through cases matter as much as the masked ones: a mask that swallows everything
would satisfy the masked half of this file while turning every 400 into an opaque 500.
"""

import logging

import pytest

from tests.test_graphql.conftest import auth_header

STATIONS_SEARCH = """
query($q: String) {
    stations(q: $q) { pageInfo { totalCount } }
}
"""

CREATE_STATION = """
mutation($input: CreateStationInput!) {
    createStation(input: $input) { uuid }
}
"""

UPDATE_STATION = """
mutation($uuid: UUID!, $input: UpdateStationInput!) {
    updateStation(uuid: $uuid, input: $input) { uuid }
}
"""

CREATE_SUGGESTION = """
mutation($input: CreateStationSuggestionInput!) {
    createStationSuggestion(input: $input) { uuid }
}
"""

REVIEW_SUGGESTION = """
mutation($uuid: UUID!, $approve: Boolean!) {
    reviewStationSuggestion(uuid: $uuid, approve: $approve) { uuid status }
}
"""

STATION_PROPERTY_CONFIGS = """
query($stationType: String!) {
    stationPropertyConfigs(stationType: $stationType) { uuid propertyName }
}
"""

MASKED = "Unexpected error."
POINT = {"type": "Point", "coordinates": [121.5, 25.0]}


async def _post(client, query, variables, token=None):
    resp = await client.post(
        "/graphql",
        json={"query": query, "variables": variables},
        headers=auth_header(token) if token else {},
    )
    return resp.json()


def _assert_masked(body):
    """The message is the fixed placeholder, and nothing about the statement survives."""
    assert "errors" in body, body
    message = body["errors"][0]["message"]
    assert message == MASKED, message
    # Redundant given the equality above, but these name what actually used to leak, so a
    # future change to `error_message` cannot quietly reopen it.
    for leaked in ("SQL:", "INSERT", "UPDATE", "stations", "varchar", "asyncpg"):
        assert leaked not in message, (leaked, message)


async def _create_station(client, token, **fields) -> str:
    body = await _post(client, CREATE_STATION, {"input": {"geometry": POINT, **fields}}, token)
    assert "errors" not in body, body
    return body["data"]["createStation"]["uuid"]


@pytest.mark.asyncio
async def test_create_station_over_long_type_is_masked(client, coordinator_auth):
    """An unvalidated short column on INSERT: stations.type is varchar(50)."""
    _, token = coordinator_auth
    body = await _post(client, CREATE_STATION, {"input": {"geometry": POINT, "type": "T" * 300}}, token)
    _assert_masked(body)


@pytest.mark.asyncio
async def test_update_station_over_long_type_is_masked(client, coordinator_auth):
    """The UPDATE shape leaks a different statement — `SET type=$1 WHERE stations.uuid=$2`."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token)
    body = await _post(client, UPDATE_STATION, {"uuid": uuid, "input": {"type": "T" * 300}}, token)
    _assert_masked(body)


@pytest.mark.asyncio
async def test_review_suggestion_over_long_value_is_masked(client, coordinator_auth):
    """The indirect path, and the reason per-field validation is the wrong shape here.

    `station_update_suggestions.new_value` is an unbounded String, so an over-long value
    stores fine and only hits the narrow `stations.type` when a reviewer approves it. Nothing
    at the suggestion's own entry point could have caught this, and the statement leaked to
    the moderator rather than to the submitter.
    """
    _, token = coordinator_auth
    station_uuid = await _create_station(client, token)
    body = await _post(client, CREATE_SUGGESTION, {"input": {
        "targetType": "station", "targetUuid": station_uuid,
        "fieldName": "type", "newValue": "T" * 300,
    }}, token)
    assert "errors" not in body, body
    suggestion_uuid = body["data"]["createStationSuggestion"]["uuid"]

    body = await _post(client, REVIEW_SUGGESTION, {"uuid": suggestion_uuid, "approve": True}, token)
    _assert_masked(body)


@pytest.mark.asyncio
async def test_domain_value_error_is_not_masked(client, coordinator_auth):
    """A service ValueError is the API's contract and must survive verbatim (ADR-013/014)."""
    _, token = coordinator_auth
    body = await _post(client, CREATE_STATION, {"input": {
        "geometry": {"type": "LineString", "coordinates": [[121.5, 25.0], [121.6, 25.1]]},
    }}, token)
    assert "errors" in body, body
    assert "Station geometry must be a Point" in body["errors"][0]["message"], body


@pytest.mark.asyncio
async def test_permission_denied_is_not_masked(client):
    """The other allow-listed kind: HTTPException from the authz layer."""
    body = await _post(client, STATION_PROPERTY_CONFIGS, {"stationType": "shelter"})
    assert any("Permission Denied." in e["message"] for e in body.get("errors", [])), body


# ──────────────────────────────────────────────
# 記錄等級 (ADR-160)
# ──────────────────────────────────────────────
#
# 遮蔽決定「client 看到什麼」,記錄等級決定「維運看到什麼」。兩者共用同一個
# `_is_expected` 述詞,所以下面這幾條同時釘住「訊息是契約的錯誤不會被當成當機記錄」
# 與「真的當機仍然帶完整 traceback」。


def _records_at(caplog, level: int) -> list:
    return [r for r in caplog.records if r.levelno == level]


@pytest.mark.asyncio
async def test_a_length_violation_is_not_logged_as_a_server_fault(client, caplog):
    """ADR-160：長度違規是呼叫端輸入錯誤,不該以 ERROR + traceback 記錄。

    `stations` 在 PUBLIC_PERMS,匿名可打且沒有 rate limiter,使用者逐字輸入必然頻繁
    跨越 2 字邊界。ADR-084 原本把這件事交給前端擋,但端點公開且可直接呼叫,前端
    guard 不能當邊界。
    """
    with caplog.at_level(logging.INFO):
        body = await _post(client, STATIONS_SEARCH, {"q": "光"})

    assert "搜尋關鍵字至少" in body["errors"][0]["message"], body
    assert _records_at(caplog, logging.ERROR) == [], "a client input error must not log at ERROR"

    info = _records_at(caplog, logging.INFO)
    assert any("搜尋關鍵字至少" in r.getMessage() for r in info), "the message should still be logged"
    assert all(r.exc_info is None for r in info), "an expected error must not carry a traceback"


@pytest.mark.asyncio
async def test_permission_denied_is_not_logged_as_a_server_fault(client, caplog):
    """同一條規則的另一半:被允許通過遮蔽的 HTTPException 也不是伺服器故障。"""
    with caplog.at_level(logging.INFO):
        body = await _post(client, STATION_PROPERTY_CONFIGS, {"stationType": "shelter"})

    assert any("Permission Denied." in e["message"] for e in body.get("errors", [])), body
    assert _records_at(caplog, logging.ERROR) == []


@pytest.mark.asyncio
async def test_an_unexpected_error_still_logs_at_error_with_its_traceback(
    client, coordinator_auth, monkeypatch, caplog
):
    """降級只適用於 allow-list 內的錯誤——真正的當機必須完全照舊。

    這是上面兩條的必要配對:一個把所有東西都降成 INFO 的實作會通過那兩條,卻讓每一個
    500 悄悄消失。
    """
    from app.repositories import geo_repository

    async def boom(*args, **kwargs):
        raise RuntimeError("simulated internal fault")

    monkeypatch.setattr(geo_repository.station_repository, "count_active", boom)

    with caplog.at_level(logging.INFO):
        body = await _post(client, STATIONS_SEARCH, {"q": "光復"})

    assert body["errors"][0]["message"] == "Unexpected error.", body

    errors = _records_at(caplog, logging.ERROR)
    assert len(errors) == 1, caplog.records
    assert errors[0].exc_info is not None, "a genuine fault must keep its traceback"
    assert errors[0].exc_info[0] is RuntimeError
    assert "simulated internal fault" in str(errors[0].getMessage()), (
        "the log must keep the original message even though the client sees the mask"
    )
