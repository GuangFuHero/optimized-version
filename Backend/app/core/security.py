import hashlib
import secrets
import hmac
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Any, Union, Dict, Protocol
from fastapi import HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.core.config import settings
from app.repositories.auth_repository import user_repository
from app.models.auth import User

# --- 密碼處理框架 ---

class PasswordHandler(Protocol):
    name: str
    def hash(self, password: str, salt_frontend: str) -> str: ...
    def verify(self, password: str, hashed_password_db: str) -> bool: ...
    def parse_salt_frontend(self, hashed_password_db: str) -> Optional[str]: ...


class PBKDF2SHA256Handler:
    name = "pbkdf2_sha256"
    default_iterations = 600000

    def hash(self, password: str, salt_frontend: str) -> str:
        """格式: pbkdf2_sha256$<iterations>$<salt_frontend>$<salt_backend>$<hash>"""
        salt_backend = secrets.token_hex(16)
        hash_hex = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt_backend.encode('utf-8'),
            self.default_iterations
        ).hex()
        return f"{self.name}${self.default_iterations}${salt_frontend}${salt_backend}${hash_hex}"

    def verify(self, password: str, hashed_password_db: str) -> bool:
        try:
            parts = hashed_password_db.split('$')
            if len(parts) != 5: return False
            _, iterations, _, salt_backend, hash_val = parts

            new_hash = hashlib.pbkdf2_hmac(
                'sha256',
                password.encode('utf-8'),
                salt_backend.encode('utf-8'),
                int(iterations)
            ).hex()
            return hmac.compare_digest(new_hash, hash_val)
        except (ValueError, IndexError):
            return False

    def parse_salt_frontend(self, hashed_password_db: str) -> Optional[str]:
        parts = hashed_password_db.split('$')
        return parts[2] if len(parts) >= 3 else None


class PasswordManager:
    def __init__(self):
        self._handlers: Dict[str, PasswordHandler] = {}
        self._default_handler: Optional[str] = None

    def register(self, handler: PasswordHandler, default: bool = False):
        self._handlers[handler.name] = handler
        if default or not self._default_handler:
            self._default_handler = handler.name

    def _get_handler(self, algorithm: str) -> PasswordHandler:
        handler = self._handlers.get(algorithm)
        if not handler:
            raise ValueError(f"Unsupported algorithm: {algorithm}")
        return handler

    def hash(self, password: str, salt_frontend: str, algorithm: Optional[str] = None) -> str:
        algo = algorithm or self._default_handler
        return self._get_handler(algo).hash(password, salt_frontend)

    def verify(self, password: str, hashed_password_db: str) -> bool:
        if not hashed_password_db or '$' not in hashed_password_db:
            return False
        algorithm = hashed_password_db.split('$', 1)[0]
        return self._get_handler(algorithm).verify(password, hashed_password_db)

    def get_salt_frontend(self, hashed_password_db: str) -> Optional[str]:
        if not hashed_password_db or '$' not in hashed_password_db:
            return None
        algorithm = hashed_password_db.split('$', 1)[0]
        return self._get_handler(algorithm).parse_salt_frontend(hashed_password_db)

# 初始化管理員
pwd_manager = PasswordManager()
pwd_manager.register(PBKDF2SHA256Handler(), default=True)

# 導出便捷方法
def get_password_hash(hash_password_frontend: str, salt_frontend: str) -> str:
    return pwd_manager.hash(hash_password_frontend, salt_frontend)

def verify_password(hash_password_frontend: str, hashed_password_db: str) -> bool:
    return pwd_manager.verify(hash_password_frontend, hashed_password_db)

def parse_salt_frontend(hashed_password_db: str) -> Optional[str]:
    return pwd_manager.get_salt_frontend(hashed_password_db)


# --- JWT 與 其他邏輯 ---

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def generate_salt(length: int = 16) -> str:
    return secrets.token_hex(length)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SIGNING_KEY, algorithm=settings.ALGORITHM)

async def get_db():
    async with SessionLocal() as session:
        yield session

async def get_current_user(db: AsyncSession = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="無法驗證憑證", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
        user_uuid: str = payload.get("sub")
        if user_uuid is None: raise credentials_exception
    except JWTError: raise credentials_exception
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None: raise credentials_exception
    return user

class PermissionChecker:
    def __init__(self, resource: str, action: str):
        self.resource, self.action = resource.lower(), action.lower()
    async def __call__(self, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> str:
        """
        檢查權限範圍 (Scope)。定義遵循產品規格 FR-081：
        - all: 具備該資源全域存取權。
        - own: 僅限於存取自己建立的資源。
        - none: 無任何存取權。
        """
        user_policies = await user_repository.get_user_permissions(db, current_user.uuid)
        target_policy = next((p for p in user_policies if p.name.lower() == self.resource or p.name.lower().endswith(f":{self.resource}") or p.name.lower().endswith(f"_{self.resource}")), None)
        if not target_policy: raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource access restricted.")
        scope = getattr(target_policy, self.action, "none")
        if scope == "none": raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        return scope

def has_permission(resource: str, action: str):
    return Depends(PermissionChecker(resource, action))
