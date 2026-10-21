"""The address parser: official TGOS lines split exactly, typed lines split as far as they go."""

import pytest

from app.core.address import AddressParts, parse_tw_address

# Official lines as TGOS returned them, with TGOS's own components for each.
TGOS_ROWS = [
    (
        "花蓮縣光復鄉大進村3鄰糖廠街19號",
        {
            "county": "花蓮縣",
            "town": "光復鄉",
            "village": "大進村",
            "neighborhood": "3鄰",
            "road": "糖廠街",
            "no": "19號",
        },
    ),
    (
        "臺北市中山區行政里1鄰松江路469巷4號",
        {
            "county": "臺北市",
            "town": "中山區",
            "village": "行政里",
            "neighborhood": "1鄰",
            "road": "松江路",
            "lane": "469巷",
            "no": "4號",
        },
    ),
    (
        "花蓮縣光復鄉大進村5鄰中興路202巷1弄1號",
        {
            "county": "花蓮縣",
            "town": "光復鄉",
            "village": "大進村",
            "neighborhood": "5鄰",
            "road": "中興路",
            "lane": "202巷",
            "alley": "1弄",
            "no": "1號",
        },
    ),
    (
        "花蓮縣光復鄉大全村3鄰大全街12號",
        {
            "county": "花蓮縣",
            "town": "光復鄉",
            "village": "大全村",
            "neighborhood": "3鄰",
            "road": "大全街",
            "no": "12號",
        },
    ),
]


def _set(parts: AddressParts) -> dict:
    return {k: v for k, v in parts.as_dict().items() if v is not None}


@pytest.mark.parametrize(("line", "components"), TGOS_ROWS)
def test_an_official_line_splits_into_tgos_components(line, components):
    """A line TGOS returned splits into exactly the components TGOS gave for it."""
    assert _set(parse_tw_address(line)) == {"full_address": line, **components}


@pytest.mark.parametrize(
    ("line", "town", "road"),
    [
        ("高雄市前鎮區中山二路1號", "前鎮區", "中山二路"),
        ("桃園市平鎮區中豐路1號", "平鎮區", "中豐路"),
        ("臺南市新市區中興街1號", "新市區", "中興街"),
        ("新竹縣竹北市光明六路1號", "竹北市", "光明六路"),
        ("花蓮縣鳳林鎮中正路1號", "鳳林鎮", "中正路"),
    ],
)
def test_a_district_named_with_town_or_city_stays_whole(line, town, road):
    """前鎮區 and 新市區 hold a 鎮 or 市 inside the name; only the final 區 ends it."""
    parts = parse_tw_address(line)
    assert (parts.town, parts.road) == (town, road)


def test_a_section_keeps_its_numeral_as_written():
    """段 keeps the numeral TGOS writes, so the part matches the line."""
    parts = parse_tw_address("臺北市中正區黎明里3鄰忠孝西路一段49號")
    assert (parts.road, parts.section, parts.no) == ("忠孝西路", "一段", "49號")


def test_a_typed_tai_is_stored_as_the_official_county():
    """台北市 typed by hand is stored as TGOS writes it, 臺北市."""
    parts = parse_tw_address("台北市松江路469巷4號")
    assert (parts.full_address, parts.county) == ("臺北市松江路469巷4號", "臺北市")


def test_a_floor_and_room_are_cut_from_the_line():
    """樓 and 室 come off the line, which then holds the door alone."""
    parts = parse_tw_address("臺中市西屯區臺灣大道二段2號12樓A室")
    assert parts.full_address == "臺中市西屯區臺灣大道二段2號"
    assert (parts.floor, parts.room) == ("12樓", "A")


def test_a_basement_and_a_sub_floor_are_floors():
    """B1, 地下1樓 and 3樓之1 are all read as the floor, and none is left in the line."""
    assert parse_tw_address("花蓮縣光復鄉中山路三段100號B1").floor == "B1"
    assert parse_tw_address("花蓮縣光復鄉糖廠街19號3樓之1").floor == "3樓之1"
    basement = parse_tw_address("臺北市信義區松壽路12號地下1樓")
    assert (basement.full_address, basement.road, basement.floor) == (
        "臺北市信義區松壽路12號",
        "松壽路",
        "地下1樓",
    )


@pytest.mark.parametrize(
    ("line", "full_address", "floor"),
    [
        ("臺北市中正區重慶南路一段122號地下室", "臺北市中正區重慶南路一段122號", "地下室"),
        ("新北市板橋區文化路二段1巷2弄3號地下1層", "新北市板橋區文化路二段1巷2弄3號", "地下1層"),
        ("臺中市西屯區台灣大道三段99號(1樓)", "臺中市西屯區台灣大道三段99號", "1樓"),
        ("臺中市西屯區台灣大道三段99號（1樓）", "臺中市西屯區台灣大道三段99號", "1樓"),
    ],
)
def test_a_basement_or_a_bracketed_floor_is_the_floor(line, full_address, floor):
    """地下室, 地下1層 and (1樓) come off the line as the floor, leaving the door in place."""
    parts = parse_tw_address(line)
    assert (parts.full_address, parts.floor) == (full_address, floor)
    assert parts.no is not None


