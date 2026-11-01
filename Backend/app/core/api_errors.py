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
    # A password signs in with an email or phone number, so an account with neither could never
    # use one (ADR-401). Remedy: add a contact first, not retry.
    PASSWORD_NEEDS_CONTACT = "password_needs_contact"
    PASSWORD_INCORRECT = "password_incorrect"
    CREDENTIALS_INVALID = "credentials_invalid"
    REFRESH_TOKEN_INVALID = "refresh_token_invalid"
    # The session died out from under a live client (revoked elsewhere, or expired). Remedy:
    # sign in again; everything will be as it was.
    SESSION_EXPIRED = "session_expired"
    # The access token's own 15 minutes ran out; the session behind it is fine. Remedy: refresh
    # and send the request again — unlike SESSION_EXPIRED, nobody is signed out (ADR-328).
    ACCESS_TOKEN_EXPIRED = "access_token_expired"
    # The session switched identity after this token was signed (ADR-195). Remedy: refresh, which
    # signs a token for the identity the session acts as now (ADR-328).
    ACCESS_TOKEN_STALE = "access_token_stale"
    # A cookie-authenticated write that did not come from one of our own pages (ADR-327) — what a
    # forged form on another site looks like. Not the user's doing, so nothing for them to fix.
    ORIGIN_NOT_ALLOWED = "origin_not_allowed"
    # The session store could not be reached, so whether the caller is signed in is unknown. On a
    # logout, distinct from every other failure because the generic "something went wrong" copy
    # would let a user walk away from a shared machine believing they signed out. On any other
    # request (503, ADR-328), so the caller is refused without being signed out.
    SESSION_STORE_UNAVAILABLE = "session_store_unavailable"

    # Identity switching (multi-team membership)
    # The acting identity was revoked while in use. Unlike SESSION_EXPIRED, signing in again
    # lands the user somewhere different — their default identity, not the one they had.
    IDENTITY_REVOKED = "identity_revoked"
    # Spec 029 (ADR-402): what the backend answers instead of IDENTITY_REVOKED, which it no longer
    # sends. The session has already been moved to the default identity and the cookies are kept.
    # Remedy: forget the remembered identity, refresh without naming one, tell the user which
    # identity was taken (`revoked_identity`), and do not resend the request on its own.
    IDENTITY_RESET = "identity_reset"
    # A switch may only move between identities already held; the client's list was stale.
    # Remedy: refresh the identity list, not the sign-in.
    IDENTITY_NOT_HELD = "identity_not_held"
    # `/auth/switch-identity` answers with a token in the body, so a request signed in by the cookie is
    # refused there (ADR-325): the cookie exists to keep the token from the page's scripts. A browser
    # switches through `POST /auth/session/identity`. A client bug, not something to show a user.
    BEARER_TOKEN_REQUIRED = "bearer_token_required"
    # The mirror case: `POST /auth/session/identity` answers with a cookie, so a Bearer request is refused
    # there and switches through `/auth/switch-identity` (ADR-325). Also a client bug.
    COOKIE_SESSION_REQUIRED = "cookie_session_required"
    # A back-office request (ADR-329) from an account holding nothing besides `user`. Not a sign-in
    # failure: the session is fine and the site still works, so the back office says "no access"
    # and signs nobody out.
    BACK_OFFICE_IDENTITY_REQUIRED = "back_office_identity_required"
    # A token issued to an MCP client tried to write. Those tokens only read, outside the MCP as in it.
    MCP_READ_ONLY = "mcp_read_only"

    # Social login
    SSO_TOKEN_INVALID = "sso_token_invalid"
    SSO_EMAIL_UNVERIFIED = "sso_email_unverified"
    SSO_EMAIL_TAKEN = "sso_email_taken"
    SSO_ALREADY_LINKED = "sso_already_linked"
    SSO_LINKED_ELSEWHERE = "sso_linked_elsewhere"
    # Unlink was asked for a provider this account does not hold, or one this API does not
    # know. Separate from the "already linked" cases: the remedy is to re-read the account's
    # login methods, not to pick a different account (ADR-237).
    SSO_NOT_LINKED = "sso_not_linked"
    SSO_PROVIDER_UNKNOWN = "sso_provider_unknown"
    # A first login that raced another and could not complete. Distinct from the "taken" cases
    # because the remedy is to retry, not to log in some other way.
    SSO_SIGNIN_RACE = "sso_signin_race"

    # The backend's own Google / LINE sign-in (ADR-331). They reach the browser as `?error=<code>` on the
    # sign-in page, which is where the user lands either way; only a start naming no app of ours is
    # answered as JSON instead, there being no sign-in page to send it to.
    # A sign-in that cannot be started: an unknown or unconfigured provider, an unknown app, or a
    # `return_to` that is not a path on our own site. A bug in the page that linked here.
    OAUTH_REQUEST_INVALID = "oauth_request_invalid"
    # The provider sent the browser back with a state this browser did not start, or one already used
    # or expired. Remedy: start again.
    OAUTH_STATE_INVALID = "oauth_state_invalid"
    # The user said no at the provider. Not an error to apologise for: just offer the buttons again.
    OAUTH_CANCELLED = "oauth_cancelled"
    # The provider could not be asked for the user's identity, or answered with none. Remedy: retry.
    OAUTH_EXCHANGE_FAILED = "oauth_exchange_failed"

    # Step-up proof before authentication material changes (ADR-215/217/220/234).
    # STEP_UP_REQUIRED is not a mistake the caller made: the backend has just delivered a code
    # (or is asking for the account's password / provider token) and wants the same call again
    # carrying it. A client that cannot tell it from a generic 422 shows the user an error where
    # it should show them a field.
    STEP_UP_REQUIRED = "step_up_required"
    # The proof can only come from the account's provider, which a browser proves by signing in there again
    # (ADR-361). The answer names the providers; the client sends the person to one and repeats the call.
    STEP_UP_REAUTH_REQUIRED = "step_up_reauth_required"
    STEP_UP_INVALID = "step_up_invalid"
    STEP_UP_THROTTLED = "step_up_throttled"
    # No channel and no provider to prove against — the remedy is to add a contact, not to retry.
    NO_PROOF_CHANNEL = "no_proof_channel"

    # The "do not strand this account" guards (ADR-087/218). Both mean the same thing to a user
    # — this is the last way back in — but they are separate because the remedy differs: add
    # another contact, versus add another sign-in method.
    LAST_LOGIN_CHANNEL = "last_login_channel"
    LAST_LOGIN_METHOD = "last_login_method"

    # Throttling
    RATE_LIMITED = "rate_limited"

    # Audit log export (ADR-414): more changes match than one file carries. The answer carries
    # `matched` and `limit`, so the page can say how far over it is and ask for a narrower range.
    AUDIT_EXPORT_TOO_LARGE = "audit_export_too_large"


class ApiError(HTTPException):
    """An HTTPException that also carries a stable `code` for clients to branch on."""

    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        detail: str,
        headers: dict | None = None,
        extra: dict | None = None,
    ):
        """Build the error; `code` is what clients match on, `detail` is prose for humans.

        `extra` holds further fields for the body, beside `code` and `detail`, for an answer the client acts
        on rather than only shows (`providers` on `step_up_reauth_required`).
        """
        super().__init__(status_code, detail=detail, headers=headers)
        self.code = code
        self.extra = extra or {}
