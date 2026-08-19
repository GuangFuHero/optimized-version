"""SMS delivery: abstract sender + dev console impl. Real provider (Twilio/SNS) deferred."""

import logging
from typing import Protocol

logger = logging.getLogger("app.sms")

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
    """Return the bilingual SMS body carrying a verification code (register + add-contact)."""
    return (f"【{_BRAND_ZH}】您的驗證碼是 {code}，10 分鐘內有效。 "
            f"Your verification code is {code}, expires in 10 minutes.")


def build_password_reset_sms(code: str) -> str:
    """Return the bilingual SMS body carrying a password-reset code."""
    return (f"【{_BRAND_ZH}】您的密碼重設驗證碼是 {code}，10 分鐘內有效。 "
            f"Your password reset code is {code}, expires in 10 minutes.")


def build_sso_notice_sms() -> str:
    """Return the bilingual SMS telling an SSO-only user there is no password to reset (no code)."""
    return (f"【{_BRAND_ZH}】此帳號使用第三方登入，無密碼可重設，請改用該服務登入。 "
            "This account uses a third-party login and has no password set; "
            "please sign in with that provider.")


def get_sms_sender() -> SmsSender:
    """FastAPI dependency selecting the configured SMS sender (console for now)."""
    return ConsoleSmsSender()


def build_contact_changed_sms(masked_new_value: str) -> str:
    """Return the bilingual SMS telling the OLD channel that the contact was replaced.

    The new value arrives masked (ADR-087): enough for the owner to recognise, not enough to
    hand the full address to whoever else reads a forwarded message.
    """
    return (f"【{_BRAND_ZH}】您的聯絡方式已變更為 {masked_new_value}。若非本人操作請立即聯繫我們。 "
            f"Your contact was changed to {masked_new_value}. "
            "If this was not you, contact us immediately.")
