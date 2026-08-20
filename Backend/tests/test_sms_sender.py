"""Tests for the SMS sender abstraction."""
import logging

import pytest

from app.messaging.kotsms import KotSmsSender, to_kotsms_number
from app.messaging.sms import (
    ConsoleSmsSender,
    build_password_reset_sms,
    build_sso_notice_sms,
    build_verification_sms,
    get_sms_sender,
)


@pytest.mark.asyncio
async def test_console_sms_logs_code(caplog):
    """ConsoleSmsSender logs the recipient and body."""
    with caplog.at_level(logging.INFO):
        await ConsoleSmsSender().send("+886912345678", "code 123456")
    assert "+886912345678" in caplog.text
    assert "123456" in caplog.text


def test_build_verification_sms_has_code():
    """The SMS body contains the 6-digit code."""
    assert "123456" in build_verification_sms("123456")


@pytest.mark.parametrize("build", [
    lambda: build_verification_sms("123456"),
    lambda: build_password_reset_sms("123456"),
    build_sso_notice_sms,
])
def test_bodies_fit_one_kotsms_point(build):
    """Every body stays within KotSMS's 70-character 1-point bracket and carries the sender identity."""
    body = build()
    assert len(body) <= 70
    assert body.startswith("【島嶼守望】")


def test_get_sms_sender_defaults_to_console(monkeypatch):
    """get_sms_sender returns the console sender by default."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "SMS_PROVIDER", "console")
    assert isinstance(get_sms_sender(), ConsoleSmsSender)


def test_get_sms_sender_returns_kotsms_when_configured(monkeypatch):
    """SMS_PROVIDER=kotsms selects the KotSMS adapter."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "SMS_PROVIDER", "kotsms")
    assert isinstance(get_sms_sender(), KotSmsSender)


@pytest.mark.parametrize(("e164", "expected"), [
    ("+886912345678", "0912345678"),      # TW mobile: 09 prefix, never 8869
    ("+886227923939", "0227923939"),      # TW landline
    ("+8613922223333", "8613922223333"),  # international: country code kept, "+" dropped
])
def test_to_kotsms_number(e164, expected):
    """E.164 is rewritten into the digits-only format KotSMS accepts."""
    assert to_kotsms_number(e164) == expected


@pytest.mark.asyncio
async def test_kotsms_send_without_credentials_raises(monkeypatch):
    """The adapter refuses to run before the credentials are configured."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "KOTSMS_USERNAME", "")
    monkeypatch.setattr(settings, "KOTSMS_PASSWORD", "")
    with pytest.raises(RuntimeError, match="KOTSMS_USERNAME"):
        await KotSmsSender().send("+886912345678", "code 123456")


class _FakeResponse:
    """Stands in for an httpx response carrying a canned KotSMS reply body."""

    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        """Match httpx's interface; the canned replies are always transport-level 200s."""
        return None


def _capture_kotsms_post(monkeypatch, reply):
    """Point the adapter's httpx client at a canned reply and record what it posted."""
    sent = {}

    class _FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def post(self, url, params=None, data=None):
            sent["url"] = url
            sent["params"] = params
            sent["data"] = data
            return _FakeResponse(reply)

    monkeypatch.setattr("app.messaging.kotsms.httpx.AsyncClient", _FakeClient)
    return sent


@pytest.fixture
def kotsms_credentials(monkeypatch):
    """Configure dummy credentials so the adapter gets past its guard."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "KOTSMS_USERNAME", "user")
    monkeypatch.setattr(settings, "KOTSMS_PASSWORD", "pass")


@pytest.mark.asyncio
@pytest.mark.parametrize("statuscode", ["0", "1", "2", "4"])
async def test_kotsms_send_accepts_delivery_statuscodes(monkeypatch, kotsms_credentials, statuscode):
    """0/1/2/4 are the 附錄二 codes meaning the message was taken; none may raise."""
    _capture_kotsms_post(monkeypatch, f"[1]\nmsgid=123\nstatuscode={statuscode}\n")

    await KotSmsSender().send("+886912345678", "code 123456")


@pytest.mark.asyncio
@pytest.mark.parametrize(("statuscode", "expected"), [
    ("e", "帳號、密碼錯誤"),
    ("k", "無效的連線位址"),
    ("p", "沒有權限使用外部 Http 程式"),
    ("6", "門號有錯誤"),
    ("8", "逾時無送達"),
])
async def test_kotsms_send_raises_on_failure_statuscode(
        monkeypatch, kotsms_credentials, statuscode, expected):
    """A failing statuscode must surface — swallowing it would lose the user's OTP silently."""
    _capture_kotsms_post(monkeypatch, f"[1]\nstatuscode={statuscode}\n")

    with pytest.raises(RuntimeError, match=expected):
        await KotSmsSender().send("+886912345678", "code 123456")


@pytest.mark.asyncio
async def test_kotsms_send_raises_on_missing_statuscode(monkeypatch, kotsms_credentials):
    """An unparseable reply is a failure; treating it as success would drop the OTP."""
    _capture_kotsms_post(monkeypatch, "unexpected body\n")

    with pytest.raises(RuntimeError):
        await KotSmsSender().send("+886912345678", "code 123456")


@pytest.mark.asyncio
async def test_kotsms_send_posts_local_number_and_utf8(monkeypatch, kotsms_credentials):
    """The wire payload carries the local-format number and asks for UTF-8 handling."""
    sent = _capture_kotsms_post(monkeypatch, "[1]\nmsgid=1\nstatuscode=1\n")

    await KotSmsSender().send("+886912345678", "code 123456")

    assert sent["data"]["dstaddr"] == "0912345678"
    assert sent["params"] == {"CharsetURL": "UTF8"}


@pytest.mark.asyncio
async def test_kotsms_send_uses_a_fresh_clientid_each_time(monkeypatch, kotsms_credentials):
    """A repeated clientid within 12h makes the API replay the old result and swallow a resent OTP."""
    seen = set()
    for _ in range(2):
        sent = _capture_kotsms_post(monkeypatch, "[1]\nmsgid=1\nstatuscode=1\n")
        await KotSmsSender().send("+886912345678", "code 123456")
        seen.add(sent["data"]["clientid"])

    assert len(seen) == 2
