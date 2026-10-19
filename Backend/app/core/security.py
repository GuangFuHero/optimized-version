"""Authentication, password hashing, JWT token handling, and RBAC permission checking."""

import hashlib
import hmac
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Protocol

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import ExpiredSignatureError, JWTError, jwt
from redis.exceptions import RedisError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.context import request_identity
from app.core.permissions import GOV_TEAM_WIDENED_PERMS, Perm
from app.core.rbac_scopes import Scope, active_team
from app.core.redis import get_redis
from app.core.request_auth import accept_access_token
from app.db.session import SessionLocal
from app.models.auth import User
from app.models.team import Team
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
            "sha256", password.encode("utf-8"), salt_backend.encode("utf-8"), self.default_iterations
        ).hex()
        return f"{self.name}${self.default_iterations}${salt_frontend}${salt_backend}${hash_hex}"

    def verify(self, password: str, hashed_password_db: str) -> bool:
        """Verify a plaintext password against the stored PBKDF2 hash."""
        try:
            parts = hashed_password_db.split("$")
            if len(parts) != 5:
                return False
            _, iterations, _, salt_backend, hash_val = parts

            new_hash = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt_backend.encode("utf-8"), int(iterations)
            ).hex()
            return hmac.compare_digest(new_hash, hash_val)
        except (ValueError, IndexError):
            return False

    def parse_salt_frontend(self, hashed_password_db: str) -> str | None:
        """Extract the frontend salt from a stored PBKDF2 hash string."""
        parts = hashed_password_db.split("$")
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
        if not hashed_password_db or "$" not in hashed_password_db:
            return False
        algorithm = hashed_password_db.split("$", 1)[0]
        return self._get_handler(algorithm).verify(password, hashed_password_db)

    def get_salt_frontend(self, hashed_password_db: str) -> str | None:
        """Extract the frontend salt from a stored hash string."""
        if not hashed_password_db or "$" not in hashed_password_db:
            return None
        algorithm = hashed_password_db.split("$", 1)[0]
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

