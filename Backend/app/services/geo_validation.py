"""Geometry validation shared by the station/closure_area use-cases (ADR-013).

This used to be private helpers inside app/graphql/geo/mutations.py; validation is
business logic, so it moved into the use-case layer along with everything else that
resolver did.
"""

from shapely.geometry import shape


def validate_point(geojson: dict, *, entity: str = "Station") -> None:
    """Raise ValueError if geojson is not a valid Point within lon/lat bounds.

    `entity` names the caller's domain in the error message (default kept for the existing
    station callers; ticket passes "Ticket").
    """
    geom = shape(geojson)
    if geom.geom_type != "Point":
        raise ValueError(f"{entity} geometry must be a Point")
    x, y = geom.coords[0][:2]
    if not (-180 <= x <= 180 and -90 <= y <= 90):
        raise ValueError("Invalid coordinates")


def validate_polygon(geojson: dict, *, entity: str = "Closure area") -> None:
    """Raise ValueError if geojson is not a Polygon or MultiPolygon.

    `entity` names the caller's domain in the error message (default kept for the
    existing closure_area callers; work_zone passes "Work zone" — Phase 4/T119).
    """
    geom = shape(geojson)
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError(f"{entity} geometry must be Polygon or MultiPolygon")
