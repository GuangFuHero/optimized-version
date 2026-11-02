"""A window in which Postgres plans statements generically from their first run (ADR-437)."""

from contextlib import asynccontextmanager, suppress

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

# Nesting depth of the windows open on one session, stashed on the session itself because that is
# what the windows share, as for the search ceiling (ADR-157).
_DEPTH_ATTR = "_generic_plan_depth"


@asynccontextmanager
async def generic_plan(db, *, needed: bool = True):
    """Plan the statements run inside generically, from the first run on a connection (ADR-437).

    asyncpg prepares every statement, and Postgres plans a prepared statement's first five runs on
    each connection with the values given (custom plans) before it settles on a generic one. For the
    guest map's box the custom plan guesses one row for the cell-centre test and scans `tickets`
    once per ticket in view: seconds, on every new connection, where the generic plan takes tens of
    milliseconds.

    `set_config(..., is_local => true)` keeps it to this transaction, and the outermost window puts
    it back on the way out, as `statement_ceiling` does its timeout (ADR-156/157): a GraphQL request
    is one transaction on one session, and the reads after the window plan as they always did. A
    sibling root field's reads that land while it is open are planned generically too, since root
    fields resolve concurrently on that session (`app/graphql/context.py`), so which ones depends on
    how they interleave. That changes their plan for those runs only, never their results: once
    reset, Postgres plans a statement as if the window had never run it. A no-op when not `needed`.
    """
    if not needed:
        yield
        return
    depth = getattr(db, _DEPTH_ATTR, 0)
    setattr(db, _DEPTH_ATTR, depth + 1)
    if depth == 0:
        await db.execute(text("SELECT set_config('plan_cache_mode', 'force_generic_plan', true)"))
    try:
        yield
    finally:
        setattr(db, _DEPTH_ATTR, getattr(db, _DEPTH_ATTR, 1) - 1)
        if depth == 0:
            # A statement that failed inside has aborted the transaction, which rejects this too;
            # its rollback drops the setting anyway, and its error is the one the caller needs.
            with suppress(DBAPIError):
                await db.execute(text("RESET plan_cache_mode"))
