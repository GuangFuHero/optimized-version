"""Email delivery: abstract sender with a dev console impl and a SMTP2Go HTTP-API impl.

GCP blocks outbound SMTP ports, so production uses an HTTP API provider (SMTP2Go), never SMTP.

Builders return ``(subject, html, text)``: a branded HTML body for normal clients plus a plain-text
fallback for clients that strip HTML and for spam-filter friendliness. All CSS is inlined because email
clients routinely drop ``<style>`` blocks, and the brand logo is referenced as ``cid:logo`` (sent as an
inline attachment by the SMTP2Go adapter) so it renders without any external image hosting.
"""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger("app.email")

_BRAND_ZH = "島嶼守望"

# --- inline style fragments (email clients strip <style> blocks, so every rule lives on the element) ---
# Font names use SINGLE quotes: the style="..." attribute is double-quoted, so double-quoted font names
# would prematurely close the attribute and make clients (Gmail) drop the whole declaration.
_FONT = ("'Noto Sans TC','Nunito',-apple-system,'Segoe UI',Roboto,"
         "'PingFang TC','Microsoft JhengHei',Arial,sans-serif")
_S_WRAP = "max-width:560px;margin:0 auto;"
_S_LOGO = "margin:0 0 12px;padding:0 4px;"
_S_LOGO_IMG = "vertical-align:middle;display:inline-block;"
_S_LOGO_BRAND = (f"vertical-align:middle;display:inline-block;margin-left:8px;color:#0f172a;"
                 f"font-size:22px;font-weight:700;letter-spacing:1px;font-family:{_FONT};")
_S_CARD = ("background:#ffffff;border:1px solid #DCC1B1;border-radius:32px;overflow:hidden;"
           "box-shadow:0 4px 20px rgba(227,121,30,0.10);")
_S_BODY = f"padding:32px 32px 28px;font-family:{_FONT};"
_S_H1 = f"margin:0 0 24px;font-size:22px;line-height:1.35;color:#151C22;font-weight:700;font-family:{_FONT};"
_S_P_ZH = f"margin:0 0 2px;font-size:15px;color:#006685;font-weight:700;font-family:{_FONT};"
_S_P_EN = f"margin:0 0 14px;font-size:13px;color:#006685;font-family:{_FONT};"
_S_CODEBOX = "background:#EDF4FD;border:1px solid #DCC1B1;text-align:center;padding:20px;margin:0 0 24px;"
_S_CODE = f"font-size:38px;font-weight:700;letter-spacing:10px;color:#151C22;font-family:{_FONT};"
_S_NOTICE = f"margin:0 0 20px;font-size:14px;line-height:1.4;color:#564337;font-family:{_FONT};"
_S_NOTICE_LAST = f"margin:0;font-size:14px;line-height:1.4;color:#564337;font-family:{_FONT};"
_S_NOTICE_EN = "color:#564337;font-size:13px;"
_S_FOOTER = "border-top:1px solid #DCC1B1;padding:16px 32px;text-align:center;background:#E1E9F1;"
_S_FOOTER_P = f"margin:0;font-size:12px;line-height:1.4;color:#897365;font-family:{_FONT};"
_S_FOOTER_P2 = f"margin:16px 0 0;font-size:12px;line-height:1.4;color:#897365;font-family:{_FONT};"

_FOOTER_BRAND = f"{_BRAND_ZH} Wan Guard · 本郵件由系統自動發送，請勿直接回覆"


class EmailSender(Protocol):
    """Sends a single transactional email with an HTML body and a plain-text fallback."""

    async def send(self, to: str, subject: str, html: str, text: str) -> None:
        """Deliver an email; raise on hard failure."""
        ...


class ConsoleEmailSender:
    """Dev/test sender: logs the plain-text body instead of delivering it (no signup, no SMTP)."""

    async def send(self, to: str, subject: str, html: str, text: str) -> None:
        """Log the plain-text body so the verification code is visible in dev."""
        logger.info("EMAIL to=%s subject=%s\n%s", to, subject, text)


