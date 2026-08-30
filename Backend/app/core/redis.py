"""Redis client construction and the dependency that hands it to endpoints."""

import redis.asyncio as aioredis
from fastapi import Request
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

# Retry a command whose connection died underneath it (ADR-196). Without this, every Redis
# restart costs one spurious 401 per connection still sitting in the pool: the pooled socket
# is only discovered to be dead when a request tries to use it, and `_require_live_session`
# fail-closes that into a 401 (ADR-100) indistinguishable from a real revocation.
#
# `health_check_interval` does NOT solve this and is deliberately not set — measured, the
# health-check PING is itself sent on the dead socket and raises with nothing to catch it:
# 30 of 30 concurrent requests still failed. Retrying is what actually reconnects.
#
# Three attempts with an exponential backoff capped at 200ms: a Redis restart is back inside
# that budget, and anything longer than a genuine outage should still surface as fail-closed
# rather than be papered over.
_RETRY_ATTEMPTS = 3
_BACKOFF_BASE_SECONDS = 0.01
_BACKOFF_CAP_SECONDS = 0.2


def create_redis_client(url: str):
    """Build the shared async Redis client.

    One place, so the application and anything else that needs a client get the same retry
    behaviour rather than each rediscovering it.
    """
    return aioredis.from_url(
        url,
        decode_responses=False,
        retry=Retry(
            ExponentialBackoff(cap=_BACKOFF_CAP_SECONDS, base=_BACKOFF_BASE_SECONDS),
            _RETRY_ATTEMPTS,
        ),
        retry_on_error=[RedisConnectionError, RedisTimeoutError],
    )


def get_redis(request: Request):
    """Return the shared async Redis client created in the app lifespan."""
    return request.app.state.redis
