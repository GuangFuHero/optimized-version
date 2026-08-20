"""Centralized account creation — the single entry point all register/SSO flows funnel through (design §2)."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User, UserContact, UserIdentity
from app.models.rbac import UserRoleAssign
from app.repositories.auth_repository import role_repository

DEFAULT_PLATFORM_ROLE = "user"


async def create_account(
    db: AsyncSession,
    *,
    name: str,
    provider: str = "password",
    provider_subject: str | None = None,
    password_hash: str | None = None,
    contact_type: str | None = None,
    value: str | None = None,
) -> User:
    """Create user + ONE identity (+ optional VERIFIED contact) + default platform role, atomically.

    Defaults preserve the original password-register behavior (provider="password"), so existing
    callers need no change. SSO callers pass provider="google", provider_subject=<sub>, and (for Google)
    a verified email contact. `value` must already be normalized; caller guarantees it is not taken.
    Returns a refreshed `User`.
    """
    user = User(name=name)
    db.add(user)
    await db.flush()  # populate user.uuid for the FK rows below
    db.add(UserIdentity(
        user_uuid=user.uuid, provider=provider,
        provider_subject=provider_subject, password_hash=password_hash,
    ))
    if contact_type and value:
        db.add(UserContact(
            user_uuid=user.uuid, type=contact_type, value=value,
            verified=True, verified_at=datetime.now(UTC),
        ))
    # If seed hasn't run yet, this role won't exist and the user is silently left roleless
    # (same tradeoff the old Login-User-group assignment had) — documented, not fixed here.
    role = await role_repository.get_by_name(db, name=DEFAULT_PLATFORM_ROLE)
    if role:
        db.add(UserRoleAssign(
            user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=None, role_kind="platform"
        ))
    await db.commit()
    await db.refresh(user)
    return user