@pytest.mark.parametrize(
    ("line", "full_address", "building", "floor"),
    [
        ("花蓮縣光復鄉大進村糖廠街19號A棟3樓", "花蓮縣光復鄉大進村糖廠街19號", "A棟", "3樓"),
        ("臺北市中正區中正路1號3樓(B棟)", "臺北市中正區中正路1號", "B棟", "3樓"),
        ("臺北市中正區中正路1號甲棟", "臺北市中正區中正路1號", "甲棟", None),
    ],
)
def test_a_building_after_the_door_is_the_building_section(line, full_address, building, floor):
    """A 棟 before or after the floor comes off the line as the building section, leaving the 號."""
    parts = parse_tw_address(line)
    assert (parts.full_address, parts.building_section, parts.floor) == (full_address, building, floor)
    assert parts.no is not None


@pytest.mark.parametrize(
    ("line", "building", "floor", "room"),
    [
        ("臺北市中正區忠孝東路一段100號3樓5號室", None, "3樓", "5"),
        ("臺北市中正區中正路100號10樓B座", "B座", "10樓", None),
        ("臺北市中正區中正路100號B座", "B座", None, None),
    ],
)
def test_a_hao_shi_room_and_a_zuo_building_are_units(line, building, floor, room):
    """5號室 is room 5 and B座 is a building like B棟; the door keeps its 號."""
    parts = parse_tw_address(line)
    assert parts.full_address.endswith("100號") and parts.no == "100號"
    assert (parts.building_section, parts.floor, parts.room) == (building, floor, room)


@pytest.mark.parametrize(
    "line",
    ["臺北市中正區中正路100號3-5樓", "臺北市中正區中正路100號後面的鐵皮屋"],
)
def test_unrecognised_text_after_the_door_never_moves_the_door(line):
    """Whatever follows the 號 and is not a unit stays in the line, with the road and 號 still right."""
    parts = parse_tw_address(line)
    assert (parts.full_address, parts.road, parts.no) == (line, "中正路", "100號")


@pytest.mark.parametrize(
    ("line", "floor", "room"),
    [
        ("臺北市信義區信義路五段7號5樓之502室", "5樓", "502"),
        ("臺北市信義區信義路五段7號5樓-502室", "5樓", "502"),
        ("臺北市大安區和平東路1號2樓-301室", "2樓", "301"),
    ],
)
def test_a_multi_digit_room_after_a_floor_keeps_all_its_digits(line, floor, room):
    """The floor's 之/- suffix never eats the digits of a room that follows it."""
    parts = parse_tw_address(line)
    assert (parts.floor, parts.room) == (floor, room)


def test_a_room_written_after_zhi_is_the_room():
    """10樓之3室 reads as floor 10樓 and room 3, with nothing left dangling in the line."""
    parts = parse_tw_address("臺中市西區五權西路一段10號10樓之3室")
    assert (parts.full_address, parts.road, parts.floor, parts.room) == (
        "臺中市西區五權西路一段10號",
        "五權西路",
        "10樓",
        "3",
    )


@pytest.mark.parametrize(
    ("line", "road", "no", "floor"),
    [
        ("屏東縣枋寮鄉村前路5號 1F-A", "村前路", "5號", "1F-A"),
        ("高雄市三民區建工路2號-3", "建工路", "2號之3", None),
        ("高雄市三民區建工路2號之3", "建工路", "2號之3", None),
    ],
)
def test_a_unit_letter_or_a_sub_number_after_the_hao_is_not_the_road(line, road, no, floor):
    """1F-A and 號-3 are read as floor and number instead of falling into the road."""
    parts = parse_tw_address(line)
    assert (parts.road, parts.no, parts.floor) == (road, no, floor)


@pytest.mark.parametrize(
    ("line", "village", "road"),
    [
        ("臺北市大安區中里路3號", None, "中里路"),
        ("臺中市南屯區中村路1段10號", None, "中村路"),
        ("花蓮縣吉安鄉中里北路12號", None, "中里北路"),
        ("花蓮縣光復鄉大進村糖廠街19號", "大進村", "糖廠街"),
        ("花蓮縣新城鄉嘉里村1鄰北埔路1號", "嘉里村", "北埔路"),
        ("臺中市大里區大里里1鄰中興路1號", "大里里", "中興路"),
    ],
)
def test_a_road_named_with_village_or_li_is_not_a_village(line, village, road):
    """中里路 is a road, not the village 中里 followed by 路."""
    parts = parse_tw_address(line)
    assert (parts.village, parts.road) == (village, road)


