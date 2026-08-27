"""Keyword search condition builder (feature 011, ADR-078/082).

Chinese text search uses pg_trgm + ILIKE rather than tsvector: PostgreSQL's built-in
full-text search does not segment Chinese, so "花蓮縣光復鄉" becomes a single token and
searching "光復" finds nothing. Trigram matching is character-level and needs no
segmentation (ADR-078).

Lives in app/core/ rather than app/graphql/ because repositories consume it, and a
repository must not import from the GraphQL layer.
"""

from contextlib import asynccontextmanager, suppress

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, SQLAlchemyError

# Lengths are Python str lengths, i.e. Unicode code point counts. For CJK queries
# "2 code points" is exactly "2 characters", which is the semantics we want.
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 50

# Wall-clock ceiling for a single search statement (ADR-152). A 2-character CJK query has
# no trigram selectivity at all (ADR-150) — it walks the whole GIN index and rechecks every
# row — and `stations(q:)` / `tickets(q:)` are callable by an anonymous Guest (ADR-025/027)
# on an endpoint with no rate limiter. Without this bound, one unauthenticated caller can
# hold a connection for as long as the planner takes (measured at 54.8s once the EXISTS
# SubPlan hash spills to disk). 3s is well above any legitimate search on realistic data.
SEARCH_STATEMENT_TIMEOUT_MS = 3000

# PostgreSQL raises query_canceled when statement_timeout fires. Both asyncpg (.sqlstate)
# and psycopg (.pgcode) expose it on the driver exception SQLAlchemy wraps.
_QUERY_CANCELED_SQLSTATE = "57014"

# Nesting depth of the search windows currently open on one session, stashed on the session
# itself because that is what the windows share (ADR-157).
_DEPTH_ATTR = "_search_timeout_depth"

# ILIKE wildcards. User input containing these must be escaped or it changes the meaning
# of the query ("100%" would become "anything starting with 100").
# The order matters: the escape character itself goes first, otherwise the backslashes
# introduced while escaping % and _ would be escaped a second time.
_ESCAPE_CHAR = "\\"
_WILDCARDS = ("\\", "%", "_")


class SearchQueryError(ValueError):
    """Raised when the caller's query string is outside the accepted length range.

    **Subclassing ValueError is what makes this message reach the client, and it is load-
    bearing.** app/graphql/schema.py installs MaskErrors(should_mask_error=_should_mask),
    and _should_mask allow-lists ValueError and HTTPException — everything else is replaced
    with "Unexpected error." on the way out. Re-parenting this class onto a bare Exception
    turns a helpful message into that placeholder.

    Pinned end-to-end by test_single_character_query_is_rejected in
    tests/test_graphql/test_search.py, which asserts the Chinese message reaches the
    client through the real schema; it goes red if this stops being a ValueError.
    """


class SearchTimeoutError(ValueError):
    """Raised when a search statement exceeds SEARCH_STATEMENT_TIMEOUT_MS.

    Same ValueError-based contract as SearchQueryError, and load-bearing for the same
    reason (see there): the caller is told the search was too expensive rather than seeing
    a raw driver error, which would leak SQL state into the API response.
    """


def _is_statement_timeout(exc: DBAPIError) -> bool:
    """True if `exc` is PostgreSQL cancelling a statement that hit statement_timeout."""
    orig = exc.orig
    code = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return code == _QUERY_CANCELED_SQLSTATE


@asynccontextmanager
async def search_timeout(db, term: str | None):
    """Bound the statements a keyword search runs, and only those (ADR-152/156/157/158).

    A no-op when `term` is None, so the non-search list/count paths keep their previous
    behaviour exactly.

    `set_config(..., is_local => true)` rather than `SET LOCAL` because the value is user-
    independent but still parameterised, matching the audit variables already set this way
    in app/db/session.py.

    **The setting is restored on the way out** (ADR-156). Transaction scope alone is not
    enough: a GraphQL request is one transaction on one shared AsyncSession
    (app/graphql/context.py), so without the reset the ceiling would also apply to every
    sibling root field resolved after the search — fields that never asked for a search,
    whose cancellation would surface as a raw driver error, because the translation below
    only covers this block. The search itself stays bounded either way, which is what
    ADR-152 is actually protecting.

    **The restore is nesting-aware** (ADR-157). That same shared session means two sibling
    `q:` resolvers interleave: each of them entering and leaving its own window, while the
    setting they are both writing is one transaction-wide value. Only the outermost window
    touches it, so an inner one cannot restore the ceiling out from under an outer search,
    and — the actual bug this replaces — cannot capture the outer window's ceiling as if it
    were the default and leave it applied to the rest of the transaction. `RESET` rather
    than writing back a previously read value is what makes that possible: it needs no
    read, so there is no read-modify-write to lose. Nothing else in the codebase sets
    `statement_timeout`, so the session default it reverts to is the server default.

    Mutations never reach this code, so write paths keep the server default.

    Note this bounds *one statement's* cost, not the request rate — a caller can still
    repeat the query. Rate limiting `/graphql` is tracked separately (ADR-152).
    """
    if term is None:
        yield
        return
    depth = getattr(db, _DEPTH_ATTR, 0)
    setattr(db, _DEPTH_ATTR, depth + 1)
    is_outermost = depth == 0
    if is_outermost:
        await _apply_statement_timeout(db)
    needs_restore = True
    try:
        yield
    except DBAPIError as exc:
        if _is_statement_timeout(exc):
            # Rolling back discards the transaction-local ceiling with it (ADR-158).
            rolled_back = await _rollback_aborted_transaction(db)
            needs_restore = not rolled_back
            if rolled_back and not is_outermost:
                # The ceiling this rollback discarded was shared with every window still
                # open on this session, and the outer one already ran its set_config —
                # `is_outermost` is decided on entry, so it will not run it again. Without
                # re-applying here, a sibling search that is still in flight would carry on
                # with no bound at all (ADR-163). Suppressed rather than raised: this is
                # already the error path, and a failure here must not replace the timeout
                # the caller needs to see.
                with suppress(DBAPIError):
                    await _apply_statement_timeout(db)
            raise SearchTimeoutError(
                f"搜尋耗時過長已中止，請改用更明確的關鍵字（上限 {SEARCH_STATEMENT_TIMEOUT_MS // 1000} 秒）"
            ) from exc
        raise
    finally:
        setattr(db, _DEPTH_ATTR, getattr(db, _DEPTH_ATTR, 1) - 1)
        if is_outermost and needs_restore:
            await _restore_statement_timeout(db)


