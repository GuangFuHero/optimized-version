"""Map tile proxy service — fetches tiles from upstream sources with Redis caching."""

import base64
import contextlib
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

import httpx

from app.core.config import settings
from app.schemas.map import AttributionResponse
from app.services.address import NON_STRICT_SSL

# 1×1 transparent PNG (67 bytes)
BLANK_TILE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIAAQAABjkB6QAAAABJRU5ErkJggg=="
)


@dataclass
class SourceConfig:
    """Configuration for an upstream map tile source."""

    url_template: str
    image_format: str
    # False verifies with NON_STRICT_SSL instead of httpx's default context.
    strict_x509: bool = True
    # GIBS DescribeDomains URL; when set, `{date}` in url_template is the second-newest date it lists.
    dates_url: str | None = None
    # Seconds a fetched tile stays in Redis.
    cache_ttl: int = 604800
    # Deepest zoom the source serves; deeper requests get a blank tile without asking upstream.
    max_zoom: int | None = None
    # True keeps a tile as long as the upstream caching headers say, and cache_ttl only when they are missing.
    cache_from_headers: bool = False
    # True passes on the origin of the page that asked for the tile as Referer.
    forward_referer: bool = False


SOURCE_REGISTRY: dict[tuple[str, str], SourceConfig] = {
    # HLS Sentinel-2 at 30 m, native up to z12. Each day is one satellite pass, so areas outside it
    # come back transparent.
    ("satellite", "nasa_gibs"): SourceConfig(
        url_template=(
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
            "HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/"
            "GoogleMapsCompatible_Level12/{z}/{y}/{x}.png"
        ),
        image_format="image/png",
        dates_url=(
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/"
            "HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/"
            "GoogleMapsCompatible_Level12/all/all.xml"
        ),
        # The date moves daily, so a copy older than a day is never read again.
        cache_ttl=86400,
        max_zoom=12,
    ),
    ("satellite", "eox"): SourceConfig(
        url_template=("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"),
        image_format="image/jpeg",
    ),
    ("satellite", "nlsc"): SourceConfig(
        url_template="https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/EPSG:3857/{z}/{y}/{x}",
        image_format="image/jpeg",
        strict_x509=False,
    ),
    # The OSM Foundation tile usage policy asks a proxy to honour the caching headers (7 days when they are
    # missing) and to keep the browser's Referer.
    ("road", "osm"): SourceConfig(
        url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        image_format="image/png",
        cache_from_headers=True,
        forward_referer=True,
    ),
}

ATTRIBUTION_REGISTRY: dict[tuple[str, str], AttributionResponse] = {
    ("satellite", "nasa_gibs"): AttributionResponse(
        source="nasa_gibs",
        type="satellite",
        name="NASA GIBS",
        license="US Gov Open Data",
        attribution_text=(
            "Imagery provided by NASA's Global Imagery Browse Services (GIBS), "
            "part of NASA's ESDIS (HLS, contains modified Copernicus Sentinel data)"
        ),
        attribution_url=(
            "https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs"
        ),
        image_format="image/png",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes="One satellite pass from the second-newest date GIBS lists; areas outside it are blank.",
    ),
    ("satellite", "eox"): AttributionResponse(
        source="eox",
        type="satellite",
        name="EOxCloudless",
        license="CC BY-NC-SA 4.0",
        attribution_text=(
            "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH "
            "(Contains modified Copernicus Sentinel data 2024)"
        ),
        attribution_url="https://cloudless.eox.at",
        image_format="image/jpeg",
        commercial_use=False,
        requires_logo=False,
        logo_url=None,
        notes="Non-commercial use only.",
    ),
    ("satellite", "nlsc"): AttributionResponse(
        source="nlsc",
        type="satellite",
        name="內政部國土測繪中心",
        license="國土測繪圖資服務雲服務使用條款",
        attribution_text="© 內政部國土測繪中心",
        attribution_url="https://maps.nlsc.gov.tw/pro/use_clause.jsp",
        image_format="image/jpeg",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=(
            "No layer-specific licence found. The service terms allow public display with the source "
            "credited, and forbid bulk downloading and removing or covering source and copyright notices."
        ),
    ),
    ("road", "osm"): AttributionResponse(
        source="osm",
        type="road",
        name="OpenStreetMap",
        license="ODbL",
        attribution_text="© OpenStreetMap contributors",
        attribution_url="https://www.openstreetmap.org/copyright",
        image_format="image/png",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
    ),
}


def build_cache_key(
    source: str,
    type_: str,
    z: int,
    x: int,
    y: int,
    query_params: dict[str, str],
) -> str:
    """Build a Redis cache key for a tile request including sorted query params."""
    sorted_params = ",".join(f"{k}={v}" for k, v in sorted(query_params.items())) if query_params else "_"
    return f"tile:{source}:{type_}:{sorted_params}:{z}:{x}:{y}"


def upstream_headers(referer: str | None = None) -> dict[str, str]:
    """Headers for an upstream request: the configured User-Agent, plus the origin of `referer` if given.

    Only the origin is passed on, as a browser does by default for a cross-origin request, so a page's path
    and query never leave the platform.
    """
    headers = {"User-Agent": settings.UPSTREAM_USER_AGENT}
    parts = urlsplit(referer or "")
    if parts.scheme in ("http", "https") and parts.netloc:
        headers["Referer"] = f"{parts.scheme}://{parts.netloc}/"
    return headers


