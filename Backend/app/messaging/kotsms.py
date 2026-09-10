"""簡訊王 (kotsms.com.tw) SMS adapter, built against the vendor's Mitake API spec v2.14.

Two prerequisites live outside this code and both fail loudly here if missing: the account needs the
API 發送權限 switched on (otherwise ``statuscode=p``) and the sending host's public IP registered with
the SMS centre (otherwise ``statuscode=k``).
"""

import logging
import re
import uuid

import httpx
import phonenumbers

from app.core.config import settings

logger = logging.getLogger("app.sms")

# Note the non-standard port; the API doc also requires TLS 1.2 or newer and caps concurrent
# connections at 15.
_BASE_URL = "https://api.kotsms.com.tw:8515/kotsms"
_SEND_URL = f"{_BASE_URL}/SmSend"
_QUERY_URL = f"{_BASE_URL}/SmQuery"

# statuscodes that mean the message was accepted (附錄二): queued, handed to the carrier, delivered.
_ACCEPTED_STATUS = frozenset({"0", "1", "2", "4"})

# Every failing statuscode from 附錄二; letters are request-level errors, digits are delivery outcomes.
_STATUS_MESSAGES = {
    "*": "系統發生錯誤，請聯絡三竹資訊窗口人員",
    "a": "簡訊發送功能暫時停止服務",
    "b": "簡訊發送功能暫時停止服務",
    "c": "請輸入帳號",
    "d": "請輸入密碼",
    "e": "帳號、密碼錯誤",
    "f": "帳號已過期",
    "h": "帳號已被停用",
    "k": "無效的連線位址（發送主機 IP 未向簡訊中心報備）",
    "l": "帳號已達到同時連線數上限（上限 15 條）",
    "m": "必須變更密碼，在變更密碼前無法使用簡訊發送服務",
    "n": "密碼已逾期，在變更密碼前無法使用簡訊發送服務",
    "p": "沒有權限使用外部 Http 程式（API 發送權限未開通）",
    "r": "系統暫停服務，請稍後再試",
    "s": "帳務處理失敗，無法發送簡訊",
    "t": "簡訊已過期",
    "u": "簡訊內容不得為空白",
    "v": "無效的手機號碼",
    "w": "查詢筆數超過上限",
    "x": "發送檔案過大，無法發送簡訊",
    "y": "參數錯誤",
    "z": "查無資料",
    "5": "內容有錯誤",
    "6": "門號有錯誤",
    "7": "簡訊已停用",
    "8": "逾時無送達",
    "9": "預約已取消",
}


def to_kotsms_number(e164: str) -> str:
    """Convert a stored E.164 number to the local format KotSMS accepts.

    The API doc spells ``dstaddr`` as ``0912345678``, and the member console adds that ``+``, ``-``,
    ``002`` and spaces are rejected and that TW mobiles must not start with ``8869``. Sending ``+886…``
    verbatim also risks being billed as an international message (5 points instead of 1).

    Args:
        e164: An already-normalized E.164 number, as stored by ``app.core.normalize.normalize_phone``.

    Returns:
        Digits only — ``0912345678`` for TW, ``8613922223333`` for everything else.
    """
    parsed = phonenumbers.parse(e164, settings.PHONE_DEFAULT_REGION)
    if phonenumbers.region_code_for_number(parsed) == settings.PHONE_DEFAULT_REGION:
        national = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
        return re.sub(r"\D", "", national)
    return f"{parsed.country_code}{parsed.national_number}"


def _credentials() -> dict[str, str]:
    """Return the configured API credentials; raise if they are missing."""
    if not settings.KOTSMS_USERNAME or not settings.KOTSMS_PASSWORD:
        raise RuntimeError("KOTSMS_USERNAME and KOTSMS_PASSWORD are required when SMS_PROVIDER=kotsms")
    return {"username": settings.KOTSMS_USERNAME, "password": settings.KOTSMS_PASSWORD}


def _parse_response(text: str) -> dict[str, str]:
    """Parse the API's ``key=value`` plain-text reply, ignoring the ``[n]`` record markers."""
    fields: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.strip().partition("=")
        if sep:
            fields[key] = value
    return fields


def _describe(statuscode: str) -> str:
    """Return the human-readable meaning of a statuscode."""
    return _STATUS_MESSAGES.get(statuscode, "未知的 statuscode")


async def query_account_point() -> int:
    """Return the account's remaining points.

    SmQuery without a ``msgid`` is a balance query: it sends no SMS and costs no points, which makes it
    the cheapest way to prove credentials, IP registration and API permission are all in place.

    Raises:
        RuntimeError: If the credentials are unset or the reply carries no ``AccountPoint``.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(_QUERY_URL, data=_credentials())
        resp.raise_for_status()
    fields = _parse_response(resp.text)
    if "AccountPoint" not in fields:
        status = fields.get("statuscode", "")
        raise RuntimeError(f"KotSMS balance query failed (statuscode={status!r}: {_describe(status)})")
    return int(fields["AccountPoint"])


class KotSmsSender:
    """Sends SMS through 簡訊王's SmSend endpoint using the account's own login credentials."""

    async def send(self, to: str, body: str) -> None:
        """Deliver one SMS; raise on anything the API does not report as accepted.

        Raises:
            RuntimeError: If the credentials are unset or the API rejects the message.
            httpx.HTTPError: On transport failure or a non-2xx reply.
        """
        payload = _credentials() | {
            "dstaddr": to_kotsms_number(to),
            "smbody": body,
            # A fresh GUID per send: the API treats a repeated clientid within 12h as a duplicate and
            # silently returns the previous result, which would swallow a resent OTP.
            "clientid": str(uuid.uuid4()),
            "smsPointFlag": "1",  # ask for smsPoint so the log shows what each message actually cost
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_SEND_URL, params={"CharsetURL": "UTF8"}, data=payload)
            resp.raise_for_status()
        fields = _parse_response(resp.text)
        status = fields.get("statuscode", "")
        if status not in _ACCEPTED_STATUS:
            raise RuntimeError(f"KotSMS rejected the message (statuscode={status!r}: {_describe(status)})")
        logger.info("kotsms sent msgid=%s statuscode=%s point=%s balance=%s",
                    fields.get("msgid"), status, fields.get("smsPoint"), fields.get("AccountPoint"))
