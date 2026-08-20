"""Photo write actions.

Same flat-service style as station.py/ticket.py: `db` first, keyword-only args, owns its
own authz + validation + persistence (ADR-013/014/015/022).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.photo import Photo
from app.repositories.geo_repository import station_repository
from app.repositories.photo_repository import photo_repository
from app.services.authz import require_scope


async def attach_photo_to_geometry(
    db: AsyncSession, *, actor: User, base_geometry_uuid: str, url: str
) -> Photo:
    """Attach a photo to a base_geometries-backed entity (currently: stations).

    Open crowd-sourcing (station.contribute), matching the existing model for station
    properties/ratings in station.py — anyone holding the capability may attach a photo
    to any station, no ownership check.
    """
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
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
