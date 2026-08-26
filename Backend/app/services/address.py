"""Address normalization and validation (L1–L3), plus the guard every address write calls.

Layered on `app/core/address.py`'s pure parser (L0):

    L0  parse / fold                app.core.address        the ONLY layer that rejects
    L1  does it exist?              ref_roads, ref_villages  government data, COMPLETE
    L2  does it agree with the pin? ST_Contains              government polygons, COMPLETE
    L3  does the 號 exist?          osm_address_points       OpenStreetMap, not authoritative

Only L0 rejects. L1–L3 downgrade a status, because refusing a rescue report on the grounds that
OpenStreetMap has not mapped a house number would lose real reports during a disaster. OSM's
Taiwanese coverage is good (~9.2M address nodes against the government's ~8M 門牌) but it is not
authoritative and it is not guaranteed, so everything that parses is stored and
`normalization_status` records how far it got, for admins to triage afterwards.

Same flat-service style as station.py (ADR-013/014): `db` first, then keyword-only args, and
`ValueError` as the entire client-visible error vocabulary (schema.py's MaskErrors allow-lists
it, so these messages reach the caller verbatim).
"""

from dataclasses import dataclass, field, replace

from shapely.geometry import shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.address import AddressParts, fold, format_tw_address, parse_tw_address
from app.repositories import address_repository as ref

# Status vocabulary. Ordered worst-first: `_worst` picks the most actionable one when several
# apply, so a pin disagreement is never hidden behind a successful road match.
STATUS_PIN_MISMATCH = "pin_mismatch"
STATUS_UNVERIFIED = "unverified"
STATUS_CORRECTED = "corrected"
STATUS_VERIFIED = "verified"
_PRIORITY = (STATUS_PIN_MISMATCH, STATUS_UNVERIFIED, STATUS_CORRECTED, STATUS_VERIFIED)

# A matched address point further than this from the supplied pin is reported as an issue rather
# than silently accepted: 500 m is well beyond GPS error but well inside a rural 村.
_FAR_FROM_PIN_M = 500.0

# Candidates fetched per requested suggestion, to survive deduplication (see _suggest_from_coordinate).
_OVERFETCH = 4

# Column widths in secondary_locations. Checked here rather than left to the driver, because
# asyncpg quotes the whole failing statement on truncation — the leak class schema.py masks.
_LIMITS = {
    "county": 50,
    "town": 50,
    "village": 50,
    "road": 100,
    "section": 10,
    "lane": 20,
    "alley": 20,
    "no": 20,
    "floor": 20,
    "room": 20,
    "formatted": 255,
}

_ADDRESS_FIELDS = tuple(f for f in _LIMITS if f != "formatted")


@dataclass
class Suggestion:
    """One candidate address near a coordinate."""

    parts: AddressParts
    formatted: str
    distance_m: float | None = None


@dataclass
class NormalizedAddress:
    """The graded result of one normalization request."""

    normalizable: bool
    status: str
    parts: AddressParts
    formatted: str | None = None
    lat: float | None = None
    lng: float | None = None
    distance_m: float | None = None
    issues: list[str] = field(default_factory=list)
    suggestions: list[Suggestion] = field(default_factory=list)


def _worst(*statuses: str) -> str:
    """Return the most actionable of the given statuses (see `_PRIORITY`)."""
    return min((s for s in statuses if s), key=_PRIORITY.index, default=STATUS_UNVERIFIED)


def _point_of(geometry: dict | None) -> tuple[float, float] | None:
    """Extract (lat, lng) from a GeoJSON Point, or None. Callers validate the shape first."""
    if not geometry:
        return None
    x, y = shape(geometry).coords[0][:2]
    return y, x


def _parts_from_components(values: dict) -> AddressParts:
    """Build AddressParts from already-separated input fields, folding each one."""
    return AddressParts(**{f: fold(values.get(f)) for f in AddressParts.__dataclass_fields__})


def _parts_from_point(point, village) -> AddressParts:
    """Build AddressParts from an OSM address point, filling admin gaps from the 村里 polygon."""
    return AddressParts(
        county=(point.county if point else None) or (village.county if village else None),
        town=(point.town if point else None) or (village.town if village else None),
        village=(point.village if point else None) or (village.village if village else None),
        road=point.road if point else None,
        section=point.section if point else None,
        lane=point.lane if point else None,
        alley=point.alley if point else None,
        no=point.no if point else None,
    )


def _reattached_lane(parts: AddressParts, published: list[str]) -> AddressParts | None:
    """Re-join a lane number the parser split off a road that is genuinely named ``…N巷``.

    ``竹田1巷`` is a published road name in 三星鄉, but the grammar reads a digit before 巷 as a
    lane, giving road=竹田 lane=1. Only the reference data can settle it, so this runs after an
    exact-match miss: if road+lane+巷 IS published, that reading wins.
    """
    if not (parts.road and parts.lane):
        return None
    candidate = f"{parts.road}{parts.lane}巷"
    if candidate not in published:
        return None
    return replace(parts, road=candidate, lane=None)


