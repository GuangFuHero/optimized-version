"""Keyword search condition builder (feature 011, ADR-078/082).

Chinese text search uses pg_trgm + ILIKE rather than tsvector: PostgreSQL's built-in
full-text search does not segment Chinese, so "花蓮縣光復鄉" becomes a single token and
searching "光復" finds nothing. Trigram matching is character-level and needs no
segmentation (ADR-078).

Lives in app/core/ rather than app/graphql/ because repositories consume it, and a
repository must not import from the GraphQL layer.
"""

from sqlalchemy import or_

# Lengths are Python str lengths, i.e. Unicode code point counts. For CJK queries
# "2 code points" is exactly "2 characters", which is the semantics we want.
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 50

# ILIKE wildcards. User input containing these must be escaped or it changes the meaning
# of the query ("100%" would become "anything starting with 100").
# The order matters: the escape character itself goes first, otherwise the backslashes
# introduced while escaping % and _ would be escaped a second time.
_ESCAPE_CHAR = "\\"
_WILDCARDS = ("\\", "%", "_")


class SearchQueryError(ValueError):
    """Raised when the caller's query string is outside the accepted length range.

    Subclasses ValueError to match the existing GraphQL convention: resolvers raise plain
    exceptions and Strawberry surfaces str(exc) as errors[0].message. No masking extension
    is configured (app/graphql/schema.py), so nothing further is needed to expose this.
    """


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


def any_matches(pattern: str, first_column, *more_columns):
    """OR together an ILIKE predicate over each column.

    At least one column is required *by the signature*. ``or_()`` accepts zero clauses and
    silently produces an empty condition (deprecation warning only, SQLAlchemy 2.0.45),
    which would quietly corrupt the caller's query instead of failing — so the invariant
    is enforced structurally rather than by a runtime check.
    """
    columns = (first_column, *more_columns)
    return or_(*(matches(col, pattern) for col in columns))
