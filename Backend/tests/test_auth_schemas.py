"""Unit tests for the verify-then-create auth request schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest, ResendVerificationRequest, VerifyEmailRequest


def test_register_request_email_type():
    """A valid email registration request parses and keeps type == 'email'."""
    r = RegisterRequest(type="email", value="A@X.com", password="hashed", salt_frontend="abc")
    assert r.type == "email"


def test_register_request_rejects_blank_value():
    """A blank value fails the min_length=1 constraint."""
    with pytest.raises(ValidationError):
        RegisterRequest(type="email", value="", password="hashed", salt_frontend="abc")


def test_verify_email_request():
    """The verify-email body carries the single-use token."""
    assert VerifyEmailRequest(token="abc").token == "abc"


def test_resend_request():
    """The resend body carries the contact value to resend to."""
    assert ResendVerificationRequest(type="email", value="a@x.com").value == "a@x.com"
