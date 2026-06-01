"""Redis-backed unified verification store: pending registrations verified by a 6-digit code.

One key per pending registration, keyed by the normalized identifier (email or phone):
  pending_reg:{type}:{value} -> {type, value, password_hash, name, code_hash, attempts}
Used by email and phone identically; only the delivery channel differs.
"""

import json
import secrets

from app.core.config import settings
from app.core.security import hash_refresh_token  # sha256 hex, reused as a generic code hash

PENDING = "pending_reg:"
MAX_OTP_ATTEMPTS = 5


def _key(type_: str, value: str) -> str:
    """Redis key for a pending registration."""
    return f"{PENDING}{type_}:{value}"


def _gen_code() -> str:
    """Generate a zero-padded 6-digit numeric code."""
    return f"{secrets.randbelow(1_000_000):06d}"


class VerificationRepository:
    """Stores pending registrations keyed by identifier; verified by 6-digit code (bytes-mode client)."""

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis
        self.ttl = settings.OTP_TTL_SECONDS

    async def issue_registration(
        self, *, type_: str, value: str, password_hash: str, name: str | None
    ) -> str:
        """Store a fresh pending registration and return the plaintext 6-digit code for delivery."""
        code = _gen_code()
        payload = {
            "type": type_, "value": value, "password_hash": password_hash, "name": name,
            "code_hash": hash_refresh_token(code), "attempts": 0,
        }
        await self.redis.set(_key(type_, value), json.dumps(payload), ex=self.ttl)
        return code

    async def consume_registration(self, *, type_: str, value: str, code: str) -> dict | None:
        """Verify a code. Correct → delete + return payload. Wrong → count attempt, burn at cap. None else."""
        raw = await self.redis.get(_key(type_, value))
        if raw is None:
            return None
        payload = json.loads(raw)
        if hash_refresh_token(code) == payload["code_hash"]:
            await self.redis.delete(_key(type_, value))
            return payload
        payload["attempts"] += 1
        if payload["attempts"] >= MAX_OTP_ATTEMPTS:
            await self.redis.delete(_key(type_, value))
        else:
            await self.redis.set(_key(type_, value), json.dumps(payload), keepttl=True)
        return None

    async def reissue_registration(self, *, type_: str, value: str) -> str | None:
        """Mint a new code for a still-pending registration (resets attempts). None if none pending."""
        raw = await self.redis.get(_key(type_, value))
        if raw is None:
            return None
        payload = json.loads(raw)
        code = _gen_code()
        payload["code_hash"] = hash_refresh_token(code)
        payload["attempts"] = 0
        await self.redis.set(_key(type_, value), json.dumps(payload), ex=self.ttl)
        return code
