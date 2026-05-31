"""Endpoint tests for the salt lookup over the identity model."""

import pytest

from app.core.security import generate_salt, get_password_hash
from app.services.auth_account import create_password_account


@pytest.mark.asyncio
async def test_salt_returns_real_salt_for_known_email(client, db_session):
    """Salt lookup returns the stored frontend salt for a known email."""
    # 'Login User' group is already seeded by the db_session fixture (Task 9b) — do NOT re-add it
    # (a duplicate group makes group_repository.get_by_name raise MultipleResultsFound).
    salt = generate_salt()
    await create_password_account(db_session, email="a@x.com", password_hash=get_password_hash("pw", salt))
    res = await client.get("/api/v1/auth/salt/A@X.com")
    assert res.status_code == 200
    assert res.json()["salt_frontend"] == salt


@pytest.mark.asyncio
async def test_salt_returns_deterministic_fake_for_unknown(client):
    """Salt lookup for an unknown email returns a stable fake salt (anti-enumeration)."""
    r1 = await client.get("/api/v1/auth/salt/ghost@x.com")
    r2 = await client.get("/api/v1/auth/salt/ghost@x.com")
    assert r1.json()["salt_frontend"] == r2.json()["salt_frontend"]  # stable fake salt (anti-enumeration)


@pytest.mark.asyncio
async def test_salt_malformed_email_returns_fake(client):
    """Salt lookup for a malformed email falls through to a 32-char fake salt (no 500)."""
    res = await client.get("/api/v1/auth/salt/not-an-email")
    assert res.status_code == 200
    assert len(res.json()["salt_frontend"]) == 32


@pytest.mark.asyncio
async def test_salt_unknown_email_case_variants_collapse(client):
    """Fix I1: case variants of an unknown email return the SAME fake salt (no case-based enumeration)."""
    upper = await client.get("/api/v1/auth/salt/Ghost@X.com")
    lower = await client.get("/api/v1/auth/salt/ghost@x.com")
    assert upper.status_code == 200
    assert lower.status_code == 200
    assert upper.json()["salt_frontend"] == lower.json()["salt_frontend"]
