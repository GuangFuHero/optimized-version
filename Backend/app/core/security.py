"""Authentication, password hashing, JWT token handling, and RBAC permission checking."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Protocol

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.auth import User
from app.repositories.auth_repository import user_repository

# --- 密碼處理框架 ---

class PasswordHandler(Protocol):
    """Protocol defining the password handler interface."""

    name: str
    def hash(self, password: str, salt_frontend: str) -> str:
        """Hash a plaintext password with the given frontend salt."""
        ...
    def verify(self, password: str, hashed_password_db: str) -> bool:
        """Verify a plaintext password against a stored hash string."""
        ...
    def parse_salt_frontend(self, hashed_password_db: str) -> str | None:
        """Extract the frontend salt component from a stored hash string."""
        ...


class PBKDF2SHA256Handler:
    """Password handler using PBKDF2-SHA256 with frontend and backend salts."""

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
        """Verify a plaintext password against the stored PBKDF2 hash."""
        try:
            parts = hashed_password_db.split('$')
            if len(parts) != 5:
                return False
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

    def parse_salt_frontend(self, hashed_password_db: str) -> str | None:
        """Extract the frontend salt from a stored PBKDF2 hash string."""
        parts = hashed_password_db.split('$')
        return parts[2] if len(parts) >= 3 else None


class PasswordManager:
    """Registry and dispatcher for password hash handlers."""

    def __init__(self):
        """Initialize with an empty handler registry."""
        self._handlers: dict[str, PasswordHandler] = {}
        self._default_handler: str | None = None

    def register(self, handler: PasswordHandler, default: bool = False):
        """Register a handler, optionally setting it as the default."""
        self._handlers[handler.name] = handler
        if default or not self._default_handler:
            self._default_handler = handler.name

    def _get_handler(self, algorithm: str) -> PasswordHandler:
        """Return the handler for the given algorithm, raising if unknown."""
        handler = self._handlers.get(algorithm)
        if not handler:
            raise ValueError(f"Unsupported algorithm: {algorithm}")
        return handler

    def hash(self, password: str, salt_frontend: str, algorithm: str | None = None) -> str:
        """Hash a password using the specified or default algorithm."""
        algo = algorithm or self._default_handler
        return self._get_handler(algo).hash(password, salt_frontend)

    def verify(self, password: str, hashed_password_db: str) -> bool:
        """Verify a plaintext password against a stored hash string."""
        if not hashed_password_db or '$' not in hashed_password_db:
            return False
        algorithm = hashed_password_db.split('$', 1)[0]
        return self._get_handler(algorithm).verify(password, hashed_password_db)

    def get_salt_frontend(self, hashed_password_db: str) -> str | None:
        """Extract the frontend salt from a stored hash string."""
        if not hashed_password_db or '$' not in hashed_password_db:
            return None
        algorithm = hashed_password_db.split('$', 1)[0]
        return self._get_handler(algorithm).parse_salt_frontend(hashed_password_db)

# 初始化管理員
pwd_manager = PasswordManager()
pwd_manager.register(PBKDF2SHA256Handler(), default=True)

# 導出便捷方法
def get_password_hash(hash_password_frontend: str, salt_frontend: str) -> str:
    """Hash a frontend-hashed password with the configured password manager."""
    return pwd_manager.hash(hash_password_frontend, salt_frontend)

def verify_password(hash_password_frontend: str, hashed_password_db: str) -> bool:
    """Verify a frontend-hashed password against the stored hash."""
    return pwd_manager.verify(hash_password_frontend, hashed_password_db)

def parse_salt_frontend(hashed_password_db: str) -> str | None:
    """Extract the frontend salt from a stored hash."""
    return pwd_manager.get_salt_frontend(hashed_password_db)


# --- JWT 與 其他邏輯 ---

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def generate_salt(length: int = 16) -> str:
    """Generate a random hex salt of the given byte length."""
    return secrets.token_hex(length)

def generate_refresh_token() -> str:
    """Generate an opaque, URL-safe refresh token (raw value, returned to client only)."""
    return secrets.token_urlsafe(32)

def hash_refresh_token(token: str) -> str:
    """Return the SHA-256 hex digest used to store/look up a refresh token in Redis."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_access_token(
    data: dict, expires_delta: timedelta | None = None, sid: str | None = None
) -> str:
    """Create a signed JWT access token, tagging it with type/jti and optional session id."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(UTC),
        "type": "access",
        "jti": secrets.token_hex(16),
        "sid": sid,
    })
    return jwt.encode(to_encode, settings.JWT_SIGNING_KEY, algorithm=settings.ALGORITHM)

async def get_db():
    """Async generator yielding a database session per request."""
    async with SessionLocal() as session:
        yield session

def _credentials_exception() -> HTTPException:
    """Build the standard 401 used when an access token cannot be validated."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

def _decode_access_payload(token: str) -> dict:
    """Decode and validate an access JWT, returning its payload. Raises 401 on any failure."""
    try:
        payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as err:
        raise _credentials_exception() from err
    if payload.get("sub") is None or payload.get("type") != "access":
        raise _credentials_exception()
    return payload

async def get_current_user(db: AsyncSession = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    """FastAPI dependency resolving the current authenticated user from JWT."""
    payload = _decode_access_payload(token)
    user = await user_repository.get_by_uuid(db, payload["sub"])
    if user is None:
        raise _credentials_exception()
    return user

async def get_current_session(token: str = Depends(oauth2_scheme)) -> tuple[str, str | None]:
    """Resolve (user_uuid, sid) from the access token without a DB hit."""
    payload = _decode_access_payload(token)
    return payload["sub"], payload.get("sid")

class PermissionChecker:
    """FastAPI dependency that enforces RBAC permissions on a resource and action."""

    def __init__(self, resource: str, action: str):
        """Store resource and action for later permission check."""
        self.resource, self.action = resource.lower(), action.lower()
    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> str:
        """檢查權限範圍 (Scope)。定義遵循產品規格 FR-081。

        - all: 具備該資源全域存取權。
        - own: 僅限於存取自己建立的資源。
        - none: 無任何存取權。
        """
        user_policies = await user_repository.get_user_permissions(db, current_user.uuid)
        target_policy = next(
            (
                p for p in user_policies
                if p.name.lower() == self.resource
                or p.name.lower().endswith(f":{self.resource}")
                or p.name.lower().endswith(f"_{self.resource}")
            ),
            None,
        )
        if not target_policy:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource access restricted.")
        scope = getattr(target_policy, self.action, "none")
        if scope == "none":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        return scope

def has_permission(resource: str, action: str):
    """FastAPI dependency factory for resource and action permission checks."""
    return Depends(PermissionChecker(resource, action))


async def require_onboarded(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Gate: require the user to own >=1 verified contact. Raises 403 until onboarding completes."""
    from sqlalchemy import select  # local import to avoid reshuffling module header

    from app.models.auth import UserContact
    q = select(UserContact.uuid).where(
        UserContact.user_uuid == current_user.uuid, UserContact.verified.is_(True)
    ).limit(1)
    if (await db.execute(q)).first() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Onboarding incomplete: verify a contact method first",
        )
    return current_user
