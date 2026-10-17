"""Signing in, refreshing and finishing a registration, shared by the Bearer and the browser endpoints.

`/auth/login`, `/auth/refresh` and `/auth/verify` answer scripts and tests with tokens in the body;
`/auth/session*` answer the browser with cookies (ADR-325). Each pair runs the same checks through these
functions, so a fix to one reaches the other: #75's 320-character cap on the username, ADR-330's grace
period, ADR-096's refusal of a revoked identity.

They raise `ApiError` themselves, because both callers answer every failure identically.
"""

import logging
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.api_errors import ApiError, ErrorCode
from app.core.identity import ActiveIdentity
from app.core.normalize import normalize_email, normalize_phone
from app.db.session import attribute_writes_to
from app.models.auth import User
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.auth_repository import contact_repository, identity_repository, user_repository
from app.repositories.session_repository import InvalidRefreshToken, RefreshTokenReuse, SessionRepository
from app.repositories.verification_repository import VerificationRepository
from app.schemas.auth import VerifyRequest
from app.services.auth_account import create_account

logger = logging.getLogger(__name__)


async def authenticate_password(db: AsyncSession, username: str, password: str) -> User:
    """The account `username` (an email, else a phone number) names, if `password` is its password.

    One answer for every failure — no such account, no password on it, the wrong password — so the
    response does not say which accounts exist.
    """
    credentials_invalid = ApiError(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code=ErrorCode.CREDENTIALS_INVALID,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = None
    for type_, normalizer in (("email", normalize_email), ("phone", normalize_phone)):
        try:
            ident = normalizer(username)
        except ValueError:
            continue
        user = await contact_repository.get_user_by_contact(db, type_=type_, value=ident)
        if user:
            break
    if user is None:
        raise credentials_invalid
    identity = await identity_repository.get_password_identity(db, str(user.uuid))
    if identity is None or not security.verify_password(password, identity.password_hash):
        raise credentials_invalid
    return user


async def record_login(db: AsyncSession, user: User) -> None:
    """Stamp `users.last_login_at`."""
    # The request carries no access token, so nothing has named an actor for the audit
    # trigger — but the credential check before this proved who this is (ADR-170).
    await attribute_writes_to(db, str(user.uuid))
    await user_repository.update(db, db_obj=user, obj_in={"last_login_at": datetime.now(UTC)})


async def open_session(
    redis, user_uuid: str, identity: ActiveIdentity | None, device: str
) -> tuple[str, str]:
    """Create a session acting as `identity` and return its (access token, refresh token).

    `identity` is None only for an account holding no grants.
    """
    act = identity.to_claim() if identity else None
    # The session records the identity too (ADR-188), so a later refresh that does not name
    # one can carry it forward rather than resetting to the platform default.
    sid, refresh_token = await SessionRepository(redis).create_session(user_uuid, device, act=act)
    access_token = security.create_access_token(data={"sub": user_uuid}, sid=sid, act=act)
    return access_token, refresh_token


async def _record_activity(db: AsyncSession, user_uuid: str) -> None:
    """Stamp `users.last_activity_at`, swallowing any failure (ADR-093).

    Called only after the refresh token has already been rotated, so raising here would cost
    the caller their session — see the note in `refresh_session`. The session is rolled back on
    failure so the request's remaining work is not left inside an aborted transaction.

    `users` is an audited table, so the write appends an `audit_logs` row; naming the actor
    first is what keeps that row attributable (ADR-170).
    """
    try:
        user = await user_repository.get_by_uuid(db, user_uuid)
        if user is not None:
            # `rotate()` resolved this uuid from the refresh token it just accepted, so the
            # actor is known even though the request carried no access token (ADR-170).
            await attribute_writes_to(db, user_uuid)
            await user_repository.update(db, db_obj=user, obj_in={"last_activity_at": datetime.now(UTC)})
    except Exception:  # noqa: BLE001 — observability must never fail the token exchange
        logger.warning("Could not record last_activity_at for %s", user_uuid, exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001 — the session is already unusable; nothing to salvage
            logger.warning("Rollback after the activity write also failed", exc_info=True)


def _refresh_token_invalid() -> ApiError:
    return ApiError(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code=ErrorCode.REFRESH_TOKEN_INVALID,
        detail="Invalid or revoked refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def refresh_session(
    db: AsyncSession, redis, raw_refresh: str | None, wanted: str | None = None
) -> tuple[str, str, ActiveIdentity | None]:
    """Rotate a refresh token; return (access token, new refresh token, the identity it acts as).

    `raw_refresh` is None when the browser sent no refresh cookie, which is answered like any other
    token that cannot be used.

    The identity is validated BEFORE rotating (ADR-096). `rotate()` burns the old refresh
    token the moment it runs, so refusing afterwards would leave the caller holding a dead
    token with no replacement — and their retry, once the grace period is over (ADR-330),
    would read as a replay and revoke the whole session. Reading the record first is
    side-effect free.

    **The identity comes from the session when the caller does not name one** (ADR-188).
    `wanted` still wins, so a client that tracks it keeps deciding; but a client that
    does not — or forgets on one request — no longer gets silently returned to its platform
    identity, which for a super_admin acting as a team member was a silent re-escalation
    every time an access token expired.

    Rotation is also where `users.last_activity_at` is recorded (ADR-093). Access tokens
    live 15 minutes, so an active user rotates about that often — precise enough to answer
    "has this account been used lately?", which is all the admin console needs. It is
    deliberately NOT updated per request: `users` is in AUDITED_TABLES, so that would append
    one `audit_logs` row per request and bury the audit trail under activity noise.

    `SessionRepository` stays a pure Redis component — the DB write happens here, not there.

    The write is deliberately best-effort. By the time `rotate()` returns it has already
    burned the old refresh token (`SessionRepository._claim` sets the `refresh_used:` flag),
    so letting a DB error escape would 500 the request *after* the old token died: the client
    never receives `new_refresh`, retries with the old one, and — once the grace period is
    over (ADR-330) — `rotate()` reads that as a replay and revokes the entire session. A
    transient DB outage would sign the device out permanently. `last_activity_at` is
    observability — it is not worth a user's session.
    """
    if raw_refresh is None:
        raise _refresh_token_invalid()
    repo = SessionRepository(redis)
    record = await repo.get_refresh_for_token(raw_refresh)
    session = await repo.get_session(record["sid"]) if record else None
    # What the caller asked for, else what this session was already acting as. None means a
    # session predating ADR-188, which falls back to the platform default as it used to.
    wanted = wanted or (session or {}).get("act")
    # Resolved once, before rotation, and reused afterwards (ADR-206). `rotate()` returns the
    # same session's owner and `wanted` cannot change in between, so resolving a second time
    # asked the database an identical question — on every refresh, from every logged-in
    # client, roughly every 15 minutes.
    identity = None
    if wanted is not None and record is not None:
        identity = await active_identity_repository.resolve(db, record["user_uuid"], wanted)
        if identity is None:
            # The identity this client was acting as is gone. Refuse here as well as on the
            # request path, so a revoked identity means signed out, not silently downgraded.
            raise ApiError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code=ErrorCode.IDENTITY_REVOKED,
                detail="This identity no longer exists",
                headers={"WWW-Authenticate": "Bearer"},
            )
    try:
        sid, user_uuid, new_refresh = await repo.rotate(raw_refresh)
    except (InvalidRefreshToken, RefreshTokenReuse) as err:
        raise _refresh_token_invalid() from err
    # Only the no-identity path still needs a query here: `wanted` was already resolved above.
    if not wanted:
        identity = await active_identity_repository.default_for_user(db, user_uuid)
    # Rotation preserves the session record, so a `wanted` that came from it is already
    # stored; one the caller named has to be written back, or the next refresh without an
    # identity would revert to whatever the session remembered before.
    if identity is not None:
        await repo.set_identity(sid, identity.to_claim())
    await _record_activity(db, user_uuid)
    access_token = security.create_access_token(
        data={"sub": user_uuid}, sid=sid, act=identity.to_claim() if identity else None
    )
    return access_token, new_refresh, identity


async def verify_registration(db: AsyncSession, redis, body: VerifyRequest) -> User:
    """Consume a registration's 6-digit code and create the account it was for."""
    normalize = normalize_email if body.type == "email" else normalize_phone
    try:
        ident = normalize(body.value)
    except ValueError as err:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.CODE_INVALID,
            detail="Invalid or expired code",
        ) from err
    payload = await VerificationRepository(redis).consume_registration(
        type_=body.type, value=ident, code=body.code
    )
    if payload is None:
        raise ApiError(status.HTTP_400_BAD_REQUEST, ErrorCode.CODE_INVALID, detail="Invalid or expired code")
    # guard a stale pending (pre-required-name deploy) that has no usable name: the pending is already
    # consumed (burned) above, so the user simply re-registers instead of hitting a 500 on the NOT NULL
    name = payload.get("name")
    if not name or not str(name).strip():
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.REGISTRATION_EXPIRED,
            detail="Registration expired, please register again",
        )
    # re-check the race: someone may have verified the same identifier between register and now
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise ApiError(status.HTTP_409_CONFLICT, ErrorCode.IDENTIFIER_TAKEN, detail="Already in use")
    try:
        return await create_account(
            db,
            contact_type=body.type,
            value=ident,
            password_hash=payload["password_hash"],
            name=name,
        )
    except IntegrityError as err:  # concurrent verify race for the same identifier
        await db.rollback()
        raise ApiError(status.HTTP_409_CONFLICT, ErrorCode.IDENTIFIER_TAKEN, detail="Already in use") from err
