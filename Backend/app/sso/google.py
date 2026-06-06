"""Google id_token verification: protocol + real (OIDC) adapter and dependency."""
from dataclasses import dataclass
from typing import Protocol

import anyio

from app.core.config import settings


@dataclass
class GoogleIdentity:
    """Verified Google identity claims we care about."""

    sub: str
    email: str
    email_verified: bool
    name: str | None


class GoogleTokenVerificationError(Exception):
    """Raised when an id_token cannot be verified or is malformed."""


class GoogleTokenVerifier(Protocol):
    """Verifies a Google id_token and returns the identity claims."""

    async def verify(self, id_token: str) -> GoogleIdentity:
        """Verify the token; raise GoogleTokenVerificationError on failure."""
        ...


class GoogleOidcVerifier:
    """Real verifier using google-auth (checks signature, aud, iss, exp)."""

    def __init__(self, client_id: str):
        """Store the expected audience (our OAuth client id)."""
        self._client_id = client_id

    async def verify(self, id_token: str) -> GoogleIdentity:
        """Verify a real Google id_token against the configured client id."""
        from google.auth.transport import requests as ga_requests
        from google.oauth2 import id_token as ga_id_token
        try:
            # verify_oauth2_token is sync and fetches Google's certs over the network — run it off the
            # event loop so a slow round-trip doesn't block every other request.
            claims = await anyio.to_thread.run_sync(
                ga_id_token.verify_oauth2_token, id_token, ga_requests.Request(), self._client_id
            )
        except Exception as err:  # google-auth raises ValueError subclasses
            raise GoogleTokenVerificationError(str(err)) from err
        return GoogleIdentity(
            sub=str(claims["sub"]),
            email=claims.get("email", ""),
            email_verified=bool(claims.get("email_verified", False)),
            name=claims.get("name"),
        )


def get_google_verifier() -> GoogleTokenVerifier:
    """FastAPI dependency: always the real Google OIDC verifier (tests inject a fake double)."""
    return GoogleOidcVerifier(settings.GOOGLE_CLIENT_ID)
