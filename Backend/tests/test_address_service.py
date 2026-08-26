"""Tests for the L1–L3 grading ladder (app/services/address.py).

Reference data is hand-seeded, never imported: `conftest`'s `db` fixture drops and recreates the
schema for every test, so loading the real 35.8k roads and 7,987 polygons would dominate the
suite. The fixture below is a deliberately tiny slice of 光復鄉 built from values that exist in
the published data, so a test passing here means the same thing it would against production data.
"""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Point, Polygon

from app.models.reference import OsmAddressPoint, ReferenceDataset, RefRoad, RefVillage
from app.services.address import (
    STATUS_CORRECTED,
    STATUS_PIN_MISMATCH,
    STATUS_UNVERIFIED,
    STATUS_VERIFIED,
    normalize_address,
    validate_secondary_location,
)

# A square around 光復鄉 大全村 and a neighbouring square standing in for 鳳林鎮, so a
# pin/text disagreement can be produced without shipping real 8 MB polygons into the tests.
_DAQUAN = Polygon([(121.40, 23.64), (121.45, 23.64), (121.45, 23.68), (121.40, 23.68)])
_FENGLIN = Polygon([(121.45, 23.72), (121.50, 23.72), (121.50, 23.76), (121.45, 23.76)])

IN_DAQUAN = (23.66, 121.42)  # lat, lng
IN_FENGLIN = (23.74, 121.47)
OFF_TAIWAN = (10.0, 100.0)


def _point(lat: float, lng: float):
    return from_shape(Point(lng, lat), srid=4326)


@pytest_asyncio.fixture
async def refdata(db):
    """Seed a minimal but realistic reference slice and mark all three datasets ready."""
    db.add_all(
        [
            RefRoad(county="花蓮縣", town="光復鄉", road="中興路"),
            RefRoad(county="花蓮縣", town="光復鄉", road="中華路"),
            RefRoad(county="花蓮縣", town="光復鄉", road="大平"),  # published, no 路/街 suffix
            RefRoad(county="宜蘭縣", town="三星鄉", road="竹田1巷"),  # the ambiguous 巷-named road
            RefVillage(
                villcode="10015060005",
                county="花蓮縣",
                town="光復鄉",
                village="大全村",
                geom=from_shape(MultiPolygon([_DAQUAN]), srid=4326),
            ),
            RefVillage(
                villcode="10015040001",
                county="花蓮縣",
                town="鳳林鎮",
                village="長橋里",
                geom=from_shape(MultiPolygon([_FENGLIN]), srid=4326),
            ),
            OsmAddressPoint(
                id=1,
                geom=_point(*IN_DAQUAN),
                county="花蓮縣",
                town="光復鄉",
                village="大全村",
                road="中興路",
                no="10",
            ),
            OsmAddressPoint(
                id=2,
                geom=_point(23.6601, 121.4201),
                county="花蓮縣",
                town="光復鄉",
                village="大全村",
                road="中興路",
                no="12",
            ),
        ]
    )
    for name in ("ref_roads", "ref_villages", "osm_address_points"):
        db.add(ReferenceDataset(name=name, status="ready"))
    await db.commit()
    return db


# --------------------------------------------------------------------------- request errors


@pytest.mark.asyncio
async def test_requires_some_input(refdata):
    """Neither text nor a coordinate is a caller bug, so it raises rather than grading."""
    with pytest.raises(ValueError, match="provide an address"):
        await normalize_address(refdata)


@pytest.mark.asyncio
@pytest.mark.parametrize("lat,lng", [(23.66, None), (None, 121.42)])
async def test_half_a_coordinate_is_rejected(refdata, lat, lng):
    """A lone lat or lng cannot locate anything."""
    with pytest.raises(ValueError, match="together"):
        await normalize_address(refdata, lat=lat, lng=lng)


@pytest.mark.asyncio
@pytest.mark.parametrize("lat,lng", [(91.0, 121.0), (23.0, 181.0), (-91.0, 0.0)])
async def test_coordinates_off_the_globe_are_rejected(refdata, lat, lng):
    """Same bounds and message as geo_validation.validate_point."""
    with pytest.raises(ValueError, match="Invalid coordinates"):
        await normalize_address(refdata, lat=lat, lng=lng)


# --------------------------------------------------------------------------- text only


@pytest.mark.asyncio
async def test_text_only_verified(refdata):
    """A published road with a house number OSM knows grades as verified."""
    result = await normalize_address(refdata, raw="花蓮縣光復鄉中興路10號")
    assert result.normalizable
    assert result.status == STATUS_VERIFIED
    assert result.formatted == "花蓮縣光復鄉中興路10號"


@pytest.mark.asyncio
async def test_typo_is_corrected_not_rejected(refdata):
    """中興街 trigram-matches the published 中興路; the canonical spelling is what comes back."""
    result = await normalize_address(refdata, raw="花蓮縣光復鄉中興街10號")
    assert result.status == STATUS_CORRECTED
    assert result.parts.road == "中興路"
    assert any("corrected" in issue for issue in result.issues)