# The Bearer half of `get_access_token`. `auto_error=False`, because a request without the header may
# still carry the access cookie (ADR-327); kept as a dependency so the OpenAPI schema clients are
# generated from still declares the scheme.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_access_token(request: Request, _bearer: str | None = Depends(oauth2_scheme)) -> str:
    """The access token of a request that must be signed in: a Bearer token, else the cookie.

    `_bearer` is not read: `accept_access_token` parses the header itself, so REST and the GraphQL
    context follow one rule, Origin check included. The dependency is there for OpenAPI.

    No token at all is 401 `credentials_invalid` with detail "Not authenticated" — every 401 here
    carries a code (ADR-328). It is not a cookie-authenticated request, so nothing is cleared.
    """
    token = accept_access_token(request)
    if token is None:
        raise ApiError(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.CREDENTIALS_INVALID,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


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
    data: dict,
    expires_delta: timedelta | None = None,
    sid: str | None = None,
    act: str | None = None,
) -> str:
    """Create a signed JWT access token, tagging it with type/jti and optional session id."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update(
        {
            "exp": expire,
            "iat": datetime.now(UTC),
            "type": "access",
            "jti": secrets.token_hex(16),
            "sid": sid,
            # The identity this token acts as (ADR-069). Absent means "no identity resolved",
            # which yields no grants at all.
            "act": act,
        }
    )
    return jwt.encode(to_encode, settings.JWT_SIGNING_KEY, algorithm=settings.ALGORITHM)


async def get_db():
    """Async generator yielding a database session per request."""
    async with SessionLocal() as session:
        yield session


logger = logging.getLogger(__name__)


def _credentials_exception(code: ErrorCode) -> ApiError:
    """Build the 401 used when an access token cannot be used, naming why (ADR-328).

    The detail is the same in every case; `code` is what a client branches on. Two codes mean
    "refresh and send it again" — `access_token_expired`, `access_token_stale` — and the rest
    mean the user is signed out. Without them a browser cannot tell a token that merely ran out
    from a session that was revoked, and either refreshes in vain or signs out for nothing.

    `code` has no default, and every caller spells it as `ErrorCode.X`: the same contract
    `tests/test_error_codes.py` enforces on the auth endpoints, where a code that arrives some
    other way is how a typo ships. A default would also let a new raise site sign users out
    without anyone having decided that it should.
    """
    return ApiError(
        status.HTTP_401_UNAUTHORIZED,
        code,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode_access_payload(token: str) -> dict:
    """Decode and validate an access JWT, returning its payload. Raises 401 on any failure."""
    try:
        payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
    except ExpiredSignatureError as err:
        # Checked before JWTError, which it subclasses: only an expired token is worth refreshing.
        raise _credentials_exception(ErrorCode.ACCESS_TOKEN_EXPIRED) from err
    except JWTError as err:
        raise _credentials_exception(ErrorCode.CREDENTIALS_INVALID) from err
    if payload.get("sub") is None or payload.get("type") != "access":
        raise _credentials_exception(ErrorCode.CREDENTIALS_INVALID)
    return payload


async def _require_live_session(redis, payload: dict) -> None:
    """Refuse a token whose session is gone (ADR-099).

    This is what makes every revocation path take effect at once: logout, logout-all,
    change-password, reset-password and an admin kick all already delete `session:{sid}`,
    they were simply never looked at on the request path. Checking here — before the user
    lookup — also means a revoked token costs no database round trip.
    """
    # Imported here, not at module scope: session_repository imports this module for its
    # token hashing, so a top-level import would close the cycle.
    from app.repositories.session_repository import SessionRepository

    sid = payload.get("sid")
    # Only tokens that did not come from issue_token_pair lack a sid, and there is no live
    # session to check them against. Letting them through would make "leave the sid out" a
    # way around this check (ADR-101).
    if not sid:
        raise _credentials_exception(ErrorCode.CREDENTIALS_INVALID)
    try:
        session = await SessionRepository(redis).get_session(sid)
    except RedisError:
        # Fail closed (ADR-100): with Redis unreachable we cannot tell a live session from a
        # revoked one, and guessing "live" would hand anyone who can disrupt Redis a way to
        # switch revocation off. But a 503, not a 401 (ADR-328): the session may well be alive,
        # and a browser told it is signed out would have its cookies cleared and stay signed out
        # after Redis is back. The log is what says why the store was unreachable.
        logger.exception("refusing the request: Redis (the session store) is unreachable")
        raise ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCode.SESSION_STORE_UNAVAILABLE,
            detail="Session store is unavailable",
        ) from None
    # Gone: logged out, signed out everywhere, a password change or an admin's kick. The token
    # itself is fine, but nothing a refresh does can bring the session back (ADR-328).
    if session is None:
        raise _credentials_exception(ErrorCode.SESSION_EXPIRED)
    # A session that names a different user than the token does is not a case that can arise
    # today — both claims are signed — but pinning it here keeps sid/sub paired as an
    # invariant a future path cannot quietly break (ADR-101).
    if session.get("user_uuid") != payload["sub"]:
        raise _credentials_exception(ErrorCode.CREDENTIALS_INVALID)
    # The identity is pinned to the session too (ADR-195). Switching identity writes the
    # new `act` into the session record, but the access token it replaced carries the same
    # sid/sub and would otherwise stay usable for the rest of its 15 minutes — replaying it
    # undoes a deliberate downgrade, and attributes whatever it does to the pre-switch
    # identity in the audit trail. The session record is the single source of truth for which
    # identity a session is acting as; a token that disagrees with it is stale — and a refresh,
    # which signs for the session's current identity, is what replaces it (ADR-328).
    if session.get("act") != payload.get("act"):
        raise _credentials_exception(ErrorCode.ACCESS_TOKEN_STALE)


# The header, and its two values, by which the site and the back office mark their requests
# (ADR-289, ADR-329).
REALM_HEADER = "X-WG-Realm"
SITE_REALM = "site"
ADMIN_REALM = "admin"


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(get_access_token),
    redis=Depends(get_redis),
    realm: str | None = Header(None, alias=REALM_HEADER),
) -> User:
    """Resolve the authenticated user AND the identity this token acts as (ADR-069/096).

    An `act` claim that no longer names a grant the user holds — role revoked, role deleted,
    team soft-deleted — is refused here rather than quietly downgraded. Silently dropping to
    a lesser identity would leave the caller acting with permissions they cannot see they
    lost; refusing makes it visible. `/auth/refresh` refuses the same case with the same
    `identity_revoked`, so between them the user is signed out and comes back on their platform identity.

    A request the site marks with `realm` = `site` then acts as the caller's `user` grant
    instead, for that request alone (ADR-289): everyone signed in has the same
    permissions on the site, and switching identity is a back-office matter. It applies only
    after the token's own identity has been checked, so a
    revoked one still 401s, and an account holding no `user` grant keeps the token's identity
    (ADR-289 decision 2). Neither the token nor the session changes.

    A request the back office marks with `realm` = `admin` acts as a back-office identity in the
    same way (ADR-329): the token's own, unless that is `user` — the site's identity, where every
    login lands — in which case the caller's first back-office identity. An account holding none
    gets a 403, after the same checks, so a revoked identity still 401s here too.

    `redis` and `realm` are ordinary parameters rather than read off the request, because the
    GraphQL context calls this function directly instead of through FastAPI and has to supply
    them itself (ADR-102).
    """
    payload = _decode_access_payload(token)
    await _require_live_session(redis, payload)
    user = await user_repository.get_by_uuid(db, payload["sub"])
    if user is None:
        raise _credentials_exception(ErrorCode.CREDENTIALS_INVALID)
    act = payload.get("act")
    if act:
        identity = await active_identity_repository.resolve(db, str(user.uuid), act)
        if identity is None:
            # The code a refresh answers too, so a client can say the access was taken away (ADR-328).
            raise _credentials_exception(ErrorCode.IDENTITY_REVOKED)
    else:
        # No `act` at all is a different case from one that names a vanished identity: nothing
        # was claimed, so fall back to the platform identity — the ADR-069 default, and what
        # the caller holds anyway, so it grants nothing new. Keeps tokens minted before this
        # feature (and any caller that does not track identity) working as they did.
        identity = await active_identity_repository.default_for_user(db, str(user.uuid))
    if realm == SITE_REALM:
        identity = await active_identity_repository.site_identity(db, str(user.uuid)) or identity
    elif realm == ADMIN_REALM:
        identity = await active_identity_repository.back_office_identity(db, str(user.uuid), identity)
        if identity is None:
            # Not a 401: the session is fine and the site still works, so nobody is signed out.
            raise ApiError(
                status.HTTP_403_FORBIDDEN,
                ErrorCode.BACK_OFFICE_IDENTITY_REQUIRED,
                "This account has no back-office identity",
            )
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
    await db.execute(
        text("SELECT set_config('app.active_identity', :identity, true)"), {"identity": snapshot}
    )


async def get_current_session(token: str = Depends(get_access_token)) -> tuple[str, str | None]:
    """Resolve (user_uuid, sid) from the access token without a DB hit or a Redis read.

    Deliberately does NOT check that the session is still live (ADR-190, superseding
    ADR-180). Its only callers are the logout endpoints and the two that switch identity, and
    "the session is gone" means something different at each: switching checks it itself
    (`auth_session.switch_identity`) and refuses, while logout has already got what it was
    asking for and answers 204.
    Raising 401 from here made `/auth/logout` non-idempotent, which breaks the ordinary
    client pattern of calling logout from a 401 interceptor.

    The attack ADR-180 closed — an intruder replaying a revoked token against
    `/auth/logout-all` to keep kicking the victim out — is closed in `logout_all` instead,
    which refuses to revoke anything on behalf of a session that is already gone.
    """
    payload = _decode_access_payload(token)
    return payload["sub"], payload.get("sid")


def session_id_of_access_token(token: str) -> str | None:
    """The `sid` of an access token we signed, even an expired one; None for anything else.

    Only for signing a browser out (ADR-325): a token past its 15 minutes still says which session
    the browser holds, and refusing to read it would leave that session running. The signature is
    still checked, so nobody can name a session that is not theirs.
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM], options={"verify_exp": False}
        )
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload.get("sid")


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


