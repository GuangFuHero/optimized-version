"""Unit tests for the search condition builder (feature 011, ADR-082)."""

import pytest

from app.core.search import MAX_QUERY_LENGTH, SearchQueryError, build_search_condition
from app.models.geo import Station


def _compiled(cond) -> str:
    return str(cond.compile(compile_kwargs={"literal_binds": True}))


def test_none_query_produces_no_condition():
    """No query means no filter — callers splat the empty list unconditionally."""
    assert build_search_condition(None, Station.search_text) == []


def test_blank_query_produces_no_condition():
    """Whitespace-only input is treated as no query, not as a 1-character one."""
    assert build_search_condition("   ", Station.search_text) == []


def test_single_character_query_is_rejected():
    """One CJK character has near-zero trigram selectivity (ADR-082)."""
    with pytest.raises(SearchQueryError):
        build_search_condition("水", Station.search_text)


def test_two_character_query_is_accepted():
    """Two characters is the shortest query worth running."""
    assert len(build_search_condition("光復", Station.search_text)) == 1


def test_overlong_query_is_rejected():
    """The upper bound caps trigram extraction on untrusted input (ADR-082)."""
    with pytest.raises(SearchQueryError):
        build_search_condition("光" * (MAX_QUERY_LENGTH + 1), Station.search_text)


def test_query_at_the_maximum_length_is_accepted():
    """The bound is inclusive — exactly MAX_QUERY_LENGTH is fine."""
    assert len(build_search_condition("光" * MAX_QUERY_LENGTH, Station.search_text)) == 1


def test_surrounding_whitespace_does_not_count_towards_the_minimum():
    """" 水 " is one character of query, not three."""
    with pytest.raises(SearchQueryError):
        build_search_condition("  水  ", Station.search_text)


def test_calling_without_a_column_is_a_type_error():
    """The invariant is enforced by the signature, not by a runtime check.

    SQLAlchemy's or_() accepts zero clauses and silently yields an empty condition
    (deprecation warning only), so a missing column would corrupt the caller's query
    rather than fail loudly. The signature must make that unrepresentable.
    """
    with pytest.raises(TypeError):
        build_search_condition("光復")


# --- wildcard escaping -------------------------------------------------------
# _escape() handles three characters in the order \ then % then _ — the escape
# character itself must go first, or the backslashes it introduces get escaped a
# second time. All three need a test pinning the behaviour down.


def test_percent_is_escaped():
    """A user typing % must not turn into a match-everything query."""
    assert r"100\%" in _compiled(build_search_condition("100%", Station.search_text)[0])


def test_underscore_is_escaped():
    """_ is ILIKE's single-character wildcard and must be matched literally."""
    assert r"a\_b" in _compiled(build_search_condition("a_b", Station.search_text)[0])


def test_backslash_is_escaped():
    """The escape character itself must be escaped first, or everything after breaks."""
    assert r"C:\\foo" in _compiled(build_search_condition(r"C:\foo", Station.search_text)[0])


def test_mixed_wildcards_are_escaped_in_the_right_order():
    r"""`100%\_` must not double-escape: the \ introduced by escaping % is left alone."""
    compiled = _compiled(build_search_condition(r"100%\_", Station.search_text)[0])
    assert r"100\%\\\_" in compiled


def test_multiple_columns_are_or_ed():
    """Several columns collapse into one OR clause, not one condition each."""
    conds = build_search_condition("光復", Station.name, Station.description)
    assert len(conds) == 1  # a single OR clause, not one condition per column
    compiled = _compiled(conds[0])
    assert " OR " in compiled