async def _resolve_road(db: AsyncSession, parts: AddressParts, issues: list[str]) -> tuple[AddressParts, str]:
    """L1 — check the road against 全國路名資料; return (possibly corrected parts, status)."""
    if not parts.road:
        return parts, STATUS_VERIFIED  # nothing to contradict; the ladder grades elsewhere
    if not (parts.county and parts.town):
        issues.append("road not checked: 縣市 and 鄉鎮市區 are needed to look it up")
        return parts, STATUS_UNVERIFIED

    if await ref.road_exists(db, county=parts.county, town=parts.town, road=parts.road):
        return parts, STATUS_VERIFIED

    published = await ref.roads_in_town(db, county=parts.county, town=parts.town)
    rejoined = _reattached_lane(parts, published)
    if rejoined is not None:
        return rejoined, STATUS_VERIFIED

    matches = await ref.similar_roads(db, county=parts.county, town=parts.town, road=parts.road)
    if matches:
        issues.append(f"road corrected: {parts.road} → {matches[0]}")
        return replace(parts, road=matches[0]), STATUS_CORRECTED

    issues.append(f"road not found in {parts.county}{parts.town}: {parts.road}")
    return parts, STATUS_UNVERIFIED


async def _apply_pin(
    db: AsyncSession, parts: AddressParts, lat: float, lng: float, issues: list[str]
) -> tuple[AddressParts, str]:
    """L2 — compare the text against the 村里 polygon under the pin, and fill gaps from it."""
    village = await ref.village_at_point(db, lat=lat, lng=lng)
    if village is None:
        issues.append("coordinate is outside the loaded 村里 boundaries")
        return parts, STATUS_UNVERIFIED

    if parts.town and parts.town != village.town:
        issues.append(
            f"address says {parts.county or ''}{parts.town} but the pin is in {village.county}{village.town}"
        )
        return parts, STATUS_PIN_MISMATCH

    # The pin is authoritative for anything the text left out — users rarely type 村里 correctly.
    return replace(
        parts,
        county=parts.county or village.county,
        town=parts.town or village.town,
        village=parts.village or village.village,
    ), STATUS_VERIFIED


async def _confirm_house_number(
    db: AsyncSession,
    parts: AddressParts,
    lat: float | None,
    lng: float | None,
    issues: list[str],
) -> tuple[str, float | None]:
    """L3 — look the exact 路+號 up in OSM. Returns (status, distance in metres)."""
    if not (parts.road and parts.no):
        issues.append("no house number to confirm")
        return STATUS_UNVERIFIED, None

    point = await ref.address_point_for(
        db, county=parts.county, town=parts.town, road=parts.road, no=parts.no
    )
    if point is None:
        issues.append("house number not present in OpenStreetMap (not necessarily wrong)")
        return STATUS_UNVERIFIED, None

    if lat is None or lng is None:
        return STATUS_VERIFIED, None

    distance = await ref.distance_to_point(db, point=point, lat=lat, lng=lng)
    if distance > _FAR_FROM_PIN_M:
        issues.append(f"matched address is {distance:.0f} m from the supplied pin")
        return STATUS_UNVERIFIED, distance
    return STATUS_VERIFIED, distance


async def _warn_if_unloaded(db: AsyncSession, issues: list[str]) -> bool:
    """Note any reference dataset that has not finished importing. True if all are ready.

    The import is detached from deploy (DEPLOY.md step 8), so an empty reference table is the
    normal state for the first minutes after a release. Saying so beats returning a bare "not
    found" that reads as "this address does not exist".
    """
    loaded = await ref.loaded_datasets(db)
    missing = {"ref_roads", "ref_villages", "osm_address_points"} - loaded
    if missing:
        issues.append(f"reference data still loading: {', '.join(sorted(missing))}")
    return not missing


def _check_request(raw: str | None, lat: float | None, lng: float | None, limit: int) -> int:
    """Validate the request shape and return a clamped `limit`.

    These are caller bugs, not un-normalizable data, so they raise rather than grading — the
    distinction the whole endpoint rests on.
    """
    if raw is None and lat is None and lng is None:
        raise ValueError("provide an address, a coordinate, or both")
    if (lat is None) != (lng is None):
        raise ValueError("lat and lng must be provided together")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("Invalid coordinates")
    return max(1, min(limit, 50))


def _unresolvable(issues: list[str], **coords) -> NormalizedAddress:
    """The "we could not resolve this" result — never an exception, per goal 1."""
    return NormalizedAddress(
        normalizable=False, status=STATUS_UNVERIFIED, parts=AddressParts(), issues=issues, **coords
    )


