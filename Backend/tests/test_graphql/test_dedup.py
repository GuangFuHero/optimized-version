"""GraphQL integration tests for the dedup fast layer (送單前查重複).

The unit compared is a task: the task being filed against open tasks nearby. Exercises the
real SQL path (PostGIS distance between the parent tickets, pg_trgm `similarity()` over the
task text), the permission gate and the hint-outcome write. The formula itself is
unit-tested in tests/test_dedup_scoring.py.
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services.dedup_scoring import max_hint_distance_m
from tests.test_graphql.conftest import auth_header, test_db

DEDUP_CANDIDATES = """
query($input: TicketDedupCheckInput!) {
    ticketDedupCandidates(input: $input) {
        relatedTicketUuid
        relatedTaskUuid
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
ALL_SIGNALS = {"distance", "time", "task_type", "text"}

PUMP = {
    "task_type": "rescue",
    "task_name": "民生街三段淹水需要抽水機",
    "task_description": "一樓積水到膝蓋，需要抽水機",
}
MEALS = {"task_type": "supply", "task_name": "需要便當一百份", "task_description": "避難的鄰居晚餐沒著落"}
SANDBAGS = {"task_type": "hr", "task_name": "需要志工搬沙包", "task_description": "巷口要堆沙包擋水"}
UNRELATED = {"task_type": "hr", "task_name": "需要志工幫忙搬物資", "task_description": "倉庫缺人手"}


async def _seed_ticket(
    user_uuid: str, *tasks: dict, offset_deg=0.0, **ticket_overrides
) -> tuple[str, list[str]]:
    """Seed a ticket near the flooded street with the given tasks; return (ticket uuid, task uuids).

    Each task dict holds TicketTask fields plus an optional `age_min` (default 10).
    """
    ticket_fields = {"title": "民生街三段", "status": "pending", "priority": "high", "visibility": "public"}
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(FLOODED_STREET[0] + offset_deg, FLOODED_STREET[1]), srid=4326),
            created_by=user_uuid,
            contact_name="Test",
            **(ticket_fields | ticket_overrides),
        )
        db.add(ticket)
        await db.flush()
        rows = []
        for fields in tasks:
            fields = dict(fields)
            age_min = fields.pop("age_min", 10.0)
            rows.append(
                TicketTask(
                    ticket_uuid=ticket.uuid,
                    created_by=user_uuid,
                    created_at=datetime.now(UTC) - timedelta(minutes=age_min),
                    **fields,
                )
            )
        db.add_all(rows)
        await db.flush()
        return str(ticket.uuid), [str(row.uuid) for row in rows]


async def _check(client, token=None, **overrides) -> dict:
    """Run ticketDedupCandidates for a pump task filed at the flooded street; return the JSON body."""
    payload = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "taskType": PUMP["task_type"],
        "taskName": PUMP["task_name"],
        "taskDescription": PUMP["task_description"],
    }
    res = await client.post(
        "/graphql",
        json={"query": DEDUP_CANDIDATES, "variables": {"input": payload | overrides}},
        headers=auth_header(token) if token else None,
    )
    return res.json()


async def _hints(client, token, **overrides) -> list[dict]:
    return (await _check(client, token, **overrides))["data"]["ticketDedupCandidates"]


async def _record(client, token, **input_) -> dict:
    """Run recordDedupHintOutcome; return the JSON body."""
    res = await client.post(
        "/graphql",
        json={"query": RECORD_OUTCOME, "variables": {"input": input_}},
        headers=auth_header(token),
    )
    return res.json()


async def _all_pairs() -> list[tuple]:
    """Every pair card as (uuid, status, rescan_needed, hint_outcome)."""
    async with test_db() as db:
        pairs = (await db.execute(select(DuplicatePair))).scalars().all()
        return [(str(p.uuid), p.status, p.rescan_needed, p.hint_outcome) for p in pairs]


@pytest_asyncio.fixture(autouse=True)
async def _clean_dedup_tables():
    """Start each test with no tickets, so one test's fixture is not another's candidate."""
    async with test_db() as db:
        for model in (DedupAuditEvent, DuplicatePair, TicketTask, Tickets):
            for row in (await db.execute(select(model))).scalars().all():
                await db.delete(row)
    yield