def test_a_bare_door_number_is_not_a_postcode():
    """Only digits in front of a county are a postcode; 100號 on its own is the door."""
    assert (parse_tw_address("100號").full_address, parse_tw_address("100號").no) == ("100號", "100號")


@pytest.mark.parametrize(
    ("line", "full_address", "floor", "room"),
    [
        ("臺北市大安區和平東路100號之1-3樓", "臺北市大安區和平東路100號之1", "3樓", None),
        ("臺北市中山南路1號-3室", "臺北市中山南路1號", None, "3"),
    ],
)
def test_the_separator_before_a_floor_or_room_leaves_with_it(line, full_address, floor, room):
    """A - or 之 before the 樓 or 室 goes with it, so the line ends at the door."""
    parts = parse_tw_address(line)
    assert (parts.full_address, parts.floor, parts.room) == (full_address, floor, room)


def test_a_hyphenated_number_reads_as_zhi():
    """19-1號 is stored the way TGOS writes it, 19之1號, in the line as well as the number."""
    parts = parse_tw_address("花蓮縣光復鄉糖廠街19-1號")
    assert (parts.full_address, parts.no) == ("花蓮縣光復鄉糖廠街19之1號", "19之1號")


@pytest.mark.parametrize(
    ("line", "lane", "alley"),
    [
        ("臺北市中正區中山路1之2巷3號", "1之2巷", None),
        ("臺北市中正區中山路1-2巷3號", "1之2巷", None),
        ("臺北市中正區中山路1巷2之1弄5號", "1巷", "2之1弄"),
    ],
)
def test_a_sub_numbered_lane_or_alley_stays_whole(line, lane, alley):
    """1之2巷 and 2之1弄 are one lane and one alley, so no fragment is left in the road."""
    parts = parse_tw_address(line)
    assert (parts.road, parts.lane, parts.alley) == ("中山路", lane, alley)


def test_a_neighborhood_in_chinese_numerals_is_the_neighborhood():
    """三鄰 is a 鄰 like 3鄰, not the start of the road."""
    parts = parse_tw_address("花蓮縣光復鄉大進村三鄰糖廠街19號")
    assert (parts.neighborhood, parts.road) == ("三鄰", "糖廠街")


@pytest.mark.parametrize(
    ("line", "building", "floor", "room"),
    [
        ("臺北市中正區忠孝西路100號3樓(502室)", None, "3樓", "502"),
        ("臺北市中正區忠孝西路100號(A棟)3樓", "A棟", "3樓", None),
    ],
)
def test_a_bracketed_room_or_building_is_still_the_unit(line, building, floor, room):
    """A room or 棟 in brackets comes off the line like an unbracketed one, leaving the 號."""
    parts = parse_tw_address(line)
    assert parts.full_address.endswith("100號")
    assert (parts.building_section, parts.floor, parts.room) == (building, floor, room)


def test_a_postcode_spaces_and_full_width_digits_are_folded():
    """A postcode, spaces and full-width digits do not reach the stored line."""
    parts = parse_tw_address("  ９７６花蓮縣 光復鄉中山路三段１００號 ")
    assert parts.full_address == "花蓮縣光復鄉中山路三段100號"
    assert (parts.section, parts.no) == ("三段", "100號")


def test_a_road_named_like_a_lane_stays_the_road():
    """A road whose name ends in 巷 is not mistaken for a lane."""
    parts = parse_tw_address("花蓮縣光復鄉松羅南巷5號")
    assert (parts.road, parts.lane) == ("松羅南巷", None)


def test_a_sub_alley_stays_only_in_the_line():
    """衖 has no column of its own, but it must not swallow the 號 after it."""
    parts = parse_tw_address("臺北市中山區民生東路一段1巷2弄3衖4號")
    assert (parts.lane, parts.alley, parts.no) == ("1巷", "2弄", "4號")
    assert parts.full_address == "臺北市中山區民生東路一段1巷2弄3衖4號"


def test_a_road_only_address_parses():
    """An address with no 號, common in the countryside, still splits."""
    assert _set(parse_tw_address("花蓮縣光復鄉大平")) == {
        "full_address": "花蓮縣光復鄉大平",
        "county": "花蓮縣",
        "town": "光復鄉",
        "road": "大平",
    }


def test_unrecognised_text_stays_whole_and_is_not_a_road():
    """Free text is kept as the line, never passed off as a road."""
    assert _set(parse_tw_address("我家在糖廠附近")) == {"full_address": "我家在糖廠附近"}


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_blank_parses_to_nothing(blank):
    """Blank input gives an empty address, not an error."""
    assert parse_tw_address(blank) == AddressParts()
