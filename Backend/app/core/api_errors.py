"""Machine-readable error codes for API failures.

`detail` stays a human-readable English string for logs and API consumers, but clients must branch
on `code`. Matching on the English text couples every client to backend copy: change one word and
the client stops recognising the case, silently falling back to a generic message instead of failing
loudly. The code is the contract; the detail is prose.

Adding a case here is only half the job — the raising endpoint must use `ApiError`, or the response
carries no code and clients fall back to their generic handling.
"""

from enum import StrEnum

from fastapi import HTTPException


class ErrorCode(StrEnum):
    """Stable identifiers for the auth failures a client needs to tell apart."""

    # Identifiers (email / phone)
    IDENTIFIER_INVALID = "identifier_invalid"
    IDENTIFIER_TAKEN = "identifier_taken"
    CONTACT_TYPE_TAKEN = "contact_type_taken"

    # Verification codes
    CODE_INVALID = "code_invalid"
    REGISTRATION_EXPIRED = "registration_expired"
    NO_PENDING_REGISTRATION = "no_pending_registration"
    NO_PENDING_CONTACT = "no_pending_contact"

    # Passwords and sessions
    PASSWORD_NOT_SET = "password_not_set"
    PASSWORD_ALREADY_SET = "password_already_set"
    PASSWORD_INCORRECT = "password_incorrect"
    CREDENTIALS_INVALID = "credentials_invalid"
    REFRESH_TOKEN_INVALID = "refresh_token_invalid"
    # The session died out from under a live client (revoked elsewhere, or expired). Remedy:
    # sign in again; everything will be as it was.
    SESSION_EXPIRED = "session_expired"
    # Logout could not reach the session store, so the caller is still signed in. Distinct from
    # every other failure because the generic "something went wrong" copy would let a user walk
    # away from a shared machine believing they signed out.
    SESSION_STORE_UNAVAILABLE = "session_store_unavailable"

    # Identity switching (multi-team membership)
    # The acting identity was revoked while in use. Unlike SESSION_EXPIRED, signing in again
    # lands the user somewhere different — their default identity, not the one they had.
    IDENTITY_REVOKED = "identity_revoked"
    # A switch may only move between identities already held; the client's list was stale.
    # Remedy: refresh the identity list, not the sign-in.
    IDENTITY_NOT_HELD = "identity_not_held"

    # Social login
    SSO_TOKEN_INVALID = "sso_token_invalid"
    SSO_EMAIL_UNVERIFIED = "sso_email_unverified"
    SSO_EMAIL_TAKEN = "sso_email_taken"
    SSO_ALREADY_LINKED = "sso_already_linked"
    SSO_LINKED_ELSEWHERE = "sso_linked_elsewhere"
    # A first login that raced another and could not complete. Distinct from the "taken" cases
    # because the remedy is to retry, not to log in some other way.
    SSO_SIGNIN_RACE = "sso_signin_race"

    # Throttling
    RATE_LIMITED = "rate_limited"


class ApiError(HTTPException):
    """An HTTPException that also carries a stable `code` for clients to branch on."""

    def __init__(self, status_code: int, code: ErrorCode, detail: str, headers: dict | None = None):
        """Build the error; `code` is what clients match on, `detail` is prose for humans."""
        super().__init__(status_code, detail=detail, headers=headers)
        self.code = code