@pytest.mark.asyncio
async def test_hint_names_the_ticket_and_its_matching_task(client, login_user_auth):
    """Same street, same need, minutes old — one hint naming the ticket and the task."""
    user_uuid, token = login_user_auth
    ticket, [task] = await _seed_ticket(user_uuid, PUMP)

    hints = await _hints(client, token)
    assert [(h["relatedTicketUuid"], h["relatedTaskUuid"]) for h in hints] == [(ticket, task)]
    assert hints[0]["similarity"] >= 0.8
    components = {c["name"]: c for c in hints[0]["scoreComponents"]}
    assert set(components) == ALL_SIGNALS
    assert components["text"]["score"] > 0.5  # pg_trgm actually ran


@pytest.mark.asyncio
@pytest.mark.parametrize("filed,expected_index", [(PUMP, 0), (MEALS, 1), (SANDBAGS, 2)])
async def test_a_multi_task_ticket_hints_the_task_that_matches(
    client, login_user_auth, filed, expected_index
):
    """Each task of a ticket is its own candidate; the hint points at the one that matches."""
    user_uuid, token = login_user_auth
    ticket, tasks = await _seed_ticket(user_uuid, PUMP, MEALS, SANDBAGS)

    hints = await _hints(
        client,
        token,
        taskType=filed["task_type"],
        taskName=filed["task_name"],
        taskDescription=filed["task_description"],
    )
    assert [(h["relatedTicketUuid"], h["relatedTaskUuid"]) for h in hints] == [
        (ticket, tasks[expected_index])
    ]


@pytest.mark.asyncio
async def test_no_hint_for_a_distant_unrelated_task(client, login_user_auth):
    """A different need a few hundred metres away stays below the threshold."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, UNRELATED | {"age_min": 4000.0}, offset_deg=0.004)
    assert await _hints(client, token) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "task_overrides",
    [{"status": "fulfilled"}, {"status": "canceled"}, {"delete_at": datetime.now(UTC)}],
)
async def test_closed_and_deleted_tasks_are_not_candidates(client, login_user_auth, task_overrides):
    """Only open tasks are compared — a fulfilled, canceled or soft-deleted twin never hints."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, PUMP | task_overrides)
    assert await _hints(client, token) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("ticket_overrides", [{"status": "cancelled"}, {"delete_at": datetime.now(UTC)}])
async def test_tasks_of_cancelled_or_deleted_tickets_are_not_candidates(
    client, login_user_auth, ticket_overrides
):
    """Cancelling a ticket leaves its tasks pending, so the ticket itself is checked too."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, PUMP, **ticket_overrides)
    assert await _hints(client, token) == []


@pytest.mark.asyncio
async def test_a_ticket_with_no_tasks_is_never_a_candidate(client, login_user_auth):
    """The unit is a task: a ticket on the same spot with nothing under it cannot hint."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, title=PUMP["task_name"])
    assert await _hints(client, token) == []


@pytest.mark.asyncio
async def test_a_completed_ticket_that_gets_a_new_task_is_a_candidate(client, login_user_auth):
    """The new task is scored by its own age, not by the old ticket's; the finished task stays out."""
    user_uuid, token = login_user_auth
    _, [_old_task, new_task] = await _seed_ticket(
        user_uuid,
        PUMP | {"status": "fulfilled", "age_min": 60 * 24 * 5},
        PUMP | {"age_min": 5.0},
        status="completed",
    )

    hints = await _hints(client, token)
    assert [h["relatedTaskUuid"] for h in hints] == [new_task]
    time = next(c for c in hints[0]["scoreComponents"] if c["name"] == "time")
    assert time["score"] > 0.99  # 5 minutes old, not 5 days


@pytest.mark.asyncio
async def test_adding_a_task_excludes_its_own_ticket_and_uses_the_ticket_location(client, login_user_auth):
    """With `ticketUuid`, sibling tasks are not candidates and the client's geometry is ignored."""
    user_uuid, token = login_user_auth
    own_ticket, _ = await _seed_ticket(user_uuid, PUMP)
    far_away = {"type": "Point", "coordinates": [121.0, 23.0]}  # ~80 km off

    assert await _hints(client, token, ticketUuid=own_ticket, geometry=far_away) == []

    other_ticket, [other_task] = await _seed_ticket(user_uuid, PUMP, offset_deg=0.0001)
    hints = await _hints(client, token, ticketUuid=own_ticket, geometry=far_away)
    assert [(h["relatedTicketUuid"], h["relatedTaskUuid"]) for h in hints] == [(other_ticket, other_task)]


