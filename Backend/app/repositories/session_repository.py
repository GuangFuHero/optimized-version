"""Redis-backed session + refresh-token store with rotation and reuse detection."""

import json
import uuid
from datetime import UTC, datetime

from app.core.config import settings
from app.core.security import generate_refresh_token, hash_refresh_token


class InvalidRefreshToken(Exception):
    """Raised when a refresh token is unknown or already revoked."""


class RefreshTokenReuse(Exception):
    """Raised when an already-rotated refresh token is replayed (theft signal)."""


class SessionRepository:
    """Stores sessions/refresh tokens in Redis as JSON strings (bytes-mode client)."""

    SESSION = "session:"
    REFRESH = "refresh:"
    USER_SESSIONS = "user_sessions:"
    USED = "refresh_used:"

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis
        self.ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    @staticmethod
    def _hash(token: str) -> str:
        """Return the SHA-256 hex digest used as the Redis key for a refresh token."""
        return hash_refresh_token(token)

    @staticmethod
    def _load(raw: bytes | None) -> dict | None:
        """Decode a JSON record stored in Redis, or return None if absent."""
        return json.loads(raw) if raw else None

    async def create_session(self, user_uuid: str, device: str) -> tuple[str, str]:
        """Create a new session; return (sid, raw_refresh_token)."""
        sid = str(uuid.uuid4())
        raw = generate_refresh_token()
        rt_hash = self._hash(raw)
        now = datetime.now(UTC).isoformat()
        session = {
            "user_uuid": user_uuid, "current_rt_hash": rt_hash, "device": device,
            "created_at": now, "last_used_at": now,
        }
        await self.redis.set(self.SESSION + sid, json.dumps(session), ex=self.ttl)
        await self.redis.set(
            self.REFRESH + rt_hash,
            json.dumps({"sid": sid, "user_uuid": user_uuid}),
            ex=self.ttl,
        )
        await self.redis.sadd(self.USER_SESSIONS + user_uuid, sid)
        await self.redis.expire(self.USER_SESSIONS + user_uuid, self.ttl)
        return sid, raw

    async def get_refresh(self, rt_hash: str) -> dict | None:
        """Fetch a refresh-token record by hash."""
        return self._load(await self.redis.get(self.REFRESH + rt_hash))

    async def rotate(self, raw_token: str) -> tuple[str, str, str]:
        """Validate + rotate a refresh token. Returns (sid, user_uuid, new_raw_token).

        Raises InvalidRefreshToken if unknown/revoked; RefreshTokenReuse if replayed (and
        revokes the whole session as a side effect).
        """
        rt_hash = self._hash(raw_token)
        rec = await self.get_refresh(rt_hash)
        if rec is None:
            raise InvalidRefreshToken
        sid = rec["sid"]
        user_uuid = rec["user_uuid"]
        # atomically claim this token: only the first rotation sets the NX flag and proceeds.
        # any later (or concurrent-losing) rotation finds it already set -> replay -> revoke session.
        claimed = await self.redis.set(self.USED + rt_hash, b"1", nx=True, ex=self.ttl)
        if not claimed:
            await self.revoke_session(sid)
            raise RefreshTokenReuse
        # NOTE: the claim is atomic, but mint-new-token + update-pointer below are not transactional with it.
        # A crash between the claim and the new-token write is a SAFE failure: the old token is trapped, no
        # new token is issued -> the user re-logs in. There is no window where two valid chains coexist.
        # load session after the claim; a missing session fails before we mint a new token
        session = self._load(await self.redis.get(self.SESSION + sid))
        if session is None:
            raise InvalidRefreshToken
        # issue new token
        new_raw = generate_refresh_token()
        new_hash = self._hash(new_raw)
        await self.redis.set(
            self.REFRESH + new_hash,
            json.dumps({"sid": sid, "user_uuid": user_uuid}),
            ex=self.ttl,
        )
        # update session pointer + sliding TTL
        session["current_rt_hash"] = new_hash
        session["last_used_at"] = datetime.now(UTC).isoformat()
        await self.redis.set(self.SESSION + sid, json.dumps(session), ex=self.ttl)
        await self.redis.expire(self.USER_SESSIONS + user_uuid, self.ttl)
        return sid, user_uuid, new_raw

    async def revoke_session(self, sid: str) -> None:
        """Delete a single session and its current refresh token."""
        session = self._load(await self.redis.get(self.SESSION + sid))
        if session is not None:
            await self.redis.delete(self.REFRESH + session["current_rt_hash"])
            await self.redis.srem(self.USER_SESSIONS + session["user_uuid"], sid)
        await self.redis.delete(self.SESSION + sid)

    async def revoke_all_for_user(self, user_uuid: str) -> None:
        """Delete every session belonging to the user (global logout)."""
        members = await self.redis.smembers(self.USER_SESSIONS + user_uuid)
        for m in members:
            await self.revoke_session(m.decode() if isinstance(m, bytes) else m)
        await self.redis.delete(self.USER_SESSIONS + user_uuid)
