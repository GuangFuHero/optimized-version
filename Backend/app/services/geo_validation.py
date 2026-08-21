"""Input validation shared by the geo use-cases (ADR-013).

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


_CONTACT_LIMITS = {  # stations.contact_* / tickets.contact_* — same widths in both tables
    "contact_name": 100, "contact_email": 100, "contact_phone": 50,
}


def validate_contact_fields(fields: dict) -> None:
    """Raise ValueError if any contact value is too long for its column.

    Checked here rather than left to the database for the same reason as
    `validate_photo_url` in photo.py: these are short columns, the schema installs no error
    masking, and asyncpg's truncation error quotes the whole statement — so an unchecked
    value hands the table layout to any authenticated caller.

    Absent keys and explicit nulls are both skipped, so this is safe to hand an
    already-diffed `changes` dict where a null means "clear this field".
    """
    for name, limit in _CONTACT_LIMITS.items():
        val = fields.get(name)
        if val is not None and len(val.strip()) > limit:
            raise ValueError(f"{name} must be at most {limit} characters")
