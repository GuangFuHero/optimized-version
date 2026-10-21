"""Taiwanese address parsing: one address line split into its 縣市 … 號 parts.

Pure functions with no I/O. The line is normally the official address TGOS returned, but a
typed one has to parse too, so nothing here raises on content: whatever is not recognized stays
in `full_address` alone.
"""

import re
import unicodedata
from dataclasses import asdict, dataclass

# The 22 直轄市/縣市 as TGOS writes them. A typed 台 is accepted and stored as 臺.
COUNTIES: tuple[str, ...] = (
    "臺北市",
    "新北市",
    "桃園市",
    "臺中市",
    "臺南市",
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
    "臺東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
)
_COUNTY_SPELLINGS = {spelling: c for c in COUNTIES for spelling in (c, c.replace("臺", "台"))}

_WHITESPACE_RE = re.compile(r"\s+")
_POSTCODE_RE = re.compile(r"^\d{3}(?:\d{2,3})?")
# 鄉/鎮/市 ends the name only when no 區 follows it, so 前鎮區 and 新市區 stay whole.
_TOWN_RE = re.compile(r"^(.{1,4}?(?:區|[鄉鎮市](?!區)))")
# A 村/里 ends the village only when no other 村/里 follows (嘉里村, 大里里) and no road suffix does
# either, since 中里路 and 中里北路 are roads.
_VILLAGE_RE = re.compile(r"^(.{1,5}?[村里])(?![村里])(?![東西南北中]?(?:路|街|大道))")
_NEIGHBORHOOD_RE = re.compile(r"^(\d+鄰)")

# The tail runs 段 巷 弄 (衖 衕) 號 樓 室, each part optional; 衖 and 衕 stay only in the line. 巷 and 弄
# need leading digits, so a road named like 松羅南巷 stays the road; `unit` is the 樓/室 with its separator.
_TAIL_RE = re.compile(
    r"(?P<section>(?:\d+|[一二三四五六七八九十]+)段)?"
    r"(?P<lane>\d+巷)?"
    r"(?P<alley>\d+弄)?"
    r"(?:\d+衖)?(?:\d+衕)?"
    r"(?P<no>\d+(?:[-之]\d+)?號(?:[-之]\d+)?)?"
    r"(?P<unit>[-之(]?"
    r"(?P<floor>地下室|(?:地下)?(?:[Bb]?\d+|[一二三四五六七八九十]+)(?:樓|層|[Ff])(?:[-之][0-9A-Za-z]+)?|[Bb]\d+)?"
    r"(?:[-之]?(?P<room>[0-9A-Za-z]{1,8})室)?\)?)"
    r"$"
)
_TAIL_PARTS = ("section", "lane", "alley", "no", "floor", "room")


@dataclass(frozen=True)
class AddressParts:
    """One parsed address. Every numbered part keeps its unit: 3鄰, 一段, 469巷, 1弄, 19號."""

    full_address: str | None = None
    county: str | None = None
    town: str | None = None
    village: str | None = None
    neighborhood: str | None = None
    road: str | None = None
    section: str | None = None
    lane: str | None = None
    alley: str | None = None
    no: str | None = None
    floor: str | None = None
    room: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        """The parts as a dict whose keys are `secondary_locations` columns."""
        return asdict(self)


def fold(value: str | None) -> str | None:
    """NFKC (full-width → ASCII) with all whitespace removed; None for blank input."""
    if value is None:
        return None
    folded = _WHITESPACE_RE.sub("", unicodedata.normalize("NFKC", value))
    return folded or None


def _take(pattern: re.Pattern, text: str) -> tuple[str | None, str]:
    """Match `pattern` at the start of `text`; return (match, rest) or (None, text)."""
    m = pattern.match(text)
    return (m.group(1), text[m.end() :]) if m else (None, text)


def _split_tail(rest: str) -> tuple[int, dict[str, str | None], int | None]:
    """Split `rest` at the earliest offset where a tail starts, keeping the road as short as possible.

    Returns (offset, tail parts, offset where 樓/室 begin or None); with no tail the offset is len(rest).
    """
    for i in range(len(rest)):
        m = _TAIL_RE.fullmatch(rest[i:])
        if m is None or not any(m.group(k) for k in _TAIL_PARTS):
            continue
        tail = {k: m.group(k) for k in _TAIL_PARTS}
        if tail["no"]:
            tail["no"] = tail["no"].replace("-", "之")
        has_unit = tail["floor"] or tail["room"]
        return i, tail, (i + m.start("unit")) if has_unit else None
    return len(rest), dict.fromkeys(_TAIL_PARTS), None


def parse_tw_address(text: str | None) -> AddressParts:
    """Split an address line into its parts; whatever is not recognized stays in `full_address`.

    A 樓/室 tail is returned as `floor`/`room` and cut from `full_address`, so the line holds the
    door alone, as TGOS writes it.
    """
    line = fold(text)
    if not line:
        return AddressParts()
    postcode = _POSTCODE_RE.match(line)
    # Only a number in front of a county is a postcode; on its own it is the door, as in 100號.
    if postcode and line[postcode.end() :].startswith(tuple(_COUNTY_SPELLINGS)):
        line = line[postcode.end() :]

    county = next((s for s in _COUNTY_SPELLINGS if line.startswith(s)), None)
    rest = line[len(county) :] if county else line
    town = village = neighborhood = None
    if county:
        town, rest = _take(_TOWN_RE, rest)
    if town:
        village, rest = _take(_VILLAGE_RE, rest)
        neighborhood, rest = _take(_NEIGHBORHOOD_RE, rest)

    offset, tail, unit_at = _split_tail(rest)
    if unit_at is not None:
        cut = len(line) - len(rest) + unit_at
        line = line[:cut]
    parts = {
        "county": _COUNTY_SPELLINGS[county] if county else None,
        "town": town,
        "village": village,
        "neighborhood": neighborhood,
        **tail,
    }
    if not any(parts.values()):
        # Nothing locating was found, so none of it is a road either: keep the text as typed.
        return AddressParts(full_address=line)
    if county:
        line = parts["county"] + line[len(county) :]
    return AddressParts(full_address=line or None, road=rest[:offset] or None, **parts)
