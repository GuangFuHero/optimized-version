"""Redis-backed state of OAuth sign-ins in progress (ADR-331).

Key: `oauth_state:{state}` -> the provider, the app, where to return to, the PKCE verifier and the nonce,
for as long as the browser's `{p}_oauth` cookie lives. A state is consumed with `GETDEL`, so a callback can
use it once: a replayed callback, or two racing, find nothing.
"""

import json
import secrets
from dataclasses import asdict, dataclass

from app.core.auth_cookies import OAUTH_COOKIE_MAX_AGE
from app.sso.oauth import new_code_verifier

OAUTH_STATE = "oauth_state:"


@dataclass(frozen=True)
class PendingSignIn:
    """One sign-in in progress, as its start recorded it.

    `purpose` is `step_up` when it proves a signed-in account instead of signing in (ADR-361): for `action`,
    by session `sid` of account `user_uuid`. It defaults to `sign_in`, so a record written before these
    fields existed still reads as one.
    """

    state: str
    provider: str
    app: str
    return_to: str
    code_verifier: str
    nonce: str
    purpose: str = "sign_in"
    action: str | None = None
    sid: str | None = None
    user_uuid: str | None = None


class OAuthStateRepository:
    """Starts and finishes the record of a sign-in in progress."""

    def __init__(self, redis):
        """Initialize with a `redis.asyncio` client (decode_responses=False)."""
        self.redis = redis

    async def create(
        self,
        provider: str,
        app: str,
        return_to: str,
        *,
        purpose: str = "sign_in",
        action: str | None = None,
        sid: str | None = None,
        user_uuid: str | None = None,
    ) -> PendingSignIn:
        """Record a new sign-in with a fresh state, PKCE verifier and nonce, for the cookie's lifetime."""
        record = PendingSignIn(
            state=secrets.token_urlsafe(32),
            provider=provider,
            app=app,
            return_to=return_to,
            code_verifier=new_code_verifier(),
            nonce=secrets.token_urlsafe(32),
            purpose=purpose,
            action=action,
            sid=sid,
            user_uuid=user_uuid,
        )
        await self.redis.set(OAUTH_STATE + record.state, json.dumps(asdict(record)), ex=OAUTH_COOKIE_MAX_AGE)
        return record

    async def consume(self, state: str) -> PendingSignIn | None:
        """The sign-in `state` names, removed in the same step; None if unknown, expired or used."""
        raw = await self.redis.getdel(OAUTH_STATE + state)
        return PendingSignIn(**json.loads(raw)) if raw is not None else None
