"""Photo write actions.

Same flat-service style as station.py/ticket.py: `db` first, keyword-only args, owns its
own authz + validation + persistence (ADR-013/014/015/022).
"""

from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.photo import Photo
from app.repositories.geo_repository import station_repository
from app.repositories.photo_repository import photo_repository
from app.services.authz import require_scope

# `photos.url` is String(500), so anything longer is a driver-level error rather than a
# clean rejection. The scheme allow-list keeps non-fetchable URLs (javascript:,
# data:text/html,) out of a column the frontend renders as a link/image — seed_rbac.py
# grants the default `user` role STATION_CONTRIBUTE:all, so any account can write here.
_ALLOWED_URL_SCHEMES = ("http", "https")
_MAX_URL_LENGTH = 500


def validate_photo_url(url: str) -> None:
    """Raise ValueError unless `url` is an http(s) URL that fits the column."""
    if not url or len(url) > _MAX_URL_LENGTH:
        raise ValueError(f"Photo url must be 1-{_MAX_URL_LENGTH} characters")
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_URL_SCHEMES:
        raise ValueError(f"Photo url scheme must be one of {', '.join(_ALLOWED_URL_SCHEMES)}")
    if not parsed.netloc:
        raise ValueError("Photo url must include a host")


async def attach_photo_to_geometry(
    db: AsyncSession, *, actor: User, base_geometry_uuid: str, url: str
) -> Photo:
    """Attach a photo to a base_geometries-backed entity (currently: stations).

    Open crowd-sourcing (station.contribute), matching the existing model for station
    properties/ratings in station.py — anyone holding the capability may attach a photo
    to any station, no ownership check.
    """
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
    validate_photo_url(url)
    if not await station_repository.get_by_uuid_active(db, base_geometry_uuid):
        raise ValueError("Station not found")
    return await photo_repository.create(
        db,
        obj_in={
            "ref_uuid": base_geometry_uuid,
            "ref_type": "geometry",
            "url": url,
            "created_by": str(actor.uuid),
        },
    )
