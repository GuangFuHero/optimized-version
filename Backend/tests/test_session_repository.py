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
    sid, _user, new_raw = await repo.rotate(raw)
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
    sid, raw = await repo.create_session("u-1", "dev")
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
