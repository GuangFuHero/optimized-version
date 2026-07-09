"""Closure-area write actions (create/update).

Same flat-service style as station.py: `db` first, keyword-only args, each function owns
its own authz + validation + persistence (ADR-013/014/015/022).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom
from app.models.auth import User
from app.models.geo import ClosureArea
from app.repositories.geo_repository import closure_area_repository
from app.services.authz import require_scope
from app.services.geo_validation import validate_polygon


async def create_closure_area(
    db: AsyncSession,
    *,
    actor: User,
    geometry: dict,
    status: str,
    information_source: str | None,
    comment: str | None,
) -> ClosureArea:
    """Create a closure area (checkpoint 1 only — a new area has no prior owner to scope-check)."""
    await require_scope(actor, Perm.MAP_MAKE, db)
    validate_polygon(geometry)
    return await closure_area_repository.create(
        db,
        obj_in={
            "property_name": "closure_area",
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor.uuid),
            "status": status,
            "information_source": information_source,
            "comment": comment,
        },
    )


async def update_closure_area(
    db: AsyncSession, *, actor: User, uuid: str, geometry: dict | None = None, changes: dict
) -> ClosureArea:
    """Update a closure area (checkpoint 1 map.edit, then checkpoint 2 against the loaded area).

    `changes` is the already-diffed non-geometry field dict; `geometry` is the raw GeoJSON
    dict (or None), kept separate since it needs validating before conversion.
    """
    area = await closure_area_repository.get_by_uuid_active(db, uuid)
    if not area:
        raise ValueError("Closure area not found")
    await require_scope(actor, Perm.MAP_EDIT, db, resource=area)

    obj_in = dict(changes)
    if geometry is not None:
        validate_polygon(geometry)
        obj_in["geometry"] = geojson_to_geom(geometry)
    return await closure_area_repository.update(db, db_obj=area, obj_in=obj_in)


async def delete_closure_area(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete a closure area (checkpoint 1 map.delete, then checkpoint 2 against it).

    Soft delete (sets delete_at); the audit trigger records the deletion.
    """
    area = await closure_area_repository.get_by_uuid_active(db, uuid)
    if not area:
        raise ValueError("Closure area not found")
    await require_scope(actor, Perm.MAP_DELETE, db, resource=area)
    await closure_area_repository.soft_delete(db, db_obj=area)
