"""TEST-ONLY doubles. None of these are ever wired into the running application."""
import json

from app.sso.google import GoogleIdentity, GoogleTokenVerificationError
from app.sso.line import LineIdentity, LineTokenVerificationError


class FakeGoogleVerifier:
    """Test double: treats the id_token string as JSON claims; NO signature check."""

    async def verify(self, id_token: str) -> GoogleIdentity:
        """Parse the id_token string as a JSON claims payload."""
        try:
            claims = json.loads(id_token)
        except (json.JSONDecodeError, TypeError) as err:
            raise GoogleTokenVerificationError("fake verifier expects a JSON id_token") from err
        if not isinstance(claims, dict) or "sub" not in claims:
            raise GoogleTokenVerificationError("missing sub")
        return GoogleIdentity(
            sub=str(claims["sub"]),
            email=claims.get("email", ""),
            email_verified=bool(claims.get("email_verified", False)),
            name=claims.get("name"),
        )


class FakeLineVerifier:
    """Test double: treats the id_token string as JSON claims; NO signature check."""

    async def verify(self, id_token: str) -> LineIdentity:
        """Parse the id_token string as a JSON claims payload."""
        try:
            claims = json.loads(id_token)
        except (json.JSONDecodeError, TypeError) as err:
            raise LineTokenVerificationError("fake verifier expects a JSON id_token") from err
        if not isinstance(claims, dict) or "sub" not in claims:
            raise LineTokenVerificationError("missing sub")
        return LineIdentity(
            sub=str(claims["sub"]), name=claims.get("name"), email=claims.get("email")
        )