@pytest.mark.asyncio
async def test_unknown_road_is_unverified_not_an_error(refdata):
    """An unpublished road downgrades the status; it never refuses the write."""
    result = await normalize_address(refdata, raw="花蓮縣光復鄉不存在的路9號")
    assert result.normalizable
    assert result.status == STATUS_UNVERIFIED
    assert any("not found" in issue for issue in result.issues)


@pytest.mark.asyncio
async def test_named_lane_road_is_reattached(refdata):
    """竹田1巷 parses as road=竹田 lane=1, and the reference data puts it back together."""
    result = await normalize_address(refdata, raw="宜蘭縣三星鄉竹田1巷5號")
    assert result.parts.road == "竹田1巷"
    assert result.parts.lane is None


@pytest.mark.asyncio
async def test_unparseable_text_is_a_result_not_an_error(refdata):
    """This is goal 1's "tell me it is not normalizable" — no exception, no GraphQL error."""
    result = await normalize_address(refdata, raw="asdfgh")
    assert result.normalizable is False
    assert result.issues


# --------------------------------------------------------------------------- coordinate only


@pytest.mark.asyncio
async def test_coordinate_resolves_to_nearest_address(refdata):
    """A pin with an address point nearby answers at 門牌 level and ranks the alternatives."""
    result = await normalize_address(refdata, lat=IN_DAQUAN[0], lng=IN_DAQUAN[1])
    assert result.normalizable
    assert result.formatted == "花蓮縣光復鄉大全村中興路10號"
    assert [s.parts.no for s in result.suggestions] == ["10", "12"]  # nearest first
    assert result.suggestions[0].distance_m == pytest.approx(0, abs=1)


@pytest.mark.asyncio
async def test_coordinate_without_address_points_falls_back_to_the_village(db):
    """The 村里 polygons have complete coverage, so a pin always resolves to something.

    Uses the bare `db` fixture with only a village seeded — the case where OpenStreetMap has
    mapped nothing nearby, which a spot check suggests is the majority of rural Taiwan.
    """
    db.add(
        RefVillage(
            villcode="10015060005",
            county="花蓮縣",
            town="光復鄉",
            village="大全村",
            geom=from_shape(MultiPolygon([_DAQUAN]), srid=4326),
        )
    )
    db.add(ReferenceDataset(name="ref_villages", status="ready"))
    await db.commit()

    result = await normalize_address(db, lat=IN_DAQUAN[0], lng=IN_DAQUAN[1])
    assert result.normalizable
    assert result.formatted == "花蓮縣光復鄉大全村"
    assert any("村里 only" in issue for issue in result.issues)


@pytest.mark.asyncio
async def test_suggestions_are_deduplicated(db):
    """OSM carries several nodes per address, so the same building must not fill the list.

    Roughly half of OSM's Taiwanese address nodes duplicate an address already present (a real
    import loads 8.86M points that resolve to 4.46M distinct addresses — separate nodes for
    entrances, floors and units), and un-deduplicated a request for 5 suggestions came back as
    the same address five times.
    """
    db.add(
        RefVillage(
            villcode="10015060005",
            county="花蓮縣",
            town="光復鄉",
            village="大全村",
            geom=from_shape(MultiPolygon([_DAQUAN]), srid=4326),
        )
    )
    for i in range(6):  # six nodes, one address
        db.add(
            OsmAddressPoint(
                id=100 + i,
                geom=_point(23.6600 + i * 0.00001, 121.4200),
                county="花蓮縣",
                town="光復鄉",
                village="大全村",
                road="中興路",
                no="10",
            )
        )
    db.add(
        OsmAddressPoint(
            id=200,
            geom=_point(23.6605, 121.4200),
            county="花蓮縣",
            town="光復鄉",
            village="大全村",
            road="中興路",
            no="12",
        )
    )
    for name in ("ref_roads", "ref_villages", "osm_address_points"):
        db.add(ReferenceDataset(name=name, status="ready"))
    await db.commit()

    result = await normalize_address(db, lat=23.66, lng=121.42, limit=5)
    assert [s.formatted for s in result.suggestions] == [
        "花蓮縣光復鄉大全村中興路10號",
        "花蓮縣光復鄉大全村中興路12號",
    ]


@pytest.mark.asyncio
async def test_coordinate_outside_taiwan_is_not_normalizable(refdata):
    """Null island and anywhere else off the map: a result, not a crash."""
    result = await normalize_address(refdata, lat=OFF_TAIWAN[0], lng=OFF_TAIWAN[1])
    assert result.normalizable is False
    assert any("outside" in issue for issue in result.issues)


@pytest.mark.asyncio
@pytest.mark.parametrize("limit,expected", [(0, 1), (-5, 1), (10_000, 2)])
async def test_limit_is_clamped(refdata, limit, expected):
    """A hostile or careless limit is clamped to 1–50 rather than reaching the query."""
    result = await normalize_address(refdata, lat=IN_DAQUAN[0], lng=IN_DAQUAN[1], limit=limit)
    assert len(result.suggestions) == expected


