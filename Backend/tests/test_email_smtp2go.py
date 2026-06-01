"""Tests for the SMTP2Go HTTP-API email adapter."""

import httpx
import pytest

from app.core.email_smtp2go import Smtp2goEmailSender


@pytest.mark.asyncio
async def test_smtp2go_posts_to_api(monkeypatch):
    """send() POSTs to the SMTP2Go v3 endpoint with the api-key header and recipient."""
    captured = {}

    class FakeResp:
        """Stand-in httpx response with a no-op status check."""

        status_code = 200

        def raise_for_status(self):
            """No-op for a 2xx response."""

    class FakeClient:
        """Async context-manager double recording the POST arguments."""

        def __init__(self, *a, **k):
            """Accept and ignore client args."""

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
    monkeypatch.setattr("app.core.email_smtp2go.settings.SMTP2GO_API_KEY", "api-test", raising=False)

    await Smtp2goEmailSender().send("alice@x.com", "Verify", "code 123456")
    assert captured["url"] == "https://api.smtp2go.com/v3/email/send"
    assert captured["headers"]["X-Smtp2go-Api-Key"] == "api-test"
    assert "alice@x.com" in captured["json"]["to"][0]
