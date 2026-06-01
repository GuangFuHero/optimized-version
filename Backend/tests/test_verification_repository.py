"""Tests for the unified (email + phone) 6-digit verification store."""
import fakeredis.aioredis
import pytest

from app.repositories.verification_repository import MAX_OTP_ATTEMPTS, VerificationRepository


@pytest.fixture
def redis():
    """In-memory bytes-mode redis."""
    return fakeredis.aioredis.FakeRedis(decode_responses=False)


@pytest.mark.asyncio
@pytest.mark.parametrize("type_,value", [("email", "a@x.com"), ("phone", "+886912345678")])
async def test_issue_then_consume(redis, type_, value):
    """A correct code consumes the pending and returns the payload (single-use)."""
    repo = VerificationRepository(redis)
    code = await repo.issue_registration(type_=type_, value=value, password_hash="h", name="A")
    assert len(code) == 6 and code.isdigit()
    payload = await repo.consume_registration(type_=type_, value=value, code=code)
    assert payload["value"] == value and payload["password_hash"] == "h"
    assert await repo.consume_registration(type_=type_, value=value, code=code) is None


@pytest.mark.asyncio
async def test_wrong_code_returns_none(redis):
    """A wrong code returns None but the pending survives (until attempt cap)."""
    repo = VerificationRepository(redis)
    code = await repo.issue_registration(type_="email", value="a@x.com", password_hash="h", name=None)
    assert await repo.consume_registration(type_="email", value="a@x.com", code="000000") is None
    # correct code still works (pending not burned yet)
    assert (await repo.consume_registration(type_="email", value="a@x.com", code=code)) is not None


@pytest.mark.asyncio
async def test_attempt_cap_burns_pending(redis):
    """After MAX_OTP_ATTEMPTS wrong tries the pending is burned; the real code no longer works."""
    repo = VerificationRepository(redis)
    code = await repo.issue_registration(type_="phone", value="+886912345678", password_hash="h", name=None)
    for _ in range(MAX_OTP_ATTEMPTS):
        assert await repo.consume_registration(type_="phone", value="+886912345678", code="000000") is None
    assert await repo.consume_registration(type_="phone", value="+886912345678", code=code) is None


@pytest.mark.asyncio
async def test_reissue_resets_code_and_attempts(redis):
    """Reissue mints a new code, invalidates the old, and resets attempts."""
    repo = VerificationRepository(redis)
    old = await repo.issue_registration(type_="email", value="a@x.com", password_hash="h", name=None)
    new = await repo.reissue_registration(type_="email", value="a@x.com")
    assert new and new != old
    assert await repo.consume_registration(type_="email", value="a@x.com", code=old) is None
    assert (await repo.consume_registration(type_="email", value="a@x.com", code=new)) is not None


@pytest.mark.asyncio
async def test_reissue_unknown_returns_none(redis):
    """Reissue for a non-pending identifier returns None."""
    repo = VerificationRepository(redis)
    assert await repo.reissue_registration(type_="email", value="none@x.com") is None
