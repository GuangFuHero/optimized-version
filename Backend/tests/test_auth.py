"""Integration tests for authentication endpoints: register, verify, login, and salt retrieval."""

import os
import uuid

import pytest

# 強制設定為測試環境，避開全域 Rate Limit
os.environ["ENV"] = "testing"

from app.core import security


@pytest.mark.asyncio
async def test_auth_full_flow(client, capture_email):
    """測試完整的註冊 -> 驗證信箱 -> 登入流程 (Happy Path)."""
    email = f"user_{uuid.uuid4().hex[:6]}@t.local"
    password = "pw123456"

    # 1. 註冊 (verify-then-create) -> 202
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": email, "password": password, "salt_frontend": "abc"},
    )
    assert reg_res.status_code == 202

    # 2. 從擷取的驗證信中讀出 token 並驗證信箱
    token = capture_email.last_token
    assert token
    verify_res = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verify_res.status_code == 200
    assert "access_token" in verify_res.json()
    assert "refresh_token" in verify_res.json()

    # 3. 以 email 登入
    login_res = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()


@pytest.mark.asyncio
async def test_registration_conflict_409(client, capture_email):
    """測試重複註冊已驗證的信箱應回傳 409."""
    email = f"conflict_{uuid.uuid4().hex[:6]}@t.local"
    payload = {"type": "email", "value": email, "password": "pw123456", "salt_frontend": "abc"}

    # 第一次註冊 + 驗證，帳號就會存在
    await client.post("/api/v1/auth/register", json=payload)
    token = capture_email.last_token
    await client.post("/api/v1/auth/verify-email", json={"token": token})

    # 再次以相同信箱註冊 -> 409
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_login_failures(client):
    """測試各種登入失敗情況."""
    # 案例 1: 帳號不存在 / 密碼錯誤
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "any_user", "password": "wrong_password"},
    )
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_malformed_password_logic():
    """測試 security 核心對損毀密碼字串的處理."""
    # 缺少分割符號
    assert security.verify_password("p", "invalid_string") is False
    # 分割部分不足
    assert security.verify_password("p", "pbkdf2_sha256$600000$salt") is False
