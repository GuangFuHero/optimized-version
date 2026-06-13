"""SMTP2Go transactional-email adapter (HTTP API; works on GCP where SMTP ports are blocked)."""

import base64
import logging
from pathlib import Path

import httpx

from app.core.config import settings

logger = logging.getLogger("app.email")

_SMTP2GO_URL = "https://api.smtp2go.com/v3/email/send"

# Brand logo shipped with the app and embedded as an inline attachment (cid:logo) on every send, so it
# renders in clients without any external image hosting. Encoded once at import; "" if the asset is absent.
_LOGO_PATH = Path(__file__).parent / "assets" / "logo.png"
if _LOGO_PATH.exists():
    _LOGO_B64 = base64.b64encode(_LOGO_PATH.read_bytes()).decode()
else:
    _LOGO_B64 = ""
    logger.warning("logo asset missing at %s; emails will render without the inline logo", _LOGO_PATH)


class Smtp2goEmailSender:
    """Sends email via SMTP2Go's v3 HTTP API using the configured API key."""

    async def send(self, to: str, subject: str, html: str, text: str) -> None:
        """POST one multipart email (HTML + text) to SMTP2Go; raise on non-2xx. Logo rides along as cid."""
        if not settings.SMTP2GO_API_KEY:
            raise RuntimeError("SMTP2GO_API_KEY is required when EMAIL_PROVIDER=smtp2go")
        payload = {
            "sender": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
            "to": [to],
            "subject": subject,
            "html_body": html,
            "text_body": text,
        }
        if _LOGO_B64:
            payload["inlines"] = [{"filename": "logo", "fileblob": _LOGO_B64, "mimetype": "image/png"}]
        headers = {"X-Smtp2go-Api-Key": settings.SMTP2GO_API_KEY, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_SMTP2GO_URL, json=payload, headers=headers)
            resp.raise_for_status()
