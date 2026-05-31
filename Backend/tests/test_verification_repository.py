"""Tests for VerificationRepository (Redis pending-registration store, fakeredis bytes mode)."""

import fakeredis.aioredis
import pytest

from app.repositories.verification_repository import VerificationRepository


@pytest.fixture
def redis():
    """Provide a bytes-mode fakeredis client (decode_responses=False) per test."""
    return fakeredis.aioredis.FakeRedis(decode_responses=False)


@pytest.mark.asyncio
async def test_issue_then_consume_roundtrip(redis):
    """Issuing then consuming returns the payload once; a second consume returns None."""
    repo = VerificationRepository(redis)
    token = await repo.issue_email_registration(email="a@x.com", password_hash="h", name="A")
    payload = await repo.consume_email_registration(token)
    assert payload["value"] == "a@x.com"
    assert payload["password_hash"] == "h"
    # single-use: second consume returns None
    assert await repo.consume_email_registration(token) is None


@pytest.mark.asyncio
async def test_consume_unknown_token_returns_none(redis):
    """Consuming a token that was never issued returns None."""
    repo = VerificationRepository(redis)
    assert await repo.consume_email_registration("nope") is None


@pytest.mark.asyncio
async def test_reissue_invalidates_old_token(redis):
    """Reissuing mints a new token, kills the old one, and preserves the payload."""
    repo = VerificationRepository(redis)
    old = await repo.issue_email_registration(email="a@x.com", password_hash="h", name="A")
    new = await repo.reissue_email_registration("a@x.com")
    assert new is not None and new != old
    assert await repo.consume_email_registration(old) is None         # old token dead
    payload = await repo.consume_email_registration(new)               # new token works
    assert payload["password_hash"] == "h"                             # payload preserved


@pytest.mark.asyncio
async def test_reissue_unknown_email_returns_none(redis):
    """Reissuing for an email with no pending registration returns None."""
    repo = VerificationRepository(redis)
    assert await repo.reissue_email_registration("nobody@x.com") is None
