"""Shared auth-endpoint helpers: identifier normalization, token issuance, rate limiting."""

import os

from fastapi import Request, status

from app.core import security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.normalize import normalize_email, normalize_phone
from app.repositories.session_repository import SessionRepository
from app.schemas.auth import TokenPair

# Fixed-window counter. INCR and the first-hit EXPIRE run in one script so a crash between them can
# never leave a key without a TTL (which would ban the caller forever).
_RATE_LIMIT_LUA = """
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return hits
"""


def _normalize_identifier(type_: str, value: str) -> str:
    """Normalize an email or phone identifier; raise ValueError if invalid for the type."""
    return normalize_email(value) if type_ == "email" else normalize_phone(value)


async def issue_token_pair(redis, request: Request, user_uuid: str) -> TokenPair:
    """Create a session + access token for `user_uuid` and return the TokenPair (device from UA header)."""
    device = request.headers.get("user-agent", "unknown")
    sid, refresh_token = await SessionRepository(redis).create_session(user_uuid, device)
    access_token = security.create_access_token(data={"sub": user_uuid}, sid=sid)
    return TokenPair(
        access_token=access_token, refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# An IP is well under this; the cap only stops a hostile header from becoming a huge Redis key.
_MAX_CALLER_KEY_LEN = 64


def resolve_client_ip(request: Request) -> str:
    """Resolve the caller's IP, preferring the proxy-supplied `X-Forwarded-For`.

    The backend is only reachable from the frontend container over the internal docker network, so
    this header is written by our own BFF — which sets it from `CF-Connecting-IP` only, never from
    the browser's own `X-Forwarded-For`. If the backend is ever exposed directly, the header becomes
    caller-controlled and the rate limit becomes bypassable by rotating it; it must then be
    re-validated at the edge before being used as a key.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()[:_MAX_CALLER_KEY_LEN]
    return request.client.host if request.client else "unknown"


def build_rate_limit_key(times: int, seconds: int, caller: str, path: str) -> str:
    """Build the Redis key for one caller's allowance on one endpoint."""
    return f"ratelimit:{times}:{seconds}:{caller}:{path}"


async def consume_rate_limit(redis, key: str, times: int, seconds: int) -> bool:
    """Count one hit against `key`; return False once the caller is over `times` within `seconds`.

    Each key gets its own independent window — that is the whole point, and is what the previous
    pyrate_limiter-based implementation silently failed to do (it routed every key to one shared
    bucket, so the limit applied to the entire deployment at once).
    """
    hits = await redis.eval(_RATE_LIMIT_LUA, 1, key, seconds)
    return int(hits) <= times


def _resolve_route_path(request: Request) -> str:
    """Prefer the route template over the concrete path.

    `/auth/salt/alice@example.com` and `/auth/salt/bob@example.com` must share one allowance,
    otherwise a caller gets a fresh quota for every identifier they probe.
    """
    route = request.scope.get("route")
    return getattr(route, "path", None) or request.scope["path"]


# 頻率限制包裝器：支援測試環境繞過
def get_rate_limiter(times: int, seconds: int):
    """Build a per-caller rate-limit dependency backed by Redis (bypassed in testing).

    Keyed by caller IP + route, so callers do not consume each other's allowance and the count is
    shared across workers and replicas.
    """

    async def dynamic_rate_limiter(request: Request):
        # 只有在非測試環境下才執行限制
        if os.getenv("ENV") == "testing":
            return None
        key = build_rate_limit_key(
            times, seconds, resolve_client_ip(request), _resolve_route_path(request),
        )
        if not await consume_rate_limit(request.app.state.redis, key, times, seconds):
            raise ApiError(
                status.HTTP_429_TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, "Too Many Requests",
            )
        return None

    return dynamic_rate_limiter