# --------------------------------------------------------------------------- text + pin


@pytest.mark.asyncio
async def test_pin_fills_in_the_village(refdata):
    """Users rarely type 村里, so the polygon under the pin supplies it."""
    result = await normalize_address(
        refdata, raw="花蓮縣光復鄉中興路10號", lat=IN_DAQUAN[0], lng=IN_DAQUAN[1]
    )
    assert result.parts.village == "大全村"
    assert result.status == STATUS_VERIFIED


@pytest.mark.asyncio
async def test_pin_mismatch_beats_a_good_road_match(refdata):
    """The most actionable status wins: a correct road in the wrong township is still wrong."""
    result = await normalize_address(
        refdata, raw="花蓮縣光復鄉中興路10號", lat=IN_FENGLIN[0], lng=IN_FENGLIN[1]
    )
    assert result.status == STATUS_PIN_MISMATCH
    assert any("鳳林鎮" in issue for issue in result.issues)


@pytest.mark.asyncio
async def test_far_from_pin_is_reported(refdata):
    """A matched 門牌 hundreds of metres from the pin is surfaced, not silently accepted."""
    result = await normalize_address(refdata, raw="花蓮縣光復鄉中興路10號", lat=23.67, lng=121.44)
    assert result.status == STATUS_UNVERIFIED
    assert any("from the supplied pin" in issue for issue in result.issues)


# --------------------------------------------------------------------------- degraded mode


@pytest.mark.asyncio
async def test_missing_reference_data_degrades_rather_than_failing(db):
    """The import is detached from deploy, so empty tables are normal right after a release."""
    result = await normalize_address(db, raw="花蓮縣光復鄉中興路10號")
    assert result.normalizable  # still parses and still returns components
    assert result.status == STATUS_UNVERIFIED
    assert any("still loading" in issue for issue in result.issues)


# --------------------------------------------------------------------------- the write guard


POINT_IN_DAQUAN = {"type": "Point", "coordinates": [IN_DAQUAN[1], IN_DAQUAN[0]]}


@pytest.mark.asyncio
async def test_write_guard_returns_values_to_persist(refdata):
    """The caller stores what comes back — the normalize_contact_fields contract."""
    out = await validate_secondary_location(
        refdata,
        sl={"location_type": "address", "raw": "花蓮縣光復鄉中興路10號"},
        geometry=POINT_IN_DAQUAN,
    )
    assert out["town"] == "光復鄉"
    assert out["village"] == "大全村"  # filled from the pin
    assert out["formatted"] == "花蓮縣光復鄉大全村中興路10號"
    assert out["normalization_status"] == STATUS_VERIFIED
    assert "raw" not in out  # input-only; there is no such column


@pytest.mark.asyncio
async def test_write_guard_accepts_components_without_raw(refdata):
    """Structured input is normalized through exactly the same path as a raw string."""
    out = await validate_secondary_location(
        refdata,
        sl={"location_type": "address", "county": "臺北市", "town": "信義區", "road": "松智路", "no": "7"},
        geometry=None,
    )
    assert out["county"] == "台北市"  # folded, matching the reference tables
    assert out["formatted"] == "台北市信義區松智路7號"


@pytest.mark.asyncio
async def test_write_guard_rejects_unparseable(refdata):
    """The one hard failure: a mutation refuses garbage rather than storing it."""
    with pytest.raises(ValueError):
        await validate_secondary_location(
            refdata, sl={"location_type": "address", "raw": "asdfgh"}, geometry=None
        )


@pytest.mark.asyncio
async def test_write_guard_rejects_over_long_input_before_the_insert(refdata):
    """An oversized value must never reach the driver — see MaskErrors in app/graphql/schema.py."""
    with pytest.raises(ValueError, match="at most"):
        await validate_secondary_location(
            refdata, sl={"location_type": "address", "raw": "花" * 500}, geometry=None
        )


@pytest.mark.asyncio
async def test_write_guard_stores_an_unverified_address(refdata):
    """Accept-with-status: an unmappable house number is persisted, flagged, never refused."""
    out = await validate_secondary_location(
        refdata,
        sl={"location_type": "address", "raw": "花蓮縣光復鄉中興路999號"},
        geometry=POINT_IN_DAQUAN,
    )
    assert out["normalization_status"] == STATUS_UNVERIFIED
    assert out["no"] == "999"


@pytest.mark.asyncio
async def test_write_guard_leaves_pole_locations_alone(refdata):
    """A utility pole has no address, so nothing is parsed and nothing is rejected."""
    sl = {"location_type": "pole", "pole_id": "A123", "pole_type": "電線桿"}
    assert await validate_secondary_location(refdata, sl=sl, geometry=None) == sl


@pytest.mark.asyncio
async def test_write_guard_passes_through_an_empty_payload(refdata):
    """No address supplied is not an error — the field is optional on every mutation."""
    assert await validate_secondary_location(refdata, sl=None, geometry=None) is None
    sl = {"location_type": "address"}
    assert await validate_secondary_location(refdata, sl=sl, geometry=None) == sl
