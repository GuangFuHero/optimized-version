"""Tests for Taiwanese address parsing (app/core/address.py) — pure, no database.

Same shape as test_normalize.py: parametrized happy paths plus the ValueError cases. Most of
the inputs here are taken from the published reference data rather than invented, because the
parser's job is to agree with what 全國路名資料 and OpenStreetMap actually contain.
"""

import pytest

from app.core.address import (
    MAX_RAW_LENGTH,
    AddressParts,
    fold,
    format_tw_address,
    parse_tw_address,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("臺北市", "台北市"),  # 臺 → 台, the whole reason fold exists
        ("新群３路", "新群3路"),  # full-width digits, as published in 全國路名資料
        ("  花蓮縣 光復鄉  ", "花蓮縣光復鄉"),  # all whitespace removed, not just the ends
        ("台中路", "台中路"),  # already folded, unchanged
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_fold(raw, expected):
    """fold() is the match key both the import and the query path go through."""
    assert fold(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        # county / town / village / road / no
        ("花蓮縣光復鄉中興路10號", "花蓮縣光復鄉中興路10號"),
        ("976花蓮縣光復鄉大全村中興路10號", "花蓮縣光復鄉大全村中興路10號"),  # postal code stripped
        ("花蓮縣光復鄉大全村15鄰10號", "花蓮縣光復鄉大全村10號"),  # 鄰 dropped, not stored
        ("  花蓮縣 光復鄉 中興路 10號  ", "花蓮縣光復鄉中興路10號"),
        # 臺 → 台 on both the county and a road that is published with 臺
        ("臺中市西區臺灣大道二段100號", "台中市西區台灣大道2段100號"),
        # 段 as a Chinese numeral, 之 → -, floor
        ("台北市信義區松智路一段7之1號3樓", "台北市信義區松智路1段7-1號3樓"),
        # the full tail: 段 巷 弄 號 樓, with the floor sub-unit AFTER the 樓
        ("新北市板橋區文化路二段182巷3弄5號12樓之2", "新北市板橋區文化路2段182巷3弄5號12樓之2"),
        ("台南市安南區公學路四段100號2F", "台南市安南區公學路4段100號2樓"),  # F → 樓
        ("高雄市前金區民生二路100號B1", "高雄市前金區民生二路100號B1"),  # basement, no 樓
        ("花蓮縣光復鄉大全村中興路10號3樓A室", "花蓮縣光復鄉大全村中興路10號3樓A室"),
        # no county/town at all — legitimate when a pin supplies the location
        ("中興路10號", "中興路10號"),
    ],
)
def test_parse_and_format_round_trip(raw, expected):
    """Parsing then formatting yields the canonical form, and re-parsing it is a fixed point."""
    formatted = format_tw_address(parse_tw_address(raw))
    assert formatted == expected
    assert format_tw_address(parse_tw_address(formatted)) == formatted


def test_parse_components():
    """Each segment lands in its own field."""
    p = parse_tw_address("新北市板橋區文化路二段182巷3弄5號12樓之2")
    assert (p.county, p.town, p.road, p.section) == ("新北市", "板橋區", "文化路", "2")
    assert (p.lane, p.alley, p.no, p.floor) == ("182", "3", "5", "12-2")


def test_road_without_suffix_is_kept():
    """大平/中山/大馬 are published road names in 光復鄉 with no 路/街/道 suffix.

    A parser that required a suffix would reject exactly the rural addresses this app exists
    for, so this is a regression guard, not a style preference.
    """
    p = parse_tw_address("花蓮縣光復鄉大平15號")
    assert (p.road, p.no) == ("大平", "15")


def test_named_lane_road_stays_in_the_road():
    """松羅南巷 is a published road NAME; only a digit-led 巷 is a lane number."""
    p = parse_tw_address("宜蘭縣冬山鄉松羅南巷12號")
    assert (p.road, p.lane, p.no) == ("松羅南巷", None, "12")


def test_digit_led_lane_splits_off_the_road():
    """竹田1巷 is genuinely ambiguous; L0 splits it and app/services/address.py re-checks.

    Pinning the split here is what makes `_reattached_lane` meaningful — if the parser ever
    stopped splitting, that service-layer fixup would become dead code without failing.
    """
    p = parse_tw_address("宜蘭縣三星鄉竹田１巷5號")
    assert (p.road, p.lane, p.no) == ("竹田", "1", "5")


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        None,
        "asdfgh",  # parses as a bare road and nothing else — not an address
        "中興路",  # a road with no number and no administrative context
        "%_%",  # LIKE wildcards must not survive into a query
    ],
)
def test_parse_rejects_unlocatable_input(raw):
    """Only input with no locating structure at all is refused."""
    with pytest.raises(ValueError):
        parse_tw_address(raw)


def test_parse_rejects_over_long_input():
    """Length is checked so an oversized value can never reach a varchar column.

    asyncpg quotes the whole failing statement on truncation, which is the leak class
    app/graphql/schema.py's MaskErrors exists to contain.
    """
    with pytest.raises(ValueError, match="at most"):
        parse_tw_address("花" * (MAX_RAW_LENGTH + 1))


def test_length_is_measured_after_normalization():
    """NFKC can lengthen a string, so a raw-length check would let an over-long value through."""
    # ㍿ expands to 4 characters under NFKC.
    raw = "㍿" * (MAX_RAW_LENGTH // 2)
    assert len(raw) < MAX_RAW_LENGTH < len(fold(raw))
    with pytest.raises(ValueError, match="at most"):
        parse_tw_address(raw)


def test_county_only_parses():
    """A lone 縣市 is structure, if weak — the service layer grades it, the parser accepts it."""
    assert parse_tw_address("台北市") == AddressParts(county="台北市")


def test_format_empty_parts():
    """Formatting nothing yields the empty string rather than raising."""
    assert format_tw_address(AddressParts()) == ""
