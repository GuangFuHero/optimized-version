"""Address lookups against TGOS, and the address step of every write.

The frontend looks an address up before saving it, and each address TGOS confirms comes back with
a signed token. A save never calls TGOS: `apply_address` keeps the line as received, splits it into
columns and grades it by that token.
"""

import asyncio
import html
import json
import logging
import math
import re
import ssl
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta

import httpx
from jose import JWTError, jwt
from shapely.geometry import shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.address import MAX_ADDRESS_LENGTH, AddressParts, fold, parse_tw_address
from app.core.config import settings
from app.graphql.scalars import geom_to_geojson
from app.models.secondary_location import USER_INPUT_ADDRESS_LENGTH, SecondaryLocation
from app.repositories.geo_repository import secondary_location_repository
from app.services.column_lengths import check_lengths

logger = logging.getLogger("app.address")

FOUND, NOT_FOUND, AMBIGUOUS, UNAVAILABLE = "found", "not_found", "ambiguous", "unavailable"
VERIFIED, PIN_MISMATCH, UNVERIFIED = "verified", "pin_mismatch", "unverified"

PIN_TOLERANCE_M = 500.0  # well beyond GPS error, well inside a rural 村
_SEARCH_RADIUS_M = 500

_BASE_URL = "https://addr.tgos.tw/addrws/v40"
# Covers the wait for a free slot as well as the request itself.
_TIMEOUT_S = 3.0
# TGOS slows sharply once more than about four requests run at once.
_SLOTS = asyncio.Semaphore(4)
# TGOS's certificate has no Subject Key Identifier, which Python's strict mode rejects; the chain
# is still verified.
_SSL = ssl.create_default_context()
_SSL.verify_flags &= ~ssl.VERIFY_X509_STRICT
_STRING_RE = re.compile(r"<string[^>]*>(.*)</string>", re.S)

_TOKEN_TYPE = "address"
_TOKEN_LIFETIME = timedelta(days=1)  # long enough to finish a form
_UNIT_FIELDS = ("building_section", "floor", "room")
# The parts apply_address writes; `full_address` is built by the database from them.
_ADDRESS_COLUMNS = tuple(
    f for f in AddressParts.__dataclass_fields__ if f not in (*_UNIT_FIELDS, "full_address")
)

# QueryAddr takes every parameter on every call. Exact matches only: fuzzy matching lands on the
# nearest existing number, which can be a different house.
_QUERY_ADDR_PARAMS = {
    "oFuzzyType": 0,
    "oFuzzyBuffer": 0,
    "oIsOnlyFullMatch": "true",
    "oIsSupportPast": "true",
    "oIsShowCodeBase": "false",
    "oIsLockCounty": "false",
    "oIsLockTown": "false",
    "oIsLockVillage": "false",
    "oIsLockRoadSection": "false",
    "oIsLockLane": "false",
    "oIsLockAlley": "false",
    "oIsLockArea": "false",
    "oIsSameNumber_SubNumber": "false",
    "oCanIgnoreVillage": "true",
    "oCanIgnoreNeighborhood": "true",
    "oReturnMaxCount": 2,
}


@dataclass(frozen=True)
class AddressLookup:
    """One lookup's answer; `parts`, the point and the token are set only when `status` is found."""

    status: str
    parts: AddressParts = field(default_factory=AddressParts)
    lat: float | None = None
    lng: float | None = None
    distance_m: float | None = None
    pin_mismatch: bool = False
    token: str | None = None


def point_of(geometry: dict | None) -> tuple[float, float] | None:
    """(lat, lng) of a GeoJSON Point, or None."""
    if not geometry:
        return None
    x, y = shape(geometry).coords[0][:2]
    return y, x


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in metres between two (lat, lng) points."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def _sign(full_address: str, lat: float, lng: float) -> str:
    """A token saying TGOS confirmed this exact line at this point."""
    expires = datetime.now(UTC) + _TOKEN_LIFETIME
    claims = {"type": _TOKEN_TYPE, "addr": full_address, "lat": lat, "lng": lng, "exp": expires}
    return jwt.encode(claims, settings.JWT_SIGNING_KEY, algorithm=settings.ALGORITHM)


