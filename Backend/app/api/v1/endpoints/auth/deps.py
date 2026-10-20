"""Shared auth-endpoint helpers: identifier normalization, token issuance, sign-in cookies, rate limiting."""

import os

from fastapi import Request, Response, status

from app.core import auth_cookies
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.normalize import normalize_email, normalize_phone
from app.core.request_auth import authenticated_by_cookie
from app.schemas.auth import TokenPair
from app.services import auth_session

# Fixed-window counter. INCR and the first-hit EXPIRE run in one script so a crash between them can
# never leave a key without a TTL (which would ban the caller forever).
_RATE_LIMIT_LUA = """
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return hits
"""


def reauth_required(err) -> ApiError:
    """The 422 that sends the person to their provider to prove the account (ADR-361), naming which ones.

    One builder for every endpoint behind `require_channel_proof`, so the answer cannot differ between them.
    """
    return ApiError(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        ErrorCode.STEP_UP_REAUTH_REQUIRED,
        detail=str(err),
        extra={"providers": err.providers},
    )


def _normalize_identifier(type_: str, value: str) -> str:
    """Normalize an email or phone identifier; raise ValueError if invalid for the type."""
    return normalize_email(value) if type_ == "email" else normalize_phone(value)


def device_of(request: Request) -> str:
    """What a new session records as its device: the browser's or the client's user agent."""
    return request.headers.get("user-agent", "unknown")


async def issue_token_pair(
    redis, request: Request, user_uuid: str, *, identity=None
) -> TokenPair:
    """Create a session + access token for `user_uuid` and return the TokenPair.

    `identity` is the resolved `ActiveIdentity` the token acts as (ADR-069), or None for an
    account holding no grants. It is taken as the object rather than the claim string so the
    response can report which identity the token carries (ADR-205) without the caller
    resolving it a second time.
    """
    access_token, refresh_token = await auth_session.open_session(
        redis, user_uuid, identity, device_of(request)
    )
    return TokenPair(
        access_token=access_token, refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        identity=identity.to_view() if identity else None,
    )


def clear_cookies_if_cookie_authenticated(request: Request, response: Response) -> None:
    """Clear the sign-in cookies if this request signed in with them (ADR-325).

    For the endpoints that end the caller's own session. A Bearer client never had its tokens in
    our cookies, so it gets no `Set-Cookie` at all.
    """
    if authenticated_by_cookie(request):
        auth_cookies.clear_session_cookies(response)


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


# `/auth/login` and `POST /auth/session` check the same password, so they count against one allowance:
# two doors must not double the guesses a caller gets (ADR-325).
PASSWORD_SIGN_IN_BUCKET = "password-sign-in"


# 頻率限制包裝器：支援測試環境繞過
def get_rate_limiter(times: int, seconds: int, bucket: str | None = None):
    """Build a per-caller rate-limit dependency backed by Redis (bypassed in testing).

    Keyed by caller IP + route, so callers do not consume each other's allowance and the count is
    shared across workers and replicas. Routes given the same `bucket` share one allowance instead.
    """

    async def dynamic_rate_limiter(request: Request):
        # 只有在非測試環境下才執行限制
        if os.getenv("ENV") == "testing":
            return None
        key = build_rate_limit_key(
            times, seconds, resolve_client_ip(request), bucket or _resolve_route_path(request),
        )
        if not await consume_rate_limit(request.app.state.redis, key, times, seconds):
            raise ApiError(
                status.HTTP_429_TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, "Too Many Requests",
            )
        return None

    return dynamic_rate_limiter
