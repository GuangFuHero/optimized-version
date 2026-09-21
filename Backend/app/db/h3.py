"""H3 hexagonal grid helpers for the coarse ticket point (ADR-281/283).

A caller without `ticket.view_detail` gets the centre of the H3 cell a ticket falls in, not
its point. The snapping happens in Postgres (h3-pg + h3_postgis), not in Python, so the exact
coordinate never leaves the database for that caller — the same rule `bounds` has to follow
(ADR-282), which is only possible if the cell is a SQL expression.

Why a fixed grid rather than a random offset: an offset is a fresh draw every time, so asking
the same question repeatedly and averaging the answers recovers the point. A cell centre is
the same answer every time (HC, 2026-07 on Discord).

Adapted from HC's `20a3cfb` (PR #23), which never reached main (the stacked PRs merged in
the wrong order); the calibration below is his.
"""

import math

from geoalchemy2 import Geometry
from sqlalchemy import String, cast, func

# The finest cell a caller without ticket.view_detail can ever get, whatever zoom it sends.
# Resolution 8: average edge 531 m, area 0.737 km², about 1 km across (h3geo.org resolution
# table; `h3_get_hexagon_edge_length_avg(8, 'm')` agrees). Coarser than the "550 m circle"
# it was described as in chat, and kept anyway: a rural cell may hold a handful of houses,
# and the finer resolution 9 (201 m edge) would narrow that to one or two (ADR-283).
COARSE_MAX_H3_RESOLUTION = 8

# Each H3 resolution step shrinks a cell's edge by sqrt(7) (a cell splits into ~7 children);
# each map zoom level halves ground distance per pixel. So one zoom level of precision takes
# log_sqrt(7)(2) = 2/log2(7) ~= 0.7124 resolution steps. Our own calibration — there is no
# official zoom<->H3 mapping — anchored so the frontend's default zoom (13) lands exactly on
# the cap, and zooming out only ever gets coarser.
_ZOOM_TO_RES_SLOPE = 2 / math.log2(7)
_ANCHOR_ZOOM = 13

# Average hexagon edge length in metres for resolutions 0..COARSE_MAX_H3_RESOLUTION, as
# h3-pg's `h3_get_hexagon_edge_length_avg(r, 'm')` reports them (asserted in the tests). The
# edge of a hexagon is also its circumradius, so it bounds how far a point sits from its own
# cell centre — which is what coarse_margin_degrees() needs.
_AVG_EDGE_M = (
    1281256.011, 483056.8391, 182512.9565, 68979.22179, 26071.75968,
    9854.09099, 3724.532667, 1406.475763, 531.4140101,
)
# H3 cells are not regular: at one resolution the largest is about twice the area of the
# smallest, so a single cell's circumradius can exceed the average edge. Twice the average
# covers that with room to spare; too small a margin would drop rows, too large only costs
# index selectivity.
_MARGIN_FACTOR = 2
_METRES_PER_DEGREE = 111_320


def coarse_margin_degrees(resolution: int, max_abs_latitude: float) -> tuple[float, float]:
    """(dx, dy) in degrees: how far a point can be from its cell centre at `resolution`.

    ADR-282's index pre-filter: a row whose centre lies in a box has its point within this
    much of the box, so "point in the box grown by (dx, dy)" is a GIST-usable superset of
    "centre in the box". Longitude degrees shrink with latitude, so dx is scaled at the
    box's highest latitude (plus the margin itself), where they are narrowest.
    """
    metres = _AVG_EDGE_M[resolution] * _MARGIN_FACTOR
    dy = metres / _METRES_PER_DEGREE
    latitude = min(89.0, max_abs_latitude + dy)
    dx = metres / (_METRES_PER_DEGREE * math.cos(math.radians(latitude)))
    return dx, dy


def zoom_to_h3_resolution(zoom: float) -> int:
    """Map a (possibly fractional) map zoom level to an H3 resolution, clamped to [0, 15]."""
    raw = _ZOOM_TO_RES_SLOPE * (zoom - _ANCHOR_ZOOM) + COARSE_MAX_H3_RESOLUTION
    return max(0, min(15, round(raw)))


def coarse_resolution(zoom: float | None) -> int:
    """The resolution to coarsen at: from `zoom` when given, never finer than the cap."""
    if zoom is None:
        return COARSE_MAX_H3_RESOLUTION
    return min(zoom_to_h3_resolution(zoom), COARSE_MAX_H3_RESOLUTION)


def h3_cell(geometry_column, resolution: int):
    """SQL expression: the H3 cell `geometry_column` falls in at `resolution` (an `h3index`).

    `ST_PointOnSurface` first, although a ticket's geometry is always a point: the column
    lives on `base_geometries`, which also holds closure-area polygons, and Postgres may
    evaluate a WHERE condition while scanning that table — before the join to `tickets` has
    thrown the polygons out. `h3_lat_lng_to_cell` raises on anything but a point
    ("geometry_to_point only accepts Points"), so without this the anonymous map failed
    wherever a closure area sat in the box. For a point it returns the point unchanged.
    """
    return func.h3_lat_lng_to_cell(func.ST_PointOnSurface(geometry_column), resolution)


def h3_cell_text(geometry_column, resolution: int):
    """The same cell as its canonical hex string, e.g. '884ba0a511fffff' — what clients key on."""
    return cast(h3_cell(geometry_column, resolution), String)


def h3_centroid(geometry_column, resolution: int):
    """SQL expression: the centre of the H3 cell `geometry_column` falls in at `resolution`."""
    return cast(
        func.h3_cell_to_geometry(h3_cell(geometry_column, resolution)),
        Geometry(geometry_type="POINT", srid=4326),
    )
