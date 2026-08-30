"""Tests for the Redis-backed SessionRepository."""

import asyncio

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from app.repositories.session_repository import (
    InvalidRefreshToken,
    RefreshTokenReuse,
    SessionRepository,
)
from tests.conftest import TEST_REDIS_URL


@pytest_asyncio.fixture
async def repo():
    """Return a SessionRepository backed by a real flushed redis client (db 15)."""
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await r.flushdb()
    yield SessionRepository(r)
    await r.flushdb()
    await r.aclose()


@pytest.mark.asyncio
async def test_create_session_returns_sid_and_raw_token(repo):
    """create_session returns a sid + raw token and stores a matching refresh record."""
    sid, raw = await repo.create_session("user-1", device="pytest-UA")
    assert sid and raw
    rec = await repo.get_refresh(repo._hash(raw))
    assert rec["sid"] == sid and rec["user_uuid"] == "user-1"


@pytest.mark.asyncio
async def test_rotate_issues_new_token_and_invalidates_old(repo):
    """Rotate issues a fresh token; replaying the old token raises RefreshTokenReuse."""
    _, raw = await repo.create_session("user-1", device="UA")
    _sid, _user, new_raw = await repo.rotate(raw)
    assert new_raw != raw
    with pytest.raises(RefreshTokenReuse):
        await repo.rotate(raw)


@pytest.mark.asyncio
async def test_reuse_revokes_the_session(repo):
    """Replaying a rotated token revokes the session, invalidating the new token too."""
    _, raw = await repo.create_session("user-1", device="UA")
    _, _user, new_raw = await repo.rotate(raw)
    with pytest.raises(RefreshTokenReuse):
        await repo.rotate(raw)
    with pytest.raises(InvalidRefreshToken):
        await repo.rotate(new_raw)


@pytest.mark.asyncio
async def test_unknown_token_is_invalid(repo):
    """Rotating an unknown token raises InvalidRefreshToken."""
    with pytest.raises(InvalidRefreshToken):
        await repo.rotate("nope")


@pytest.mark.asyncio
async def test_concurrent_rotate_same_token_one_wins(repo):
    """Two concurrent rotations of the same token: exactly one wins, one is reuse-detected.

    Uses an asyncio.Barrier to deterministically force the race window: both coroutines read the
    refresh record before either mutates, which is exactly the interleave the fix must survive.
    """
    _sid, raw = await repo.create_session("u-1", "dev")
    gate = asyncio.Barrier(2)
    orig_get = repo.get_refresh

    async def gated_get_refresh(h):
        rec = await orig_get(h)
        await gate.wait()  # both coroutines have read before either mutates
        return rec

    repo.get_refresh = gated_get_refresh
    results = await asyncio.gather(repo.rotate(raw), repo.rotate(raw), return_exceptions=True)
    oks = [r for r in results if not isinstance(r, Exception)]
    reuse = [r for r in results if isinstance(r, RefreshTokenReuse)]
    assert len(oks) == 1 and len(reuse) == 1


@pytest.mark.asyncio
async def test_revoke_all_for_user_kills_every_session(repo):
    """revoke_all_for_user invalidates every refresh token belonging to the user."""
    _, raw1 = await repo.create_session("user-1", device="A")
    _, raw2 = await repo.create_session("user-1", device="B")
    await repo.revoke_all_for_user("user-1")
    for raw in (raw1, raw2):
        with pytest.raises(InvalidRefreshToken):
            await repo.rotate(raw)


# --------------------------------------------------------------------------------------
# The claim survives being retried (ADR-196)
# --------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_claim_succeeds_on_a_free_token(repo):
    """The ordinary case: nobody has claimed this hash, so it is ours."""
    assert await repo._claim("free-hash", b"nonce-a") is True


@pytest.mark.asyncio
async def test_reclaiming_with_our_own_nonce_succeeds(repo):
    """A retried claim must not read its own write as somebody else's replay.

    The shared Redis client retries a command whose connection died underneath it, and
    `SET NX` is not idempotent: if the server ran it but the reply was lost, the retry finds
    the key already set. With a constant value the caller could not tell that apart from a
    genuine replay, and would revoke the whole session — signing the user out of every
    device and telling them their refresh token had been stolen.
    """
    assert await repo._claim("same-hash", b"nonce-a") is True

    assert await repo._claim("same-hash", b"nonce-a") is True


@pytest.mark.asyncio
async def test_claiming_a_token_someone_else_holds_fails(repo):
    """A different nonce on the key is a real replay, and must still be refused."""
    assert await repo._claim("taken-hash", b"nonce-a") is True

    assert await repo._claim("taken-hash", b"nonce-b") is False


@pytest.mark.asyncio
async def test_rotate_survives_the_claim_being_retried(repo):
    """End to end: the claim executes, its reply is lost, the client re-sends the command.

    Simulates what a Redis restart does to a pooled connection. The retry lives inside the
    Redis client (ADR-196), so it re-sends the SAME `SET NX` — which now finds the key set by
    its own first execution and returns False. That False is what reaches `_claim`, and
    before the nonce it made `rotate` raise RefreshTokenReuse and revoke the session that was
    merely refreshing.

    Note what is NOT simulated: a second `rotate()` call is a new attempt with a new nonce and
    must still be read as a replay. That case is the replay test above.
    """
    _sid, raw = await repo.create_session("user-retry", device="UA")
    real_set = repo.redis.set
    sabotaged = {"done": False}

    async def set_losing_the_first_reply(*args, **kwargs):
        if kwargs.get("nx") and not sabotaged["done"]:
            sabotaged["done"] = True
            await real_set(*args, **kwargs)   # the server ran it; the reply never arrived
            return await real_set(*args, **kwargs)  # what the client's retry gets back
        return await real_set(*args, **kwargs)

    repo.redis.set = set_losing_the_first_reply
    try:
        new_sid, user_uuid, new_raw = await repo.rotate(raw)
    finally:
        repo.redis.set = real_set

    assert sabotaged["done"], "the NX claim was never exercised"
    assert user_uuid == "user-retry" and new_raw != raw and new_sid
