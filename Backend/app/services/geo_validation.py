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


def normalize_contact_fields(fields: dict, *, required: frozenset[str] = frozenset()) -> dict:
    """Return `fields` with contact values stripped, raising if one is too long for its column.

    Length is checked here rather than left to the database for the same reason as
    `normalize_photo_url` in photo.py: a caller who typed too much deserves
    "contact_name must be at most 100 characters", not the driver's truncation error. The
    schema's `MaskErrors` now stops that error from leaking the statement, but it turns it
    into an opaque "Unexpected error." — the mask is the backstop, this is the 400.

    Stripping and checking are one operation, and callers must persist what comes back,
    because splitting them is what broke this the first time (PR #40 review round 3). An
    earlier version measured `len(val.strip())` while the services stored `val`, so ten
    leading spaces plus 95 characters passed a 100-character check and then leaked the whole
    INSERT from the driver. Trailing padding hid it: PostgreSQL silently truncates trailing
    spaces to fit a varchar(n) instead of erroring, so only leading whitespace reproduced.

    Absent keys and explicit nulls are both skipped and non-contact keys pass through
    untouched, so this is safe to hand an already-diffed `changes` dict where a null means
    "clear this field".

    A value that is only whitespace normalizes to `None` — blank means absent, and the
    masking helpers already treat "" and NULL alike (masking.py short-circuits on falsy). The
    exception is `required`, which must be named per-caller rather than inferred, because the
    two tables disagree: `tickets.contact_name` is NOT NULL (models/request.py) while
    `stations.contact_name` is nullable (models/geo.py). Blanking a required column would
    fail at INSERT as an IntegrityError — a 500 shape for what is really a 400 — so it is
    refused here with a domain message instead.
    """
    out = dict(fields)
    for name, limit in _CONTACT_LIMITS.items():
        val = out.get(name)
        if val is None:
            continue
        val = val.strip()
        if len(val) > limit:
            raise ValueError(f"{name} must be at most {limit} characters")
        if not val and name in required:
            raise ValueError(f"{name} is required")
        out[name] = val or None
    return out
