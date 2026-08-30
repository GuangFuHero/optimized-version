"""Pydantic schemas for authentication requests and responses."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# --- Token 相關 ---

class TokenData(BaseModel):
    """Decoded JWT payload data."""

    user_uuid: str | None = None


# --- 使用者回傳與更新 ---

class UserSaltResponse(BaseModel):
    """Response containing the frontend salt for client-side password hashing."""

    salt_frontend: str

class UserBase(BaseModel):
    """Base fields shared by user response schemas."""

    name: str
    credibility_score: float


class UserResponse(UserBase):
    """Full user profile response, including which identity is in effect (ADR-068)."""

    uuid: UUID
    created_at: datetime
    identities: list["IdentityOption"] = Field(default_factory=list)
    active_identity: "IdentityOption | None" = None

    class Config:
        """Pydantic config: allow reading from ORM model attributes."""

        from_attributes = True


class UserUpdate(BaseModel):
    """Request body for partial user profile updates."""

    name: str | None = Field(None, min_length=1, max_length=100)


class IdentityOption(BaseModel):
    """An identity the caller may switch to (ADR-068)."""

    role_uuid: UUID
    role: str
    team_uuid: UUID | None = None
    team: str | None = None


class IdentityView(BaseModel):
    """Which identity the returned token acts as (ADR-205).

    Names travel with the uuids for the same reason `audit_logs.context` snapshots them: a
    role can be renamed or hard-deleted, and a client showing "acting as 花蓮縣府 / 管理員"
    should not have to resolve two uuids to do it.
    """

    role_uuid: str
    role: str
    team_uuid: str | None = None
    team: str | None = None


class AccessTokenResponse(BaseModel):
    """A re-signed access token, with no refresh token.

    Switching identity does not rotate the refresh token (ADR-070), and the server only ever
    stores its hash, so there is nothing to echo back — the client keeps the one it has.

    `identity` names what the new token acts as (ADR-205), so a client can confirm the switch
    landed without decoding the token it just received.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    identity: IdentityView | None = None


class SwitchIdentityRequest(BaseModel):
    """Body naming the identity to switch to. Must be one the caller already holds."""

    role_uuid: UUID
    team_uuid: UUID | None = None


class TokenPair(BaseModel):
    """Access + refresh token pair returned by login/refresh.

    `identity` names the identity the access token carries (ADR-205). It is not always the
    one the client asked for — `login` with a `scope` naming an identity the user no longer
    holds falls back to the platform default and still returns 200 (ADR-069) — and without
    this field the only way to notice was to decode the JWT or call `GET /users/me`.

    None means the token carries no identity at all: an account holding no grants.
    """

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    identity: IdentityView | None = None


class RefreshRequest(BaseModel):
    """Request body carrying a refresh token to exchange.

    `identity` is the identity the client is currently acting as, read off its own access
    token. Without it the new token would fall back to the platform identity and silently
    bounce the user out of their team identity every 15 minutes (ADR-069).
    """

    refresh_token: str
    identity: str | None = None


class ChangePasswordRequest(BaseModel):
    """Request body for changing password (all values already frontend-hashed)."""

    old_password: str = Field(..., min_length=6, max_length=255)
    new_password: str = Field(..., min_length=6, max_length=255)
    salt_frontend: str = Field(..., description="Frontend salt for the new password")


class RegisterRequest(BaseModel):
    """Verify-then-create registration for email or phone."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)
    password: str = Field(..., min_length=6, max_length=255)  # already frontend-hashed
    salt_frontend: str = Field(..., description="Frontend salt (hex)")
    name: str = Field(..., min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        """Strip surrounding whitespace and reject blank (whitespace-only) names."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class GoogleSsoRequest(BaseModel):
    """Body carrying a Google id_token for SSO login / first-login create."""

    id_token: str = Field(..., min_length=1)


class LinkGoogleRequest(BaseModel):
    """Body carrying a Google id_token to link to the current account."""

    id_token: str = Field(..., min_length=1)


class IdTokenRequest(BaseModel):
    """Body carrying a provider id_token (LINE SSO / link)."""

    id_token: str = Field(..., min_length=1)


class SetPasswordRequest(BaseModel):
    """Body for SSO-only users to set a first password (no old password)."""

    password: str = Field(..., min_length=6, max_length=255)  # already frontend-hashed
    salt_frontend: str = Field(..., description="Frontend salt (hex)")


class VerifyRequest(BaseModel):
    """Body for unified verification: identifier + 6-digit code."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)
    code: str = Field(..., min_length=4, max_length=8)


class ResendVerificationRequest(BaseModel):
    """Request to resend a verification message for a pending registration."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)


class AddContactRequest(BaseModel):
    """Body to start adding a contact (email/phone) to the current account."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)


class VerifyContactRequest(BaseModel):
    """Body to verify a contact-add with the 6-digit code."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)
    code: str = Field(..., min_length=4, max_length=8)


class ForgotPasswordRequest(BaseModel):
    """Body to request a logged-out password reset code."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)


class ResetPasswordRequest(BaseModel):
    """Body to complete a logged-out password reset (new_password already frontend-hashed)."""

    type: Literal["email", "phone"] = "email"
    value: str = Field(..., min_length=1, max_length=320)
    code: str = Field(..., min_length=4, max_length=8)
    new_password: str = Field(..., min_length=6, max_length=255)  # already frontend-hashed
    salt_frontend: str = Field(..., description="Frontend salt (hex)")
