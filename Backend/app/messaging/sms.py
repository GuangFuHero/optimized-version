"""SMS delivery: abstract sender + dev console impl. Real delivery goes through 簡訊王 (kotsms)."""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger("app.sms")

# Sender identity required by Taiwan's 簡訊實名制 (in force since 2025-11-01). This is the registered
# entity, NOT the product name — it MUST match what KotSMS approved for this account character for
# character (full/half width, case, punctuation) or the carriers drop the message. The API still
# answers statuscode=1 in that case, so a mismatch fails silently. Verified by live send on
# 2026-08-15: bare identity, no 【】, arrives on the handset. Bodies stay Chinese-only and under
# 70 chars so each send costs 1 point instead of 2.
_SENDER_IDENTITY_ZH = "開放文化基金會"


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
    return f"{_SENDER_IDENTITY_ZH} 您的驗證碼是 {code}，10 分鐘內有效。"


def build_password_reset_sms(code: str) -> str:
    """Return the SMS body carrying a password-reset code."""
    return f"{_SENDER_IDENTITY_ZH} 您的密碼重設驗證碼是 {code}，10 分鐘內有效。"


def build_sso_notice_sms() -> str:
    """Return the SMS telling an SSO-only user there is no password to reset (no code)."""
    return f"{_SENDER_IDENTITY_ZH} 此帳號使用第三方登入，無密碼可重設，請改用該服務登入。"


def get_sms_sender() -> SmsSender:
    """FastAPI dependency selecting the configured SMS sender."""
    if settings.SMS_PROVIDER == "kotsms":
        from app.messaging.kotsms import KotSmsSender  # noqa: PLC0415 — optional adapter
        return KotSmsSender()
    return ConsoleSmsSender()


def build_contact_changed_sms(masked_new_value: str) -> str:
    """Return the SMS telling the OLD channel that the contact was replaced.

    The new value arrives masked (ADR-085): enough for the owner to recognise, not enough to
    hand the full address to whoever else reads a forwarded message.
    """
    return (f"{_SENDER_IDENTITY_ZH} 您的聯絡方式已變更為 {masked_new_value}。"
            "若非本人操作請立即聯繫我們。")


def build_contact_added_sms(added_type: str, masked_value: str) -> str:
    """Return the SMS telling the existing channels a contact was added (ADR-224)."""
    label = "電子信箱" if added_type == "email" else "手機號碼"
    return (f"{_SENDER_IDENTITY_ZH} 您的帳號新增了{label} {masked_value}，"
            "可用於登入與重設密碼。若非本人操作請立即移除並變更密碼。")


def build_contact_removed_sms(removed_type: str, masked_value: str) -> str:
    """Return the SMS telling the surviving channels that a contact was removed.

    Same reasoning as the replacement notice (ADR-159): removal takes away a way back into
    the account, so it must not happen silently. The removed value arrives masked.
    """
    label = "電子信箱" if removed_type == "email" else "手機號碼"
    return (f"{_SENDER_IDENTITY_ZH} 您的{label} {masked_value} 已從帳號移除。"
            "若非本人操作請立即聯繫我們。")


def build_contact_replaced_sms(replaced_type: str, masked_new_value: str) -> str:
    """Return the SMS telling the SURVIVING channels that a contact was replaced.

    The old channel gets `build_contact_changed_sms`; this is what the account's *other*
    contact hears (ADR-229), and it names the type because the reader is not on the channel
    that changed.
    """
    label = "電子信箱" if replaced_type == "email" else "手機號碼"
    return (f"{_SENDER_IDENTITY_ZH} 您帳號的{label}已變更為 {masked_new_value}，"
            "可用於登入與重設密碼。若非本人操作請立即聯繫我們。")

_PROVIDER_LABEL = {"google": "Google", "line": "LINE", "password": "密碼"}


def build_step_up_code_sms(
    action: str, contact_type: str, code: str, masked_target: str | None = None
) -> str:
    """Return the SMS carrying a step-up code, naming what the code authorizes.

    Same reasoning as the email version (ADR-164): a code whose message describes the
    opposite action gives a session-theft victim no signal, and reads exactly like the
    "read us the code we just sent you" phone script.
    """
    label = "電子信箱" if contact_type == "email" else "手機號碼"
    if action == "set_password":
        # Not a change to this contact — it authorizes a permanent credential (ADR-215).
        zh_what = "為此帳號設定登入密碼"
    elif action == "add_contact":
        zh_what = f"為此帳號新增 {masked_target} 為聯絡方式"
    elif action in ("link_identity", "unlink_identity"):
        verb_zh = "新增" if action == "link_identity" else "移除"
        provider = _PROVIDER_LABEL.get(masked_target or "", masked_target or "")
        zh_what = f"為此帳號{verb_zh} {provider} 登入方式"
    elif action == "replace":
        zh_what = f"將此{label}更換為 {masked_target}"
    else:
        zh_what = f"將此{label}從帳號移除"
    return (f"{_SENDER_IDENTITY_ZH} 有人正在要求{zh_what}。驗證碼 {code}，10 分鐘內有效，"
            "僅能用於這項操作。若非本人請勿提供給任何人。")


def build_password_set_sms(masked_value: str, *, changed: bool = False) -> str:
    """Return the SMS telling the account its password was set or changed."""
    zh_verb = "已變更" if changed else "已設定"
    return (f"{_SENDER_IDENTITY_ZH} 您的帳號（{masked_value}）的登入密碼{zh_verb}，所有裝置都已登出。"
            "若非本人操作，請立即以第三方登入進入帳號並變更密碼。")


def build_login_method_changed_sms(added: bool, provider: str) -> str:
    """Return the SMS telling the account a sign-in method changed (ADR-218)."""
    label = _PROVIDER_LABEL.get(provider, provider)
    verb_zh = "已新增" if added else "已移除"
    return (f"{_SENDER_IDENTITY_ZH} 您的帳號{verb_zh} {label} 登入方式。"
            "若非本人操作請立即移除並變更密碼。")
