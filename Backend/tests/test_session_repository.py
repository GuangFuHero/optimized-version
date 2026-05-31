"""Tests for the Redis-backed SessionRepository."""

import fakeredis.aioredis
import pytest

from app.repositories.session_repository import (
    InvalidRefreshToken,
    RefreshTokenReuse,
    SessionRepository,
)


@pytest.fixture
def repo():
    """Return a SessionRepository backed by an in-memory fakeredis client."""
    return SessionRepository(fakeredis.aioredis.FakeRedis(decode_responses=False))


@pytest.mark.asyncio
async def test_create_session_returns_sid_and_raw_token(repo):
    """create_session returns a sid + raw token and stores a matching refresh record."""
    sid, raw = await repo.create_session("user-1", device="pytest-UA")
    assert sid and raw
    rec = await repo.get_refresh(repo._hash(raw))
    assert rec["sid"] == sid and rec["user_uuid"] == "user-1" and rec["used"] is False


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
async def test_revoke_all_for_user_kills_every_session(repo):
    """revoke_all_for_user invalidates every refresh token belonging to the user."""
    _, raw1 = await repo.create_session("user-1", device="A")
    _, raw2 = await repo.create_session("user-1", device="B")
    await repo.revoke_all_for_user("user-1")
    for raw in (raw1, raw2):
        with pytest.raises(InvalidRefreshToken):
            await repo.rotate(raw)
