"""PII masking helpers for ticket contact fields (ADR-049, ported from PR #23).

Used by the `ticket.view_pii` field resolvers: when the caller's scope does NOT cover a
ticket, its contact fields are returned *masked* (partial reveal) rather than null — a
masked value reads as "log in / get authorized to see full details", not "no data".

Detection of whether to mask is NOT done here — that is the per-role `ticket.view_pii`
scope check (own/zone/all) in app/graphql/tickets/types.py. These functions only produce
the masked string once the caller has been decided out-of-scope.
"""

import re

_MASK_GLYPH = "◯"
_CJK_RE = re.compile(r"[㐀-鿿豈-﫿぀-ヿ]")


def mask_name(name: str | None) -> str | None:
    """Mask a contact name, script-aware.

    CJK  : first char + fixed ``◯◯``   (王小明 → 王◯◯) — fixed width hides the real length.
    Latin: first token + initials      (John Smith → John S.).
    """
    if not name:
        return name
    name = name.strip()
    if not name:
        return name
    if _CJK_RE.search(name):
        return name[0] + _MASK_GLYPH * 2
    tokens = name.split()
    if len(tokens) == 1:
        return tokens[0][0] + "."
    return tokens[0] + " " + "".join(t[0] + "." for t in tokens[1:])


def mask_email(email: str | None) -> str | None:
    """Mask a contact email, keeping only the first local char and the TLD (j***@***.com)."""
    if not email or "@" not in email:
        return email
    local, _, domain = email.partition("@")
    tld = domain.rsplit(".", 1)[-1] if "." in domain else domain
    first = local[0] if local else ""
    return f"{first}***@***.{tld}"


def mask_phone(phone: str | None) -> str | None:
    """Mask a contact phone: keep first 2 + last 3 digits, mask the middle.

    Normalizes a leading ``+886`` to ``0`` first (Taiwan), preserving any separators around
    the kept digits (0912345678 → 09*****678).
    """
    if not phone:
        return phone
    normalized = re.sub(r"^\+886", "0", phone.strip())
    digits = re.sub(r"\D", "", normalized)
    if len(digits) <= 5:
        return "*" * len(digits)
    masked = digits[:2] + "*" * (len(digits) - 5) + digits[-3:]
    return masked
