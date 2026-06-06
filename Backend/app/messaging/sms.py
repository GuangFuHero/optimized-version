"""SMS delivery: abstract sender + dev console impl. Real provider (Twilio/SNS) deferred."""

import logging
from typing import Protocol

logger = logging.getLogger("app.sms")


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
    """Return the SMS body carrying a verification code."""
    return f"Your verification code is {code}. It expires in 10 minutes."


def build_password_reset_sms(code: str) -> str:
    """Return the SMS body carrying a password-reset code."""
    return f"Your password reset code is {code}. It expires in 10 minutes."


def build_sso_notice_sms() -> str:
    """Return the SMS body telling an SSO-only user there is no password to reset (no code)."""
    return ("This account uses a third-party login and has no password set. "
            "Please sign in with that provider.")


def get_sms_sender() -> SmsSender:
    """FastAPI dependency selecting the configured SMS sender (console for now)."""
    return ConsoleSmsSender()
