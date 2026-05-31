"""Tests for email identifier normalization."""

import pytest

from app.core.normalize import normalize_email


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