def cache_ttl_from_headers(headers, default: int) -> int:
    """Seconds a response may be cached by its `Cache-Control: max-age` or `Expires`, else `default`.

    `max-age` counts from when the response was made, so the `Age` an upstream cache adds is taken off, and an
    unreadable `Expires` counts as already expired, as HTTP defines both.
    """
    max_age = re.search(r"\bmax-age=(\d+)", headers.get("cache-control", ""), re.IGNORECASE)
    if max_age:
        age = headers.get("age", "")
        return int(max_age.group(1)) - (int(age) if age.isdigit() else 0)
    if "expires" not in headers:
        return default
    try:
        sent = parsedate_to_datetime(headers["date"]) if "date" in headers else datetime.now(UTC)
        return int((parsedate_to_datetime(headers["expires"]) - sent).total_seconds())
    except (TypeError, ValueError):
        return 0


def get_source_config(type_: str, source: str) -> SourceConfig | None:
    """Return the SourceConfig for the given tile type and source name, or None."""
    return SOURCE_REGISTRY.get((type_, source))


def get_attribution(type_: str, source: str) -> AttributionResponse | None:
    """Return the AttributionResponse for the given tile type and source name, or None."""
    return ATTRIBUTION_REGISTRY.get((type_, source))


async def resolve_tile_date(redis, source: str, dates_url: str) -> str | None:
    """Return the second-newest date GIBS lists at dates_url, or None if it cannot be read.

    The newest day is often still empty over Taiwan. The answer is cached in Redis for an hour so tile
    requests do not each ask GIBS.
    """
    cache_key = f"tile:{source}:date"
    try:
        cached = await redis.get(cache_key)
        if cached:
            return cached.decode()
    except Exception:
        pass  # Redis down — ask GIBS directly

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=upstream_headers()) as client:
            response = await client.get(dates_url)
        # The domain is comma-separated dates or ranges such as "2026-03-02/2026-10-22/P1D", newest last,
        # with gaps between them that GIBS answers with 404. Only each item's last two days can matter.
        domain = re.search(r"<Domain>([^<]+)</Domain>", response.text).group(1)
        days = []
        for item in domain.split(","):
            bounds = item.strip().split("/")[:2]
            start, end = date.fromisoformat(bounds[0]), date.fromisoformat(bounds[-1])
            days += [end - timedelta(days=1), end] if start < end else [end]
        tile_date = days[-2 if len(days) > 1 else -1].isoformat()
    except Exception:
        return None

    with contextlib.suppress(Exception):
        await redis.set(cache_key, tile_date, ex=3600)

    return tile_date


async def fetch_tile(
    redis,
    source: str,
    type_: str,
    z: int,
    x: int,
    y: int,
    query_params: dict[str, str],
    referer: str | None = None,
) -> tuple[bytes, str]:
    """Return (tile_bytes, content_type) for the requested tile.

    Checks Redis cache first. On miss, fetches upstream and caches result.
    On any upstream error, returns BLANK_TILE.
    If Redis is unavailable, bypasses cache and fetches upstream directly.
    A source with `dates_url` resolves its tile date first, and the date becomes part of the cache key.
    `referer` is the Referer of the browser's request, passed on only to a source with `forward_referer`.
    """
    config = get_source_config(type_, source)
    if config.max_zoom is not None and z > config.max_zoom:
        return BLANK_TILE, "image/png"
    params = dict(query_params)
    if config.dates_url:
        tile_date = await resolve_tile_date(redis, source, config.dates_url)
        if tile_date is None:
            return BLANK_TILE, "image/png"
        params["date"] = tile_date
    cache_key = build_cache_key(source, type_, z, x, y, params)

    # --- Cache check ---
    try:
        cached = await redis.hgetall(cache_key)
        if cached and b"data" in cached:
            return cached[b"data"], cached[b"ct"].decode()
    except Exception:
        cached = None  # Redis down — proceed to upstream

    # --- Upstream fetch ---
    url = config.url_template.format(z=z, x=x, y=y, date=params.get("date", ""))

    try:
        verify = True if config.strict_x509 else NON_STRICT_SSL
        headers = upstream_headers(referer if config.forward_referer else None)
        async with httpx.AsyncClient(timeout=10.0, verify=verify, headers=headers) as client:
            response = await client.get(url)

        if response.status_code != 200:
            return BLANK_TILE, "image/png"

        tile_bytes = response.content
        content_type = response.headers.get("content-type", config.image_format)
        ttl = (
            cache_ttl_from_headers(response.headers, config.cache_ttl)
            if config.cache_from_headers
            else config.cache_ttl
        )

    except Exception:
        return BLANK_TILE, "image/png"

    # --- Store in cache (best-effort, skip if Redis down) ---
    # An expiry of zero or less deletes the key, so a tile that is already stale is not kept.
    try:
        await redis.hset(cache_key, mapping={"data": tile_bytes, "ct": content_type})
        await redis.expire(cache_key, ttl)
    except Exception:
        pass

    return tile_bytes, content_type
