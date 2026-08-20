"""Attaching and removing photos.

Follows the same shape as station.py and ticket.py: plain module-level functions taking the
session first and everything else keyword-only, each one owning its own permission check,
input validation and persistence, so that GraphQL resolvers stay thin wrappers. Domain
failures are raised as ValueError.
"""

from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.photo import Photo
from app.repositories.geo_repository import station_repository
from app.repositories.photo_repository import photo_repository
from app.services.authz import require_scope

_MAX_URL_LEN = 500  # matches app/models/photo.py: url = mapped_column(String(500))


def validate_photo_url(url: str) -> None:
    """Reject a photo url that is blank, too long for the column, or not https.

    Length is checked here rather than left to the database because `photos.url` is a
    500-character column: an over-long value fails at INSERT time, and the driver's error
    message quotes the whole statement, so the table layout would leak to the caller.

    Scheme is restricted to https because photo urls are read back by anonymous visitors. An
    allowlist keeps `javascript:` and `data:` payloads out of the table entirely, instead of
    trusting every present and future consumer to sanitize them before rendering. Widening
    the allowlist later is easy; purging rows already stored is not.
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("Photo url is required")
    if len(url) > _MAX_URL_LEN:
        raise ValueError(f"Photo url must be at most {_MAX_URL_LEN} characters")
    if not url.startswith("https://"):
        raise ValueError("Photo url must be an https:// URL")


async def attach_photo_to_geometry(
    db: AsyncSession, *, actor: User, base_geometry_uuid: str, url: str
) -> Photo:
    """Attach a photo to a station.

    Requires `station.contribute`, which every registered account holds, and there is no
    ownership check: station data is crowd-sourced, so anyone may add a photo to any
    station. Station properties and ratings are open in exactly the same way.

    The argument is called `base_geometry_uuid`, not `station_uuid`, because photos key off
    `base_geometries` — the parent table stations and tickets both extend. Only stations are
    wired up today.
    """
    validate_photo_url(url)
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
    if not await station_repository.get_by_uuid_active(db, base_geometry_uuid):
        raise ValueError("Station not found")
    return await photo_repository.create(
        db,
        obj_in={
            "ref_uuid": base_geometry_uuid,
            # 'geometry' means "ref_uuid points at a base_geometries row" — a station here,
            # a ticket elsewhere. The other value in use is 'pole', for secondary locations.
            "ref_type": "geometry",
            "url": url.strip(),
            "created_by": str(actor.uuid),
        },
    )


async def detach_station_photo(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete a station photo.

    Requires `station.review` (moderation), not the `station.contribute` that attaching uses.
    Attaching is deliberately open to every registered account, so sharing one capability
    between the two would let anybody delete anybody else's photos.

    Both lookups below run before the permission check, and both are load-bearing:

    1. The photo must really belong to a station. Stations and tickets share this table, and
       a row does not say which kind it is — both store a `base_geometries` uuid in
       `ref_uuid` under the same `ref_type`. Skipping this check would let a station
       moderator delete a *ticket's* photos, which a different capability governs. Both
       failure paths raise the same message, so the error cannot be used to probe whether
       some uuid belongs to a ticket.
    2. The parent station supplies the geometry the scope check needs. A photo has no
       location of its own, so a reviewer restricted to their team's work zone would match
       nothing without borrowing the station's coordinates. Station properties, which have
       the same problem, borrow theirs the same way (see station.py).
    """
    photo = await photo_repository.get_by_uuid_active(db, uuid)
    if not photo or photo.ref_type != "geometry":
        raise ValueError("Station photo not found")
    station = await station_repository.get_by_uuid_active(db, photo.ref_uuid)
    if not station:
        raise ValueError("Station photo not found")

    await require_scope(
        actor,
        Perm.STATION_REVIEW,
        db,
        resource=SimpleNamespace(
            created_by=photo.created_by, team_uuid=None, geometry=station.geometry
        ),
    )
    await photo_repository.soft_delete(db, db_obj=photo)
