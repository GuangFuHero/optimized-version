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
PENDING_PWRESET = "pending_pwreset:"
PENDING_STEPUP = "stepup_old_channel:"
STEPUP_SENDS = "stepup_sends:"
MAX_OTP_ATTEMPTS = 5
# How many step-up codes one account may have delivered to a given channel per OTP window.
# The endpoint's own rate limit is keyed by client IP, so it bounds the source, not the
# target — this is the bound that protects the person receiving the messages (ADR-165).
MAX_STEPUP_SENDS_PER_WINDOW = 3


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
        record = {**payload, "code_hash": hash_refresh_token(code)}
        await self.redis.set(key, json.dumps(record), ex=self.ttl)
        return code

    async def _consume(self, key: str, code: str) -> dict | None:
        """Verify a code. Correct → delete + return payload. Wrong → count, burn at cap. None on fail.

        Wrong-guess counting uses an atomic `INCR` on a separate `:attempts` key so concurrent wrong
        guesses cannot lose increments and slip past the cap (a non-atomic read-modify-write would).
        """
        raw = await self.redis.get(key)
        if raw is None:
            return None
        record = json.loads(raw)
        if hash_refresh_token(code) == record["code_hash"]:
            await self.redis.delete(key, key + ":attempts")
            return record
        n = await self.redis.incr(key + ":attempts")
        if n == 1:
            await self.redis.expire(key + ":attempts", self.ttl)
        if n >= MAX_OTP_ATTEMPTS:
            await self.redis.delete(key, key + ":attempts")
        return None

    async def _reissue(self, key: str) -> str | None:
        """Mint a new code for a still-pending record (resets the attempt counter). None if none pending."""
        raw = await self.redis.get(key)
        if raw is None:
            return None
        record = json.loads(raw)
        code = _gen_code()
        record["code_hash"] = hash_refresh_token(code)
        await self.redis.set(key, json.dumps(record), ex=self.ttl)
        await self.redis.delete(key + ":attempts")
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

    # --- step-up on the OLD channel, for SSO-only accounts replacing a contact (ADR-085) ---
    # Its own key prefix, not the contact-verification one: the two are live at the same time
    # during a replacement (one code to the old address, one to the new) and must not collide.
    #
    # The key carries the action and its target as well as the address (ADR-164), so a code
    # only ever authorizes the one operation it was described as authorizing in the message.
    @staticmethod
    def _stepup_key(user_uuid: str, type_: str, value: str, action: str, target: str) -> str:
        """Key one step-up code to (account, channel, action, target)."""
        return f"{PENDING_STEPUP}{user_uuid}:{type_}:{value}:{action}:{target}"

    async def issue_old_channel_step_up(
        self, *, user_uuid: str, type_: str, value: str, action: str, target: str = ""
    ) -> tuple[str | None, str]:
        """Mint a step-up code for one specific `action` on this channel.

        Returns `(code, "issued")` when there is something to deliver, and `(None, reason)`
        when there is not — `"pending"` if a code for this exact action is already live and
        should be reused rather than silently invalidated, `"throttled"` once the account has
        had `MAX_STEPUP_SENDS_PER_WINDOW` codes sent to this channel in one OTP window.

        Both no-send cases exist because the caller of this flow is not necessarily the owner
        of the address it delivers to: the request is *expected* to fail with 422, so nothing
        stops it being repeated, and every repeat used to reach the owner's inbox or phone
        (ADR-165).
        """
        key = self._stepup_key(user_uuid, type_, value, action, target)
        if await self.redis.get(key) is not None:
            return None, "pending"
        sends_key = f"{STEPUP_SENDS}{user_uuid}:{type_}"
        sends = await self.redis.incr(sends_key)
        if sends == 1:
            await self.redis.expire(sends_key, self.ttl)
        if sends > MAX_STEPUP_SENDS_PER_WINDOW:
            return None, "throttled"
        payload = {"user_uuid": user_uuid, "type": type_, "value": value,
                   "action": action, "target": target}
        return await self._issue(key, payload), "issued"

    async def discard_old_channel_step_up(
        self, *, user_uuid: str, type_: str, value: str, action: str, target: str = ""
    ) -> None:
        """Drop a step-up code that was minted but never delivered (ADR-216).

        `issue_old_channel_step_up` writes the key before the send, so a provider failure
        would otherwise leave a live "pending" code the owner never received — and ADR-165's
        do-not-reissue rule would then refuse to mint another for the rest of the OTP window.
        A code nobody received is not pending.

        The send counter is deliberately NOT rolled back: it bounds how many messages this
        account can have aimed at one channel, and a provider that fails on every attempt
        must not become an unmetered retry loop.
        """
        key = self._stepup_key(user_uuid, type_, value, action, target)
        await self.redis.delete(key, key + ":attempts")

    async def consume_old_channel_step_up(
        self, *, user_uuid: str, type_: str, value: str, action: str, target: str = "", code: str
    ) -> dict | None:
        """Verify a step-up code for exactly this action; on success returns the payload.

        A code issued for a different action or a different target hashes to a different key,
        so it is simply not found here — and, because it is not found, it is not burned
        either. The user keeps the code they were actually sent.
        """
        return await self._consume(self._stepup_key(user_uuid, type_, value, action, target), code)

    # --- password reset (verify-then-reset), logged-out, keyed by identifier ---
    async def issue_password_reset(self, *, user_uuid: str, type_: str, value: str) -> str:
        """Store a pending password reset for `user_uuid`; return the code to deliver."""
        return await self._issue(
            f"{PENDING_PWRESET}{type_}:{value}",
            {"user_uuid": user_uuid, "type": type_, "value": value},
        )

    async def consume_password_reset(self, *, type_: str, value: str, code: str) -> dict | None:
        """Verify a password-reset code; on success returns the pending payload."""
        return await self._consume(f"{PENDING_PWRESET}{type_}:{value}", code)
