"""Map tile proxy service — fetches tiles from upstream sources with Redis caching."""

import base64
import contextlib
import re
from dataclasses import dataclass, field
from datetime import date, timedelta

import httpx

from app.schemas.map import AttributionResponse

# 1×1 transparent PNG (67 bytes)
BLANK_TILE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIAAQAABjkB6QAAAABJRU5ErkJggg=="
)


@dataclass
class SourceConfig:
    """Configuration for an upstream map tile source."""

    url_template: str
    image_format: str
    headers: dict = field(default_factory=dict)
    verify_ssl: bool = True
    # GIBS DescribeDomains URL; when set, `{date}` in url_template is the day before the newest date it lists.
    dates_url: str | None = None


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
    ),
    ("satellite", "eox"): SourceConfig(
        url_template=("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"),
        image_format="image/jpeg",
    ),
    ("satellite", "nlsc"): SourceConfig(
        url_template="https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/EPSG:3857/{z}/{y}/{x}",
        image_format="image/png",
        headers={
            "Referer": "https://maps.nlsc.gov.tw/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",  # noqa: E501
        },
        verify_ssl=False,  # NLSC cert missing Subject Key Identifier — fails Python SSL validation
    ),
    ("satellite", "sinica"): SourceConfig(
        url_template=("https://gis.sinica.edu.tw/tileserver/file-exists.php?img={layer}/{z}/{x}/{y}"),
        image_format="image/png",
    ),
    ("road", "osm"): SourceConfig(
        url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        image_format="image/png",
    ),
    ("road", "carto"): SourceConfig(
        url_template="https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        image_format="image/png",
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
        notes="One satellite pass from the day before GIBS's newest date; areas outside it are blank.",
    ),
    ("satellite", "eox"): AttributionResponse(
        source="eox",
        type="satellite",
        name="Sentinel-2 Cloudless by EOX",
        license="CC BY-NC-SA 4.0",
        attribution_text=(
            "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH "
            "(Contains modified Copernicus Sentinel data 2024)"
        ),
        attribution_url="https://s2maps.eu",
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
        license="Taiwan Gov",
        attribution_text="© 內政部國土測繪中心",
        attribution_url="https://maps.nlsc.gov.tw",
        image_format="image/png",
        commercial_use=False,
        requires_logo=False,
        logo_url=None,
        notes="Non-commercial redistribution restricted.",
    ),
    ("satellite", "sinica"): AttributionResponse(
        source="sinica",
        type="satellite",
        name="中央研究院",
        license="Academic (unconfirmed)",
        attribution_text="© 中央研究院",
        attribution_url="https://gis.sinica.edu.tw/worldmap/",
        image_format="image/png",
        commercial_use=False,
        requires_logo=False,
        logo_url=None,
        notes="ToS unconfirmed — confirm before production use.",
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
    ("road", "carto"): AttributionResponse(
        source="carto",
        type="road",
        name="CARTO",
        license="OSM ODbL + CARTO ToS",
        attribution_text="© OpenStreetMap contributors, © CARTO",
        attribution_url="https://carto.com/attributions",
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


def get_source_config(type_: str, source: str) -> SourceConfig | None:
    """Return the SourceConfig for the given tile type and source name, or None."""
    return SOURCE_REGISTRY.get((type_, source))


def get_attribution(type_: str, source: str) -> AttributionResponse | None:
    """Return the AttributionResponse for the given tile type and source name, or None."""
    return ATTRIBUTION_REGISTRY.get((type_, source))


async def resolve_tile_date(redis, source: str, dates_url: str) -> str | None:
    """Return the day before the newest date GIBS lists at dates_url, or None if it cannot be read.

    The answer is cached in Redis for an hour so tile requests do not each ask GIBS.
    """
    cache_key = f"tile:{source}:date"
    try:
        cached = await redis.get(cache_key)
        if cached:
            return cached.decode()
    except Exception:
        pass  # Redis down — ask GIBS directly

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(dates_url)
        # The domain is comma-separated date ranges such as "2026-03-02/2026-10-22/P1D", newest last.
        domain = re.search(r"<Domain>([^<]+)</Domain>", response.text).group(1)
        newest = domain.split(",")[-1].split("/")
        tile_date = (
            date.fromisoformat(newest[1] if len(newest) > 1 else newest[0]) - timedelta(days=1)
        ).isoformat()
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
) -> tuple[bytes, str]:
    """Return (tile_bytes, content_type) for the requested tile.

    Checks Redis cache first. On miss, fetches upstream and caches result.
    On any upstream error, returns BLANK_TILE.
    If Redis is unavailable, bypasses cache and fetches upstream directly.
    A source with `dates_url` resolves its tile date first, and the date becomes part of the cache key.
    """
    config = get_source_config(type_, source)
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
    url = config.url_template.format(
        z=z, x=x, y=y, layer=params.get("layer", ""), date=params.get("date", "")
    )

    try:
        async with httpx.AsyncClient(timeout=10.0, verify=config.verify_ssl) as client:
            response = await client.get(url, headers=config.headers)

        if response.status_code != 200:
            return BLANK_TILE, "image/png"

        tile_bytes = response.content
        content_type = response.headers.get("content-type", config.image_format)

    except Exception:
        return BLANK_TILE, "image/png"

    # --- Store in cache (best-effort, skip if Redis down) ---
    try:
        await redis.hset(cache_key, mapping={"data": tile_bytes, "ct": content_type})
        await redis.expire(cache_key, 604800)
    except Exception:
        pass

    return tile_bytes, content_type
