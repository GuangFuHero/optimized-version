"""LINE id_token verification: protocol + real (verify-endpoint) adapter and dependency."""
import hmac
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import settings


@dataclass
class LineIdentity:
    """Verified LINE identity claims we care about."""

    sub: str
    name: str | None
    email: str | None
    # When the person signed in at LINE, in UNIX seconds. LINE includes it only when the authorization request
    # carried `max_age`, which a step-up's does (ADR-361).
    auth_time: int | None = None


class LineTokenVerificationError(Exception):
    """Raised when a LINE id_token cannot be verified or is malformed."""


class LineTokenVerifier(Protocol):
    """Verifies a LINE id_token and returns the identity claims."""

    async def verify(self, id_token: str, nonce: str | None = None) -> LineIdentity:
        """Verify the token, and its nonce if one is given; raise LineTokenVerificationError on failure."""
        ...


class LineVerifyApiVerifier:
    """Real verifier: validates a LINE id_token via LINE's official verify endpoint."""

    VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify"

    def __init__(self, channel_id: str):
        """Store the channel id used as the expected audience (client_id)."""
        self._channel_id = channel_id

    async def verify(self, id_token: str, nonce: str | None = None) -> LineIdentity:
        """POST the token to LINE's verify endpoint; LINE checks signature/aud/exp.

        With `nonce`, LINE also checks the token carries it, and so do we once LINE has answered: LINE
        documents what it does with a nonce that differs, not with a token that has none. The backend's own
        sign-in passes the one it sent (ADR-331). A token the frontend obtained, for linking or step-up, is
        verified without one.
        """
        data = {"id_token": id_token, "client_id": self._channel_id}
        if nonce is not None:
            data["nonce"] = nonce
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(self.VERIFY_URL, data=data)
        except httpx.HTTPError as err:
            raise LineTokenVerificationError(f"LINE verify request failed: {err}") from err
        if resp.status_code != 200:
            raise LineTokenVerificationError(
                f"LINE rejected token: {resp.status_code} {resp.text[:200]}"
            )
        try:
            claims = resp.json()
        except ValueError as err:
            raise LineTokenVerificationError("LINE verify returned non-JSON") from err
        sub = claims.get("sub")
        if not sub:
            raise LineTokenVerificationError("LINE verify response missing sub")
        token_nonce = claims.get("nonce")
        if nonce is not None and not (
            isinstance(token_nonce, str) and hmac.compare_digest(token_nonce.encode(), nonce.encode())
        ):
            raise LineTokenVerificationError("LINE token carries another nonce, or none")
        auth_time = claims.get("auth_time")
        return LineIdentity(
            sub=str(sub),
            name=claims.get("name"),
            email=claims.get("email"),
            # Anything but a whole number of seconds reads as absent, which a step-up refuses.
            auth_time=auth_time if type(auth_time) is int else None,
        )


def get_line_verifier() -> LineTokenVerifier:
    """FastAPI dependency: always the real LINE verify-endpoint verifier (tests inject a fake)."""
    return LineVerifyApiVerifier(settings.LINE_CHANNEL_ID)
