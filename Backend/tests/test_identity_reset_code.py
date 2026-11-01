"""The code Spec 029 adds, and that it does not sign a browser out (ADR-402, ADR-404)."""

from app.core.api_errors import ErrorCode
from app.main import _SIGNED_OUT


def test_the_new_code_is_named_as_the_spec_says():
    """Clients branch on this string."""
    assert ErrorCode.IDENTITY_RESET == "identity_reset"


def test_an_identity_reset_keeps_the_cookies():
    """The refresh that follows needs them (ADR-404)."""
    assert ErrorCode.IDENTITY_RESET not in _SIGNED_OUT
