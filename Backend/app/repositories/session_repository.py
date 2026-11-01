"""Redis-backed session + refresh-token store with rotation and reuse detection."""

import base64
import json
import os
import time
import uuid
from datetime import UTC, datetime

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings
from app.core.security import generate_refresh_token, hash_refresh_token

# Ties a key derived from a refresh token to this one purpose (ADR-330).
_GRACE_KEY_INFO = b"wg-refresh-grace-v1"
_GRACE_IV_BYTES = 12


def _now() -> float:
    """Wall-clock seconds. A function of its own so tests can move past the grace period."""
    return time.time()


def _grace_cipher(old_raw: str) -> AESGCM:
    """AES-GCM keyed by the token being rotated, so only whoever holds it can open the record."""
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=_GRACE_KEY_INFO).derive(
        old_raw.encode("utf-8")
    )
    return AESGCM(key)


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

    async def create_session(
        self, user_uuid: str, device: str, *, act: str | None = None, mcp_client: str | None = None
    ) -> tuple[str, str]:
        """Create a new session; return (sid, raw_refresh_token).

        `act` is the identity this session is acting as (ADR-188). Stored here rather than
        only in the access token so that a refresh which does not name one can carry the
        session's identity forward instead of resetting to the platform default.
        """
        sid = str(uuid.uuid4())
        raw = generate_refresh_token()
        rt_hash = self._hash(raw)
        now = datetime.now(UTC).isoformat()
        session = {
            "user_uuid": user_uuid,
            "current_rt_hash": rt_hash,
            "device": device,
            "act": act,
            "created_at": now,
            "last_used_at": now,
        }
        if mcp_client:
            session["mcp_client"] = mcp_client
        await self.redis.set(self.SESSION + sid, json.dumps(session), ex=self.ttl)
        await self.redis.set(
            self.REFRESH + rt_hash,
            json.dumps({"sid": sid, "user_uuid": user_uuid}),
            ex=self.ttl,
        )
        await self.redis.sadd(self.USER_SESSIONS + user_uuid, sid)
        await self.redis.expire(self.USER_SESSIONS + user_uuid, self.ttl)
        return sid, raw

    async def get_session(self, sid: str) -> dict | None:
        """The live session record for `sid`, or None once it has been revoked or expired.

        Read-only, and does not touch the TTL: callers use it to ask "is this session still
        alive" without keeping it alive by asking. That question is what makes revocation
        take effect on the request path — `revoke_session` already deletes `session:{sid}`,
        so a caller that checks here sees the revocation on its very next request instead of
        up to 15 minutes later (ADR-099).

        Deliberately does NOT catch connection errors. A Redis outage and a revoked session
        are different things and the caller has to tell them apart — swallowing the error
        into None would disguise an outage as "this session was revoked", signing the browser
        out, where the caller refuses with a 503 and logs the cause (ADR-100, ADR-328).
        """
        return self._load(await self.redis.get(self.SESSION + sid))

    async def set_identity(self, sid: str, act: str | None) -> None:
        """Record which identity this session is now acting as (ADR-188).

        Called when switching identity (`auth_session.switch_identity`, behind
        `/auth/switch-identity` and `/auth/session/identity`): without it the switch lives
        only in the access token it returned, and the next refresh that does not name an
        identity would put the caller back on their platform default — silently undoing a
        deliberate downgrade.

        Preserves the record's TTL rather than resetting it: switching identity is not a
        credential event (ADR-070) and must not extend the session's life. A session that
        vanished between the caller's request and this write is left alone; the switch has
        already checked it exists, and re-creating it here would resurrect a revoked session.
        """
        raw = await self.redis.get(self.SESSION + sid)
        session = self._load(raw)
        if session is None:
            return
        session["act"] = act
        ttl = await self.redis.ttl(self.SESSION + sid)
        await self.redis.set(self.SESSION + sid, json.dumps(session), ex=ttl if ttl and ttl > 0 else self.ttl)

    def is_current(self, session: dict, raw_token: str) -> bool:
        """Whether `raw_token` is the refresh token `session` last issued, not an older one (ADR-415).

        A rotated token keeps its record until it expires, so finding the record is not enough to
        let the token change the session outside `rotate()`, which judges replays.
        """
        return session.get("current_rt_hash") == self._hash(raw_token)

    async def get_refresh(self, rt_hash: str) -> dict | None:
        """Fetch a refresh-token record by hash."""
        return self._load(await self.redis.get(self.REFRESH + rt_hash))

    async def get_refresh_for_token(self, raw_token: str) -> dict | None:
        """Fetch the record of a refresh token as the client presents it, without consuming it."""
        return await self.get_refresh(self._hash(raw_token))

    async def _claim(self, rt_hash: str, claim: bytes) -> bool:
        """Claim `rt_hash` for this rotation attempt. True if it is ours, False if replayed.

        The value written is unique to this attempt rather than a constant, so that the claim
        can be safely retried (ADR-196). The shared Redis client retries a command whose
        connection died underneath it, and a `SET NX` is not idempotent: if the server ran it
        but the reply was lost, the retry finds the key already set and — with a constant
        value — the caller could not tell "someone replayed this token" from "I am seeing my
        own write". It would conclude replay and revoke the whole session, signing the user
        out of every device and telling them their token was stolen.

        Reading the value back settles it. A mismatch is a genuine replay; our own value means
        we won the claim and only the reply went missing. `rotate` writes the record from
        `_claim_record`, whose nonce makes it unique (ADR-330).

        The GET only runs on the NX-failed path, so the ordinary rotation is still one
        round trip.
        """
        if await self.redis.set(self.USED + rt_hash, claim, nx=True, ex=self.ttl):
            return True
        return await self.redis.get(self.USED + rt_hash) == claim

    @staticmethod
    def _claim_record(old_raw: str, rt_hash: str, new_raw: str) -> bytes:
        """What a rotation claims `rt_hash` with: when, and what it was rotated into (ADR-330).

        The new token is sealed with a key derived from the old one, and the old token's hash is
        bound in as associated data, so the record gives nothing to anyone reading Redis: only a
        caller presenting the old token can open it. Writing it as the claim itself, in the same
        `SET NX`, leaves no moment in which the token is claimed but the record is missing — a
        replay landing there would otherwise read as theft.
        """
        iv = os.urandom(_GRACE_IV_BYTES)
        sealed = _grace_cipher(old_raw).encrypt(iv, new_raw.encode("utf-8"), rt_hash.encode("ascii"))
        record = {
            "nonce": uuid.uuid4().hex,
            "claimed_at": _now(),
            "sealed": base64.b64encode(iv + sealed).decode("ascii"),
        }
        return json.dumps(record).encode("utf-8")

    @staticmethod
    def _rotated_within_grace(old_raw: str, rt_hash: str, claim: bytes | None) -> str | None:
        """The token `old_raw` was rotated into, if that happened within the grace period.

        None is everything else, and the caller treats it as theft: a rotation older than
        `REFRESH_REUSE_GRACE_SECONDS`, a grace period of 0, and a record this cannot read —
        including the bare nonce every claim held before ADR-330.
        """
        grace = settings.REFRESH_REUSE_GRACE_SECONDS
        if grace <= 0 or not claim:
            return None
        try:
            record = json.loads(claim)
            if _now() - float(record["claimed_at"]) >= grace:
                return None
            blob = base64.b64decode(record["sealed"], validate=True)
            opened = _grace_cipher(old_raw).decrypt(
                blob[:_GRACE_IV_BYTES], blob[_GRACE_IV_BYTES:], rt_hash.encode("ascii")
            )
        except (ValueError, KeyError, TypeError, InvalidTag):
            return None
        return opened.decode("utf-8")

    async def _answer_replay(self, old_raw: str, rt_hash: str, sid: str) -> str:
        """Answer a token that was already rotated: the same new token, or revoke the session.

        Within the grace period this is a second client that shared the token — the site and the
        back office share one cookie (ADR-330) — and it gets what the first one got, without
        anything being written. A session revoked in the meantime stays revoked. Outside the
        grace period a used token is the theft signal it always was: the whole session goes.
        """
        rotated_into = self._rotated_within_grace(old_raw, rt_hash, await self.redis.get(self.USED + rt_hash))
        if rotated_into is None:
            await self.revoke_session(sid)
            raise RefreshTokenReuse
        if await self.get_session(sid) is None:
            raise InvalidRefreshToken
        return rotated_into

    async def rotate(self, raw_token: str) -> tuple[str, str, str]:
        """Validate + rotate a refresh token. Returns (sid, user_uuid, new_raw_token).

        Raises InvalidRefreshToken if unknown/revoked; RefreshTokenReuse if replayed after the
        grace period (and revokes the whole session as a side effect). A replay within the grace
        period returns the token the first rotation issued (ADR-330).
        """
        rt_hash = self._hash(raw_token)
        rec = await self.get_refresh(rt_hash)
        if rec is None:
            raise InvalidRefreshToken
        sid = rec["sid"]
        user_uuid = rec["user_uuid"]
        # Minted before the claim, because the claim carries it for a replay within the grace period.
        new_raw = generate_refresh_token()
        # Atomically claim this token: only the first rotation sets the NX flag and proceeds. Any later
        # (or concurrent-losing) rotation finds it already set and is answered from the claim instead.
        if not await self._claim(rt_hash, self._claim_record(raw_token, rt_hash, new_raw)):
            return sid, user_uuid, await self._answer_replay(raw_token, rt_hash, sid)
        # NOTE: the claim is atomic, but storing the new token + updating the pointer below are not
        # transactional with it. A crash in between is a SAFE failure: the old token is trapped and the new
        # one was never stored, so the user signs in again. A replay within the grace period would be handed
        # that unstored token and fail on its next refresh the same way. No two valid chains ever coexist.
        # load session after the claim; a missing session fails before we store a new token
        session = self._load(await self.redis.get(self.SESSION + sid))
        if session is None:
            raise InvalidRefreshToken
        # store the new token
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

    async def revoke_mcp_sessions(self, user_uuid: str) -> None:
        """Delete every session the user opened for an MCP client, leaving their other devices alone."""
        for m in await self.redis.smembers(self.USER_SESSIONS + user_uuid):
            sid = m.decode() if isinstance(m, bytes) else m
            if (await self.get_session(sid) or {}).get("mcp_client"):
                await self.revoke_session(sid)

    async def revoke_all_for_user(self, user_uuid: str) -> int:
        """Delete every session belonging to the user (global logout); return how many.

        The count is returned rather than left to the caller to read for itself (ADR-221):
        the set is already in hand here, and a caller doing its own `smembers` first both
        pays for a second round trip and can disagree with this one — a session created
        between the two reads is revoked but not counted, so an audit row built from that
        number under-reports what happened.
        """
        members = await self.redis.smembers(self.USER_SESSIONS + user_uuid)
        for m in members:
            await self.revoke_session(m.decode() if isinstance(m, bytes) else m)
        await self.redis.delete(self.USER_SESSIONS + user_uuid)
        return len(members)
