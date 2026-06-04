"""Email delivery: abstract sender with a dev console impl and a SMTP2Go HTTP-API impl.

GCP blocks outbound SMTP ports, so production uses an HTTP API provider (SMTP2Go), never SMTP.
"""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger("app.email")


class EmailSender(Protocol):
    """Sends a single transactional email."""

    async def send(self, to: str, subject: str, body: str) -> None:
        """Deliver an email; raise on hard failure."""
        ...


class ConsoleEmailSender:
    """Dev/test sender: logs the email instead of delivering it (no signup, no SMTP)."""

    async def send(self, to: str, subject: str, body: str) -> None:
        """Log the email so the verification code is visible in dev."""
        logger.info("EMAIL to=%s subject=%s\n%s", to, subject, body)


def build_verification_email(code: str) -> tuple[str, str]:
    """Return (subject, body) for an email carrying a 6-digit verification code."""
    subject = "Your verification code"
    body = (
        f"Your verification code is {code}\n\n"
        "Enter it to finish creating your account. It expires in 10 minutes.\n"
        "If you did not request this, ignore this email."
    )
    return subject, body


def build_password_reset_email(code: str) -> tuple[str, str]:
    """Return (subject, body) for an email carrying a 6-digit password-reset code."""
    subject = "Reset your password"
    body = (
        f"Your password reset code is {code}\n\n"
        "Enter it to set a new password. It expires in 10 minutes.\n"
        "If you did not request this, ignore this email."
    )
    return subject, body


def build_sso_notice_email() -> tuple[str, str]:
    """Return (subject, body) telling an SSO-only user there is no password to reset (no code)."""
    subject = "Password reset"
    body = (
        "This account signs in with a third-party login and has no password set.\n"
        "Please sign in with the provider you used; you can set a password afterwards.\n"
        "If you did not request this, ignore this email."
    )
    return subject, body


def get_email_sender() -> EmailSender:
    """FastAPI dependency selecting the configured email sender."""
    if settings.EMAIL_PROVIDER == "smtp2go":
        from app.core.email_smtp2go import Smtp2goEmailSender  # noqa: PLC0415 — optional adapter
        return Smtp2goEmailSender()
    return ConsoleEmailSender()
