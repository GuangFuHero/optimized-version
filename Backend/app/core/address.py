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
_POSTCODE_RE = re.compile(r"^\d{3}(?:\d{2,3})?(?=\D)")
_TOWN_RE = re.compile(r"^(.{1,4}?[鄉鎮市區])")
_VILLAGE_RE = re.compile(r"^(.{1,5}?[村里])")
_NEIGHBORHOOD_RE = re.compile(r"^(\d+鄰)")

# The tail runs 段 巷 弄 (衖 衕) 號 樓 室, each part optional; 衖 and 衕 stay only in the line. 巷 and 弄
# need leading digits, so a road named like 松羅南巷 stays the road.
_TAIL_RE = re.compile(
    r"(?P<section>(?:\d+|[一二三四五六七八九十]+)段)?"
    r"(?P<lane>\d+巷)?"
    r"(?P<alley>\d+弄)?"
    r"(?:\d+衖)?(?:\d+衕)?"
    r"(?P<no>\d+(?:[-之]\d+)?號(?:之\d+)?)?"
    r"(?P<floor>(?:[Bb]?\d+|[一二三四五六七八九十]+)(?:樓|[Ff])(?:[-之]\d+)?|[Bb]\d+)?"
    r"(?:(?P<room>[0-9A-Za-z]{1,8})室)?"
    r"$"
)


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
    """Find the earliest offset where `rest` becomes a tail, keeping the road as short as possible.

    Returns (offset, tail parts, offset where 樓/室 begin or None). With no tail the offset is
    len(rest), so a road-only address like 花蓮縣光復鄉大平 parses with just a road.
    """
    for i in range(len(rest)):
        m = _TAIL_RE.fullmatch(rest[i:])
        if m is None or not any(m.groupdict().values()):
            continue
        tail = m.groupdict()
        if tail["no"]:
            tail["no"] = tail["no"].replace("-", "之")
        unit_starts = [m.start(k) for k in ("floor", "room") if tail[k]]
        return i, tail, (i + min(unit_starts)) if unit_starts else None
    return len(rest), dict.fromkeys(("section", "lane", "alley", "no", "floor", "room")), None


def parse_tw_address(text: str | None) -> AddressParts:
    """Split an address line into its parts; whatever is not recognized stays in `full_address`.

    A 樓/室 tail is returned as `floor`/`room` and cut from `full_address`, so the line holds the
    door alone, as TGOS writes it.
    """
    line = fold(text)
    if not line:
        return AddressParts()
    line = _POSTCODE_RE.sub("", line)

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
