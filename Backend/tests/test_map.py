"""Unit tests for map tile proxy service: cache key generation and attribution lookup."""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient

os.environ["ENV"] = "testing"

from app.main import app  # noqa: E402
from app.schemas.map import AttributionResponse  # noqa: E402
from app.services.tile_proxy import (  # noqa: E402
    BLANK_TILE,
    build_cache_key,
    fetch_tile,
    get_attribution,
    get_source_config,
    resolve_tile_date,
)
from tests.conftest import TEST_REDIS_URL  # noqa: E402


def test_attribution_response_valid():
    """AttributionResponse is valid without a logo when requires_logo is False."""
    resp = AttributionResponse(
        source="nasa_gibs",
        type="satellite",
        name="NASA GIBS",
        license="US Gov Open Data",
        attribution_text="Imagery provided by NASA's Global Imagery Browse Services (GIBS), part of NASA's ESDIS",  # noqa: E501
        attribution_url="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs",
        image_format="image/jpeg",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
    )
    assert resp.source == "nasa_gibs"
    assert resp.logo_url is None


def test_attribution_response_with_logo():
    """AttributionResponse with requires_logo=True and a valid logo_url is accepted."""
    resp = AttributionResponse(
        source="mapbox",
        type="road",
        name="Mapbox",
        license="Mapbox ToS",
        attribution_text="© Mapbox, © OpenStreetMap contributors",
        attribution_url="https://www.mapbox.com/about/maps/",
        image_format="image/png",
        commercial_use=True,
        requires_logo=True,
        logo_url="https://www.mapbox.com/mapbox-logo/",
        notes=None,
    )
    assert resp.requires_logo is True
    assert resp.logo_url == "https://www.mapbox.com/mapbox-logo/"


def test_attribution_response_requires_logo_without_url_raises():
    """AttributionResponse raises ValueError when requires_logo=True but logo_url is None."""
    with pytest.raises(ValueError):
        AttributionResponse(
            source="mapbox",
            type="road",
            name="Mapbox",
            license="Mapbox ToS",
            attribution_text="© Mapbox",
            attribution_url="https://www.mapbox.com/about/maps/",
            image_format="image/png",
            commercial_use=True,
            requires_logo=True,
            logo_url=None,
            notes=None,
        )


def test_cache_key_no_params():
    """Cache key with empty params uses underscore sentinel."""
    key = build_cache_key("nasa_gibs", "satellite", 10, 123, 456, {})
    assert key == "tile:nasa_gibs:satellite:_:10:123:456"


def test_cache_key_with_one_param():
    """Cache key with a single query param includes it in the key."""
    key = build_cache_key("sinica", "satellite", 10, 1, 2, {"layer": "EARTH"})
    assert key == "tile:sinica:satellite:layer=EARTH:10:1:2"


def test_cache_key_params_sorted():
    """Cache key sorts multiple query params alphabetically for cache consistency."""
    key = build_cache_key("sinica", "satellite", 5, 0, 0, {"style": "default", "layer": "EARTH"})
    assert key == "tile:sinica:satellite:layer=EARTH,style=default:5:0:0"


def test_get_source_config_valid():
    """Valid type/source combination returns a SourceConfig with url_template."""
    config = get_source_config("satellite", "nasa_gibs")
    assert config is not None
    assert "{z}" in config.url_template
    assert config.image_format == "image/png"


def test_get_source_config_invalid_combo():
    """Invalid type/source combination returns None."""
    config = get_source_config("road", "nasa_gibs")
    assert config is None


def test_get_attribution_valid():
    """Valid type/source returns an AttributionResponse with expected fields."""
    attr = get_attribution("satellite", "nasa_gibs")
    assert attr is not None
    assert attr.source == "nasa_gibs"
    assert attr.commercial_use is True
    assert attr.requires_logo is False
    assert attr.logo_url is None


def test_get_attribution_invalid():
    """Invalid type/source combination returns None."""
    attr = get_attribution("satellite", "carto")
    assert attr is None


def test_blank_tile_is_bytes():
    """BLANK_TILE is a valid PNG byte sequence."""
    assert isinstance(BLANK_TILE, bytes)
    assert len(BLANK_TILE) > 0
    # Valid PNG starts with PNG magic bytes
    assert BLANK_TILE[:8] == b"\x89PNG\r\n\x1a\n"


@pytest_asyncio.fixture
async def fake_redis():
    """Provide a real Redis instance (db 15, flushed per test) for unit tests."""
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await r.flushdb()
    yield r
    await r.flushdb()
    await r.aclose()


@pytest.mark.asyncio
async def test_fetch_tile_cache_hit(fake_redis):
    """Returns cached bytes and content-type on cache hit."""
    key = "tile:eox:satellite:_:10:1:2"
    await fake_redis.hset(key, mapping={"data": b"PNG_DATA", "ct": b"image/jpeg"})
    await fake_redis.expire(key, 604800)

    data, ct = await fetch_tile(
        redis=fake_redis,
        source="eox",
        type_="satellite",
        z=10,
        x=1,
        y=2,
        query_params={},
    )
    assert data == b"PNG_DATA"
    assert ct == "image/jpeg"


