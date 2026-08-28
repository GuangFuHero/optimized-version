"""Taiwanese address parsing and normalization (L0).

Pure functions, no DB and no I/O — the same contract as `normalize.py`'s `normalize_email` /
`normalize_phone`: return the normalized value, raise `ValueError` on input that cannot be
parsed at all. Everything that needs reference data (does this road exist? does the text agree
with the pin?) lives in `app/services/address.py`.

**`fold()` is the correctness invariant of this whole feature.** It must be applied to the
government/OSM reference rows at import time and to user input at query time, or matching
silently misses. Two real cases from the published 全國路名資料 make this non-optional:

- ``臺`` vs ``台`` — counties are published as ``臺北市`` but road names overwhelmingly use the
  short form (58 roads contain ``台``: 台中路, 台中港路…; exactly one contains ``臺``: 臺灣大道).
  Folding one way breaks counties, folding the other breaks roads, so both sides fold to ``台``.
- Full-width digits — ``新群３路``, ``民主１４路``, ``竹田１巷`` are published full-width, and a
  user types half-width.

The folded form is what gets stored and returned. Output therefore says ``台北市``, not the
government's ``臺北市``; rendering the long form is a display-layer concern if anyone needs it.
"""

import re
import unicodedata
from dataclasses import asdict, dataclass

# Longest published road name is 9 characters and the longest `site_id` is 7, so this bound is
# generous for real input. It exists to stop a multi-kilobyte string reaching a varchar column:
# asyncpg quotes the failing statement, which is the leak class app/graphql/schema.py masks.
MAX_RAW_LENGTH = 255

# The 22 直轄市/縣市, in folded form. 連江縣 is absent from 全國路名資料 but is a real county, so
# it is listed here — parsing must not depend on a road file that omits it.
COUNTIES: tuple[str, ...] = (
    "台北市",
    "新北市",
    "桃園市",
    "台中市",
    "台南市",
    "高雄市",
    "基隆市",
    "新竹市",
    "嘉義市",
    "新竹縣",
    "苗栗縣",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義縣",
    "屏東縣",
    "宜蘭縣",
    "花蓮縣",
    "台東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
)

_WHITESPACE_RE = re.compile(r"\s+")
# 3-digit, 3+2 and 3+3 postal codes, only when they lead the string.
_POSTCODE_RE = re.compile(r"^\d{3}(?:\d{2,3})?(?=\D)")
# 鄰 is a real address segment but is not stored — nothing downstream matches on it.
_NEIGHBORHOOD_RE = re.compile(r"\d+鄰")

_TOWN_RE = re.compile(r"^(.{1,4}?[鄉鎮市區])")
_VILLAGE_RE = re.compile(r"^(.{1,5}?[村里])")

_CHINESE_DIGITS = {
    "一": "1",
    "二": "2",
    "三": "3",
    "四": "4",
    "五": "5",
    "六": "6",
    "七": "7",
    "八": "8",
    "九": "9",
    "十": "10",
}

# Left-to-right the tail is strictly ordered: 段 巷 弄 號 樓 室. Every group is optional, so this
# also matches the empty string — `_split_road_and_tail` only accepts a match that consumes
# something, which is what makes the scan below terminate on a real tail.
#
# 巷/弄 require leading ASCII digits on purpose. 570 published road *names* end in 巷 (松羅南巷,
# 中興四巷), and requiring digits keeps those in the road, not the lane. It does not settle the
# genuinely ambiguous case (竹田1巷) — `app/services/address.py` re-checks that against ref_road.
_TAIL_RE = re.compile(
    r"(?:(?P<section>[0-9]+|[一二三四五六七八九十]+)段)?"
    r"(?:(?P<lane>[0-9]+)巷)?"
    r"(?:(?P<alley>[0-9]+)弄)?"
    r"(?:(?P<no>[0-9]+(?:[-之][0-9]+)?)號)?"
    # A sub-unit hangs off the floor AFTER the 樓, not before it: 12樓之2, never 12之2樓.
    # `basement` is the bare form (…100號B1) that carries no 樓 at all.
    r"(?:(?P<floor>[Bb]?[0-9]+)(?:樓|[Ff])(?P<floor_sub>[-之][0-9]+)?|(?P<basement>[Bb][0-9]+))?"
    r"(?:(?P<room>[0-9A-Za-z]{1,8})室)?"
    r"$"
)

_TAIL_FIELDS = ("section", "lane", "alley", "no", "floor", "room")
_FIELD_ORDER = ("county", "town", "village", "road", "section", "lane", "alley", "no", "floor", "room")
_SUFFIXES = {"section": "段", "lane": "巷", "alley": "弄", "no": "號", "room": "室"}


