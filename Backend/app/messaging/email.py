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


def build_contact_changed_email(masked_new_value: str) -> tuple[str, str, str]:
    """Return (subject, html, text) telling the OLD address that the contact was replaced.

    Sent to the address being replaced, not the new one — this is the only mechanism that
    lets a victim of session theft notice the takeover attempt (ADR-085). The new value is
    masked so a forwarded copy does not leak it in full.
    """
    subject = f"【{_BRAND_ZH}】聯絡方式已變更 Contact changed"
    html = _render_email(
        h1="聯絡方式已變更 Contact changed",
        notices=[
            f"您帳號的聯絡方式已變更為 {masked_new_value}。",
            ('<span style="' + _S_NOTICE_EN + '">Your account contact was changed to '
             f'{masked_new_value}.</span>'),
        ],
        footer_lines=[
            "若非本人操作，請立即聯繫我們。 If this was not you, contact us immediately.",
            _FOOTER_BRAND,
        ],
    )
    text = (
        f"您帳號的聯絡方式已變更為 {masked_new_value}。\n"
        f"Your account contact was changed to {masked_new_value}.\n"
        "若非本人操作，請立即聯繫我們。\n"
    )
    return subject, html, text


def build_contact_removed_email(removed_type: str, masked_value: str) -> tuple[str, str, str]:
    """Return (subject, html, text) telling the surviving channels that a contact was removed.

    Removal is as sensitive as replacement — it drops a way back into the account — so it is
    announced the same way (ADR-159). The removed value is masked for the same reason the
    replacement notice masks the new one.
    """
    label = "電子信箱 email" if removed_type == "email" else "手機號碼 phone"
    subject = f"【{_BRAND_ZH}】聯絡方式已移除 Contact removed"
    html = _render_email(
        h1="聯絡方式已移除 Contact removed",
        notices=[
            f"您帳號的{label} {masked_value} 已從帳號移除。",
            ('<span style="' + _S_NOTICE_EN + '">The '
             f'{removed_type} {masked_value} was removed from your account.</span>'),
        ],
        footer_lines=[
            "若非本人操作，請立即聯繫我們。 If this was not you, contact us immediately.",
            _FOOTER_BRAND,
        ],
    )
    text = (
        f"您帳號的{label} {masked_value} 已從帳號移除。\n"
        f"The {removed_type} {masked_value} was removed from your account.\n"
        "若非本人操作，請立即聯繫我們。\n"
    )
    return subject, html, text


_STEP_UP_ACTION_ZH = {"replace": "更換", "remove": "移除"}
_STEP_UP_ACTION_EN = {"replace": "change", "remove": "remove"}
# `set_password` is not a change to the contact it is sent to — it authorizes minting a
# permanent credential on the account that contact belongs to (ADR-215).
SET_PASSWORD_ACTION = "set_password"


def build_step_up_code_email(
    action: str, contact_type: str, code: str, masked_target: str | None = None
) -> tuple[str, str, str]:
    """Return (subject, html, text) for a step-up code sent to the address being changed.

    Distinct from `build_contact_verification_email` on purpose (ADR-164). That one says
    "enter this to verify this email address", which describes the opposite of what this code
    authorizes — the recipient is being asked to approve *losing* this address. For a session
    -theft victim this message is the one moment where a warning prevents the takeover instead
    of reporting it afterwards, so it names the action and, for a replacement, the value the
    address would be replaced with.
    """
    label = "電子信箱 email" if contact_type == "email" else "手機號碼 phone"
    if action == SET_PASSWORD_ACTION:
        zh_what = "為此帳號設定登入密碼"
        en_what = "set a sign-in password on this account"
        heading = "請確認密碼設定 Confirm a password setup"
    elif action == "replace":
        zh_what = f"將此{label}{_STEP_UP_ACTION_ZH[action]}為 {masked_target}"
        en_what = f"{_STEP_UP_ACTION_EN[action]} this {contact_type} to {masked_target}"
        heading = "請確認聯絡方式變更 Confirm a contact change"
    else:
        zh_what = f"將此{label}從帳號{_STEP_UP_ACTION_ZH[action]}"
        en_what = f"{_STEP_UP_ACTION_EN[action]} this {contact_type} from the account"
        heading = "請確認聯絡方式變更 Confirm a contact change"
    subject = f"【{_BRAND_ZH}】{heading}"
    html = _render_email(
        h1=heading,
        intro=(f"有人正在要求{zh_what}。若這是您本人，請使用以下驗證碼：",
               f"Someone is asking to {en_what}. If this is you, use this code:"),
        code=code,
        notices=[
            _notice(f"此驗證碼 <strong>10 分鐘</strong>內有效，且僅能用於{zh_what}。",
                    "This code is valid for <strong>10 minutes</strong> and authorizes "
                    f"only one thing: to {en_what}."),
            _notice("<strong>若這不是您本人的操作，請勿提供此驗證碼給任何人</strong>——"
                    "有人可能已經取得您帳號的登入狀態，請立即變更密碼並聯繫我們。",
                    "<strong>If this was not you, do not share this code with anyone.</strong> "
                    "Someone may already be signed in to your account — change your password "
                    "and contact us immediately."),
        ],
        footer_lines=[
            "未提供驗證碼，這項變更就不會發生。 Without this code, the change does not happen.",
            _FOOTER_BRAND,
        ],
    )
    text = (
        f"有人正在要求{zh_what}。\n"
        f"若這是您本人，您的驗證碼是 {code}（10 分鐘內有效，僅能用於這項操作）。\n"
        "若這不是您本人的操作，請勿提供此驗證碼給任何人，並立即變更密碼並聯繫我們。\n\n"
        f"Someone is asking to {en_what}.\n"
        f"If this is you, your code is {code} (valid 10 minutes, for this one action only).\n"
        "If this was not you, do not share this code with anyone — change your password and "
        "contact us immediately."
    )
    return subject, html, text


def build_password_set_email(masked_value: str) -> tuple[str, str, str]:
    """Return (subject, html, text) telling the account a first password was set (ADR-215).

    Setting a first password on an SSO-only account creates a permanent credential where
    there was none. The step-up code already required the owner's consent, but this is the
    record: if a code was ever read out to someone, this message is where the owner sees
    what it bought.
    """
    subject = f"【{_BRAND_ZH}】您的帳號已設定密碼 Password set"
    html = _render_email(
        h1="您的帳號已設定密碼 Password set",
        notices=[
            _notice(f"您的帳號（{masked_value}）已設定登入密碼，所有裝置都已登出。",
                    f"A sign-in password was set on your account ({masked_value}), and every "
                    "session was signed out."),
            _notice("<strong>若非本人操作，請立即使用第三方登入進入帳號並變更密碼</strong>，"
                    "並聯繫我們。",
                    "<strong>If this was not you, sign in with your third-party provider, "
                    "change the password immediately</strong> and contact us."),
        ],
        footer_lines=[_FOOTER_BRAND],
    )
    text = (
        f"您的帳號（{masked_value}）已設定登入密碼，所有裝置都已登出。\n"
        "若非本人操作，請立即使用第三方登入進入帳號並變更密碼，並聯繫我們。\n\n"
        f"A sign-in password was set on your account ({masked_value}), and every session was "
        "signed out.\nIf this was not you, sign in with your third-party provider, change the "
        "password immediately and contact us.\n"
    )
    return subject, html, text
