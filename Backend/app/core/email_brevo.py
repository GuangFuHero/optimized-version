"""Brevo transactional-email adapter (HTTPS API; works on GCP where SMTP ports are blocked)."""

import httpx

from app.core.config import settings

_BREVO_URL = "https://api.brevo.com/v3/smtp/email"


class BrevoEmailSender:
    """Sends email via Brevo's REST API using the configured API key."""

    async def send(self, to: str, subject: str, body: str) -> None:
        """POST one transactional email to Brevo; raise on non-2xx."""
        payload = {
            "sender": {"email": settings.EMAIL_FROM, "name": settings.EMAIL_FROM_NAME},
            "to": [{"email": to}],
            "subject": subject,
            "textContent": body,
        }
        headers = {"api-key": settings.BREVO_API_KEY, "content-type": "application/json"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_BREVO_URL, json=payload, headers=headers)
            resp.raise_for_status()