async def _suggest_from_coordinate(
    db: AsyncSession, lat: float, lng: float, limit: int, issues: list[str]
) -> tuple[list[Suggestion], AddressParts | None]:
    """Reverse-lookup a coordinate: ranked suggestions, plus the best single answer.

    The answer falls back through nearest OSM point → 村里 polygon → None. That middle step is
    why a pin in unmapped terrain still resolves: the government polygons cover all of Taiwan,
    while OSM address points do not.
    """
    village = await ref.village_at_point(db, lat=lat, lng=lng)
    # Over-fetch, because roughly half of OSM's Taiwanese address nodes are duplicates of an
    # address already present (8.86M points resolve to 4.46M distinct addresses — separate nodes
    # for entrances, floors and units). Without this a caller asking for 5 suggestions can get
    # the same building five times.
    nearby = await ref.nearest_address_points(db, lat=lat, lng=lng, limit=limit * _OVERFETCH)
    suggestions: list[Suggestion] = []
    seen: set[str] = set()
    for point, distance in nearby:
        candidate = _parts_from_point(point, village)
        formatted = format_tw_address(candidate)
        if not formatted or formatted in seen:
            continue
        seen.add(formatted)
        suggestions.append(Suggestion(parts=candidate, formatted=formatted, distance_m=distance))
        if len(suggestions) == limit:
            break

    if suggestions:
        return suggestions, suggestions[0].parts
    if village is not None:
        issues.append("no address point nearby; resolved to 村里 only")
        return suggestions, _parts_from_point(None, village)
    issues.append("coordinate is outside the loaded 村里 boundaries")
    return suggestions, None


async def normalize_address(
    db: AsyncSession,
    *,
    raw: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    limit: int = 5,
) -> NormalizedAddress:
    """Normalize an address from text, from a coordinate, or from both.

    Raises ValueError for a malformed *request* (neither input given, half a coordinate, a
    coordinate off the globe) — those are caller bugs. It never raises for un-normalizable
    *data*: that comes back as `normalizable=False` with the reason in `issues`, which is what
    lets a client show "we could not resolve this" without treating it as a failed request.
    """
    limit = _check_request(raw, lat, lng, limit)

    issues: list[str] = []
    await _warn_if_unloaded(db, issues)

    parts = AddressParts()
    if raw is not None:
        try:
            parts = parse_tw_address(raw)
        except ValueError as err:
            issues.append(str(err))
            return _unresolvable(issues)

    suggestions: list[Suggestion] = []
    if lat is not None:
        suggestions, from_pin = await _suggest_from_coordinate(db, lat, lng, limit, issues)
        if raw is None:
            if from_pin is None:
                return _unresolvable(issues, lat=lat, lng=lng)
            parts = from_pin

    parts, road_status = await _resolve_road(db, parts, issues)
    pin_status = STATUS_VERIFIED
    if lat is not None:
        parts, pin_status = await _apply_pin(db, parts, lat, lng, issues)
    number_status, distance = await _confirm_house_number(db, parts, lat, lng, issues)

    return NormalizedAddress(
        normalizable=True,
        status=_worst(road_status, pin_status, number_status),
        parts=parts,
        formatted=format_tw_address(parts),
        lat=lat,
        lng=lng,
        distance_m=distance,
        issues=issues,
        suggestions=suggestions,
    )


def _check_lengths(values: dict) -> None:
    """Raise ValueError if any normalized value is too long for its column."""
    for name, limit in _LIMITS.items():
        value = values.get(name)
        if value is not None and len(value) > limit:
            raise ValueError(f"{name} must be at most {limit} characters")


async def validate_secondary_location(
    db: AsyncSession, *, sl: dict | None, geometry: dict | None
) -> dict | None:
    """Normalize a secondary-location payload for storage; raise ValueError if unparseable.

    The write-path counterpart of `normalize_address`, and shaped exactly like
    `normalize_contact_fields` in geo_validation.py: it returns the values to persist, and
    **callers must store what comes back, never the raw input**. Splitting normalization from
    storage is what leaked an INSERT in the PR #40 review.

    Accepts either a `raw` full-address string or the separate components; `raw` wins when both
    are present. A `pole` location is returned untouched — a utility pole has no address.
    Called AFTER `require_scope` in every service, so an unauthorized caller can never probe the
    reference data through these messages.
    """
    if not sl:
        return sl
    out = dict(sl)
    raw = out.pop("raw", None)
    if out.get("location_type") == "pole":
        return out
    if raw is None and not any(out.get(f) for f in _ADDRESS_FIELDS):
        return out  # nothing address-shaped was supplied

    point = _point_of(geometry)
    lat, lng = point if point else (None, None)
    if raw is not None:
        result = await normalize_address(db, raw=raw, lat=lat, lng=lng)
    else:
        parts = _parts_from_components(out)
        result = await normalize_address(db, raw=format_tw_address(parts), lat=lat, lng=lng)

    if not result.normalizable:
        raise ValueError(result.issues[-1] if result.issues else "address could not be parsed")

    out.update(result.parts.as_dict())
    out["formatted"] = result.formatted
    out["normalization_status"] = result.status
    _check_lengths(out)
    return out
