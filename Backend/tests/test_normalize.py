"""Tests for email identifier normalization."""

import pytest

from app.core.normalize import normalize_email, normalize_phone


@pytest.mark.parametrize("raw,expected", [
    ("Alice@X.com", "alice@x.com"),
    ("  bob@x.com  ", "bob@x.com"),
    ("MIXED@Case.IO", "mixed@case.io"),
])
def test_normalize_email(raw, expected):
    """Lowercase and strip a valid email."""
    assert normalize_email(raw) == expected


def test_normalize_email_rejects_garbage():
    """Reject input that is not a plausible email address."""
    with pytest.raises(ValueError):
        normalize_email("not-an-email")


@pytest.mark.parametrize("raw,expected", [
    ("0912345678", "+886912345678"),
    ("+886912345678", "+886912345678"),
    ("0912-345-678", "+886912345678"),
    (" 0912345678 ", "+886912345678"),
])
def test_normalize_phone_tw(raw, expected):
    """TW local and E.164 inputs normalize to E.164."""
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("bad", ["", "not-a-phone", "12345", "0912345"])
def test_normalize_phone_rejects_invalid(bad):
    """Invalid / unparseable / impossible numbers raise ValueError."""
    with pytest.raises(ValueError):
        normalize_phone(bad)