async def _apply_statement_timeout(db) -> None:
    """Set the search ceiling for the rest of this transaction.

    `set_config(..., is_local => true)` rather than `SET LOCAL` because the value is user-
    independent but still parameterised, matching the audit variables already set this way
    in app/db/session.py.
    """
    await db.execute(
        text("SELECT set_config('statement_timeout', :ms, true)"),
        {"ms": str(SEARCH_STATEMENT_TIMEOUT_MS)},
    )


async def _rollback_aborted_transaction(db) -> bool:
    """Discard the transaction PostgreSQL aborted when it cancelled the search (ADR-158).

    A cancelled statement leaves the transaction in a state where every further statement
    fails with 25P02. The session is shared by every root field of the request
    (app/graphql/context.py), so without this the sibling fields resolved after the search
    fail with an opaque "current transaction is aborted" instead of returning their data.
    Read paths only, so there is never uncommitted work here to lose.

    Returns whether the rollback succeeded, i.e. whether the transaction-local ceiling is
    already gone and the caller can skip restoring it.
    """
    try:
        await db.rollback()
    except SQLAlchemyError:
        return False
    return True


async def _restore_statement_timeout(db) -> None:
    """Put `statement_timeout` back, tolerating an already-poisoned transaction.

    Whenever the search raised a database error other than a timeout, PostgreSQL has
    aborted the transaction and rejects every further statement until rollback — including
    this one. That path needs no reset: rollback discards the transaction-local setting
    anyway. Swallowing the failure here keeps the original error as the one the caller
    sees, instead of masking it with a secondary "current transaction is aborted".
    """
    with suppress(DBAPIError):
        await db.execute(text("RESET statement_timeout"))


def _escape(value: str) -> str:
    """Escape ILIKE wildcards so user input is matched literally."""
    for char in _WILDCARDS:
        value = value.replace(char, _ESCAPE_CHAR + char)
    return value


def normalize_query(q: str | None) -> str | None:
    """Validate and trim a raw query, returning the search term or None for "no search".

    Callers that build their own conditions (EXISTS subqueries, relevance ordering) need
    the term itself as well as the LIKE pattern — `similarity()` ranks against the raw
    term, not the escaped pattern — so validation is exposed separately from
    build_search_condition().

    Raises SearchQueryError outside the accepted length range (ADR-082):

    - **Below MIN_QUERY_LENGTH**: a single CJK character has such poor trigram selectivity
      that the index scan matches most rows and degrades into a full scan plus recheck —
      and the result is meaningless to the user anyway.
    - **Above MAX_QUERY_LENGTH**: an application-level resource bound on untrusted input.
      Query cost scales with several factors — the number of trigrams extracted from the
      pattern (each is a separate GIN key lookup), the size of the candidate set those
      keys match, and the per-row recheck of the ``%...%`` pattern. Bounding the query
      length caps the first directly, and it is the only one of the three controllable at
      the API boundary.
    """
    if q is None:
        return None
    cleaned = q.strip()
    if not cleaned:
        return None
    if len(cleaned) < MIN_QUERY_LENGTH:
        raise SearchQueryError(f"搜尋關鍵字至少 {MIN_QUERY_LENGTH} 個字")
    if len(cleaned) > MAX_QUERY_LENGTH:
        raise SearchQueryError(f"搜尋關鍵字不得超過 {MAX_QUERY_LENGTH} 個字")
    return cleaned


def like_pattern(term: str) -> str:
    """Turn a validated term into an escaped `%term%` ILIKE pattern."""
    return f"%{_escape(term)}%"


def matches(column, pattern: str):
    """One ILIKE predicate for an already-escaped pattern, with the escape char set.

    Every ILIKE in the search path must go through this — passing `escape=` is what makes
    the escaping in like_pattern() actually take effect.
    """
    return column.ilike(pattern, escape=_ESCAPE_CHAR)

