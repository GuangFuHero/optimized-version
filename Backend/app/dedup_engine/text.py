"""pg_trgm-compatible trigram similarity, computed in Python (ADR-288).

Mirrors pg_trgm's `similarity()`: lower-case the text, split it into alphanumeric words, pad
each word with two spaces in front and one behind, take the set of 3-character windows, and
return |A ∩ B| / |A ∪ B|. CJK characters count as alphanumeric, so an unspaced Chinese
sentence is one word — as it is to pg_trgm under a UTF-8 locale.

tests/test_dedup_trgm_parity.py checks this against the database function.
"""

import re

_WORD = re.compile(r"[^\W_]+")


def trigrams(text: str) -> frozenset[str]:
    """The set of padded trigrams pg_trgm would extract from `text`."""
    grams: set[str] = set()
    for word in _WORD.findall(text.lower()):
        padded = f"  {word} "
        grams.update(padded[i : i + 3] for i in range(len(padded) - 2))
    return frozenset(grams)


def trigram_similarity(a: str, b: str) -> float:
    """Shared trigrams over all trigrams, 0–1. Zero when either side has none."""
    return set_similarity(trigrams(a), trigrams(b))


def set_similarity(grams_a: frozenset[str], grams_b: frozenset[str]) -> float:
    """`trigram_similarity` on trigram sets already extracted, for callers comparing one text to many."""
    if not grams_a or not grams_b:
        return 0.0
    return len(grams_a & grams_b) / len(grams_a | grams_b)
