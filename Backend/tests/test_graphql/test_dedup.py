"""GraphQL integration tests for the dedup fast layer (送單前查重複).

Exercises the real SQL path — PostGIS distance and pg_trgm `similarity()` — plus the
permission gate and the hint-outcome write. The scoring formula itself is unit-tested in
tests/test_dedup_scoring.py; here we only care that the pieces are wired together.
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.models.dedup import TicketDedupAuditEvent, TicketDuplicatePair
from app.models.request import Tickets
from tests.test_graphql.conftest import auth_header, test_db

DEDUP_CANDIDATES = """
query($input: TicketDedupCheckInput!) {
    ticketDedupCandidates(input: $input) {
        relatedTicketUuid
        similarity
        scoreComponents { name score weight passed }
    }
}
"""

RECORD_OUTCOME = """
mutation($input: RecordDedupHintOutcomeInput!) {
    recordDedupHintOutcome(input: $input) { auditEventUuid hintOutcome pairUuid }
}
"""

# The location every fixture ticket in this file sits at.
FLOODED_STREET = (121.5601, 23.6701)


def _check_input(**overrides) -> dict:
    """Build a TicketDedupCheckInput for a ticket filed at the same flooded street."""
    payload = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "title": "民生街三段淹水需要抽水機",
        "description": "一樓積水到膝蓋，需要抽水機",
        "taskType": "rescue",
    }
    payload.update(overrides)
    return payload


async def _seed_ticket(user_uuid: str, *, offset_deg=0.0, age_min=10.0, **overrides) -> str:
    """Seed one open ticket near the flooded street and return its uuid."""
    fields = {
        "title": "民生街三段淹水需要抽水機",
        "description": "一樓積水到膝蓋，需要抽水機",
        "status": "pending",
        "priority": "high",
        "task_type": "rescue",
        "visibility": "public",
    }
    fields.update(overrides)
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(
                Point(FLOODED_STREET[0] + offset_deg, FLOODED_STREET[1]), srid=4326
            ),
            created_by=user_uuid,
            contact_name="Test",
            created_at=datetime.now(UTC) - timedelta(minutes=age_min),
            **fields,
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


@pytest_asyncio.fixture(autouse=True)
async def _clean_tickets():
    """Start each test with no tickets, so one test's fixture is not another's candidate."""
    async with test_db() as db:
        for model in (TicketDedupAuditEvent, TicketDuplicatePair):
            for row in (await db.execute(select(model))).scalars().all():
                await db.delete(row)
        for row in (await db.execute(select(Tickets))).scalars().all():
            await db.delete(row)
    yield


@pytest.mark.asyncio
async def test_hint_returned_for_a_near_identical_open_ticket(client, login_user_auth):
    """Same street, same wording, minutes old — the submitter gets one hint with a breakdown."""
    user_uuid, token = login_user_auth
    existing = await _seed_ticket(user_uuid)

    res = await client.post(
        "/graphql",
        json={"query": DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    hints = res.json()["data"]["ticketDedupCandidates"]
    assert len(hints) == 1
    assert hints[0]["relatedTicketUuid"] == existing
    assert hints[0]["similarity"] >= 0.8
    names = {c["name"] for c in hints[0]["scoreComponents"]}
    assert names == {"distance", "time", "task_type", "text"}
    text = next(c for c in hints[0]["scoreComponents"] if c["name"] == "text")
    assert text["score"] > 0.5  # pg_trgm actually ran


@pytest.mark.asyncio
async def test_no_hint_for_a_distant_unrelated_ticket(client, login_user_auth):
    """A different problem a few hundred metres away stays below the threshold."""
    user_uuid, token = login_user_auth
    await _seed_ticket(
        user_uuid,
        offset_deg=0.004,  # ~400 m east
        age_min=4000.0,
        title="需要志工幫忙搬物資",
        description="倉庫缺人手",
        task_type="hr",
    )

    res = await client.post(
        "/graphql",
        json={"query": DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    assert res.json()["data"]["ticketDedupCandidates"] == []


@pytest.mark.asyncio
async def test_closed_and_deleted_tickets_are_not_candidates(client, login_user_auth):
    """Only 未結案 tickets are compared — a completed or soft-deleted twin never hints."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, status="completed")
    deleted = await _seed_ticket(user_uuid)
    async with test_db() as db:
        row = await db.get(Tickets, uuid_mod.UUID(deleted))
        row.delete_at = datetime.now(UTC)

    res = await client.post(
        "/graphql",
        json={"query": DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    assert res.json()["data"]["ticketDedupCandidates"] == []


@pytest.mark.asyncio
async def test_anonymous_caller_is_denied(client, login_user_auth):
    """ticket.add is not public, so a Guest gets a 403 rather than a look at nearby tickets."""
    user_uuid, _ = login_user_auth
    await _seed_ticket(user_uuid)

    res = await client.post(
        "/graphql", json={"query": DEDUP_CANDIDATES, "variables": {"input": _check_input()}}
    )
    body = res.json()
    assert body["data"] is None
    assert "Permission Denied" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_malformed_geometry_returns_no_hint_instead_of_an_error(client, login_user_auth):
    """Fail-open: a point the check cannot read yields an empty list, never a blocked submission."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid)

    res = await client.post(
        "/graphql",
        json={
            "query": DEDUP_CANDIDATES,
            "variables": {"input": _check_input(geometry={"type": "Point", "coordinates": []})},
        },
        headers=auth_header(token),
    )
    body = res.json()
    assert "errors" not in body
    assert body["data"]["ticketDedupCandidates"] == []


@pytest.mark.asyncio
async def test_submitting_anyway_writes_a_dup_ignored_pair_and_an_event(client, login_user_auth):
    """照樣送出 leaves a dup_ignored card the slow layer will re-scan, plus an audit event."""
    user_uuid, token = login_user_auth
    original = await _seed_ticket(user_uuid)
    submitted = await _seed_ticket(user_uuid, age_min=0.0)

    res = await client.post(
        "/graphql",
        json={
            "query": RECORD_OUTCOME,
            "variables": {"input": {
                "candidateTicketUuid": original,
                "submittedTicketUuid": submitted,
                "outcome": "submitted_anyway",
            }},
        },
        headers=auth_header(token),
    )
    result = res.json()["data"]["recordDedupHintOutcome"]
    assert result["hintOutcome"] == "ignored_hint"
    assert result["pairUuid"]

    async with test_db() as db:
        pair = await db.get(TicketDuplicatePair, uuid_mod.UUID(result["pairUuid"]))
        assert (pair.status, pair.source_layer, pair.method) == ("dup_ignored", "fast", "fast_rule")
        assert pair.hint_outcome == "ignored_hint"
        assert pair.rescan_needed is True
        assert str(pair.ticket_low_id) < str(pair.ticket_high_id)
        assert {c["name"] for c in pair.score_components} == {"distance", "time", "task_type", "text"}
        assert 0 <= float(pair.similarity) <= 1

        event = await db.get(TicketDedupAuditEvent, uuid_mod.UUID(result["auditEventUuid"]))
        assert event.event_type == "ignored_by_submitter"
        assert event.source_layer == "fast"
        assert event.decision_reason == "submitted_anyway"
        assert str(event.primary_ticket_uuid) == original
        assert str(event.duplicate_ticket_uuid) == submitted


@pytest.mark.asyncio
async def test_accepting_the_hint_records_an_event_with_no_pair(client, login_user_auth):
    """接受提示 usually means no second ticket exists — the event is the whole record."""
    user_uuid, token = login_user_auth
    original = await _seed_ticket(user_uuid)

    res = await client.post(
        "/graphql",
        json={
            "query": RECORD_OUTCOME,
            "variables": {"input": {
                "candidateTicketUuid": original,
                "outcome": "commented_on_original",
            }},
        },
        headers=auth_header(token),
    )
    result = res.json()["data"]["recordDedupHintOutcome"]
    assert result["hintOutcome"] == "accepted_hint"
    assert result["pairUuid"] is None

    async with test_db() as db:
        event = await db.get(TicketDedupAuditEvent, uuid_mod.UUID(result["auditEventUuid"]))
        assert event.event_type == "hint_accepted"
        assert event.decision_reason == "commented_on_original"
        assert event.duplicate_ticket_uuid is None


@pytest.mark.asyncio
async def test_recording_an_outcome_for_a_missing_ticket_errors(client, login_user_auth):
    """Unlike the check, the outcome write is not fail-open — a bad uuid is a real error."""
    _user_uuid, token = login_user_auth
    res = await client.post(
        "/graphql",
        json={
            "query": RECORD_OUTCOME,
            "variables": {"input": {
                "candidateTicketUuid": str(uuid_mod.uuid4()),
                "outcome": "submitted_anyway",
            }},
        },
        headers=auth_header(token),
    )
    assert res.json()["errors"][0]["message"] == "Ticket not found"
