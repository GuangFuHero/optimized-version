"""Rate-limit window behaviour.

The previous pyrate_limiter-based implementation computed a per-caller key and then threw it away
(`SingleBucketFactory.get(self, _)`), so every caller in the whole deployment shared one allowance.
The earlier audit missed it because its only test hammered a single key — an experiment that looks
identical whether the limit is per-caller or global. The isolation tests below are the ones that
would have caught it.
"""

import pytest

from app.api.v1.endpoints.auth.deps import (
    build_rate_limit_key,
    consume_rate_limit,
    resolve_client_ip,
)


class _FakeRequest:
    """Minimal stand-in exposing only what `resolve_client_ip` reads."""

    class _Client:
        def __init__(self, host):
            self.host = host

    def __init__(self, headers=None, client_host=None):
        self.headers = headers or {}
        self.client = self._Client(client_host) if client_host else None


@pytest.mark.asyncio
async def test_allows_up_to_the_limit_then_blocks(redis):
    """The window admits exactly `times` hits, then refuses."""
    key = build_rate_limit_key(3, 60, "10.0.0.1", "/auth/register")

    assert [await consume_rate_limit(redis, key, 3, 60) for _ in range(3)] == [True] * 3
    assert await consume_rate_limit(redis, key, 3, 60) is False


@pytest.mark.asyncio
async def test_callers_do_not_consume_each_others_allowance(redis):
    """The regression that matters: one caller exhausting the limit must not block anyone else."""
    mine = build_rate_limit_key(3, 60, "10.0.0.1", "/auth/register")
    theirs = build_rate_limit_key(3, 60, "10.0.0.2", "/auth/register")

    for _ in range(4):
        await consume_rate_limit(redis, mine, 3, 60)
    assert await consume_rate_limit(redis, mine, 3, 60) is False

    assert await consume_rate_limit(redis, theirs, 3, 60) is True


@pytest.mark.asyncio
async def test_endpoints_do_not_share_an_allowance(redis):
    """Exhausting one endpoint must leave the caller's other endpoints untouched."""
    caller = "10.0.0.1"
    register = build_rate_limit_key(3, 60, caller, "/auth/register")
    verify = build_rate_limit_key(10, 60, caller, "/auth/verify")

    for _ in range(4):
        await consume_rate_limit(redis, register, 3, 60)
    assert await consume_rate_limit(redis, register, 3, 60) is False

    assert await consume_rate_limit(redis, verify, 10, 60) is True


@pytest.mark.asyncio
async def test_window_key_always_gets_a_ttl(redis):
    """A key without a TTL would ban the caller permanently."""
    key = build_rate_limit_key(3, 60, "10.0.0.1", "/auth/register")

    await consume_rate_limit(redis, key, 3, 60)

    assert 0 < await redis.ttl(key) <= 60


@pytest.mark.asyncio
async def test_ttl_is_not_extended_by_later_hits_in_the_same_window(redis):
    """Refreshing the TTL on every hit would let a steady caller stay blocked forever."""
    key = build_rate_limit_key(3, 1, "10.0.0.1", "/auth/register")

    await consume_rate_limit(redis, key, 3, 1)
    first_ttl = await redis.pttl(key)
    await consume_rate_limit(redis, key, 3, 1)

    assert await redis.pttl(key) <= first_ttl


def test_client_ip_prefers_the_forwarded_header():
    """The BFF's forwarded browser IP wins over the container's peer address."""
    request = _FakeRequest(
        headers={"X-Forwarded-For": "203.0.113.7, 10.1.1.1"}, client_host="172.18.0.3",
    )

    assert resolve_client_ip(request) == "203.0.113.7"


def test_client_ip_falls_back_to_the_peer_address():
    """Direct callers with no proxy header are keyed by their socket address."""
    assert resolve_client_ip(_FakeRequest(client_host="172.18.0.3")) == "172.18.0.3"


def test_client_ip_survives_a_missing_peer():
    """A request with neither header nor peer must not blow up the limiter."""
    assert resolve_client_ip(_FakeRequest()) == "unknown"