@pytest.mark.asyncio
async def test_an_unknown_ticket_uuid_returns_no_hint(client, login_user_auth):
    """Fail-open: a `ticketUuid` that does not resolve is an empty list, not an error."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, PUMP)

    body = await _check(client, token, ticketUuid=str(uuid_mod.uuid4()))
    assert "errors" not in body
    assert body["data"]["ticketDedupCandidates"] == []


@pytest.mark.asyncio
async def test_anonymous_caller_is_denied(client, login_user_auth):
    """ticket.add is not public, so a Guest gets a 403 rather than a look at nearby tasks."""
    user_uuid, _ = login_user_auth
    await _seed_ticket(user_uuid, PUMP)

    body = await _check(client)
    assert body["data"] is None
    assert "Permission Denied" in body["errors"][0]["message"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_geometry",
    [
        "POINT(121.5601 23.6701)",  # a string where a mapping is expected
        None,  # neither geometry nor ticketUuid
        {"type": "Point"},  # no coordinates key at all
        {"type": "Point", "coordinates": []},
        {"type": "Point", "coordinates": [999.0, 25.0]},  # off the planet
    ],
)
async def test_malformed_geometry_returns_no_hint_instead_of_an_error(client, login_user_auth, bad_geometry):
    """The GeoJSON scalar passes anything through; the check fails open instead of a 500."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, PUMP)

    body = await _check(client, token, geometry=bad_geometry)
    assert "errors" not in body
    assert body["data"]["ticketDedupCandidates"] == []


@pytest.mark.asyncio
async def test_submitting_anyway_writes_a_dup_ignored_task_pair_and_an_event(client, login_user_auth):
    """照樣送出 leaves a dup_ignored task card the slow layer will re-scan, plus an audit event."""
    user_uuid, token = login_user_auth
    _, [original] = await _seed_ticket(user_uuid, PUMP)
    _, [submitted] = await _seed_ticket(user_uuid, PUMP | {"age_min": 0.0})

    body = await _record(
        client, token, candidateTaskUuid=original, submittedTaskUuid=submitted, outcome="ignored_hint"
    )
    result = body["data"]["recordDedupHintOutcome"]
    assert result["hintOutcome"] == "ignored_hint"

    async with test_db() as db:
        pair = await db.get(DuplicatePair, uuid_mod.UUID(result["pairUuid"]))
        assert (pair.entity_kind, pair.status, pair.source_layer, pair.method) == (
            "ticket_task",
            "dup_ignored",
            "fast",
            "fast_rule",
        )
        assert (pair.hint_outcome, pair.rescan_needed) == ("ignored_hint", True)
        assert sorted((str(pair.low_uuid), str(pair.high_uuid))) == sorted((original, submitted))
        assert str(pair.low_uuid) < str(pair.high_uuid)
        assert {c["name"] for c in pair.score_components} == ALL_SIGNALS
        assert 0 <= float(pair.similarity) <= 1

        event = await db.get(DedupAuditEvent, uuid_mod.UUID(result["auditEventUuid"]))
        assert (event.entity_kind, event.event_type, event.source_layer, event.decision_reason) == (
            "ticket_task",
            "ignored_by_submitter",
            "fast",
            "ignored_hint",
        )
        assert (str(event.primary_uuid), str(event.duplicate_uuid)) == (original, submitted)


@pytest.mark.asyncio
async def test_accepting_the_hint_records_an_event_with_no_pair(client, login_user_auth):
    """接受提示 usually means no second task exists — the event is the whole record."""
    user_uuid, token = login_user_auth
    _, [original] = await _seed_ticket(user_uuid, PUMP)

    result = (await _record(client, token, candidateTaskUuid=original, outcome="accepted_hint"))["data"][
        "recordDedupHintOutcome"
    ]
    assert (result["hintOutcome"], result["pairUuid"]) == ("accepted_hint", None)

    async with test_db() as db:
        event = await db.get(DedupAuditEvent, uuid_mod.UUID(result["auditEventUuid"]))
        assert (event.entity_kind, event.event_type, event.decision_reason, event.duplicate_uuid) == (
            "ticket_task",
            "hint_accepted",
            "accepted_hint",
            None,
        )


