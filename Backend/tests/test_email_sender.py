"""Tests for the EmailSender protocol, console impl, and sender selection."""

import logging
from datetime import UTC, datetime

import pytest

from app.messaging.email import (
    ConsoleEmailSender,
    build_contact_verification_email,
    build_password_set_email,
    build_verification_email,
    get_email_sender,
)

CHANGED_AT = datetime(2026, 10, 28, 6, 5, tzinfo=UTC)  # 14:05 in Taiwan
CHANGED_COPY = "你的密碼在 2026/10/28 14:05 變更了。如果不是你自己改的，請馬上到登入頁按「忘記密碼」重設。"


def test_a_changed_password_email_says_when_in_taiwan_time_and_what_to_do():
    """糖's copy (uiux, 2026-10-28, as the SMS's version B), in both bodies; the subject stays."""
    subject, html, text = build_password_set_email("o***r@x.com", changed=True, at=CHANGED_AT)
    assert "已變更" in subject
    assert CHANGED_COPY in text
    assert "你的密碼在 2026/10/28 14:05 變更了" in html
    assert "第三方登入" not in text
    assert "登出所有裝置" not in text


def test_a_first_password_email_keeps_its_copy():
    """Only the change notice was rewritten; a first password still says it was set."""
    subject, _, text = build_password_set_email("o***r@x.com")
    assert "已設定" in subject
    assert "登入密碼已設定" in text


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
