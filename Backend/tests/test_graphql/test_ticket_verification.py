"""Whether 重複審核 still waits on a ticket, read from its cards.

TicketType.verificationStatus tells anyone the state and the tickets (ADR-443, ADR-455);
suspectedDuplicateOf tells anyone which tickets those are, and nothing more (ADR-454).
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import event, select, update

from app.core.permissions import Perm
from app.db.session import engine as app_engine
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql import conftest as gql_conftest
from tests.test_graphql.conftest import _create_user_with_grants, auth_header

LIST = """
query($q: String!) {
    tickets(q: $q, limit: 200) {
        items { title verificationStatus { state duplicateOf { uuid title } } }
    }
}
"""

SUSPECTED = """
query($q: String!) {
    tickets(q: $q, limit: 200) { items { title suspectedDuplicateOf { uuid title } } }
}
"""

BOTH = """
query($q: String!) {
    tickets(q: $q, limit: 200) {
        items { title verificationStatus { state } suspectedDuplicateOf { uuid } }
    }
}
"""

REVIEWER = [(Perm.TICKET_VIEW, "all"), (Perm.AI_DUP_VIEW, "all")]


async def _ticket(title: str, status: str = "pending") -> str:
    """Insert one ticket; returns its uuid."""
    async with gql_conftest.test_db() as db:
        author = User(name=f"u_{uuid_mod.uuid4().hex[:8]}")
        db.add(author)
        await db.flush()
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=str(author.uuid),
            title=title,
            description="d",
            contact_name="c",
            status=status,
            priority="high",
            task_type="hr",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _need(ticket: str) -> str:
    """Insert one need on `ticket`; returns its uuid."""
    async with gql_conftest.test_db() as db:
        task = TicketTask(
            ticket_uuid=ticket,
            task_type="hr",
            task_name="n",
            status="pending",
            source="user",
            created_by=await db.scalar(select(Tickets.created_by).where(Tickets.uuid == ticket)),
        )
        db.add(task)
        await db.flush()
        return str(task.uuid)


async def _card(
    a: str, b: str, *, kind: str = "ticket_task", status: str = "dup_ignored", age: int = 0
) -> str:
    """Insert a fast-layer card between `a` and `b`, made `age` minutes ago; returns its uuid."""
    low, high = sorted([a, b])
    async with gql_conftest.test_db() as db:
        card = DuplicatePair(
            entity_kind=kind,
            low_uuid=uuid_mod.UUID(low),
            high_uuid=uuid_mod.UUID(high),
            similarity=Decimal("0.9"),
            evidence={"stub": True},
            method="fast_rule",
            engine_version="fast-v4",
            source_layer="fast",
            status=status,
            created_at=datetime.now(UTC) - timedelta(minutes=age),
        )
        db.add(card)
        await db.flush()
        return str(card.uuid)


async def _merged(card: str, primary: str) -> None:
    """Record that `card` was resolved, keeping `primary`: what a resolve leaves (Spec 028)."""
    async with gql_conftest.test_db() as db:
        db.add(
            DedupAuditEvent(
                entity_kind="ticket_task",
                event_type="merged",
                pair_uuid=card,
                primary_uuid=uuid_mod.UUID(primary),
                source_layer="manual",
            )
        )


async def _states(client, token: str | None, tag: str, query: str = LIST) -> dict:
    """The one field `query` reads on each tagged ticket (verificationStatus), by title after the tag."""
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": {"q": tag}}, headers=headers)
    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["tickets"]["items"]
    return {i.pop("title").removeprefix(f"{tag} "): next(iter(i.values())) for i in items}


def _refs(*others: tuple[str, str]) -> list[dict]:
    """The tickets a ticket may duplicate, as read, given (uuid, title) of each."""
    return [{"uuid": u, "title": t} for u, t in others]


def _disputed(*others: tuple[str, str]) -> dict:
    """What a disputed ticket reads as, given (uuid, title) of each ticket it may duplicate."""
    return {"state": "disputed", "duplicateOf": _refs(*others)}


@pytest.mark.asyncio
async def test_a_waiting_card_between_two_needs_marks_both_tickets(client, redis):
    """Each side reads as disputed and names the other; a ticket with no card reads null."""
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    await _ticket(f"{tag} alone")
    await _card(await _need(a), await _need(b))

    assert await _states(client, token, tag) == {
        "a": _disputed((b, f"{tag} b")),
        "b": _disputed((a, f"{tag} a")),
        "alone": None,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "merged", "disputed"),
    [
        ("dup_ignored", False, True),
        ("suggested", False, True),
        # Judged a duplicate, not merged yet: 重複審核 can still resolve it.
        ("confirmed_duplicate", False, True),
        ("confirmed_duplicate", True, False),
        ("not_duplicate", False, False),
    ],
)
async def test_only_a_card_review_can_still_act_on_counts(client, redis, status, merged, disputed):
    """Waiting for a verdict, or judged a duplicate and not merged; a merge or 'not a duplicate' ends it."""
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    card = await _card(await _need(a), await _need(b), status=status)
    if merged:
        await _merged(card, primary=a)

    states = await _states(client, token, tag)
    assert states["a"] == (_disputed((b, f"{tag} b")) if disputed else None)


@pytest.mark.asyncio
async def test_a_soft_deleted_card_does_not_count(client, redis):
    """A card soft-deleted is out of 重複審核 altogether."""
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    card = await _card(await _need(a), await _need(b))
    async with gql_conftest.test_db() as db:
        deleted = {"delete_at": datetime.now(UTC)}
        await db.execute(update(DuplicatePair).where(DuplicatePair.uuid == card).values(**deleted))

    assert await _states(client, token, tag) == {"a": None, "b": None}


@pytest.mark.asyncio
async def test_a_card_between_two_tickets_counts_too(client, redis):
    """The fast layer pairs needs, but 重複審核 resolves a card between whole tickets as well."""
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    await _card(a, b, kind="ticket")

    assert await _states(client, token, tag) == {
        "a": _disputed((b, f"{tag} b")),
        "b": _disputed((a, f"{tag} a")),
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("gone", ["cancelled", "deleted"])
async def test_a_card_whose_far_ticket_is_gone_does_not_count(client, redis, gone):
    """重複審核 cannot merge it any more; a card on a ticket still there counts as before."""
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b, c = await _ticket(f"{tag} a"), await _ticket(f"{tag} b"), await _ticket(f"{tag} c")
    alone = await _ticket(f"{tag} alone")
    await _card(await _need(a), await _need(b), age=2)
    await _card(await _need(a), await _need(c), age=1)
    await _card(await _need(alone), await _need(b))
    async with gql_conftest.test_db() as db:
        ticket = await db.get(Tickets, uuid_mod.UUID(b))
        if gone == "cancelled":
            ticket.status = "cancelled"
        else:
            ticket.delete_at = datetime.now(UTC)

    states = await _states(client, token, tag)
    assert (states["a"], states["alone"]) == (_disputed((c, f"{tag} c")), None)


@pytest.mark.asyncio
@pytest.mark.parametrize("second_need", ["folded", "moved"])
async def test_the_cards_a_merge_leaves_behind_do_not_count(client, redis, second_need):
    """Two needs like a's gave b two cards; resolving one folds b into a, and the other is left.

    Its far side is now b, cancelled, or a itself when b's need was moved over: neither can be merged.
    """
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    pump_a, water_a, pump_b, water_b = await _need(a), await _need(a), await _need(b), await _need(b)
    await _merged(await _card(pump_a, pump_b), primary=a)
    await _card(water_a, water_b)
    async with gql_conftest.test_db() as db:
        ticket, now = await db.get(Tickets, uuid_mod.UUID(b)), datetime.now(UTC)
        ticket.status, ticket.delete_at = "cancelled", now
        need = {"ticket_uuid": a} if second_need == "moved" else {"delete_at": now}
        await db.execute(update(TicketTask).where(TicketTask.uuid == water_b).values(**need))

    assert await _states(client, token, tag) == {"a": None}


@pytest.mark.asyncio
async def test_each_far_ticket_is_named_once_oldest_card_first(client, redis):
    """Two cards against b and one against c: b once, ahead of c, whose card is newer."""
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b, c = await _ticket(f"{tag} a"), await _ticket(f"{tag} b"), await _ticket(f"{tag} c")
    await _card(await _need(a), await _need(c), age=1)
    await _card(await _need(a), await _need(b), age=3)
    await _card(await _need(a), await _need(b), age=2)

    assert (await _states(client, token, tag))["a"] == _disputed((b, f"{tag} b"), (c, f"{tag} c"))


@pytest.mark.asyncio
async def test_a_need_card_counts_on_the_ticket_the_need_is_on_now(client, redis):
    """A merge moves a need onto the kept ticket, and its waiting card goes along.

    A need taken off keeps its card, which still waits in 重複審核.
    """
    _, token = await _create_user_with_grants(redis, REVIEWER)
    tag = uuid_mod.uuid4().hex[:10]
    a, b, kept = await _ticket(f"{tag} a"), await _ticket(f"{tag} b"), await _ticket(f"{tag} kept")
    need_a, need_b = await _need(a), await _need(b)
    await _card(need_a, need_b)
    async with gql_conftest.test_db() as db:
        await db.execute(update(TicketTask).where(TicketTask.uuid == need_b).values(ticket_uuid=kept))
        taken_off = {"delete_at": datetime.now(UTC)}
        await db.execute(update(TicketTask).where(TicketTask.uuid == need_a).values(**taken_off))

    assert await _states(client, token, tag) == {
        "a": _disputed((kept, f"{tag} kept")),
        "b": None,
        "kept": _disputed((a, f"{tag} a")),
    }


@pytest.mark.asyncio
async def test_every_caller_is_told_without_ai_duplicate_view(client, redis):
    """Every role sees the 疑似重複 tag (ADR-455): signed in without the capability, or not at all."""
    _, viewer = await _create_user_with_grants(redis, [(Perm.TICKET_VIEW, "all")])
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    await _ticket(f"{tag} alone")
    await _card(await _need(a), await _need(b))

    told = {"a": _disputed((b, f"{tag} b")), "b": _disputed((a, f"{tag} a")), "alone": None}
    assert await _states(client, viewer, tag) == told
    assert await _states(client, None, tag) == told


async def _card_statements(client, token: str | None, tag: str, query: str = LIST) -> tuple[dict, int]:
    """Read the tagged tickets; return their states and how many statements read the cards."""
    seen = []

    def on_execute(conn, cursor, statement, params, context, executemany):
        if "duplicate_pairs" in statement:
            seen.append(statement)

    event.listen(app_engine.sync_engine, "before_cursor_execute", on_execute)
    try:
        states = await _states(client, token, tag, query)
    finally:
        event.remove(app_engine.sync_engine, "before_cursor_execute", on_execute)
    return states, len(seen)


@pytest.mark.asyncio
async def test_a_page_reads_the_cards_once_whoever_asks(client, redis):
    """One statement on the cards for a page of 2 or 8 tickets, for a reviewer and a guest alike.

    Asked with suspectedDuplicateOf in the same query, the two share it: still one.
    """
    _, reviewer = await _create_user_with_grants(redis, REVIEWER)
    counts = []
    for size in (1, 4):
        tag = uuid_mod.uuid4().hex[:10]
        for i in range(size):
            a, b = await _ticket(f"{tag} a{i}"), await _ticket(f"{tag} b{i}")
            await _card(await _need(a), await _need(b))
        for token, query in ((reviewer, LIST), (None, LIST), (None, BOTH)):
            states, statements = await _card_statements(client, token, tag, query)
            assert len(states) == 2 * size and all(states.values())
            counts.append(statements)
    assert counts == [1] * 6


@pytest.mark.asyncio
async def test_anyone_is_told_which_tickets_a_ticket_may_repeat(client, redis):
    """No capability is asked for: signed in or not, each side's suspectedDuplicateOf names the other.

    A ticket with no card reads an empty list.
    """
    _, viewer = await _create_user_with_grants(redis, [(Perm.TICKET_VIEW, "all")])
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    await _ticket(f"{tag} alone")
    await _card(await _need(a), await _need(b))

    told = {"a": _refs((b, f"{tag} b")), "b": _refs((a, f"{tag} a")), "alone": []}
    assert await _states(client, None, tag, SUSPECTED) == told
    assert await _states(client, viewer, tag, SUSPECTED) == told


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "merged", "suspected"),
    [
        ("dup_ignored", False, True),
        ("suggested", False, True),
        ("confirmed_duplicate", False, True),
        ("confirmed_duplicate", True, False),
        ("not_duplicate", False, False),
    ],
)
async def test_the_cards_review_can_act_on_count_and_no_verdict_is_told(
    client, redis, status, merged, suspected
):
    """The cards verificationStatus counts; one judged a duplicate reads as one still waiting."""
    tag = uuid_mod.uuid4().hex[:10]
    a, b = await _ticket(f"{tag} a"), await _ticket(f"{tag} b")
    card = await _card(await _need(a), await _need(b), status=status)
    if merged:
        await _merged(card, primary=a)

    told = await _states(client, None, tag, SUSPECTED)
    assert told["a"] == (_refs((b, f"{tag} b")) if suspected else [])


@pytest.mark.asyncio
async def test_a_page_told_to_anyone_reads_the_cards_once(client, redis):
    """A guest's page of 2 or 8 tickets takes one statement on the cards, as a reviewer's does."""
    counts = []
    for size in (1, 4):
        tag = uuid_mod.uuid4().hex[:10]
        for i in range(size):
            a, b = await _ticket(f"{tag} a{i}"), await _ticket(f"{tag} b{i}")
            await _card(await _need(a), await _need(b))
        states, statements = await _card_statements(client, None, tag, SUSPECTED)
        assert len(states) == 2 * size and all(states.values())
        counts.append(statements)
    assert counts == [1, 1]
