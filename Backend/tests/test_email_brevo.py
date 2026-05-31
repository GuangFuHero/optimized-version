"""Tests for the Brevo HTTPS-API email adapter."""

import httpx
import pytest

from app.core.email_brevo import BrevoEmailSender


@pytest.mark.asyncio
async def test_brevo_posts_to_api(monkeypatch):
    """BrevoEmailSender POSTs the right URL, payload, and api-key header."""
    captured = {}

    class FakeResp:
        """Stand-in httpx response with a no-op status check."""

        status_code = 201

        def raise_for_status(self):
            """Pretend the request succeeded."""

    class FakeClient:
        """Async context-manager double recording the POST arguments."""

        def __init__(self, *a, **k):
            """Accept and ignore any client construction arguments."""

        async def __aenter__(self):
            """Enter the async context and return self."""
            return self

        async def __aexit__(self, *a):
            """Exit the async context without suppressing exceptions."""
            return False

        async def post(self, url, json, headers):
            """Record the POST arguments and return a fake response."""
            captured["url"], captured["json"], captured["headers"] = url, json, headers
            return FakeResp()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr("app.core.email_brevo.settings.BREVO_API_KEY", "test-key", raising=False)

    await BrevoEmailSender().send("alice@x.com", "Verify", "link")
    assert captured["url"] == "https://api.brevo.com/v3/smtp/email"
    assert captured["json"]["to"][0]["email"] == "alice@x.com"
    assert captured["headers"]["api-key"] == "test-key"
