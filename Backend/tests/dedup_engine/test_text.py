"""Trigram similarity in the dedup core (ADR-288). Parity with pg_trgm: tests/test_dedup_trgm_parity.py."""

from app.dedup_engine.text import trigram_similarity, trigrams


def test_identical_text_scores_one():
    """The same sentence is a perfect match."""
    assert trigram_similarity("民生街淹水", "民生街淹水") == 1.0


def test_an_empty_side_scores_zero():
    """No trigrams on one side means nothing in common."""
    assert trigram_similarity("", "民生街淹水") == 0.0
    assert trigram_similarity("!!!", "民生街淹水") == 0.0


def test_case_and_punctuation_are_ignored():
    """Only alphanumeric words count, compared lower-case."""
    assert trigram_similarity("Pump, NEEDED!", "pump needed") == 1.0


def test_symmetric():
    """Order of arguments does not matter."""
    a, b = "民生街三段淹水需要抽水機", "民生街淹水 需要抽水"
    assert trigram_similarity(a, b) == trigram_similarity(b, a)


def test_words_are_padded_like_pg_trgm():
    """Two spaces before and one after each word: 'ab' gives '  a', ' ab', 'ab '."""
    assert trigrams("ab") == frozenset({"  a", " ab", "ab "})


def test_unrelated_text_scores_low():
    """Different problems share few trigrams."""
    assert trigram_similarity("需要志工幫忙搬物資", "民生街三段淹水需要抽水機") < 0.3
