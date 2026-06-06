"""Integration tests for the session-based auth flow."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_login_returns_access_and_refresh(fake_redis, make_user):
    """登入應回傳 access + refresh token，且 access TTL 為 900 秒。"""
    _, password, name = await make_user()
    async with _client() as c:
        res = await c.post("/api/v1/auth/login", data={"username": name, "password": password})
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["token_type"] == "bearer" and body["expires_in"] == 900


@pytest.mark.asyncio
async def test_refresh_rotates_and_old_token_dies(fake_redis, make_user):
    """Refresh 應 rotate token，重放舊 token 應回傳 401。"""
    _, password, name = await make_user()
    async with _client() as c:
        login = (await c.post("/api/v1/auth/login",
                              data={"username": name, "password": password})).json()
        old_rt = login["refresh_token"]
        r1 = await c.post("/api/v1/auth/refresh", json={"refresh_token": old_rt})
        assert r1.status_code == 200
        assert r1.json()["refresh_token"] != old_rt
        r2 = await c.post("/api/v1/auth/refresh", json={"refresh_token": old_rt})
        assert r2.status_code == 401


@pytest.mark.asyncio
async def test_refresh_unknown_token_401(fake_redis, make_user):
    """未知的 refresh token 應回傳 401。"""
    async with _client() as c:
        res = await c.post("/api/v1/auth/refresh", json={"refresh_token": "bogus"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_only_current_device(fake_redis, make_user):
    """`/logout` 只撤當前裝置的 session；其他裝置仍可 refresh。"""
    _, password, name = await make_user()
    async with _client() as c:
        s1 = (await c.post("/api/v1/auth/login",
                           data={"username": name, "password": password})).json()
        s2 = (await c.post("/api/v1/auth/login",
                           data={"username": name, "password": password})).json()
        res = await c.post("/api/v1/auth/logout",
                           headers={"Authorization": f"Bearer {s1['access_token']}"})
        assert res.status_code == 204
        # device 1 的 refresh 失效,device 2 仍可用
        r1 = await c.post("/api/v1/auth/refresh", json={"refresh_token": s1["refresh_token"]})
        assert r1.status_code == 401
        r2 = await c.post("/api/v1/auth/refresh", json={"refresh_token": s2["refresh_token"]})
        assert r2.status_code == 200


@pytest.mark.asyncio
async def test_logout_all_revokes_every_session(fake_redis, make_user):
    """`/logout-all` 撤銷該使用者所有 session,所有裝置的 refresh 皆 401。"""
    _, password, name = await make_user()
    async with _client() as c:
        s1 = (await c.post("/api/v1/auth/login",
                           data={"username": name, "password": password})).json()
        s2 = (await c.post("/api/v1/auth/login",
                           data={"username": name, "password": password})).json()
        res = await c.post("/api/v1/auth/logout-all",
                           headers={"Authorization": f"Bearer {s1['access_token']}"})
        assert res.status_code == 204
        for s in (s1, s2):
            r = await c.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]})
            assert r.status_code == 401


@pytest.mark.asyncio
async def test_change_password_wrong_old_returns_401(fake_redis, make_user):
    """提供錯誤的舊密碼應回傳 401。"""
    _, password, name = await make_user()
    async with _client() as c:
        access = (await c.post("/api/v1/auth/login",
                               data={"username": name, "password": password})).json()["access_token"]
        res = await c.post("/api/v1/auth/change-password",
                           headers={"Authorization": f"Bearer {access}"},
                           json={"old_password": "WRONGPW", "new_password": "newhash123",
                                 "salt_frontend": "abc123"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_change_password_success_revokes_sessions(fake_redis, make_user):
    """成功更改密碼後撤銷所有 session，後續 refresh 應回傳 401。"""
    _, password, name = await make_user()
    async with _client() as c:
        login = (await c.post("/api/v1/auth/login",
                              data={"username": name, "password": password})).json()
        access, rt = login["access_token"], login["refresh_token"]
        res = await c.post("/api/v1/auth/change-password",
                           headers={"Authorization": f"Bearer {access}"},
                           json={"old_password": password, "new_password": "newhash123",
                                 "salt_frontend": "abc123"})
        assert res.status_code == 204
        r = await c.post("/api/v1/auth/refresh", json={"refresh_token": rt})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_change_password_then_login_with_new_password(fake_redis, make_user):
    """After changing password, the NEW password must authenticate (write-path check)."""
    _, password, name = await make_user()
    async with _client() as c:
        access = (await c.post("/api/v1/auth/login",
                               data={"username": name, "password": password})).json()["access_token"]
        res = await c.post("/api/v1/auth/change-password",
                           headers={"Authorization": f"Bearer {access}"},
                           json={"old_password": password, "new_password": "brandnewpw1",
                                 "salt_frontend": "deadbeef"})
        assert res.status_code == 204
        relog = await c.post("/api/v1/auth/login",
                             data={"username": name, "password": "brandnewpw1"})
        assert relog.status_code == 200
        assert relog.json()["access_token"] and relog.json()["refresh_token"]
