"""Unit tests for the verify-then-create auth request schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest, ResendVerificationRequest, VerifyRequest


def test_register_request_email_type():
    """A valid email registration request parses and keeps type == 'email'."""
    r = RegisterRequest(type="email", value="A@X.com", password="hashed", salt_frontend="abc",
                        name="Tester")
    assert r.type == "email"


def test_register_request_rejects_blank_value():
    """A blank value fails the min_length=1 constraint."""
    with pytest.raises(ValidationError):
        RegisterRequest(type="email", value="", password="hashed", salt_frontend="abc", name="Tester")


def test_register_request_name_required_and_stripped():
    """`name` is required, rejects whitespace-only, and is stripped of surrounding spaces."""
    # (a) missing name -> ValidationError
    with pytest.raises(ValidationError):
        RegisterRequest(type="email", value="a@x.com", password="hashed", salt_frontend="abc")
    # (b) whitespace-only name -> ValidationError
    with pytest.raises(ValidationError):
        RegisterRequest(type="email", value="a@x.com", password="hashed", salt_frontend="abc", name="   ")
    # (c) surrounding whitespace is stripped
    r = RegisterRequest(type="email", value="a@x.com", password="hashed", salt_frontend="abc",
                        name=" Bob ")
    assert r.name == "Bob"


def test_verify_request():
    """VerifyRequest carries type, value, code."""
    r = VerifyRequest(type="phone", value="+886912345678", code="123456")
    assert r.code == "123456"


def test_resend_request():
    """The resend body carries the contact value to resend to."""
    assert ResendVerificationRequest(type="email", value="a@x.com").value == "a@x.com"


def test_add_and_verify_contact_requests():
    """AddContactRequest + VerifyContactRequest carry the expected fields."""
    from app.schemas.auth import AddContactRequest, VerifyContactRequest
    assert AddContactRequest(type="phone", value="0912345678").type == "phone"
    assert VerifyContactRequest(type="phone", value="0912345678", code="123456").code == "123456"