@pytest.mark.asyncio
async def test_fetch_tile_cache_miss_upstream_success(fake_redis):
    """Fetches upstream on cache miss, stores in Redis, returns tile."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"REAL_TILE"
    mock_response.headers = {"content-type": "image/jpeg"}

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        data, ct = await fetch_tile(
            redis=fake_redis,
            source="eox",
            type_="satellite",
            z=10,
            x=1,
            y=2,
            query_params={},
        )

    assert data == b"REAL_TILE"
    assert ct == "image/jpeg"

    # Verify stored in cache
    key = "tile:eox:satellite:_:10:1:2"
    cached = await fake_redis.hgetall(key)
    assert cached[b"data"] == b"REAL_TILE"
    ttl = await fake_redis.ttl(key)
    assert ttl > 0


@pytest.mark.asyncio
async def test_fetch_tile_upstream_error_returns_blank(fake_redis):
    """Returns blank tile when upstream returns non-200."""
    mock_response = MagicMock()
    mock_response.status_code = 503
    mock_response.content = b""
    mock_response.headers = {"content-type": "text/html"}

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        data, ct = await fetch_tile(
            redis=fake_redis,
            source="eox",
            type_="satellite",
            z=10,
            x=1,
            y=2,
            query_params={},
        )

    assert data == BLANK_TILE
    assert ct == "image/png"


@pytest.mark.asyncio
async def test_fetch_tile_redis_down_fetches_upstream():
    """When Redis is unavailable, bypasses cache and fetches upstream."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"TILE_BYTES"
    mock_response.headers = {"content-type": "image/png"}

    broken_redis = AsyncMock()
    broken_redis.hgetall = AsyncMock(side_effect=Exception("Redis connection refused"))

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        data, ct = await fetch_tile(
            redis=broken_redis,
            source="osm",
            type_="road",
            z=5,
            x=0,
            y=0,
            query_params={},
        )

    assert data == b"TILE_BYTES"
    assert ct == "image/png"


@pytest.mark.asyncio
async def test_fetch_tile_sinica_layer_in_url(fake_redis):
    """Sinica layer param is substituted into the upstream URL."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"SINICA_TILE"
    mock_response.headers = {"content-type": "image/png"}

    captured_url = []

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def capture_get(url, **kwargs):
            captured_url.append(url)
            return mock_response

        mock_client.get = capture_get
        mock_client_cls.return_value = mock_client

        await fetch_tile(
            redis=fake_redis,
            source="sinica",
            type_="satellite",
            z=8,
            x=10,
            y=20,
            query_params={"layer": "EARTH"},
        )

    assert "EARTH" in captured_url[0]
    assert "layer=EARTH" not in captured_url[0]  # param consumed, not forwarded as query string


def _gibs_client(domains_response):
    """Mock httpx client answering GIBS's dates URL with domains_response and any tile URL with a PNG."""
    tile_response = MagicMock()
    tile_response.status_code = 200
    tile_response.content = b"HLS_TILE"
    tile_response.headers = {"content-type": "image/png"}
    requested = []

    async def get(url, **kwargs):
        requested.append(url)
        return domains_response if url.endswith("all.xml") else tile_response

    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = get
    return client, requested


@pytest.mark.asyncio
async def test_fetch_tile_nasa_gibs_uses_second_newest_date(fake_redis):
    """NASA GIBS tiles use the second-newest listed date, asked for once, in the cache key, kept for a day."""
    domains = MagicMock()
    domains.text = (
        "<Domains><DimensionDomain><Domain>2026-01-12/2026-02-28/P1D,2026-03-02/2026-10-22/P1D</Domain>"
        "</DimensionDomain></Domains>"
    )
    client, requested = _gibs_client(domains)

    with patch("app.services.tile_proxy.httpx.AsyncClient", return_value=client):
        data, ct = await fetch_tile(fake_redis, "nasa_gibs", "satellite", 10, 1, 2, {})
        await fetch_tile(fake_redis, "nasa_gibs", "satellite", 10, 1, 3, {})

    assert (data, ct) == (b"HLS_TILE", "image/png")
    assert sum(url.endswith("all.xml") for url in requested) == 1
    assert "/default/2026-10-21/GoogleMapsCompatible_Level12/10/2/1.png" in requested[1]
    assert await fake_redis.get("tile:nasa_gibs:date") == b"2026-10-21"
    key = "tile:nasa_gibs:satellite:date=2026-10-21:10:1:2"
    cached = await fake_redis.hgetall(key)
    assert cached[b"data"] == b"HLS_TILE"
    assert 0 < await fake_redis.ttl(key) <= 86400


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("domain", "expected"),
    [
        # A lone newest date right after a gap: 2026-10-21 isn't listed, so use the range before it.
        ("2026-03-02/2026-10-20/P1D,2026-10-22", "2026-10-20"),
        ("2026-03-02/2026-10-20/P1D,2026-10-22/2026-10-22/P1D", "2026-10-20"),
        ("2026-10-18,2026-10-22", "2026-10-18"),
        ("2026-10-22", "2026-10-22"),
    ],
)
async def test_resolve_tile_date_picks_a_listed_date(fake_redis, domain, expected):
    """The tile date is always one GIBS lists, even when the newest date follows a gap."""
    domains = MagicMock()
    domains.text = f"<Domains><Domain>{domain}</Domain></Domains>"
    client, _ = _gibs_client(domains)

    with patch("app.services.tile_proxy.httpx.AsyncClient", return_value=client):
        tile_date = await resolve_tile_date(fake_redis, "nasa_gibs", "https://example.test/all.xml")

    assert tile_date == expected


