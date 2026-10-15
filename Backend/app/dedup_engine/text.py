"""Trigram similarity in Python, giving the same result as pg_trgm.

It follows the same steps as pg_trgm's `similarity()`:

1. Change the text to lower case.
2. Split the text into alphanumeric words.
3. Put two spaces before each word and one space after it.
4. Collect the set of all 3-character windows.
5. Return |A ∩ B| / |A ∪ B|.

CJK characters count as alphanumeric, so a Chinese sentence without spaces is one word,
as in pg_trgm under a UTF-8 locale. tests/test_dedup_trgm_parity.py checks parity with the database.
"""

import re

_WORD = re.compile(r"[^\W_]+")


def trigrams(text: str) -> frozenset[str]:
    """Return the padded trigram set pg_trgm builds from `text`."""
    grams: set[str] = set()
    for word in _WORD.findall(text.lower()):
        padded = f"  {word} "
        grams.update(padded[i : i + 3] for i in range(len(padded) - 2))
    return frozenset(grams)


def trigram_similarity(a: str, b: str) -> float:
    """Shared trigrams over all trigrams, 0–1; 0 if either side has none."""
    return set_similarity(trigrams(a), trigrams(b))


def set_similarity(grams_a: frozenset[str], grams_b: frozenset[str]) -> float:
    """`trigram_similarity` on precomputed trigram sets.

    Use it to compare one text with many, building the first text's trigrams only once.
    """
    if not grams_a or not grams_b:
        return 0.0
    return len(grams_a & grams_b) / len(grams_a | grams_b)
