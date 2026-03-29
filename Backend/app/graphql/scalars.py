from typing import Any, NewType

import strawberry
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape

GeoJSON = strawberry.scalar(
    NewType("GeoJSON", dict[str, Any]),
    serialize=lambda v: v,
    parse_value=lambda v: v,
    description="GeoJSON geometry object (RFC 7946)",
)


def geom_to_geojson(wkb_element) -> dict | None:
    """Convert GeoAlchemy2 WKBElement to GeoJSON dict."""
    if not wkb_element:
        return None
    return mapping(to_shape(wkb_element))


def geojson_to_geom(geojson: dict, srid: int = 4326):
    """Convert GeoJSON dict to GeoAlchemy2 WKBElement."""
    return from_shape(shape(geojson), srid=srid)