def _confirmed_point(token: str | None, full_address: str) -> tuple[float, float] | None:
    """The official point a valid token gives for exactly this line, else None."""
    if not token:
        return None
    try:
        claims = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if claims.get("type") != _TOKEN_TYPE or claims.get("addr") != full_address:
        return None
    return float(claims["lat"]), float(claims["lng"])


def _payload(body: str) -> dict | None:
    """The JSON inside TGOS's `<string>` wrapper, or None for a refusal sent as plain text."""
    m = _STRING_RE.search(body)
    try:
        payload = json.loads(html.unescape(m.group(1) if m else body))
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


async def _tgos(operation: str, app_id: str, api_key: str, **params) -> dict | None:
    """POST one TGOS operation; its JSON, or None when unconfigured, slow, refused or failing."""
    if not (app_id and api_key):
        return None
    data = {"oAPPId": app_id, "oAPIKey": api_key, "oSRS": "EPSG:4326", "oResultDataType": "JSON", **params}
    try:
        async with asyncio.timeout(_TIMEOUT_S), _SLOTS, httpx.AsyncClient(verify=_SSL) as client:
            resp = await client.post(f"{_BASE_URL}/{operation}", data=data)
            resp.raise_for_status()
    except (httpx.HTTPError, TimeoutError) as err:
        # The request carries the keys and an address, so only the kind of failure is logged.
        logger.warning("TGOS %s failed: %s", operation, type(err).__name__)
        return None
    payload = _payload(resp.text)
    if payload is None:
        logger.warning("TGOS %s refused the request (wrong key or unregistered IP?)", operation)
    return payload


def _found(row: dict, pin: tuple[float, float] | None) -> AddressLookup:
    """Turn one TGOS address row into a found lookup, measured against `pin`."""
    parts = parse_tw_address(row.get("FULL_ADDR"))
    lat, lng = float(row["Y"]), float(row["X"])
    distance = _distance_m(pin, (lat, lng)) if pin else None
    return AddressLookup(
        status=FOUND,
        parts=parts,
        lat=lat,
        lng=lng,
        distance_m=distance,
        pin_mismatch=distance is not None and distance > PIN_TOLERANCE_M,
        token=_sign(parts.full_address, lat, lng),
    )


async def lookup_address(text: str, pin: tuple[float, float] | None = None) -> AddressLookup:
    """Look a typed address up in TGOS (exact match only), measured against the pin if given.

    A 棟/樓/室 typed into the line is not sent; it comes back in `parts` as building_section, floor, room.
    """
    typed = parse_tw_address(text)
    query = typed.full_address or fold(text)
    if not query:
        raise ValueError("address is required")
    if len(query) > MAX_ADDRESS_LENGTH:
        raise ValueError(f"address must be at most {MAX_ADDRESS_LENGTH} characters")
    payload = await _tgos(
        "QueryAddr.asmx/QueryAddr",
        settings.TGOS_ADDR_APP_ID,
        settings.TGOS_ADDR_API_KEY,
        oAddress=query,
        **_QUERY_ADDR_PARAMS,
    )
    if payload is None:
        return AddressLookup(UNAVAILABLE)
    rows = payload.get("AddressList") or []
    if not rows:
        return AddressLookup(NOT_FOUND)
    if len(rows) > 1:
        return AddressLookup(AMBIGUOUS)
    found = _found(rows[0], pin)
    return replace(found, parts=replace(found.parts, **{k: getattr(typed, k) for k in _UNIT_FIELDS}))


