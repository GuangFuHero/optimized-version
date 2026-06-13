"""Tests for the EmailSender protocol, console impl, and sender selection."""

import logging

import pytest

from app.messaging.email import (
    ConsoleEmailSender,
    build_contact_verification_email,
    build_verification_email,
    get_email_sender,
)


@pytest.mark.asyncio
async def test_console_sender_logs_text_body(caplog):
    """ConsoleEmailSender logs the recipient and the plain-text body (not the HTML)."""
    sender = ConsoleEmailSender()
    with caplog.at_level(logging.INFO):
        await sender.send("alice@x.com", "Verify", "<p>html 123456</p>", "code 123456")
    assert "alice@x.com" in caplog.text
    assert "code 123456" in caplog.text


def test_build_verification_email_has_code():
    """The verification email carries the code in both HTML and text, plus a subject."""
    subject, html, text = build_verification_email("123456")
    assert "123456" in html
    assert "123456" in text
    assert subject


def test_build_contact_verification_email_has_code_and_distinct_copy():
    """The add-contact email carries the code and uses verify-contact wording, not 'create account'."""
    subject, html, text = build_contact_verification_email("123456")
    assert "123456" in html
    assert "123456" in text
    assert subject
    assert "完成註冊" not in text  # add-contact must not claim account creation
    assert "驗證此電子郵件" in text


def test_get_email_sender_defaults_to_console(monkeypatch):
    """get_email_sender returns a ConsoleEmailSender for the console provider."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "console")
    assert isinstance(get_email_sender(), ConsoleEmailSender)


def test_get_email_sender_returns_smtp2go_when_configured(monkeypatch):
    """get_email_sender returns the SMTP2Go adapter when EMAIL_PROVIDER is 'smtp2go'."""
    from app.core.config import settings
    from app.messaging.smtp2go import Smtp2goEmailSender

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp2go")
    assert isinstance(get_email_sender(), Smtp2goEmailSender)
