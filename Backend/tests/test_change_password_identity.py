"""Endpoint tests for change-password against the password identity."""

import pytest

from app.core.security import create_access_token, generate_salt, get_password_hash
from app.services.auth_account import create_account


@pytest.mark.asyncio
async def test_change_password_updates_identity(client, db_session):
    """Change-password updates the password identity; old fails and new logs in."""
    # 'Login User' group is already seeded by the db_session fixture (Task 9b) — do NOT re-add it
    # (a duplicate group makes group_repository.get_by_name raise MultipleResultsFound).
    salt = generate_salt()
    user = await create_account(
        db_session, contact_type="email", value="a@x.com",
        password_hash=get_password_hash("oldpw1", salt),
    )
    token = create_access_token(data={"sub": str(user.uuid)})
    res = await client.post("/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"old_password": "oldpw1", "new_password": "newpw1", "salt_frontend": "deadbeef"})
    assert res.status_code == 204
    # old password no longer works, new one does
    old_login = await client.post("/api/v1/auth/login", data={"username": "a@x.com", "password": "oldpw1"})
    assert old_login.status_code == 401
    new_login = await client.post("/api/v1/auth/login", data={"username": "a@x.com", "password": "newpw1"})
    assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_old_password_401(client, db_session):
    """Change-password with a wrong old password returns 401."""
    salt = generate_salt()
    user = await create_account(
        db_session, contact_type="email", value="a@x.com",
        password_hash=get_password_hash("oldpw1", salt),
    )
    token = create_access_token(data={"sub": str(user.uuid)})
    res = await client.post("/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"old_password": "wrongpw", "new_password": "newpw1", "salt_frontend": "deadbeef"})
    assert res.status_code == 401
