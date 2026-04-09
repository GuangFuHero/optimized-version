import pytest
import os
os.environ["ENV"] = "testing"

import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import fakeredis.aioredis

from app.schemas.map import AttributionResponse
from app.services.tile_proxy import build_cache_key, get_source_config, get_attribution, BLANK_TILE, fetch_tile


def test_attribution_response_valid():
    resp = AttributionResponse(
        source="nasa_gibs",
        type="satellite",
        name="NASA GIBS",
        license="US Gov Open Data",
        attribution_text="Imagery provided by NASA's Global Imagery Browse Services (GIBS), part of NASA's ESDIS",
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
    with pytest.raises(Exception):
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
    key = build_cache_key("nasa_gibs", "satellite", 10, 123, 456, {})
    assert key == "tile:nasa_gibs:satellite:_:10:123:456"


def test_cache_key_with_one_param():
    key = build_cache_key("sinica", "satellite", 10, 1, 2, {"layer": "EARTH"})
    assert key == "tile:sinica:satellite:layer=EARTH:10:1:2"


def test_cache_key_params_sorted():
    key = build_cache_key("sinica", "satellite", 5, 0, 0, {"style": "default", "layer": "EARTH"})
    assert key == "tile:sinica:satellite:layer=EARTH,style=default:5:0:0"


def test_get_source_config_valid():
    config = get_source_config("satellite", "nasa_gibs")
    assert config is not None
    assert "{z}" in config.url_template
    assert config.image_format == "image/jpeg"


def test_get_source_config_invalid_combo():
    config = get_source_config("road", "nasa_gibs")
    assert config is None


def test_get_attribution_valid():
    attr = get_attribution("satellite", "nasa_gibs")
    assert attr is not None
    assert attr.source == "nasa_gibs"
    assert attr.commercial_use is True
    assert attr.requires_logo is False
    assert attr.logo_url is None


def test_get_attribution_invalid():
    attr = get_attribution("satellite", "carto")
    assert attr is None


def test_blank_tile_is_bytes():
    assert isinstance(BLANK_TILE, bytes)
    assert len(BLANK_TILE) > 0
    # Valid PNG starts with PNG magic bytes
    assert BLANK_TILE[:8] == b'\x89PNG\r\n\x1a\n'


@pytest_asyncio.fixture
async def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=False)


@pytest.mark.asyncio
async def test_fetch_tile_cache_hit(fake_redis):
    """Returns cached bytes and content-type on cache hit."""
    key = "tile:nasa_gibs:satellite:_:10:1:2"
    await fake_redis.hset(key, mapping={"data": b"PNG_DATA", "ct": b"image/jpeg"})
    await fake_redis.expire(key, 604800)

    data, ct = await fetch_tile(
        redis=fake_redis,
        source="nasa_gibs",
        type_="satellite",
        z=10, x=1, y=2,
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
            source="nasa_gibs",
            type_="satellite",
            z=10, x=1, y=2,
            query_params={},
        )

    assert data == b"REAL_TILE"
    assert ct == "image/jpeg"

    # Verify stored in cache
    key = "tile:nasa_gibs:satellite:_:10:1:2"
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
            source="nasa_gibs",
            type_="satellite",
            z=10, x=1, y=2,
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
            z=5, x=0, y=0,
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
            z=8, x=10, y=20,
            query_params={"layer": "EARTH"},
        )

    assert "EARTH" in captured_url[0]
    assert "layer=EARTH" not in captured_url[0]  # param consumed, not forwarded as query string
