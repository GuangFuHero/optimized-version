import base64
from dataclasses import dataclass, field
from typing import Optional

from app.schemas.map import AttributionResponse


# 1×1 transparent PNG (67 bytes)
BLANK_TILE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAA"
    "IAAQAABjkB6QAAAABJRU5ErkJggg=="
)


@dataclass
class SourceConfig:
    url_template: str
    image_format: str
    headers: dict = field(default_factory=dict)


SOURCE_REGISTRY: dict[tuple[str, str], SourceConfig] = {
    ("satellite", "nasa_gibs"): SourceConfig(
        url_template=(
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
            "MODIS_Terra_CorrectedReflectance_TrueColor/default/"
            "GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"
        ),
        image_format="image/jpeg",
    ),
    ("satellite", "eox"): SourceConfig(
        url_template=(
            "https://tiles.maps.eox.at/wmts/1.0.0/"
            "s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
        ),
        image_format="image/jpeg",
    ),
    ("satellite", "nlsc"): SourceConfig(
        url_template="https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/EPSG:3857/{z}/{y}/{x}",
        image_format="image/png",
        headers={"Referer": "https://maps.nlsc.gov.tw/"},
    ),
    ("satellite", "sinica"): SourceConfig(
        url_template=(
            "https://gis.sinica.edu.tw/tileserver/file-exists.php"
            "?img={layer}/{z}/{x}/{y}"
        ),
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
            "part of NASA's ESDIS"
        ),
        attribution_url=(
            "https://earthdata.nasa.gov/eosdis/science-system-description/"
            "eosdis-components/gibs"
        ),
        image_format="image/jpeg",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
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
    if query_params:
        sorted_params = ",".join(
            f"{k}={v}" for k, v in sorted(query_params.items())
        )
    else:
        sorted_params = "_"
    return f"tile:{source}:{type_}:{sorted_params}:{z}:{x}:{y}"


def get_source_config(type_: str, source: str) -> Optional[SourceConfig]:
    return SOURCE_REGISTRY.get((type_, source))


def get_attribution(type_: str, source: str) -> Optional[AttributionResponse]:
    return ATTRIBUTION_REGISTRY.get((type_, source))
