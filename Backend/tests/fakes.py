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


class CapturingSession:
    """Test double for AsyncSession that records every statement handed to it.

    For assertions about the SQL a repository *builds* — the ORDER BY it ends on, whether
    it wrapped the search in a statement-timeout — which are invisible from the rows a
    real query returns at test-suite data volumes.
    """

    def __init__(self):
        """Start with an empty statement log."""
        self.statements = []

    async def execute(self, statement, params=None):
        """Record the statement and return an empty result."""
        self.statements.append(statement)
        return _EmptyResult()

    async def scalar(self, statement, params=None):
        """Record the statement and return a harmless scalar."""
        self.statements.append(statement)
        return 0

    def sql(self) -> str:
        """Every recorded statement as one string, for substring assertions."""
        return "\n".join(str(s) for s in self.statements)


class _EmptyResult:
    """The slice of SQLAlchemy's Result that repositories actually call."""

    def scalars(self):
        """Return self — `.scalars().all()` is the only chain used."""
        return self

    def all(self):
        """No rows."""
        return []

