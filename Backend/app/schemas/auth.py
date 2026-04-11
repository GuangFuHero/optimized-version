from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from datetime import datetime

# --- Token 相關 ---

class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_uuid: Optional[str] = None


# --- 使用者註冊與登入 ---

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    # 此欄位接收前端經過 PBKDF2 雜湊後的結果
    password: str = Field(..., min_length=6, max_length=255)
    salt_frontend: str = Field(..., description="Frontend generated salt (hex)")


class UserLogin(BaseModel):
    name: str
    hash_password: str


# --- 使用者回傳與更新 ---

class UserSaltResponse(BaseModel):
    salt_frontend: str

class UserBase(BaseModel):
    name: str
    credibility_score: float


class UserResponse(UserBase):
    uuid: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    password: Optional[str] = Field(None, min_length=6, max_length=255)