def _notice(zh: str, en: str) -> str:
    """Combine a Chinese line and its English line into one notice paragraph (zh on top)."""
    return f'{zh}<br><span style="{_S_NOTICE_EN}">{en}</span>'


def _render_email(*, h1: str, notices: list[str], footer_lines: list[str],
                  intro: tuple[str, str] | None = None, code: str | None = None) -> str:
    """Assemble the branded, fully-inlined HTML body shared by every email."""
    parts: list[str] = []
    if intro is not None:
        zh, en = intro
        parts.append(f'<p style="{_S_P_ZH}">{zh}</p>')
        parts.append(f'<p style="{_S_P_EN}">{en}</p>')
    if code is not None:
        parts.append(f'<div style="{_S_CODEBOX}"><span style="{_S_CODE}">{code}</span></div>')
    for i, note in enumerate(notices):
        style = _S_NOTICE_LAST if i == len(notices) - 1 else _S_NOTICE
        parts.append(f'<p style="{style}">{note}</p>')
    footer = "".join(
        f'<p style="{_S_FOOTER_P if i == 0 else _S_FOOTER_P2}">{line}</p>'
        for i, line in enumerate(footer_lines)
    )
    return (
        f'<div style="{_S_WRAP}">'
        f'<div style="{_S_LOGO}">'
        f'<img src="cid:logo" width="22" height="22" alt="{_BRAND_ZH}" style="{_S_LOGO_IMG}">'
        f'<span style="{_S_LOGO_BRAND}">{_BRAND_ZH}</span>'
        f'</div>'
        f'<div style="{_S_CARD}">'
        f'<div style="{_S_BODY}">'
        f'<h1 style="{_S_H1}">{h1}</h1>'
        f'{"".join(parts)}'
        f'</div>'
        f'<div style="{_S_FOOTER}">{footer}</div>'
        f'</div>'
        f'</div>'
    )


def build_verification_email(code: str) -> tuple[str, str, str]:
    """Return (subject, html, text) for the registration verification code."""
    subject = f"【{_BRAND_ZH}】您的 OTP 驗證碼 Your verification code"
    html = _render_email(
        h1="請驗證您的身分 Verify your identity",
        intro=("以下是您的驗證碼：", "Here is your verification code:"),
        code=code,
        notices=[
            _notice("此驗證碼 <strong>10 分鐘</strong>內有效，請輸入以完成註冊。",
                    "This code is valid for <strong>10 minutes</strong>. "
                    "Enter it to finish creating your account."),
            _notice("<strong>請勿將此驗證碼提供給任何人</strong>，我們絕不會以電話或郵件向您索取。",
                    "<strong>Please don't share this code with anyone</strong> — "
                    "we'll never ask for it by phone or email."),
        ],
        footer_lines=[
            ("您會收到這封郵件，是因為有人為此地址請求驗證碼。若這不是您本人，請忽略本郵件。<br>"
             "You received this because a verification code was requested for this address. "
             "If this wasn't you, ignore it."),
            _FOOTER_BRAND,
        ],
    )
    text = (
        f"您的驗證碼是 {code}\n"
        "請於 10 分鐘內輸入此驗證碼以完成註冊。\n"
        "若您並未提出此請求，請忽略本郵件。\n\n"
        f"Your verification code is {code}\n"
        "Enter it within 10 minutes to finish creating your account.\n"
        "If you did not request this, please ignore this email."
    )
    return subject, html, text


