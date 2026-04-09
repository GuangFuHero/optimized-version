import pytest
import os
os.environ["ENV"] = "testing"

from app.schemas.map import AttributionResponse


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
