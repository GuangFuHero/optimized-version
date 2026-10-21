"""Tests for the Redis-backed SessionRepository."""

import asyncio

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from app.core.config import settings
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
async def test_rotate_issues_new_token_and_invalidates_old(repo, past_the_refresh_grace_period):
    """Rotate issues a fresh token; the old one past the grace period raises RefreshTokenReuse."""
    _, raw = await repo.create_session("user-1", device="UA")
    sid, _user, new_raw = await repo.rotate(raw)
    assert new_raw != raw
    past_the_refresh_grace_period()
    with pytest.raises(RefreshTokenReuse):
        await repo.rotate(raw)


@pytest.mark.asyncio
async def test_reuse_revokes_the_session(repo, past_the_refresh_grace_period):
    """Replaying a rotated token after the grace period revokes the session, new token included."""
    _, raw = await repo.create_session("user-1", device="UA")
    _, _user, new_raw = await repo.rotate(raw)
    past_the_refresh_grace_period()
    with pytest.raises(RefreshTokenReuse):
        await repo.rotate(raw)
    with pytest.raises(InvalidRefreshToken):
        await repo.rotate(new_raw)


@pytest.mark.asyncio
async def test_a_replay_within_the_grace_period_gets_the_same_new_token(repo):
    """Two clients sharing one refresh token both get through (ADR-330).

    The site and the back office share one cookie, and either can refresh first; the other
    arrives a moment later with the token that was just rotated. It gets the same new token
    rather than revoking the session that both of them are signed in on.
    """
    sid, raw = await repo.create_session("user-1", device="UA")
    first = await repo.rotate(raw)

    again = await repo.rotate(raw)

    assert again == first
    assert await repo.get_session(sid) is not None
    _, _, newer = await repo.rotate(first[2])
    assert newer not in (raw, first[2])


@pytest.mark.asyncio
async def test_a_late_client_keeps_up_when_the_token_was_rotated_twice(repo):
    """One client turned the token into `new1` and then `new2`; the other only now shows the old one.

    It gets `new1`, which has already been rotated too — but `new1` was rotated later than the old
    token was, so its own grace period is still open and the late client's next refresh gets `new2`
    instead of signing everyone out.
    """
    sid, old = await repo.create_session("user-1", device="UA")
    _, _, new1 = await repo.rotate(old)
    _, _, new2 = await repo.rotate(new1)

    _, _, late = await repo.rotate(old)
    _, _, caught_up = await repo.rotate(late)

    assert (late, caught_up) == (new1, new2)
    assert await repo.get_session(sid) is not None


@pytest.mark.asyncio
async def test_a_replay_within_the_grace_period_does_not_revive_a_revoked_session(repo):
    """Signing out inside the grace period stays signed out; the old token is refused, not answered."""
    sid, raw = await repo.create_session("user-1", device="UA")
    await repo.rotate(raw)
    await repo.revoke_session(sid)

    with pytest.raises(InvalidRefreshToken):
        await repo.rotate(raw)


@pytest.mark.asyncio
async def test_a_zero_grace_period_treats_every_replay_as_theft(repo, monkeypatch):
    """0 switches the grace period off: the first replay revokes the session, as before ADR-330."""
    monkeypatch.setattr(settings, "REFRESH_REUSE_GRACE_SECONDS", 0)
    sid, raw = await repo.create_session("user-1", device="UA")
    await repo.rotate(raw)

    with pytest.raises(RefreshTokenReuse):
        await repo.rotate(raw)
    assert await repo.get_session(sid) is None


@pytest.mark.asyncio
async def test_a_claim_from_before_the_grace_period_reads_as_theft(repo):
    """A token claimed before this change carries a bare nonce, which proves no rotation: revoke."""
    sid, raw = await repo.create_session("user-1", device="UA")
    await repo.redis.set(repo.USED + repo._hash(raw), b"a3f1c2d4e5b6a7980123456789abcdef")

    with pytest.raises(RefreshTokenReuse):
        await repo.rotate(raw)
    assert await repo.get_session(sid) is None


@pytest.mark.asyncio
async def test_redis_never_holds_a_usable_refresh_token(repo):
    """Everything stored is a hash or ciphertext, so reading Redis does not let anyone refresh."""
    _, raw = await repo.create_session("user-1", device="UA")
    _, _, new_raw = await repo.rotate(raw)
    await repo.rotate(raw)  # the grace-period answer reads the record back; it must write nothing new

    stored = []
    async for key in repo.redis.scan_iter():
        stored.append(key)
        if await repo.redis.type(key) == b"set":
            stored.extend(await repo.redis.smembers(key))
        else:
            stored.append(await repo.redis.get(key))

    for token in (raw, new_raw):
        assert not [value for value in stored if token.encode() in value], f"{token} is stored in clear"


@pytest.mark.asyncio
async def test_unknown_token_is_invalid(repo):
    """Rotating an unknown token raises InvalidRefreshToken."""
    with pytest.raises(InvalidRefreshToken):
        await repo.rotate("nope")


@pytest.mark.asyncio
async def test_concurrent_rotations_of_one_token_both_get_the_same_new_token(repo):
    """Two concurrent rotations of the same token: one claims it, the other gets what it issued.

    Uses an asyncio.Barrier to deterministically force the race window: both coroutines read the
    refresh record before either mutates, which is exactly the interleave the fix must survive.
    Before ADR-330 the loser was read as a replay and revoked the session both were signed in on.
    """
    sid, raw = await repo.create_session("u-1", "dev")
    gate = asyncio.Barrier(2)
    orig_get = repo.get_refresh

    async def gated_get_refresh(h):
        rec = await orig_get(h)
        await gate.wait()  # both coroutines have read before either mutates
        return rec

    repo.get_refresh = gated_get_refresh
    first, second = await asyncio.gather(repo.rotate(raw), repo.rotate(raw))
    assert first == second
    assert await repo.get_session(sid) is not None


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

    Note what is NOT simulated: a second `rotate()` call is a new attempt with a new nonce. Within
    the grace period it gets the token the first attempt issued, and after it, it is read as a
    replay (ADR-330). Those cases are the grace-period tests above.
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
