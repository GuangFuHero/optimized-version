"""Identity-provider (SSO) verifier adapters."""

from fastapi import Depends

from app.sso.google import get_google_verifier
from app.sso.line import get_line_verifier

SSO_PROVIDERS = ("google", "line")


def get_sso_verifiers(
    google=Depends(get_google_verifier),
    line=Depends(get_line_verifier),
) -> dict[str, object]:
    """One dependency carrying every provider verifier, keyed by provider name.

    `require_channel_proof` needs a verifier for whichever provider the account already holds,
    and it is reached from four endpoints (ADR-234). Threading two parameters through all of
    them buys nothing over one mapping, and the mapping is what the proof actually wants: look
    up the account's own provider rather than deciding in advance which one to ask for.

    Composed of the existing per-provider dependencies, so `dependency_overrides` on those
    (which is how the tests inject fakes) keeps working unchanged.
    """
    return {"google": google, "line": line}
