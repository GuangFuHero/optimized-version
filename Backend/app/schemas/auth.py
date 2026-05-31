"""Pydantic schemas for authentication requests and responses."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

# --- Token 相關 ---

class Token(BaseModel):
    """JWT access token response."""

    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Decoded JWT payload data."""

    user_uuid: str | None = None


# --- 使用者註冊與登入 ---

class UserCreate(BaseModel):
    """Request body for user registration."""

    name: str = Field(..., min_length=1, max_length=100)
    # 此欄位接收前端經過 PBKDF2 雜湊後的結果
    password: str = Field(..., min_length=6, max_length=255)
    salt_frontend: str = Field(..., description="Frontend generated salt (hex)")


class UserLogin(BaseModel):
    """Request body for user login (legacy, not used by OAuth2 form flow)."""

    name: str
    hash_password: str


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
    password: str | None = Field(None, min_length=6, max_length=255)
