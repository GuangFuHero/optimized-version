"""The backend's side of an OAuth sign-in: providers, PKCE, the authorize URL, the code exchange (ADR-331).

The browser is sent to the provider with a `state` (bound to this browser by the `{p}_oauth` cookie), a
`nonce` (bound into the `id_token` the provider signs) and a PKCE challenge, and comes back to the callback
with a one-time `code`. The backend exchanges that code, with the PKCE verifier and the client secret, for
the `id_token`, which the provider's verifier then checks as it always has (`sso/google.py`).

Nothing here logs a code, a token, a state, a verifier or a nonce.
"""

import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

import httpx

from app.core.config import settings

# The path every provider calls back, on the host in OAUTH_REDIRECT_BASE_URL. Registered with each
# provider exactly as built by `redirect_uri`, so it must not change without updating them.
CALLBACK_PATH = "/api/v1/auth/oauth/{provider}/callback"


@dataclass(frozen=True)
class OAuthProvider:
    """Where a provider's sign-in starts and finishes, and our credentials there."""

    name: str
    authorize_url: str
    token_url: str
    scope: str
    client_id: str
    client_secret: str

    @property
    def configured(self) -> bool:
        """Whether both credentials are set; a sign-in cannot finish without the secret."""
        return bool(self.client_id and self.client_secret)


def oauth_provider(name: str) -> OAuthProvider | None:
    """The named provider, with credentials read from the settings when called; None if unknown."""
    if name == "google":
        return OAuthProvider(
            name="google",
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            scope="openid email profile",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
        )
    if name == "line":
        return OAuthProvider(
            name="line",
            authorize_url="https://access.line.me/oauth2/v2.1/authorize",
            token_url="https://api.line.me/oauth2/v2.1/token",
            # As the frontend always asked, without `email`: that scope needs the channel's own permission
            # from LINE, and a LINE account's email is optional anyway (ADR-331).
            scope="openid profile",
            client_id=settings.LINE_CHANNEL_ID,
            client_secret=settings.LINE_CHANNEL_SECRET,
        )
    return None


def redirect_uri(provider: OAuthProvider) -> str:
    """The callback the provider sends the browser back to, on the site's host (ADR-331)."""
    return settings.OAUTH_REDIRECT_BASE_URL.rstrip("/") + CALLBACK_PATH.format(provider=provider.name)


def new_code_verifier() -> str:
    """A PKCE code verifier: 86 URL-safe characters, inside RFC 7636's 43 to 128."""
    return secrets.token_urlsafe(64)


def code_challenge(code_verifier: str) -> str:
    """The S256 challenge for a verifier: base64url of its SHA-256, without padding (RFC 7636)."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorize_url(provider: OAuthProvider, *, state: str, nonce: str, code_verifier: str) -> str:
    """The provider's sign-in page, asking for an authorization code bound to this state and nonce."""
    query = urlencode(
        {
            "response_type": "code",
            "client_id": provider.client_id,
            "redirect_uri": redirect_uri(provider),
            "scope": provider.scope,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge(code_verifier),
            "code_challenge_method": "S256",
        }
    )
    return f"{provider.authorize_url}?{query}"


class OAuthExchangeError(Exception):
    """The provider could not be asked, or did not answer with an `id_token`.

    Its message names what went wrong, never the code or anything the provider sent back.
    """


class OAuthCodeExchanger(Protocol):
    """Exchanges an authorization code for the `id_token` it stands for."""

    async def exchange(self, provider: OAuthProvider, code: str, code_verifier: str) -> str:
        """Return the `id_token`; raise OAuthExchangeError on any failure."""
        ...


class HttpOAuthCodeExchanger:
    """Real exchanger: POSTs the code to the provider's token endpoint."""

    async def exchange(self, provider: OAuthProvider, code: str, code_verifier: str) -> str:
        """Exchange the code, the PKCE verifier and our client secret for the provider's `id_token`."""
        try:
            # The same timeout as LINE's verify call (`sso/line.py`).
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(
                    provider.token_url,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "code_verifier": code_verifier,
                        "client_id": provider.client_id,
                        "client_secret": provider.client_secret,
                        "redirect_uri": redirect_uri(provider),
                    },
                )
        except httpx.HTTPError as err:
            raise OAuthExchangeError(f"{provider.name} token request failed: {type(err).__name__}") from err
        if resp.status_code != 200:
            raise OAuthExchangeError(f"{provider.name} token endpoint answered {resp.status_code}")
        try:
            id_token = resp.json().get("id_token")
        except (ValueError, AttributeError):
            id_token = None
        if not isinstance(id_token, str) or not id_token:
            raise OAuthExchangeError(f"{provider.name} token endpoint returned no id_token")
        return id_token


def get_oauth_exchanger() -> OAuthCodeExchanger:
    """FastAPI dependency: the real exchanger (tests inject a fake double)."""
    return HttpOAuthCodeExchanger()
