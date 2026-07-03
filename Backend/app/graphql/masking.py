"""PII masking for guest (non-logged-in) GraphQL requests.

Pure, script-aware masking helpers plus a Strawberry ``FieldExtension`` that applies
them only when the request is anonymous. Logged-in users always receive raw values.
"""

import re
from dataclasses import replace

import strawberry
from strawberry.extensions import FieldExtension

from app.graphql.geo.types import SecondaryLocationType

# A name is treated as Latin only when it has Latin letters and no CJK ideograph;
# anything else (CJK present, or no letters at all) uses the CJK marker style.
_LATIN_RE = re.compile(r"[A-Za-z]")
_CJK_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿]")

# Taiwan country code prefix and any separator that follows it, e.g. "+886 ", "886-".
_TW_COUNTRY_CODE_RE = re.compile(r"^\+?886[\s-]*")


def _initial(token: str) -> str:
    """First letter of a token, uppercased; empty string if it has none."""
    for ch in token:
        if ch.isalpha():
            return ch.upper()
    return ""


def _mask_cjk_name(value: str) -> str:
    """Keep the first letter/ideograph (skipping leading symbols), then fixed ``◯◯``."""
    for ch in value:
        if ch.isalpha():
            return ch + "◯◯"
    return "◯◯"


def _mask_latin_name(value: str) -> str:
    """Keep the first name token; reduce each remaining token to an initial."""
    tokens = [t for t in value.split() if any(c.isalpha() for c in t)]
    if not tokens:
        return "***"
    if len(tokens) == 1:
        for ch in tokens[0]:
            if ch.isalpha():
                return ch + "***"
        return "***"
    rest = " ".join(_initial(t) + "." for t in tokens[1:])
    return f"{tokens[0]} {rest}"


def mask_name(value: str | None) -> str | None:
    """Mask a person's name, detecting CJK vs Latin script per value."""
    if not value:
        return value
    has_cjk = bool(_CJK_RE.search(value))
    has_latin = bool(_LATIN_RE.search(value))
    if has_latin and not has_cjk:
        return _mask_latin_name(value)
    return _mask_cjk_name(value)


def mask_email(value: str | None) -> str | None:
    """Hide the local part and provider, keeping only the top-level domain label."""
    if not value:
        return value
    if "@" not in value:
        return "***"
    local, _, domain = value.rpartition("@")
    if not local or not domain:
        return "***"
    masked_local = (local[0] + "***") if len(local) >= 2 else "***"
    masked_domain = ("***." + domain.rpartition(".")[2]) if "." in domain else "***"
    return f"{masked_local}@{masked_domain}"


def mask_phone(value: str | None) -> str | None:
    """Normalize a TW country code, then keep the first 2 and last 3 digits."""
    if not value:
        return value
    normalized = _TW_COUNTRY_CODE_RE.sub("0", value)
    digit_positions = [i for i, ch in enumerate(normalized) if ch.isdigit()]
    keep = (
        set(digit_positions[:2] + digit_positions[-3:])
        if len(digit_positions) >= 6
        else set()
    )
    chars = list(normalized)
    for i in digit_positions:
        if i not in keep:
            chars[i] = "*"
    return "".join(chars)


def mask_address(value: SecondaryLocationType | None) -> SecondaryLocationType | None:
    """Keep county/city; unconditionally hide the street-level fields behind '***'.

    Always masks lane/alley/no/floor/room regardless of whether they were populated —
    a `None` left un-masked next to `"***"` values would itself leak which fields exist.
    """
    if value is None:
        return value
    return replace(value, lane="***", alley="***", no="***", floor="***", room="***")


class MaskForGuests(FieldExtension):
    """Replace a field's value with a masked version for anonymous requests."""

    def __init__(self, masker):
        """Store the masking function applied to anonymous requests."""
        self.masker = masker

    def resolve(self, next_, source, info: strawberry.types.Info, **kwargs):
        """Return the masked value for guests, the raw value otherwise."""
        value = next_(source, info, **kwargs)
        if info.context.get("user") is None:
            return self.masker(value)
        return value
