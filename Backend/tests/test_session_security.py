"""Unit tests for refresh-token helpers and access-token claims."""

import uuid

from jose import jwt

from app.core import security
from app.core.config import settings


def test_generate_refresh_token_is_unique_and_urlsafe():
    """Each generated refresh token is unique and sufficiently long."""
    a = security.generate_refresh_token()
    b = security.generate_refresh_token()
    assert a != b
    assert len(a) >= 32


def test_hash_refresh_token_is_deterministic_sha256_hex():
    """Hashing a token is deterministic and yields a 64-char SHA-256 hex digest."""
    t = "some-token"
    assert security.hash_refresh_token(t) == security.hash_refresh_token(t)
    assert len(security.hash_refresh_token(t)) == 64  # sha256 hex
    assert security.hash_refresh_token(t) != t


def test_access_token_includes_sid_jti_type():
    """An access token carries sub, sid, type=access, and a jti claim."""
    sid = str(uuid.uuid4())
    token = security.create_access_token(data={"sub": "user-1"}, sid=sid)
    payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
    assert payload["sub"] == "user-1"
    assert payload["sid"] == sid
    assert payload["type"] == "access"
    assert "jti" in payload


def test_access_token_without_sid_still_works():
    """Omitting sid still produces a valid access token with sid=None."""
    token = security.create_access_token(data={"sub": "user-1"})
    payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
    assert payload["type"] == "access"
    assert payload.get("sid") is None
