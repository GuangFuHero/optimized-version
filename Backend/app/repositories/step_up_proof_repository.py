"""Redis-backed proofs that a signed-in session has just checked its person at their provider (ADR-361).

Key: `step_up_proof:{sid}:{action}` -> the account's uuid, for five minutes. A proof belongs to one session
and one action, as a step-up code belongs to its action (ADR-164), and is spent with `GETDEL`, so it works
once.
"""

STEP_UP_PROOF = "step_up_proof:"
PROOF_TTL_SECONDS = 300


class StepUpProofRepository:
    """Records and spends the proof a step-up at the provider leaves."""

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis

    @staticmethod
    def _key(sid: str, action: str) -> str:
        return f"{STEP_UP_PROOF}{sid}:{action}"

    async def record(self, sid: str, action: str, user_uuid: str) -> None:
        """Remember that session `sid` proved `user_uuid` for `action`; a newer proof replaces an older."""
        await self.redis.set(self._key(sid, action), user_uuid, ex=PROOF_TTL_SECONDS)

    async def spend(self, sid: str, action: str, user_uuid: str) -> bool:
        """Whether session `sid` holds a proof of `user_uuid` for `action`, removing it in the same step."""
        raw = await self.redis.getdel(self._key(sid, action))
        return raw is not None and raw.decode() == user_uuid
