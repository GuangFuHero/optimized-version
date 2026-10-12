"""Identifier normalization.

Email/phone MUST be normalized before storage or UNIQUE dedupe fails (design H3).
"""

import re

import phonenumbers

from app.core.config import settings

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# The regex backtracks quadratically on long input, so the length cap must run before it. 320 is
# the request schemas' max_length: a 64-character local part, the @, and a 255-character domain.
_MAX_EMAIL_LENGTH = 320


def normalize_email(value: str) -> str:
    """Lowercase + strip an email; raise ValueError if it is not a plausible address."""
    cleaned = value.strip().lower()
    if len(cleaned) > _MAX_EMAIL_LENGTH or not _EMAIL_RE.match(cleaned):
        raise ValueError("invalid email")
    return cleaned


def normalize_phone(value: str) -> str:
    """Parse a phone number to E.164 using the configured default region; raise ValueError if invalid."""
    try:
        parsed = phonenumbers.parse(value.strip(), settings.PHONE_DEFAULT_REGION)
    except phonenumbers.NumberParseException as err:
        raise ValueError("invalid phone") from err
    if not phonenumbers.is_valid_number(parsed):
        raise ValueError("invalid phone")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
