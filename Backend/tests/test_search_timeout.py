"""Guards for the per-statement search timeout (ADR-152).

`stations(q:)` / `tickets(q:)` are reachable by an anonymous Guest (ADR-025/027) on an
endpoint with no rate limiter, and a 2-character CJK query has no trigram selectivity at
all (ADR-150) — it walks the whole GIN index and rechecks every row. These tests pin the
bound that keeps one such statement from holding a connection indefinitely.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core import search
from app.core.search import SearchTimeoutError, search_timeout
from app.repositories.geo_repository import StationRepository
from app.repositories.tickets_repository import TicketRepository, TicketTaskRepository
from tests.fakes import CapturingSession

pytestmark = pytest.mark.asyncio


async def _statement_timeout(db) -> str:
    return await db.scalar(text("SHOW statement_timeout"))


async def test_a_slow_search_statement_is_cancelled(db, monkeypatch):
    """The whole point: an over-budget search is killed, not left running."""
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)

    with pytest.raises(SearchTimeoutError) as excinfo:
        async with search_timeout(db, "光復"):
            await db.execute(text("SELECT pg_sleep(3)"))

    # The caller gets a readable message, not a raw driver error with SQL state in it.
    assert "搜尋" in str(excinfo.value)
    assert isinstance(excinfo.value, ValueError), (
        "must subclass ValueError so Strawberry surfaces the message (see SearchQueryError)"
    )


async def test_no_timeout_is_applied_when_there_is_no_search_term(db):
    """term=None must leave the non-search list/count paths byte-for-byte as they were."""
    await db.execute(text("SELECT 1"))  # open the transaction so SHOW is meaningful
    before = await _statement_timeout(db)

    async with search_timeout(db, None):
        assert await _statement_timeout(db) == before

    assert await _statement_timeout(db) == before


async def test_the_timeout_is_transaction_scoped(db, monkeypatch):
    """set_config(..., is_local => true): it reverts on rollback, so it cannot leak.

    A session is per-request (security.get_db), and this makes the setting per-transaction
    on top of that — no way for one caller's search budget to land on the next caller's
    connection. Restoring it on the way out (ADR-156) is the *other* half; see
    test_the_ceiling_does_not_outlive_the_search_window.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)
    await db.execute(text("SELECT 1"))
    default = await _statement_timeout(db)

    async with search_timeout(db, "光復"):
        assert await _statement_timeout(db) != default

    await db.rollback()
    await db.execute(text("SELECT 1"))
    assert await _statement_timeout(db) == default


async def test_unrelated_database_errors_are_not_relabelled_as_timeouts(db, monkeypatch):
    """Only SQLSTATE 57014 becomes SearchTimeoutError; everything else propagates as-is.

    A blanket `except DBAPIError` here would turn any query bug in the search path into a
    misleading "your search was too slow" message and hide the real fault.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 5000)

    with pytest.raises(DBAPIError) as excinfo:
        async with search_timeout(db, "光復"):
            await db.execute(text("SELECT 1 / 0"))

    assert not isinstance(excinfo.value, SearchTimeoutError)


async def test_the_ceiling_does_not_outlive_the_search_window(db, monkeypatch):
    """ADR-156: the ceiling is put back when the search finishes.

    A GraphQL request is one transaction on one shared AsyncSession
    (app/graphql/context.py), so a ceiling left in place would also bind every sibling
    root field resolved after the search.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)
    await db.execute(text("SELECT 1"))
    default = await _statement_timeout(db)

    async with search_timeout(db, "光復"):
        assert await _statement_timeout(db) != default

    assert await _statement_timeout(db) == default


async def test_a_statement_after_the_search_is_not_cancelled_by_the_search_ceiling(
    db, monkeypatch
):
    """The behaviour the reset exists for, not just the setting's value.

    Without the reset this raises a raw DBAPIError (SQLSTATE 57014) out of a caller that
    never asked for a search — untranslated, because the translation only covers the
    `async with` block — and aborts the transaction for everything after it.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)

    async with search_timeout(db, "光復"):
        pass  # a search that completed within budget

    await db.execute(text("SELECT pg_sleep(0.3)"))  # 3x the search ceiling


async def test_a_cancelled_search_still_reports_the_timeout_not_the_reset_failure(
    db, monkeypatch
):
    """Restoring must not mask the error it is unwinding from.

    A cancelled statement leaves PostgreSQL refusing everything until rollback, so the
    reset itself fails. If that failure escaped, the caller would see "current transaction
    is aborted" instead of the search-timeout message.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)

    with pytest.raises(SearchTimeoutError) as excinfo:
        async with search_timeout(db, "光復"):
            await db.execute(text("SELECT pg_sleep(3)"))

    assert "搜尋" in str(excinfo.value)
    await db.rollback()


async def test_every_public_search_path_sets_the_timeout():
    """The bound belongs to the predicate, not to one resolver (ADR-152).

    `ticketTasks(q:)` runs the same shape as `tickets(q:)` — a trigram ILIKE plus a
    correlated EXISTS over task_properties — and ticket.view is in PUBLIC_PERMS, so an
    anonymous Guest reaches it too. Asserting across all three search paths means a new
    one cannot be added unbounded without this going red.
    """
    paths = {
        "stations(q:)": lambda db: StationRepository().list_active(db, q="光復"),
        "tickets(q:)": lambda db: TicketRepository().list_active(db, q="光復"),
        "ticketTasks(q:)": lambda db: TicketTaskRepository().list_by_ticket(
            db, "00000000-0000-0000-0000-000000000000", q="光復"
        ),
    }
    for name, call in paths.items():
        db = CapturingSession()
        await call(db)
        assert "set_config" in db.sql(), f"{name} runs its search unbounded"


async def test_no_timeout_when_those_same_paths_are_not_searching():
    """The control: term=None must leave the plain list paths byte-for-byte as they were."""
    db = CapturingSession()
    await TicketTaskRepository().list_by_ticket(db, "00000000-0000-0000-0000-000000000000")
    assert "set_config" not in db.sql()
