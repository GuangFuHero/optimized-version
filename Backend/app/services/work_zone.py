"""Work Zone write actions (create / update / assign team / remove team).

Same flat-service style as station.py (ADR-013/022/021, Phase 4).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom
from app.models.auth import User
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.repositories.team_repository import (
    team_zone_assign_repository,
    work_zone_repository,
)
from app.services.authz import require_scope
from app.services.geo_validation import validate_polygon


async def create_work_zone(db: AsyncSession, *, actor: User, name: str, geometry: dict) -> WorkZone:
    """Draw a new work zone (checkpoint 1 only — a new zone has no prior owner)."""
    await require_scope(actor, Perm.ZONE_ADD, db)
    validate_polygon(geometry, entity="Work zone")
    return await work_zone_repository.create(
        db,
        obj_in={
            "name": name,
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor.uuid),
        },
    )


async def update_work_zone(
    db: AsyncSession, *, actor: User, uuid: str, geometry: dict | None = None, changes: dict
) -> WorkZone:
    """Update a work zone's name or boundary (checkpoint 1 work_zone.edit, then checkpoint 2)."""
    zone = await work_zone_repository.get_by_uuid(db, uuid)
    if not zone:
        raise ValueError("Work zone not found")
    await require_scope(actor, Perm.ZONE_EDIT, db, resource=zone)

    obj_in = dict(changes)
    if geometry is not None:
        validate_polygon(geometry, entity="Work zone")
        obj_in["geometry"] = geojson_to_geom(geometry)
    return await work_zone_repository.update(db, db_obj=zone, obj_in=obj_in)


async def assign_zone_to_team(
    db: AsyncSession, *, actor: User, zone_uuid: str, team_uuid: str
) -> TeamZoneAssign:
    """Assign a work zone to a team, establishing `zone` scope for it (checkpoint 1 only).

    Idempotent — returns the existing assignment if the pair is already linked.
    """
    await require_scope(actor, Perm.ZONE_ASSIGN, db)

    if not await work_zone_repository.get_by_uuid(db, zone_uuid):
        raise ValueError("Work zone not found")
    if not await db.get(Team, team_uuid):
        raise ValueError("Team not found")

    existing = await team_zone_assign_repository.get_assignment(
        db, team_uuid=team_uuid, zone_uuid=zone_uuid
    )
    if existing is not None:
        return existing

    return await team_zone_assign_repository.create(
        db, obj_in={"team_uuid": team_uuid, "zone_uuid": zone_uuid}
    )


async def remove_zone_from_team(db: AsyncSession, *, actor: User, zone_uuid: str, team_uuid: str) -> None:
    """Remove a work zone <-> team assignment (checkpoint 1 only, symmetric with assign)."""
    await require_scope(actor, Perm.ZONE_ASSIGN, db)

    existing = await team_zone_assign_repository.get_assignment(
        db, team_uuid=team_uuid, zone_uuid=zone_uuid
    )
    if existing is None:
        raise ValueError("This team is not assigned to this work zone")
    await team_zone_assign_repository.remove(db, uuid=existing.uuid)
