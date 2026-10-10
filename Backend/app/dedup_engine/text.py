"""Trigram similarity in Python, with the same result as pg_trgm (ADR-288).

This module does the same steps as `similarity()` of pg_trgm:

1. Change the text to lower case.
2. Split the text into alphanumeric words.
3. Put two spaces before each word and one space after it.
4. Collect the set of all 3-character windows.
5. Return |A ∩ B| / |A ∪ B|.

CJK characters are alphanumeric. Thus, a Chinese sentence without spaces is one word.
pg_trgm does the same with a UTF-8 locale.

tests/test_dedup_trgm_parity.py compares this module with the database function.
"""

import re

_WORD = re.compile(r"[^\W_]+")


def trigrams(text: str) -> frozenset[str]:
    """Make the set of padded trigrams that pg_trgm makes from `text`."""
    grams: set[str] = set()
    for word in _WORD.findall(text.lower()):
        padded = f"  {word} "
        grams.update(padded[i : i + 3] for i in range(len(padded) - 2))
    return frozenset(grams)


def trigram_similarity(a: str, b: str) -> float:
    """Divide the shared trigrams by all trigrams. The result is 0–1. Returns 0 if one side has none."""
    return set_similarity(trigrams(a), trigrams(b))


def set_similarity(grams_a: frozenset[str], grams_b: frozenset[str]) -> float:
    """Do `trigram_similarity` on trigram sets that the caller already made.

    Use this function to compare one text with many texts. Then you make the trigrams of the
    first text only one time.
    """
    if not grams_a or not grams_b:
        return 0.0
    return len(grams_a & grams_b) / len(grams_a | grams_b)
