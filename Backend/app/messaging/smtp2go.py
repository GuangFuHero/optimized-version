"""SMTP2Go transactional-email adapter (HTTP API; works on GCP where SMTP ports are blocked)."""

import httpx

from app.core.config import settings

_SMTP2GO_URL = "https://api.smtp2go.com/v3/email/send"


class Smtp2goEmailSender:
    """Sends email via SMTP2Go's v3 HTTP API using the configured API key."""

    async def send(self, to: str, subject: str, body: str) -> None:
        """POST one email to SMTP2Go; raise on non-2xx. `to` uses 'Name <addr>' or bare address."""
        payload = {
            "sender": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
            "to": [to],
            "subject": subject,
            "text_body": body,
        }
        headers = {"X-Smtp2go-Api-Key": settings.SMTP2GO_API_KEY, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_SMTP2GO_URL, json=payload, headers=headers)
            resp.raise_for_status()
