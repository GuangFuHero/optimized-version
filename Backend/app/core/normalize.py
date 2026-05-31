"""Identifier normalization.

Email/phone MUST be normalized before storage or UNIQUE dedupe fails (design H3).
"""

import re

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    """Lowercase + strip an email; raise ValueError if it is not a plausible address."""
    cleaned = value.strip().lower()
    if not _EMAIL_RE.match(cleaned):
        raise ValueError("invalid email")
    return cleaned
