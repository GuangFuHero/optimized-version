"""Redis-backed verification store. Holds pending email registrations (verify-then-create, design §3.1).

Two keys per pending registration so we can look up by token (verify) AND by email (resend):
  pending_reg:email:{email}  -> payload incl. current token_hash
  pending_reg:token:{hash}   -> email pointer
Generalizes to an MFA-ready OtpService later (design §6); Phase 1 only needs the email path.
"""

import json
import secrets

from app.core.config import settings
from app.core.security import hash_refresh_token  # SHA-256 hex; reused as a generic token hash

PENDING_BY_EMAIL = "pending_reg:email:"
PENDING_BY_TOKEN = "pending_reg:token:"


def _as_str(raw: bytes | str | None) -> str | None:
    """Decode a bytes-mode Redis value to str (client uses decode_responses=False)."""
    if raw is None:
        return None
    return raw.decode() if isinstance(raw, bytes) else raw


class VerificationRepository:
    """Stores pending registrations under an email key + a token pointer (bytes-mode client)."""

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis
        self.ttl = settings.EMAIL_VERIFY_TTL_SECONDS

    async def _write(self, *, email: str, payload: dict) -> str:
        """Mint a token, store the email payload + token pointer, return the raw token."""
        token = secrets.token_urlsafe(32)
        token_hash = hash_refresh_token(token)
        payload["token_hash"] = token_hash
        await self.redis.set(PENDING_BY_EMAIL + email, json.dumps(payload), ex=self.ttl)
        await self.redis.set(PENDING_BY_TOKEN + token_hash, email, ex=self.ttl)
        return token

    async def issue_email_registration(self, *, email: str, password_hash: str, name: str | None) -> str:
        """Store a fresh pending registration and return the raw token for the verification link."""
        payload = {"type": "email", "value": email, "password_hash": password_hash, "name": name}
        return await self._write(email=email, payload=payload)

    async def consume_email_registration(self, token: str) -> dict | None:
        """Single-use: token → email → payload, deleting both keys. None if unknown/expired."""
        email = _as_str(await self.redis.getdel(PENDING_BY_TOKEN + hash_refresh_token(token)))
        if email is None:
            return None
        raw = await self.redis.getdel(PENDING_BY_EMAIL + email)
        return json.loads(raw) if raw else None

    async def reissue_email_registration(self, email: str) -> str | None:
        """Mint a new token for a still-pending email, invalidating the old token. None if none pending."""
        raw = await self.redis.get(PENDING_BY_EMAIL + email)
        if raw is None:
            return None
        payload = json.loads(raw)
        old_hash = payload.get("token_hash")
        if old_hash:
            await self.redis.delete(PENDING_BY_TOKEN + old_hash)
        return await self._write(email=email, payload=payload)
