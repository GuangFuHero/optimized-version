from datetime import datetime, timedelta, timezone
from typing import List, Optional, Any, Union
from fastapi import HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import SessionLocal
from app.core.config import settings
from app.repositories.auth_repository import user_repository
from app.models.auth import User

# 密碼哈希處理
# 使用 pbkdf2_sha256 以避開 Python 3.13 下 bcrypt 的相容性與長度限制問題
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# OAuth2 方案 (Token 獲取路徑)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# --- 密碼與 Token 工具函數 ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


# --- FastAPI 依賴項 ---

async def get_db():
    async with SessionLocal() as session:
        yield session


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    從 JWT Token 中解析並獲取當前登入的使用者。
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_uuid: str = payload.get("sub")
        if user_uuid is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise credentials_exception
    
    return user


class PermissionChecker:
    def __init__(self, resource: str, action: str):
        """
        resource: 資源名稱 (對應 Policy.name)
        action: 行為 (read, create, edit, delete)
        """
        self.resource = resource.lower()
        self.action = action.lower()

    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> str:
        """
        檢查權限並回傳權限範圍 (scope): 'all', 'own' 或 'none'。
        """
        user_policies = await user_repository.get_user_permissions(db, current_user.uuid)
        
        # 尋找對應資源的 Policy (支援大小寫模糊匹配)
        target_policy = None
        for p in user_policies:
            p_name_lower = p.name.lower()
            if p_name_lower == self.resource or p_name_lower.endswith(f"_{self.resource}"):
                target_policy = p
                break
        
        if not target_policy:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"缺少對資源 {self.resource} 的存取權限"
            )

        # 根據 action 獲取權限範圍
        scope = getattr(target_policy, self.action, "none")

        if scope == "none":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"不具備對資源 {self.resource} 執行 {self.action} 的權限"
            )
        
        return scope


# 輔助函數
def has_permission(resource: str, action: str):
    """
    使用範例: Depends(has_permission("request", "edit"))
    回傳值為 scope ("all" 或 "own")
    """
    return Depends(PermissionChecker(resource, action))