def build_contact_verification_email(code: str) -> tuple[str, str, str]:
    """Return (subject, html, text) for verifying a newly added email contact (already logged in)."""
    subject = f"【{_BRAND_ZH}】您的 OTP 驗證碼 Your verification code"
    html = _render_email(
        h1="驗證您的電子郵件 Verify your email",
        intro=("以下是您的驗證碼：", "Here is your verification code:"),
        code=code,
        notices=[
            _notice("此驗證碼 <strong>10 分鐘</strong>內有效，請輸入以驗證此電子郵件地址。",
                    "This code is valid for <strong>10 minutes</strong>. "
                    "Enter it to verify this email address."),
            _notice("<strong>請勿將此驗證碼提供給任何人。</strong>",
                    "<strong>Please don't share this code with anyone.</strong>"),
        ],
        footer_lines=[
            "若您並未提出此請求，請忽略本郵件。 If you did not request this, ignore this email.",
            _FOOTER_BRAND,
        ],
    )
    text = (
        f"您的驗證碼是 {code}\n"
        "請於 10 分鐘內輸入此驗證碼以驗證此電子郵件地址。\n"
        "若您並未提出此請求，請忽略本郵件。\n\n"
        f"Your verification code is {code}\n"
        "Enter it within 10 minutes to verify this email address.\n"
        "If you did not request this, please ignore this email."
    )
    return subject, html, text


def build_password_reset_email(code: str) -> tuple[str, str, str]:
    """Return (subject, html, text) for the password-reset code."""
    subject = f"【{_BRAND_ZH}】重設您的密碼 Reset your password"
    html = _render_email(
        h1="重設您的密碼 Reset your password",
        intro=("以下是您的密碼重設驗證碼：", "Here is your password reset code:"),
        code=code,
        notices=[
            _notice("此驗證碼 <strong>10 分鐘</strong>內有效，請輸入以設定新密碼。",
                    "This code is valid for <strong>10 minutes</strong>. Enter it to set a new password."),
            _notice("<strong>請勿將此驗證碼提供給任何人。</strong>",
                    "<strong>Please don't share this code with anyone.</strong>"),
        ],
        footer_lines=[
            ("若您並未提出此請求，請忽略本郵件，您的密碼不會變更。<br>"
             "If you did not request this, ignore this email; your password stays unchanged."),
            _FOOTER_BRAND,
        ],
    )
    text = (
        f"您的密碼重設驗證碼是 {code}\n"
        "請於 10 分鐘內輸入此驗證碼以設定新密碼。\n"
        "若您並未提出此請求，請忽略本郵件。\n\n"
        f"Your password reset code is {code}\n"
        "Enter it within 10 minutes to set a new password.\n"
        "If you did not request this, please ignore this email."
    )
    return subject, html, text


def build_sso_notice_email() -> tuple[str, str, str]:
    """Return (subject, html, text) telling an SSO-only user there is no password to reset (no code)."""
    subject = f"【{_BRAND_ZH}】關於密碼重設 Password reset"
    html = _render_email(
        h1="關於密碼重設 Password reset",
        notices=[
            "此帳號使用第三方登入，並未設定密碼。請使用您當初登入的第三方服務進行登入；登入後即可設定密碼。",
            ('<span style="' + _S_NOTICE_EN + '">This account signs in with a third-party login and has '
             'no password set. Please sign in with the provider you used; you can set a password '
             'afterwards.</span>'),
        ],
        footer_lines=[
            "若您並未提出此請求，請忽略本郵件。 If you did not request this, ignore this email.",
            _FOOTER_BRAND,
        ],
    )
    text = (
        "此帳號使用第三方登入，並未設定密碼。\n"
        "請使用您當初登入的第三方服務進行登入；登入後即可設定密碼。\n"
        "若您並未提出此請求，請忽略本郵件。\n\n"
        "This account signs in with a third-party login and has no password set.\n"
        "Please sign in with the provider you used; you can set a password afterwards.\n"
        "If you did not request this, please ignore this email."
    )
    return subject, html, text


def get_email_sender() -> EmailSender:
    """FastAPI dependency selecting the configured email sender."""
    if settings.EMAIL_PROVIDER == "smtp2go":
        from app.messaging.smtp2go import Smtp2goEmailSender  # noqa: PLC0415 — optional adapter
        return Smtp2goEmailSender()
    return ConsoleEmailSender()
