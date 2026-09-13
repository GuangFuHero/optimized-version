"""Matching an imported row against existing data (feature 015, ADR-107/113)."""

import os

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TicketTask
from app.services.bulk_match import (
    AMBIGUOUS,
    MATCHED,
    NO_MATCH,
    build_station_index,
    build_ticket_index,
    duplicate_key_rows,
    match_task,
    normalize_phone_key,
    normalize_text,
    station_key,
    ticket_key,
)

POINT = Point(121.5, 25.0)


async def _author(db) -> User:
    author = User(name="Author")
    db.add(author)
    await db.flush()
    return author


async def _station(db, author, *, name, county="花蓮縣", city="光復鄉", with_address=True) -> Station:
    station = Station(
        geometry=from_shape(POINT, srid=4326), created_by=str(author.uuid),
        type="shelter", name=name, level=0, visibility="public",
    )
    db.add(station)
    await db.flush()
    if with_address:
        db.add(SecondaryLocation(
            geometry_uuid=str(station.uuid), location_type="address", county=county, city=city
        ))
        await db.flush()
    return station


async def _ticket(db, author, *, title, phone) -> Tickets:
    ticket = Tickets(
        geometry=from_shape(POINT, srid=4326), created_by=str(author.uuid), title=title,
        contact_name="王小明", contact_phone=phone, status="pending", priority="high",
        task_type="rescue", visibility="public",
    )
    db.add(ticket)
    await db.flush()
    return ticket


# --- normalization ---


def test_full_width_and_case_and_spacing_fold_together():
    """The same name typed on two keyboards has to reach the same key."""
    assert normalize_text("Ｈｕａｌｉｅｎ  Ｓｃｈｏｏｌ") == normalize_text("hualien school")


def test_a_phone_matches_across_the_forms_actually_stored():
    """`create_ticket` never normalizes contact_phone, so both forms sit in the table."""
    assert normalize_phone_key("0912345678") == normalize_phone_key("+886 912 345 678")


def test_an_unparseable_phone_still_produces_a_stable_key():
    """Garbage in the column must not crash an import; it just has to compare consistently."""
    assert normalize_phone_key("12-34") == normalize_phone_key("1234")


# --- stations ---


@pytest.mark.asyncio
async def test_one_station_with_the_same_key_is_a_match(db):
    """Exactly one candidate is the only case that produces an update."""
    author = await _author(db)
    station = await _station(db, author, name="光復國小")

    result = (await build_station_index(db)).look_up(station_key("光復國小", "花蓮縣", "光復鄉"))

    assert result.kind == MATCHED
    assert result.uuid == str(station.uuid)


@pytest.mark.asyncio
async def test_the_same_name_in_another_district_is_not_a_match(db):
    """"光復國小" exists all over Taiwan — the county/city half of the key is what separates them."""
    author = await _author(db)
    await _station(db, author, name="光復國小", county="花蓮縣", city="光復鄉")

    result = (await build_station_index(db)).look_up(station_key("光復國小", "臺北市", "大安區"))

    assert result.kind == NO_MATCH


@pytest.mark.asyncio
async def test_two_stations_sharing_a_key_refuse_to_be_guessed(db):
    """No unique constraint backs this key, so this is expected, not exceptional (ADR-113)."""
    author = await _author(db)
    first = await _station(db, author, name="光復國小")
    second = await _station(db, author, name="光復國小")

    result = (await build_station_index(db)).look_up(station_key("光復國小", "花蓮縣", "光復鄉"))

    assert result.kind == AMBIGUOUS
    assert set(result.candidates) == {str(first.uuid), str(second.uuid)}


@pytest.mark.asyncio
async def test_a_station_with_no_address_matches_a_row_that_leaves_it_blank(db):
    """Legacy rows have no secondary_location; a file without those columns still reaches them."""
    author = await _author(db)
    station = await _station(db, author, name="無地址站", with_address=False)

    result = (await build_station_index(db)).look_up(station_key("無地址站", "", ""))

    assert result.uuid == str(station.uuid)


@pytest.mark.asyncio
async def test_a_soft_deleted_station_is_not_matchable(db):
    """A deleted row must not silently absorb an import that should create a new one."""
    author = await _author(db)
    station = await _station(db, author, name="已刪站")
    from datetime import UTC, datetime

    station.delete_at = datetime.now(UTC)
    await db.flush()

    assert (await build_station_index(db)).look_up(station_key("已刪站", "花蓮縣", "光復鄉")).kind == NO_MATCH


# --- tickets ---


@pytest.mark.asyncio
async def test_a_ticket_matches_on_title_and_phone(db):
    """The ticket key is the title plus the contact phone (ADR-107)."""
    author = await _author(db)
    ticket = await _ticket(db, author, title="需要飲用水", phone="0912345678")

    result = (await build_ticket_index(db)).look_up(ticket_key("需要飲用水", "+886912345678"))

    assert result.uuid == str(ticket.uuid)


@pytest.mark.asyncio
async def test_the_same_title_from_a_different_person_is_a_different_ticket(db):
    """Same words, another reporter — a separate request."""
    author = await _author(db)
    await _ticket(db, author, title="需要飲用水", phone="0912345678")

    result = (await build_ticket_index(db)).look_up(ticket_key("需要飲用水", "0987654321"))

    assert result.kind == NO_MATCH


# --- tasks ---


@pytest.mark.asyncio
async def test_a_task_matches_within_its_own_ticket(db):
    """Task matching is scoped to the ticket it was found under."""
    author = await _author(db)
    ticket = await _ticket(db, author, title="求救", phone="0912345678")
    task = TicketTask(
        ticket_uuid=ticket.uuid, task_type="rescue", task_name="送水",
        source="user", visibility="public", created_by=str(author.uuid),
    )
    db.add(task)
    await db.flush()

    result = await match_task(db, ticket_uuid=str(ticket.uuid), task_type="rescue", task_name="送水")

    assert result.uuid == str(task.uuid)


@pytest.mark.asyncio
async def test_a_task_of_another_name_under_the_same_ticket_is_new(db):
    """A different task name under the same ticket is another task, not an edit."""
    author = await _author(db)
    ticket = await _ticket(db, author, title="求救", phone="0912345678")
    db.add(TicketTask(
        ticket_uuid=ticket.uuid, task_type="rescue", task_name="送水",
        source="user", visibility="public", created_by=str(author.uuid),
    ))
    await db.flush()

    result = await match_task(db, ticket_uuid=str(ticket.uuid), task_type="rescue", task_name="清淤")

    assert result.kind == NO_MATCH


# --- duplicates inside one file ---


def test_rows_sharing_a_key_all_fail_and_point_at_each_other():
    """Later does not win: two rows with one name are very often two different places."""
    collisions = duplicate_key_rows([("a",), ("b",), ("a",)])

    assert collisions == {0: (4,), 2: (2,)}


def test_a_file_with_distinct_keys_has_no_collisions():
    """Nothing to report when every row is unique."""
    assert duplicate_key_rows([("a",), ("b",), ("c",)]) == {}
