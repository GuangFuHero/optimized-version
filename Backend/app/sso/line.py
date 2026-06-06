"""LINE id_token verification: protocol + real (verify-endpoint) adapter and dependency."""
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


class LineTokenVerificationError(Exception):
    """Raised when a LINE id_token cannot be verified or is malformed."""


class LineTokenVerifier(Protocol):
    """Verifies a LINE id_token and returns the identity claims."""

    async def verify(self, id_token: str) -> LineIdentity:
        """Verify the token; raise LineTokenVerificationError on failure."""
        ...


class LineVerifyApiVerifier:
    """Real verifier: validates a LINE id_token via LINE's official verify endpoint."""

    VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify"

    def __init__(self, channel_id: str):
        """Store the channel id used as the expected audience (client_id)."""
        self._channel_id = channel_id

    async def verify(self, id_token: str) -> LineIdentity:
        """POST the token to LINE's verify endpoint; LINE checks signature/aud/exp."""
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(
                    self.VERIFY_URL,
                    data={"id_token": id_token, "client_id": self._channel_id},
                )
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
        return LineIdentity(sub=str(sub), name=claims.get("name"), email=claims.get("email"))


def get_line_verifier() -> LineTokenVerifier:
    """FastAPI dependency: always the real LINE verify-endpoint verifier (tests inject a fake)."""
    return LineVerifyApiVerifier(settings.LINE_CHANNEL_ID)
