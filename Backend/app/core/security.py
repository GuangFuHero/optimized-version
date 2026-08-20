"""Authentication, password hashing, JWT token handling, and RBAC permission checking."""

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Protocol

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import request_identity
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.db.session import SessionLocal
from app.models.auth import User
from app.repositories.active_identity_repository import active_identity_repository
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
        data: dict, expires_delta: timedelta | None = None, sid: str | None = None,
        act: str | None = None,
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
        # The identity this token acts as (ADR-069). Absent means "no identity resolved",
        # which yields no grants at all.
        "act": act,
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
    """Resolve the authenticated user AND the identity this token acts as (ADR-069/096).

    An `act` claim that no longer names a grant the user holds — role revoked, role deleted,
    team soft-deleted — is refused here rather than quietly downgraded. Silently dropping to
    a lesser identity would leave the caller acting with permissions they cannot see they
    lost; refusing makes it visible. `/auth/refresh` refuses the same case, so between them
    the user is signed out and comes back on their platform identity.
    """
    payload = _decode_access_payload(token)
    user = await user_repository.get_by_uuid(db, payload["sub"])
    if user is None:
        raise _credentials_exception()
    act = payload.get("act")
    if act:
        identity = await active_identity_repository.resolve(db, str(user.uuid), act)
        if identity is None:
            raise _credentials_exception()
    else:
        # No `act` at all is a different case from one that names a vanished identity: nothing
        # was claimed, so fall back to the platform identity — the ADR-069 default, and what
        # the caller holds anyway, so it grants nothing new. Keeps tokens minted before this
        # feature (and any caller that does not track identity) working as they did.
        identity = await active_identity_repository.default_for_user(db, str(user.uuid))
    user.active_identity = identity
    await _publish_identity_for_auditing(db, identity)
    return user


async def _publish_identity_for_auditing(db: AsyncSession, identity) -> None:
    """Make the active identity visible to the audit trigger (ADR-076).

    Two writes, because they cover two different windows. The contextvar is what
    `set_audit_session_variables` reads when a session opens a transaction, and covers every
    session created later in this request. But THIS session's transaction already began —
    resolving the identity needed a query — so its GUC has to be set directly, or every write
    made through the session that authenticated the request would be logged without one.

    `set_config(..., true)` is transaction-local, so nothing leaks into the next request
    through a pooled connection.
    """
    if identity is None:
        return
    snapshot = json.dumps(identity.to_audit_context(), ensure_ascii=False)
    request_identity.set(snapshot)
    await db.execute(text("SELECT set_config('app.active_identity', :identity, true)"),
                     {"identity": snapshot})


async def get_current_session(token: str = Depends(oauth2_scheme)) -> tuple[str, str | None]:
    """Resolve (user_uuid, sid) from the access token without a DB hit."""
    payload = _decode_access_payload(token)
    return payload["sub"], payload.get("sid")


def _request_rbac_cache(request: Request) -> dict:
    """Return (creating if absent) the request-scoped permission cache (ADR-046).

    Keyed by user uuid so one request's cache never leaks across users — relevant mainly
    for tests that swap `current_user` between calls within a single request lifecycle.
    The identity does not need to be part of the key: it is fixed for the whole request,
    having been resolved once from the token in `get_current_user`.
    """
    if not hasattr(request.state, "rbac_cache"):
        request.state.rbac_cache = {}
    return request.state.rbac_cache


async def resolve_scope(
        actor: User, perm: Perm, db: AsyncSession, cache: dict | None = None
) -> Scope:
    """Checkpoint 1 (ADR-022): resolve `actor`'s widest granted scope for `perm`.

    `cache`, when given, is a plain dict scoped to one request/GraphQL-context; the full
    per-user grant map is fetched at most once per request regardless of how many
    capabilities are checked in it.
    """
    if cache is not None and actor.uuid in cache:
        grants = cache[actor.uuid]
    else:
        grants = await user_repository.get_user_permissions(
            db, actor.uuid, identity=getattr(actor, "active_identity", None)
        )
        if cache is not None:
            cache[actor.uuid] = grants
    return grants.get(perm.value, Scope.NONE)


class PermissionChecker:
    """FastAPI dependency enforcing RBAC — checkpoint 1 only (ADR-022).

    Resolves the caller's scope for `perm` and raises 403 if it is Scope.NONE (ADR-023).
    Returns the resolved Scope so REST handlers needing row-level filtering (own/team/...)
    can inject it and filter themselves; handlers needing the full two-checkpoint model
    (object-level 404) should use app.graphql.context.check_permission's REST-equivalent
    pattern directly instead of relying on this dependency alone.
    """

    def __init__(self, perm: Perm):
        """Store the capability key this dependency checks."""
        self.perm = perm

    async def __call__(
            self,
            request: Request,
            current_user: User = Depends(get_current_user),
            db: AsyncSession = Depends(get_db),
    ) -> Scope:
        """Resolve and return the caller's scope for `self.perm`; 403 if none."""
        scope = await resolve_scope(current_user, self.perm, db, cache=_request_rbac_cache(request))
        if scope == Scope.NONE:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        return scope


def has_permission(perm: Perm):
    """FastAPI dependency factory: checkpoint-1-only permission check for `perm`."""
    return Depends(PermissionChecker(perm))
