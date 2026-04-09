import pytest
import os
os.environ["ENV"] = "testing"

from app.schemas.map import AttributionResponse
from app.services.tile_proxy import build_cache_key, get_source_config, get_attribution, BLANK_TILE


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
