"""Redis-backed proofs that a signed-in browser has just checked its person at their provider (ADR-361).

Key: `step_up_proof:{sid}:{action}:{browser}` -> the account's uuid, for five minutes. A proof belongs to one
session and one action, as a step-up code belongs to its action (ADR-164), and to one browser: `browser` is a
hash of the secret the callback hands only the browser that came back to it. Cookies copied from the session
before then carry its `sid` but not that secret, so they look up another key, find nothing, and leave the
owner's proof where it is. It is spent with `GETDEL`, so it works once.
"""

import hashlib
import secrets
from typing import NamedTuple

STEP_UP_PROOF = "step_up_proof:"
PROOF_TTL_SECONDS = 300


class ProofHolder(NamedTuple):
    """What a request can spend a proof with: its session, and the secret its browser was handed."""

    sid: str
    secret: str


class StepUpProofRepository:
    """Records and spends the proof a step-up at the provider leaves."""

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis

    @staticmethod
    def _key(sid: str, action: str, secret: str) -> str:
        browser = hashlib.sha256(secret.encode()).hexdigest()
        return f"{STEP_UP_PROOF}{sid}:{action}:{browser}"

    async def record(self, sid: str, action: str, user_uuid: str) -> str:
        """Remember that session `sid` proved `user_uuid` for `action`; return the secret that spends it."""
        secret = secrets.token_urlsafe(32)
        await self.redis.set(self._key(sid, action, secret), user_uuid, ex=PROOF_TTL_SECONDS)
        return secret

    async def spend(self, holder: ProofHolder, action: str, user_uuid: str) -> bool:
        """Whether `holder` holds a proof of `user_uuid` for `action`, removing it in the same step."""
        raw = await self.redis.getdel(self._key(holder.sid, action, holder.secret))
        return raw is not None and raw.decode() == user_uuid
