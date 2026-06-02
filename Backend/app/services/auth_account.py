"""Centralized account creation — the single entry point all register/SSO flows funnel through (design §2)."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User, UserContact, UserGroupAssign, UserIdentity
from app.repositories.auth_repository import group_repository

LOGIN_GROUP = "Login User"


async def create_account(
    db: AsyncSession, *, contact_type: str, value: str, password_hash: str, name: str
) -> User:
    """Create user + password identity + VERIFIED contact(type) + Login User group in ONE transaction.

    `value` must already be normalized. Caller guarantees the value is not already taken. Returns a
    refreshed `User` (safe to read attributes — see the async gotcha note at the top of this plan).
    """
    user = User(name=name)
    db.add(user)
    await db.flush()  # populate user.uuid for the FK rows below
    db.add(UserIdentity(user_uuid=user.uuid, provider="password", password_hash=password_hash))
    db.add(UserContact(
        user_uuid=user.uuid, type=contact_type, value=value,
        verified=True, verified_at=datetime.now(UTC),
    ))
    group = await group_repository.get_by_name(db, name=LOGIN_GROUP)
    if group:
        db.add(UserGroupAssign(user_uuid=user.uuid, group_uuid=group.uuid))
    await db.commit()      # single atomic commit for all four rows
    await db.refresh(user)  # un-expire after commit (expire_on_commit=True default)
    return user
