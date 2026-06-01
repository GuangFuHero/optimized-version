"""Tests for the SMS sender abstraction."""
import logging

import pytest

from app.core.sms import ConsoleSmsSender, build_verification_sms, get_sms_sender


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


def test_get_sms_sender_defaults_to_console(monkeypatch):
    """get_sms_sender returns the console sender by default."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "SMS_PROVIDER", "console")
    assert isinstance(get_sms_sender(), ConsoleSmsSender)
