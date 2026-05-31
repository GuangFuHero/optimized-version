"""Tests for the EmailSender protocol, console impl, and sender selection."""

import logging

import pytest

from app.core.email import ConsoleEmailSender, build_verification_email, get_email_sender


@pytest.mark.asyncio
async def test_console_sender_logs_link(caplog):
    """ConsoleEmailSender logs the recipient and the verification link."""
    sender = ConsoleEmailSender()
    with caplog.at_level(logging.INFO):
        await sender.send("alice@x.com", "Verify", "https://app/verify?token=abc")
    assert "alice@x.com" in caplog.text
    assert "token=abc" in caplog.text


def test_build_verification_email_has_link():
    """The built verification email contains the verify URL and a subject."""
    subject, body = build_verification_email("https://app/verify?token=abc")
    assert "https://app/verify?token=abc" in body
    assert subject


def test_get_email_sender_defaults_to_console(monkeypatch):
    """get_email_sender returns a ConsoleEmailSender for the console provider."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "console")
    assert isinstance(get_email_sender(), ConsoleEmailSender)


def test_get_email_sender_returns_brevo_when_configured(monkeypatch):
    """get_email_sender returns the Brevo adapter when EMAIL_PROVIDER is 'brevo'."""
    from app.core.config import settings
    from app.core.email_brevo import BrevoEmailSender

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "brevo")
    assert isinstance(get_email_sender(), BrevoEmailSender)
