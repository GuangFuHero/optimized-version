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
    """Full user profile response."""

    uuid: UUID
    created_at: datetime

    class Config:
        """Pydantic config: allow reading from ORM model attributes."""

        from_attributes = True


class UserUpdate(BaseModel):
    """Request body for partial user profile updates."""

    name: str | None = Field(None, min_length=1, max_length=100)


class TokenPair(BaseModel):
    """Access + refresh token pair returned by login/refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    """Request body carrying a refresh token to exchange."""

    refresh_token: str


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
