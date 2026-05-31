"""Email delivery: abstract sender with a dev console impl and a Brevo HTTPS-API impl.

GCP blocks outbound SMTP ports, so production uses an HTTPS API provider (Brevo), never SMTP.
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
        """Log the email so the verification link is visible in dev."""
        logger.info("EMAIL to=%s subject=%s\n%s", to, subject, body)


def build_verification_email(verify_url: str) -> tuple[str, str]:
    """Return (subject, body) for an account-verification email."""
    subject = "Verify your email"
    body = (
        "Welcome! Confirm your email to finish creating your account:\n\n"
        f"{verify_url}\n\n"
        "This link expires in 30 minutes. If you did not request this, ignore this email."
    )
    return subject, body


def get_email_sender() -> EmailSender:
    """FastAPI dependency selecting the configured email sender."""
    if settings.EMAIL_PROVIDER == "brevo":
        from app.core.email_brevo import BrevoEmailSender  # noqa: PLC0415 — optional adapter
        return BrevoEmailSender()
    return ConsoleEmailSender()
