"""Headers and routes every HTTP response shares, independent of any endpoint's logic."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def http():
    """A client for routes that touch neither the database nor redis."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_preflight_allows_any_origin_without_credentials(http):
    """A wildcard origin must never be paired with credentials, which would let any site act as the user."""
    resp = await http.options(
        "/graphql",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in resp.headers


async def test_cookie_bearing_request_is_not_allowed_credentials(http):
    """A cookie does not earn credentials.

    Starlette reflects the request's origin when a cookie is sent, but without the credentials
    header a browser still withholds the response from the calling page.
    """
    resp = await http.get("/health", headers={"Origin": "https://evil.example", "Cookie": "session=x"})
    assert resp.status_code == 200
    assert "access-control-allow-credentials" not in resp.headers
