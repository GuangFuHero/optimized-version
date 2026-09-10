"""Guards for the per-statement search timeout (ADR-152).

`stations(q:)` / `tickets(q:)` are reachable by an anonymous Guest (ADR-025/027) on an
endpoint with no rate limiter, and a 2-character CJK query has no trigram selectivity at
all (ADR-150) — it walks the whole GIN index and rechecks every row. These tests pin the
bound that keeps one such statement from holding a connection indefinitely.
"""

import asyncio

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


async def test_interleaved_sibling_searches_do_not_leave_the_ceiling_behind(db, monkeypatch):
    """ADR-157: two `q:` root fields overlapping on the shared session must still restore.

    graphql-core resolves sibling root fields concurrently on one AsyncSession
    (app/graphql/context.py), and the ceiling they set is one transaction-wide value. When
    the windows overlap, a read-then-write-back restore has the inner one reading the outer
    one's ceiling as if it were the default — and putting it back at the end, where it binds
    every remaining statement in the transaction. Sequential entry/exit does not exercise
    this; the overlap is the whole point.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)
    await db.execute(text("SELECT 1"))
    default = await _statement_timeout(db)

    inner_entered = asyncio.Event()

    async def outer():
        async with search_timeout(db, "光復"):
            await inner_entered.wait()
            await asyncio.sleep(0.05)  # leaves only after the inner window opened

    async def inner():
        await asyncio.sleep(0.01)  # opens after the outer window set the ceiling
        async with search_timeout(db, "光復"):
            inner_entered.set()
            await asyncio.sleep(0.1)  # ...and closes after the outer one did

    await asyncio.gather(outer(), inner())

    assert await _statement_timeout(db) == default


async def test_the_search_stays_bounded_while_a_sibling_search_window_is_open(db, monkeypatch):
    """The other half of ADR-157: nesting-awareness must not drop the bound itself.

    Only the outermost window touches the setting, so an inner window closing must not
    reset the ceiling out from under a search that is still running.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)
    await db.execute(text("SELECT 1"))
    default = await _statement_timeout(db)

    async with search_timeout(db, "光復"):
        async with search_timeout(db, "中正"):
            pass
        assert await _statement_timeout(db) != default, "inner exit dropped the bound"


async def test_a_field_resolved_after_a_cancelled_search_still_gets_its_data(db, monkeypatch):
    """ADR-158: the cancelled search must not take the rest of the request down with it.

    PostgreSQL aborts the transaction when it cancels the statement, and the session is
    shared by every root field. Without the rollback, `{ stations(q:) announcements }` has
    the search return the timeout message and `announcements` fail with an unrelated,
    unexplained 25P02 instead of returning its rows.
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 100)

    with pytest.raises(SearchTimeoutError):
        async with search_timeout(db, "光復"):
            await db.execute(text("SELECT pg_sleep(3)"))

    assert await db.scalar(text("SELECT 1")) == 1  # the sibling field, no rollback of its own


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


async def test_an_inner_timeout_leaves_an_outer_search_still_bounded(db, monkeypatch):
    """ADR-177：內層 window 逾時後的 rollback 不得把外層搜尋的上限一起帶走。

    上限是**交易層級**的單一值,由這個 session 上每一個開著的 window 共用
    (`set_config(..., is_local => true)`)。內層逾時後必須 rollback 才能讓交易脫離
    aborted 狀態 (ADR-158),而 rollback 連同這個值一起丟掉。外層 window 的
    `is_outermost` 是進入時就決定的,它不會再跑一次 `set_config`——所以如果沒有在這裡
    補回來,一個仍在飛行中的 sibling 搜尋會完全失去上限。

    這是 ADR-157 推理過的巢狀情境裡沒被涵蓋到的一條互動路徑。
    """
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 3000)
    await db.execute(text("SELECT 1"))

    async with search_timeout(db, "外層"):
        assert await _statement_timeout(db) == "3s"

        with pytest.raises(SearchTimeoutError):
            async with search_timeout(db, "內層"):
                # 只把內層自己的那一句壓到 50ms,讓它逾時而不必真的等 3 秒
                await db.execute(text("SELECT set_config('statement_timeout', '50', true)"))
                await db.execute(text("SELECT pg_sleep(1)"))

        assert await _statement_timeout(db) == "3s", (
            "the inner rollback discarded the ceiling the outer search is still relying on"
        )

        # 設定值回來了還不夠——它必須真的還會取消語句。
        with pytest.raises(DBAPIError):
            await db.execute(text("SELECT pg_sleep(10)"))
