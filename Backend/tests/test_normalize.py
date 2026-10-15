"""Tests for email identifier normalization."""

import time

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


def test_normalize_email_rejects_overlong_address():
    """An address longer than 320 characters is rejected even when it is otherwise well formed."""
    with pytest.raises(ValueError):
        normalize_email("a" * 64 + "@" + "b" * 252 + ".com")


def test_normalize_email_rejects_backtracking_input_quickly():
    """Input that makes the regex backtrack quadratically is rejected before the regex runs."""
    start = time.monotonic()
    with pytest.raises(ValueError):
        normalize_email("a@" + "." * 100_000 + "@")
    assert time.monotonic() - start < 1