@pytest.mark.asyncio
async def test_recording_an_outcome_for_a_missing_task_errors(client, login_user_auth):
    """Unlike the check, the outcome write is not fail-open — a bad uuid is a real error."""
    _, token = login_user_auth
    body = await _record(client, token, candidateTaskUuid=str(uuid_mod.uuid4()), outcome="ignored_hint")
    assert body["errors"][0]["message"] == "Task not found"


@pytest.mark.asyncio
async def test_only_the_submitter_may_record_their_own_outcome(client, login_user_auth, coordinator_auth):
    """ticket.add alone must not let a caller card an arbitrary pair of other people's tasks."""
    owner_uuid, _ = coordinator_auth
    _, other_token = login_user_auth
    _, [original] = await _seed_ticket(owner_uuid, PUMP)
    _, [submitted] = await _seed_ticket(owner_uuid, PUMP | {"age_min": 0.0})

    body = await _record(
        client, other_token, candidateTaskUuid=original, submittedTaskUuid=submitted, outcome="ignored_hint"
    )
    assert body["data"] is None
    assert "Permission Denied" in body["errors"][0]["message"]
    assert await _all_pairs() == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "source_layer,status",
    [
        ("fast", "suggested"),
        ("slow", "confirmed"),  # an admin verdict is not protected
    ],
)
async def test_an_existing_card_is_flipped_to_dup_ignored_in_place(
    client, login_user_auth, source_layer, status
):
    """Ignoring the hint updates the live card on the same row, whatever its status."""
    user_uuid, token = login_user_auth
    _, [original] = await _seed_ticket(user_uuid, PUMP)
    _, [submitted] = await _seed_ticket(user_uuid, PUMP | {"age_min": 0.0})
    low, high = sorted((original, submitted))
    async with test_db() as db:
        db.add(
            DuplicatePair(
                entity_kind="ticket_task",
                low_uuid=low,
                high_uuid=high,
                method="fast_rule",
                source_layer=source_layer,
                status=status,
            )
        )

    body = await _record(
        client, token, candidateTaskUuid=original, submittedTaskUuid=submitted, outcome="ignored_hint"
    )
    pair_uuid = body["data"]["recordDedupHintOutcome"]["pairUuid"]
    assert await _all_pairs() == [(pair_uuid, "dup_ignored", True, "ignored_hint")]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "candidate_text,query_text",
    [
        ({"task_name": "", "task_description": None}, {}),  # the candidate task has no text
        ({}, {"taskName": "", "taskDescription": None}),  # the task being filed has no text
    ],
)
async def test_missing_text_on_either_side_drops_the_text_signal(
    client, login_user_auth, candidate_text, query_text
):
    """No text is "signal unavailable", not a 0.0 that would drag every total down."""
    user_uuid, token = login_user_auth
    await _seed_ticket(user_uuid, PUMP | candidate_text)

    hints = await _hints(client, token, **query_text)
    assert len(hints) == 1
    assert {c["name"] for c in hints[0]["scoreComponents"]} == ALL_SIGNALS - {"text"}


@pytest.mark.asyncio
async def test_nearer_noise_does_not_crowd_out_the_real_twin(client, login_user_auth):
    """Fifty unrelated tasks nearer than the twin must not cost the hint: there is no row limit."""
    user_uuid, token = login_user_auth
    for i in range(50):
        await _seed_ticket(user_uuid, UNRELATED | {"age_min": 3000.0}, offset_deg=0.000005 * (i + 1))
    _, [twin] = await _seed_ticket(user_uuid, PUMP, offset_deg=0.0009)  # ~92 m, inside the boundary

    assert [h["relatedTaskUuid"] for h in await _hints(client, token)] == [twin]


@pytest.mark.asyncio
async def test_a_candidate_past_the_hint_boundary_is_never_retrieved(client, login_user_auth):
    """A perfect twin beyond `max_hint_distance_m` could not have hinted, so it is not retrieved."""
    user_uuid, token = login_user_auth
    # ~245 m east: past the ~147 m boundary even with the 1.1 rounding margin.
    assert max_hint_distance_m() < 147.5
    await _seed_ticket(user_uuid, PUMP | {"age_min": 0.0}, offset_deg=0.0024)

    assert await _hints(client, token) == []
