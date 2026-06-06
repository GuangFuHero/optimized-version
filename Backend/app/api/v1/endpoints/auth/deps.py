"""Shared auth-endpoint helpers: identifier normalization, token issuance, rate limiting."""

import os

from fastapi import Request, Response
from fastapi_limiter.depends import RateLimiter
from pyrate_limiter import Duration, Limiter, Rate

from app.core import security
from app.core.config import settings
from app.core.normalize import normalize_email, normalize_phone
from app.repositories.session_repository import SessionRepository
from app.schemas.auth import TokenPair


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


# 頻率限制包裝器：支援測試環境繞過
def get_rate_limiter(times: int, seconds: int):
    """Build a rate-limiter FastAPI dependency that is bypassed in testing."""
    _limiter = Limiter(Rate(times, Duration.SECOND * seconds))

    async def dynamic_rate_limiter(request: Request, response: Response):
        # 只有在非測試環境下才執行限制
        if os.getenv("ENV") != "testing":
            limiter_dep = RateLimiter(_limiter)
            return await limiter_dep(request, response)
        return None

    return dynamic_rate_limiter
