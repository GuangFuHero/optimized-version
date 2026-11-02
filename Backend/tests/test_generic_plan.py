"""The generic-plan window the guest map's reads open (ADR-437).

asyncpg prepares every statement, and Postgres plans a prepared statement's first five runs on each
connection with the values given before it settles on a generic plan. For the guest map's box those
custom plans scan `tickets` once per ticket in view, so a fresh connection answered in seconds what a
warm one answers in tens of milliseconds. These pin the window that plans them generically from the
first run, and only while it is open.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.plans import generic_plan

pytestmark = pytest.mark.asyncio


async def _plan_mode(db) -> str:
    return await db.scalar(text("SHOW plan_cache_mode"))


async def test_statements_in_the_window_are_planned_generically_and_only_there(db):
    """The request's other reads, run on the same session after it, plan as they always did."""
    before = await _plan_mode(db)

    async with generic_plan(db):
        inside = await _plan_mode(db)

    assert (before, inside, await _plan_mode(db)) == ("auto", "force_generic_plan", "auto")


async def test_an_inner_window_leaves_the_outer_one_generic(db):
    """Root fields share one session, so a window can open inside another; only the outer one restores."""
    async with generic_plan(db):
        async with generic_plan(db):
            pass
        still = await _plan_mode(db)

    assert (still, await _plan_mode(db)) == ("force_generic_plan", "auto")


async def test_a_window_not_needed_changes_nothing(db):
    """A caller shown every exact point has no cell-centre test to plan around."""
    async with generic_plan(db, needed=False):
        assert await _plan_mode(db) == "auto"


async def test_a_statement_failing_in_the_window_keeps_its_own_error(db):
    """The failed statement aborts the transaction, so the restore can't run; its error is the one raised."""
    with pytest.raises(DBAPIError) as excinfo:
        async with generic_plan(db):
            await db.execute(text("SELECT 1 / 0"))

    assert "division by zero" in str(excinfo.value)