@pytest.mark.asyncio
async def test_fetch_tile_nasa_gibs_unreadable_dates_returns_blank(fake_redis):
    """When GIBS's dates cannot be read, NASA GIBS returns a blank tile without asking for the tile."""
    domains = MagicMock()
    domains.text = "<html>503 Service Unavailable</html>"
    client, requested = _gibs_client(domains)

    with patch("app.services.tile_proxy.httpx.AsyncClient", return_value=client):
        data, ct = await fetch_tile(fake_redis, "nasa_gibs", "satellite", 10, 1, 2, {})

    assert (data, ct) == (BLANK_TILE, "image/png")
    assert len(requested) == 1
    assert await fake_redis.keys("tile:*") == []


@pytest.mark.asyncio
async def test_fetch_tile_nasa_gibs_past_max_zoom_returns_blank(fake_redis):
    """NASA GIBS stops at z12, so z13 returns a blank tile without asking GIBS for anything."""
    client, requested = _gibs_client(MagicMock())

    with patch("app.services.tile_proxy.httpx.AsyncClient", return_value=client):
        data, ct = await fetch_tile(fake_redis, "nasa_gibs", "satellite", 13, 1, 2, {})

    assert (data, ct) == (BLANK_TILE, "image/png")
    assert requested == []


# ===== Integration tests for endpoints =====


@pytest_asyncio.fixture
async def map_client():
    """Provide an HTTP test client with a fake Redis instance attached to app state."""
    fake_redis = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await fake_redis.flushdb()
    app.state.redis = fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, fake_redis
    await fake_redis.flushdb()
    await fake_redis.aclose()


@pytest.mark.asyncio
async def test_tile_endpoint_invalid_source(map_client):
    """Tile endpoint returns 400 for an unregistered source name."""
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/satellite/mapbox/10/1/2")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tile_endpoint_invalid_type_source_combo(map_client):
    """Tile endpoint returns 400 for a valid source used with the wrong tile type."""
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/road/nasa_gibs/10/1/2")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tile_endpoint_invalid_zoom(map_client):
    """Tile endpoint returns 400 when zoom level exceeds the maximum (24)."""
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/satellite/nasa_gibs/25/1/2")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tile_endpoint_sinica_missing_layer(map_client):
    """Sinica tile requests without a layer query param return 400."""
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/satellite/sinica/10/1/2")
    assert resp.status_code == 400
    assert "layer" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tile_endpoint_cache_hit_returns_tile(map_client):
    """Tile endpoint returns cached bytes and content-type on Redis cache hit."""
    ac, fake_redis = map_client
    key = "tile:eox:satellite:_:10:1:2"
    await fake_redis.hset(key, mapping={"data": b"CACHED_PNG", "ct": b"image/jpeg"})
    await fake_redis.expire(key, 604800)

    resp = await ac.get("/api/v1/map/tile/satellite/eox/10/1/2")
    assert resp.status_code == 200
    assert resp.content == b"CACHED_PNG"
    assert resp.headers["content-type"] == "image/jpeg"


@pytest.mark.asyncio
async def test_tile_endpoint_upstream_error_returns_blank(map_client):
    """Tile endpoint returns BLANK_TILE with image/png when upstream raises."""
    ac, _ = map_client
    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=Exception("upstream down"))
        mock_client_cls.return_value = mock_client

        resp = await ac.get("/api/v1/map/tile/satellite/eox/10/1/2")

    assert resp.status_code == 200
    assert resp.content == BLANK_TILE
    assert resp.headers["content-type"] == "image/png"


@pytest.mark.asyncio
async def test_attribution_endpoint_valid(map_client):
    """Attribution endpoint returns full metadata for a known source."""
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/attribution/satellite/nasa_gibs")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "nasa_gibs"
    assert body["requires_logo"] is False
    assert body["logo_url"] is None
    assert "NASA" in body["attribution_text"]


@pytest.mark.asyncio
async def test_attribution_endpoint_invalid(map_client):
    """Attribution endpoint returns 400 for an invalid type/source combination."""
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/attribution/road/nasa_gibs")
    assert resp.status_code == 400