async def resolve_scope(actor: User, perm: Perm, db: AsyncSession, cache: dict | None = None) -> Scope:
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
    scope = grants.get(perm.value, Scope.NONE)
    if scope == Scope.TEAM and perm in GOV_TEAM_WIDENED_PERMS and await _acts_for_gov_team(actor, db, cache):
        return Scope.ALL
    return scope


async def _acts_for_gov_team(actor: User, db: AsyncSession, cache: dict | None = None) -> bool:
    """Whether `actor`'s active identity speaks for a live, active gov team (ADR-285).

    A suspended or inactive gov team does not widen: assign_station will not hand such a team
    even one station, so it must not reach all of them either.

    The answer is cached per request under its own key, next to the grant maps keyed by
    user uuid, so a page checking many station capabilities looks it up once.
    """
    team_uuid = active_team(actor)
    if team_uuid is None:
        return False
    key = ("active_gov_team", str(team_uuid))
    if cache is not None and key in cache:
        return cache[key]
    is_active_gov = (
        await db.scalar(
            select(Team.uuid).where(
                Team.uuid == team_uuid, Team.delete_at.is_(None), Team.type == "gov", Team.status == "active"
            )
        )
        is not None
    )
    if cache is not None:
        cache[key] = is_active_gov
    return is_active_gov


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
