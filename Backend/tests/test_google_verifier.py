"""Tests for the Google id_token verifier adapters and the dependency selector."""
import json

import pytest

from app.sso.google import (
    GoogleIdentity,
    GoogleOidcVerifier,
    GoogleTokenVerificationError,
    get_google_verifier,
)
from tests.fakes import FakeGoogleVerifier


@pytest.mark.asyncio
async def test_fake_verifier_parses_json_claims():
    """The fake verifier parses a JSON id_token into the expected GoogleIdentity."""
    v = FakeGoogleVerifier()
    token = json.dumps({"sub": "g-1", "email": "A@x.com", "email_verified": True, "name": "Al"})
    gid = await v.verify(token)
    assert gid == GoogleIdentity(sub="g-1", email="A@x.com", email_verified=True, name="Al")


@pytest.mark.asyncio
async def test_fake_verifier_rejects_non_json():
    """A non-JSON id_token raises GoogleTokenVerificationError."""
    with pytest.raises(GoogleTokenVerificationError):
        await FakeGoogleVerifier().verify("not-json")


@pytest.mark.asyncio
async def test_fake_verifier_requires_sub():
    """Claims without a `sub` field raise GoogleTokenVerificationError."""
    with pytest.raises(GoogleTokenVerificationError):
        await FakeGoogleVerifier().verify(json.dumps({"email": "a@x.com"}))


def test_get_google_verifier_returns_oidc():
    """The dependency always returns the real OIDC verifier (tests inject the fake separately)."""
    assert isinstance(get_google_verifier(), GoogleOidcVerifier)


@pytest.mark.asyncio
async def test_oidc_verifier_parses_claims(monkeypatch):
    """The real OIDC verifier maps google-auth claims into a GoogleIdentity (runs off the event loop)."""
    from google.oauth2 import id_token as ga_id_token
    monkeypatch.setattr(
        ga_id_token, "verify_oauth2_token",
        lambda token, request, audience: {
            "sub": 123, "email": "a@x.com", "email_verified": True, "name": "Al"},
    )
    gid = await GoogleOidcVerifier("client-123").verify("any-token")
    assert gid == GoogleIdentity(sub="123", email="a@x.com", email_verified=True, name="Al")


@pytest.mark.asyncio
async def test_oidc_verifier_wraps_errors(monkeypatch):
    """google-auth failures surface as GoogleTokenVerificationError, never raw."""
    from google.oauth2 import id_token as ga_id_token

    def _boom(*_a):
        raise ValueError("bad token")

    monkeypatch.setattr(ga_id_token, "verify_oauth2_token", _boom)
    with pytest.raises(GoogleTokenVerificationError):
        await GoogleOidcVerifier("client-123").verify("any-token")
