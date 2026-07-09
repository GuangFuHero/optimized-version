"""H3 hexagonal grid helpers for coarsening geometry shown to guests.

Coarsening happens in Postgres (h3-pg + h3_postgis extensions), not in Python: a raw
point is snapped to an H3 cell and that cell's centroid is returned instead, so the
exact coordinate never leaves the database for an anonymous request.
"""

import math

from geoalchemy2 import Geometry
from sqlalchemy import cast, func

GUEST_MAX_H3_RESOLUTION = 8  # server-enforced ceiling; never exceeded regardless of client input

# Each H3 resolution step shrinks a cell's edge length by sqrt(7) (a cell splits into ~7
# children); each map zoom level halves ground distance per pixel. So matching one zoom
# level of precision takes log_sqrt(7)(2) = 2/log2(7) ~= 0.7124 resolution steps. This is
# our own calibration (no official zoom<->H3 standard exists), anchored so the frontend's
# default zoom (13) lands exactly on the guest cap.
_ZOOM_TO_RES_SLOPE = 2 / math.log2(7)
_ANCHOR_ZOOM = 13
_ANCHOR_RESOLUTION = GUEST_MAX_H3_RESOLUTION


def zoom_to_h3_resolution(zoom: float) -> int:
    """Map a (possibly fractional) map zoom level to an H3 resolution, clamped to [0, 15]."""
    raw = _ZOOM_TO_RES_SLOPE * (zoom - _ANCHOR_ZOOM) + _ANCHOR_RESOLUTION
    return max(0, min(15, round(raw)))


def h3_centroid_column(geometry_column, resolution: int):
    """SQL expression: snap `geometry_column` to an H3 cell at `resolution`, return its centroid."""
    return cast(
        func.h3_cell_to_geometry(func.h3_lat_lng_to_cell(geometry_column, resolution)),
        Geometry(geometry_type="POINT", srid=4326),
    )
