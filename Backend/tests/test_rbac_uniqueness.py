"""The user_permission_assign table enforces one row per (user, capability) (ADR-058)."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.auth import User
from app.models.rbac import Permission, UserPermissionAssign


@pytest.mark.asyncio
async def test_duplicate_user_permission_is_rejected(db_session):
    """A second grant for the same (user, permission) violates uq_user_perm."""
    user = User(name="Dup")
    perm = Permission(key="ticket.export")
    db_session.add(user)
    db_session.add(perm)
    await db_session.flush()

    db_session.add(UserPermissionAssign(user_uuid=user.uuid, permission_uuid=perm.uuid, scope="own"))
    await db_session.flush()

    db_session.add(UserPermissionAssign(user_uuid=user.uuid, permission_uuid=perm.uuid, scope="all"))
    with pytest.raises(IntegrityError):
        await db_session.flush()
