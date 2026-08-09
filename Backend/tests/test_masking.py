"""Unit tests for app/graphql/masking.py (PII masking, ADR-049 / ported from PR #23)."""

from app.graphql.masking import mask_email, mask_name, mask_phone


def test_mask_name_cjk_fixed_width():
    """CJK name → first char + fixed ◯◯ (does not reveal real length)."""
    assert mask_name("王小明") == "王◯◯"
    assert mask_name("陳" ) == "陳◯◯"
    assert mask_name("歐陽娜娜") == "歐◯◯"


def test_mask_name_latin_initials():
    """Latin name → first token + initials of the rest."""
    assert mask_name("John Smith") == "John S."
    assert mask_name("Mary Jane Watson") == "Mary J.W."
    assert mask_name("Cher") == "C."


def test_mask_name_empty_or_none():
    """Empty / None / whitespace pass through unchanged."""
    assert mask_name(None) is None
    assert mask_name("") == ""
    assert mask_name("   ") == ""


def test_mask_email_keeps_only_first_char_and_tld():
    """Email → first local char + masked local/provider, keep TLD."""
    assert mask_email("johnsmith@gmail.com") == "j***@***.com"
    assert mask_email("a@b.org") == "a***@***.org"


def test_mask_email_non_email_is_masked():
    """A non-empty value without '@' (e.g. a mis-entered phone) is masked, not passed through."""
    assert mask_email("not-an-email") == "◯◯◯"
    assert mask_email(None) is None
    assert mask_email("") == ""


def test_mask_phone_keeps_first_two_last_three():
    """Phone → first 2 + last 3 digits, middle masked."""
    assert mask_phone("0912345678") == "09*****678"


def test_mask_phone_normalizes_886():
    """A +886 prefix normalizes to 0 before masking."""
    assert mask_phone("+886912345678") == "09*****678"


def test_mask_phone_short_and_none():
    """Short numbers fully masked; None passes through."""
    assert mask_phone("123") == "***"
    assert mask_phone(None) is None
    assert mask_phone("") == ""


def test_mask_phone_legitimate_formats_still_mask_as_phone():
    """Legitimate Taiwanese phone punctuation is stripped, not rejected as non-phone."""
    assert mask_phone("0912345678") == "09*****678"
    assert mask_phone("0912-345-678") == "09*****678"
    assert mask_phone("(03) 8221234") == "03****234"
    assert mask_phone("+886912345678") == "09*****678"
    assert mask_phone("02-1234-5678") == "02*****678"


def test_mask_phone_non_phone_is_masked_entirely():
    """A value that is not phone-shaped is masked entirely, not passed through empty.

    E.g. a LINE ID mis-stored in the phone field must not turn into a fake phone number.
    """
    assert mask_phone("LINE: yilan_vol") == "◯◯◯"
    assert mask_phone("LINE: abc123456") == "◯◯◯"
    assert mask_phone("LINE: hualien_relief_2024") == "◯◯◯"
