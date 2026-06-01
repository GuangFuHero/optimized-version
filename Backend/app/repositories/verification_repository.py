"""Redis-backed 6-digit OTP store, shared by registration and contact-verification.

Keys:
  pending_reg:{type}:{value}                  -> registration payload (creates an account on verify)
  pending_contact:{user_uuid}:{type}:{value}  -> contact payload (attaches a contact to that user on verify)
Both share the same code lifecycle: 6-digit code, OTP_TTL_SECONDS, MAX_OTP_ATTEMPTS, keepttl on wrong guess.
"""

import json
import secrets

from app.core.config import settings
from app.core.security import hash_refresh_token

PENDING_REG = "pending_reg:"
PENDING_CONTACT = "pending_contact:"
MAX_OTP_ATTEMPTS = 5


def _gen_code() -> str:
    """Generate a zero-padded 6-digit numeric code."""
    return f"{secrets.randbelow(1_000_000):06d}"


class VerificationRepository:
    """6-digit OTP store for verify-then-create (registration) and verify-then-attach (contacts)."""

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis
        self.ttl = settings.OTP_TTL_SECONDS

    # --- generic core (key-agnostic) ---
    async def _issue(self, key: str, payload: dict) -> str:
        """Store a pending record under `key` with a fresh code; return the plaintext code."""
        code = _gen_code()
        record = {**payload, "code_hash": hash_refresh_token(code), "attempts": 0}
        await self.redis.set(key, json.dumps(record), ex=self.ttl)
        return code

    async def _consume(self, key: str, code: str) -> dict | None:
        """Verify a code. Correct → delete + return payload. Wrong → count, burn at cap. None on fail."""
        raw = await self.redis.get(key)
        if raw is None:
            return None
        record = json.loads(raw)
        if hash_refresh_token(code) == record["code_hash"]:
            await self.redis.delete(key)
            return record
        record["attempts"] += 1
        if record["attempts"] >= MAX_OTP_ATTEMPTS:
            await self.redis.delete(key)
        else:
            await self.redis.set(key, json.dumps(record), keepttl=True)
        return None

    async def _reissue(self, key: str) -> str | None:
        """Mint a new code for a still-pending record (resets attempts). None if none pending."""
        raw = await self.redis.get(key)
        if raw is None:
            return None
        record = json.loads(raw)
        code = _gen_code()
        record["code_hash"] = hash_refresh_token(code)
        record["attempts"] = 0
        await self.redis.set(key, json.dumps(record), ex=self.ttl)
        return code

    # --- registration (verify-then-create) ---
    async def issue_registration(
        self, *, type_: str, value: str, password_hash: str, name: str | None
    ) -> str:
        """Store a pending registration; return the code to deliver."""
        return await self._issue(
            f"{PENDING_REG}{type_}:{value}",
            {"type": type_, "value": value, "password_hash": password_hash, "name": name},
        )

    async def consume_registration(self, *, type_: str, value: str, code: str) -> dict | None:
        """Verify a registration code; on success returns the pending payload."""
        return await self._consume(f"{PENDING_REG}{type_}:{value}", code)

    async def reissue_registration(self, *, type_: str, value: str) -> str | None:
        """Reissue a registration code."""
        return await self._reissue(f"{PENDING_REG}{type_}:{value}")

    # --- contact verification (verify-then-attach), keyed per user ---
    async def issue_contact_verification(self, *, user_uuid: str, type_: str, value: str) -> str:
        """Store a pending contact-add for `user_uuid`; return the code to deliver."""
        return await self._issue(
            f"{PENDING_CONTACT}{user_uuid}:{type_}:{value}",
            {"user_uuid": user_uuid, "type": type_, "value": value},
        )

    async def consume_contact_verification(
        self, *, user_uuid: str, type_: str, value: str, code: str
    ) -> dict | None:
        """Verify a contact code for `user_uuid`; on success returns the pending payload."""
        return await self._consume(f"{PENDING_CONTACT}{user_uuid}:{type_}:{value}", code)

    async def reissue_contact_verification(self, *, user_uuid: str, type_: str, value: str) -> str | None:
        """Reissue a contact code for `user_uuid`."""
        return await self._reissue(f"{PENDING_CONTACT}{user_uuid}:{type_}:{value}")
