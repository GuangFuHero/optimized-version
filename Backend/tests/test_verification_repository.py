"""Tests for the unified (email + phone) 6-digit verification store."""
import asyncio

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from app.repositories.verification_repository import MAX_OTP_ATTEMPTS, VerificationRepository
from tests.conftest import TEST_REDIS_URL


@pytest_asyncio.fixture
async def redis():
    """Real bytes-mode redis (db 15, flushed per test)."""
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await r.flushdb()
    yield r
    await r.flushdb()
    await r.aclose()


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
async def test_concurrent_wrong_guesses_enforce_cap(redis):
    """Concurrent wrong guesses that all read the same stale state must not exceed the attempt cap.

    A Barrier gate after the (single) record read forces every coroutine to read the same pre-mutation
    state before any of them writes back -- the exact interleaving a non-atomic read-modify-write loses
    increments under. With an atomic counter the cap is still enforced and the pending is burned.
    """
    repo = VerificationRepository(redis)
    code = await repo.issue_registration(type_="email", value="a@x.com", password_hash="h", name="n")

    pending_key = b"pending_reg:email:a@x.com"
    gate = asyncio.Barrier(MAX_OTP_ATTEMPTS)
    orig_get = repo.redis.get

    async def gated_get(k):
        v = await orig_get(k)
        key_str = k.decode() if isinstance(k, (bytes, bytearray)) else k
        if key_str == pending_key.decode():
            await gate.wait()
        return v

    repo.redis.get = gated_get
    results = await asyncio.gather(
        *[repo.consume_registration(type_="email", value="a@x.com", code="000000")
          for _ in range(MAX_OTP_ATTEMPTS)]
    )
    repo.redis.get = orig_get

    assert all(r is None for r in results)
    # cap enforced despite the concurrent stale reads: the pending is burned, correct code now fails.
    assert await repo.consume_registration(type_="email", value="a@x.com", code=code) is None


@pytest.mark.asyncio
async def test_reissue_resets_attempt_counter(redis):
    """Reissue resets the wrong-guess counter: 4 wrong, reissue, 4 more wrong must not yet burn."""
    repo = VerificationRepository(redis)
    await repo.issue_registration(type_="email", value="a@x.com", password_hash="h", name=None)
    for _ in range(MAX_OTP_ATTEMPTS - 1):
        assert await repo.consume_registration(type_="email", value="a@x.com", code="000000") is None
    new = await repo.reissue_registration(type_="email", value="a@x.com")
    assert new
    for _ in range(MAX_OTP_ATTEMPTS - 1):
        assert await repo.consume_registration(type_="email", value="a@x.com", code="000000") is None
    # counter was reset by reissue, so after only 4 fresh wrong guesses the correct code still works.
    assert (await repo.consume_registration(type_="email", value="a@x.com", code=new)) is not None


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


@pytest.mark.asyncio
async def test_contact_issue_then_consume(redis):
    """A correct contact code consumes the pending and returns its payload (incl. user_uuid)."""
    repo = VerificationRepository(redis)
    phone = "+886912345678"
    code = await repo.issue_contact_verification(user_uuid="u-1", type_="phone", value=phone)
    assert len(code) == 6 and code.isdigit()
    payload = await repo.consume_contact_verification(user_uuid="u-1", type_="phone", value=phone, code=code)
    assert payload["user_uuid"] == "u-1" and payload["value"] == phone
    # single-use
    again = await repo.consume_contact_verification(user_uuid="u-1", type_="phone", value=phone, code=code)
    assert again is None


@pytest.mark.asyncio
async def test_contact_pending_is_per_user(redis):
    """A different user cannot consume another user's contact pending (per-user key isolation)."""
    repo = VerificationRepository(redis)
    email = "a@x.com"
    code = await repo.issue_contact_verification(user_uuid="u-1", type_="email", value=email)
    # wrong user → key not found → None (even with the right code)
    wrong = await repo.consume_contact_verification(user_uuid="u-2", type_="email", value=email, code=code)
    assert wrong is None
    # right user still works
    got = await repo.consume_contact_verification(user_uuid="u-1", type_="email", value=email, code=code)
    assert got is not None


@pytest.mark.asyncio
async def test_contact_attempt_cap_and_reissue(redis):
    """Contact codes share the 5-attempt cap + reissue semantics."""
    repo = VerificationRepository(redis)
    email = "a@x.com"
    code = await repo.issue_contact_verification(user_uuid="u-1", type_="email", value=email)
    wrong_code = "000000"
    for _ in range(MAX_OTP_ATTEMPTS):
        bad = await repo.consume_contact_verification(
            user_uuid="u-1", type_="email", value=email, code=wrong_code
        )
        assert bad is None
    # burned after the cap: even the real code no longer verifies
    burned = await repo.consume_contact_verification(user_uuid="u-1", type_="email", value=email, code=code)
    assert burned is None
    # reissue for a fresh pending
    code2 = await repo.issue_contact_verification(user_uuid="u-1", type_="email", value=email)
    new = await repo.reissue_contact_verification(user_uuid="u-1", type_="email", value=email)
    assert new and new != code2
    assert await repo.reissue_contact_verification(user_uuid="u-9", type_="email", value="none@x.com") is None