@dataclass(frozen=True)
class AddressParts:
    """One parsed Taiwanese address. Every field is already folded (see the module docstring)."""

    county: str | None = None
    town: str | None = None
    village: str | None = None
    road: str | None = None
    section: str | None = None
    lane: str | None = None
    alley: str | None = None
    no: str | None = None
    floor: str | None = None
    room: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        """Return the parts as a plain dict, suitable for spreading into a repository payload."""
        return asdict(self)

    def is_empty(self) -> bool:
        """True when nothing at all was recognized."""
        return not any(asdict(self).values())

    def has_structure(self) -> bool:
        """True when something *locating* was recognized, not just leftover text.

        `road` alone does not count. The road is whatever survives after the administrative
        prefix and the numeric tail are taken off, so an unrecognizable string lands there
        wholesale — "asdfgh" would otherwise parse as a road and look like a valid address.
        Any 縣市/鄉鎮/村里, or any tail component (段/巷/弄/號/樓/室), is real structure.
        """
        fields = asdict(self)
        fields.pop("road")
        return any(fields.values())


def fold(value: str | None) -> str | None:
    """Return `value` in the canonical match form, or None for blank input.

    NFKC (full-width → ASCII), all whitespace removed, ``臺`` → ``台``. Apply to BOTH sides of
    every comparison — reference rows at import time and user input at query time.
    """
    if value is None:
        return None
    folded = unicodedata.normalize("NFKC", value)
    folded = _WHITESPACE_RE.sub("", folded).replace("臺", "台")
    return folded or None


def _normalize_section(raw: str) -> str:
    """Return a 段 number as ASCII digits (一段 → 1). Published road names contain no 段."""
    if raw.isdigit():
        return raw
    if raw in _CHINESE_DIGITS:
        return _CHINESE_DIGITS[raw]
    # 十一..十九 — the only multi-character forms a 段 realistically takes.
    if len(raw) == 2 and raw[0] == "十" and raw[1] in _CHINESE_DIGITS:
        return "1" + _CHINESE_DIGITS[raw[1]]
    return raw


def _split_road_and_tail(rest: str) -> tuple[str | None, dict[str, str | None]]:
    """Split what follows the administrative part into (road, tail-components).

    Scans left to right for the earliest offset whose remainder is entirely a tail, so the road
    stays as short as the grammar allows. Returns (rest, empty) when there is no tail at all —
    a road-only address like 花蓮縣光復鄉大平 is legitimate.
    """
    for i in range(len(rest) + 1):
        m = _TAIL_RE.fullmatch(rest[i:])
        if m is None:
            continue
        raw = m.groupdict()
        if not any(raw.values()):
            continue  # matched the empty tail; keep scanning for a real one
        tail = {k: raw[k] for k in _TAIL_FIELDS}
        if tail["section"]:
            tail["section"] = _normalize_section(tail["section"])
        if tail["no"]:
            tail["no"] = tail["no"].replace("之", "-")
        floor = tail["floor"] or raw["basement"]
        if floor:
            tail["floor"] = (floor + (raw["floor_sub"] or "")).replace("之", "-").upper()
        return (rest[:i] or None), tail
    return (rest or None), dict.fromkeys(_TAIL_FIELDS)


def parse_tw_address(raw: str) -> AddressParts:
    """Parse a Taiwanese address string into folded components.

    Raises ValueError when the input is blank, over `MAX_RAW_LENGTH`, or yields no recognizable
    component at all. Everything else parses — a partial address (no 號, no 縣市) is a normal
    result, graded later by `app/services/address.py`, not an error here.
    """
    if raw is None:
        raise ValueError("address is required")
    text = fold(raw)
    if not text:
        raise ValueError("address is required")
    # Measured AFTER folding: NFKC can lengthen a string, so checking the raw input would let an
    # over-long value through to the INSERT.
    if len(text) > MAX_RAW_LENGTH:
        raise ValueError(f"address must be at most {MAX_RAW_LENGTH} characters")

    text = _POSTCODE_RE.sub("", text)
    text = _NEIGHBORHOOD_RE.sub("", text)

    county = next((c for c in COUNTIES if text.startswith(c)), None)
    if county:
        text = text[len(county) :]

    town = None
    if county:
        m = _TOWN_RE.match(text)
        if m:
            town = m.group(1)
            text = text[m.end() :]

    village = None
    if town:
        m = _VILLAGE_RE.match(text)
        if m:
            village = m.group(1)
            text = text[m.end() :]

    road, tail = _split_road_and_tail(text)
    parts = AddressParts(county=county, town=town, village=village, road=road, **tail)
    if not parts.has_structure():
        raise ValueError("address could not be parsed")
    return parts


def _format_floor(value: str) -> str:
    """Render a floor so it re-parses: B1 keeps no 樓, and a sub-unit goes after it (12樓之2)."""
    if value.startswith("B"):
        return value
    level, _, sub = value.partition("-")
    return f"{level}樓之{sub}" if sub else f"{level}樓"


def format_tw_address(parts: AddressParts) -> str:
    """Render parsed components back into a canonical single-line address.

    The inverse of `parse_tw_address` for anything it produced — re-parsing the output yields
    the same components, which `tests/test_address_parse.py` asserts as a round-trip property.
    """
    out = []
    for field in _FIELD_ORDER:
        value = getattr(parts, field)
        if not value:
            continue
        out.append(_format_floor(value) if field == "floor" else f"{value}{_SUFFIXES.get(field, '')}")
    return "".join(out)