async def reverse_geocode(lat: float, lng: float) -> AddressLookup:
    """The nearest 門牌 to a point, within 500 m."""
    payload = await _tgos(
        "GeoQueryAddr.asmx/PointQueryNearAddrByBuffer",
        settings.TGOS_GEO_APP_ID,
        settings.TGOS_GEO_API_KEY,
        oPX=lng,
        oPY=lat,
        oBuffer=_SEARCH_RADIUS_M,
    )
    if payload is None:
        return AddressLookup(UNAVAILABLE)
    rows = payload.get("AddressList") or []
    return _found(rows[0], (lat, lng)) if rows else AddressLookup(NOT_FOUND)


def _grade(token: str | None, full_address: str, point: tuple[float, float] | None) -> str:
    """Verified when the token confirms this line near the pin; pin_mismatch when far from it."""
    confirmed = _confirmed_point(token, full_address)
    if confirmed is None:
        return UNVERIFIED
    if point and _distance_m(point, confirmed) > PIN_TOLERANCE_M:
        return PIN_MISMATCH
    return VERIFIED


def apply_address(sl: dict | None, *, point: tuple[float, float] | None) -> dict | None:
    """The address step of every write: keep the received line, split it into columns, grade it by its token.

    Returns the values to store, which callers save in place of their input; only a part too long for
    its column is refused. `full_address` is never written: the database builds it from the parts.
    The received line is kept with its outer whitespace trimmed.
    """
    if sl is None:
        return None
    values = dict(sl)
    token = values.pop("address_token", None)
    received = (values.pop("full_address", None) or "").strip() or None
    parts = parse_tw_address(received)
    values |= {k: getattr(parts, k) for k in _ADDRESS_COLUMNS} | {"user_input_address": received}
    # A 棟/樓/室 typed into the line fills its field only when that was left empty; a filled field wins.
    for unit in _UNIT_FIELDS:
        values[unit] = values.get(unit) or getattr(parts, unit)
    values["normalization_status"] = _grade(token, parts.full_address, point) if parts.full_address else None
    # The folded line is checked as `full_address`, the name the API gives it, so a line too long is
    # refused with the message it has always had; the raw line and the remainder never exceed it by
    # more than whitespace, which the raw line's wider column holds.
    check_lengths(
        SecondaryLocation,
        full_address=parts.full_address,
        **{k: v for k, v in values.items() if k not in ("user_input_address", "remainder")},
    )
    if received and len(received) > USER_INPUT_ADDRESS_LENGTH:
        raise ValueError(f"full_address must be at most {USER_INPUT_ADDRESS_LENGTH} characters")
    return values


def same_address(existing, values: dict) -> bool:
    """Whether `values` (from `apply_address`) split into the parts and remainder `existing` already holds.

    A blank part and a missing one read the same. A 棟/樓/室 written in the new line must also match the one
    in the row's own columns, which are what the API shows; a line without one, such as the edit form's
    echo, matches any. An edit that clears or changes a 棟/樓/室 the stored line names replaces it, so the row
    never holds a unit its raw line contradicts; a unit the edit leaves as it was does not count.
    """
    if not all((getattr(existing, c) or None) == (values.get(c) or None) for c in _ADDRESS_COLUMNS):
        return False
    sent = parse_tw_address(values.get("user_input_address"))
    kept = parse_tw_address(existing.user_input_address)
    return all(
        not getattr(sent, u) or getattr(sent, u) == getattr(existing, u) for u in _UNIT_FIELDS
    ) and all(
        (getattr(existing, u) or None) == (values.get(u) or None)
        or not getattr(kept, u)
        or getattr(kept, u) == values.get(u)
        for u in _UNIT_FIELDS
    )


async def unverify_if_moved(db: AsyncSession, geometry_uuid: str, old_geometry, new_geometry: dict) -> None:
    """Drop a confirmed address to unverified when its point moves, since its token is gone."""
    if point_of(geom_to_geojson(old_geometry)) == point_of(new_geometry):
        return
    row = await secondary_location_repository.get_by_geometry(db, geometry_uuid)
    if row is not None and row.normalization_status in (VERIFIED, PIN_MISMATCH):
        row.normalization_status = UNVERIFIED
