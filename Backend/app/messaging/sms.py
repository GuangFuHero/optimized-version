"""SMS delivery: abstract sender + dev console impl. Real delivery goes through 簡訊王 (kotsms)."""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger("app.sms")

# Sender identity required by Taiwan's 簡訊實名制 (in force since 2025-11-01): every SMS must carry the
# sender's identity, and the string MUST match the one KotSMS approved for this account character for
# character (full/half width, case, punctuation) or the carriers drop the message. Bodies stay Chinese-only
# and under 70 chars so each send costs 1 point instead of 2.
_BRAND_ZH = "島嶼守望"


class SmsSender(Protocol):
    """Sends a single SMS message."""

    async def send(self, to: str, body: str) -> None:
        """Deliver an SMS; raise on hard failure."""
        ...


class ConsoleSmsSender:
    """Dev/test sender: logs the SMS instead of delivering it (no provider, no cost)."""

    async def send(self, to: str, body: str) -> None:
        """Log the SMS so the OTP is visible in dev."""
        logger.info("SMS to=%s\n%s", to, body)


def build_verification_sms(code: str) -> str:
    """Return the SMS body carrying a verification code (register + add-contact)."""
    return f"【{_BRAND_ZH}】您的驗證碼是 {code}，10 分鐘內有效。"


def build_password_reset_sms(code: str) -> str:
    """Return the SMS body carrying a password-reset code."""
    return f"【{_BRAND_ZH}】您的密碼重設驗證碼是 {code}，10 分鐘內有效。"


def build_sso_notice_sms() -> str:
    """Return the SMS telling an SSO-only user there is no password to reset (no code)."""
    return f"【{_BRAND_ZH}】此帳號使用第三方登入，無密碼可重設，請改用該服務登入。"


def get_sms_sender() -> SmsSender:
    """FastAPI dependency selecting the configured SMS sender."""
    if settings.SMS_PROVIDER == "kotsms":
        from app.messaging.kotsms import KotSmsSender  # noqa: PLC0415 — optional adapter
        return KotSmsSender()
    return ConsoleSmsSender()
