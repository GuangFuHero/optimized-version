"""Map area write actions for all three kinds: 危險區, 責任區 and 標示區 (ADR-311).

Same flat-service style as station.py (ADR-013/022): `db` first, keyword-only args, each
function owns its own authz + validation + persistence.
"""

from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom
from app.models.auth import User
from app.models.geo import AreaPolygon, BaseGeometry, HazardousZone
from app.models.team import Team, TeamZoneAssign
from app.repositories.geo_repository import (
    area_repository,
    hazardous_zone_repository,
    mark_zone_repository,
)
from app.repositories.team_repository import (
    team_zone_assign_repository,
    team_zone_repository,
)
from app.services.authz import require_gov_team, require_scope
from app.services.geo_validation import validate_polygon
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

_REPOSITORIES = {
    "hazardous_zone": hazardous_zone_repository,
    "team_zone": team_zone_repository,
    "mark_zone": mark_zone_repository,
}


async def _require_gov_zone_authority(db: AsyncSession, actor: User) -> None:
    """Restrict drawing and assigning areas to gov teams and platform holders (super_admin).

    NGO team admins hold the work_zone.* capabilities in the seed but are refused here, so they
    cannot draw a zone over any area and assign it to themselves to reach victim PII.
    """
    await require_gov_team(db, actor, detail="Only gov teams may draw or assign map areas.")


def _check_fields(kind: str, changes: dict) -> None:
    """Refuse fields the area's kind does not have. A hazardous zone stays public and keeps a status."""
    if kind == "hazardous_zone":
        if changes.get("is_public") is False:
            raise ValueError("A hazardous zone is always public")
        if "status" in changes and not (changes["status"] or "").strip():
            raise ValueError("A hazardous zone needs a status")
    elif changes.get("status") is not None or changes.get("information_source") is not None:
        raise ValueError("Only a hazardous zone has a status or information source")


async def create_area(
    db: AsyncSession,
    *,
    actor: User,
    kind: str,
    geometry: dict,
    team_uuid: str | None = None,
    **fields,
) -> AreaPolygon:
    """Draw an area of any kind (checkpoint 1 only — a new area has no prior owner).

    A team zone is flushed, not committed, so it is saved together with its first team
    assignment and a refused team leaves nothing behind.
    """
    await require_scope(actor, Perm.ZONE_ADD, db)
    await _require_gov_zone_authority(db, actor)
    validate_polygon(geometry, entity="Area")
    if (team_uuid is None) == (kind == "team_zone"):
        raise ValueError("A team zone needs a team, and only a team zone takes one")
    _check_fields(kind, {"status": None} | fields)
    if kind == "hazardous_zone":
        fields["is_public"] = True

    obj_in = {key: value for key, value in fields.items() if value is not None}
    obj_in |= {"geometry": geojson_to_geom(geometry), "created_by": str(actor.uuid)}
    repository = _REPOSITORIES[kind]
    if kind != "team_zone":
        return await repository.create(db, obj_in=obj_in)

    zone = await repository.add(db, obj_in=obj_in)
    try:
        await assign_zone_to_team(db, actor=actor, zone_uuid=str(zone.uuid), team_uuid=team_uuid)
    except Exception:
        await db.rollback()
        raise
    await db.refresh(zone)
    return zone


async def update_area(
    db: AsyncSession, *, actor: User, uuid: str, geometry: dict | None = None, changes: dict
) -> AreaPolygon:
    """Update an area's fields or boundary (checkpoint 1 work_zone.edit, then checkpoint 2).

    `changes` holds only the fields the caller set, so sending just `is_public` flips the
    visibility switch on its own.
    """
    area = await area_repository.get_by_uuid_active(db, uuid)
    if not area:
        raise ValueError("Area not found")
    await require_scope(actor, Perm.ZONE_EDIT, db, resource=area)
    await _require_gov_zone_authority(db, actor)
    _check_fields(area.property_name, changes)

    obj_in = dict(changes)
    if geometry is not None:
        validate_polygon(geometry, entity="Area")
        obj_in["geometry"] = geojson_to_geom(geometry)
    return await area_repository.update(db, db_obj=area, obj_in=obj_in)


async def delete_area(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete an area of any kind (checkpoint 1 work_zone.delete, then checkpoint 2).

    A team zone's assignment rows stay: zone scope already ignores soft-deleted zones. Never
    grant this capability at Scope.ZONE, since every polygon contains itself and a team could
    then delete its own zone.
    """
    area = await area_repository.get_by_uuid_active(db, uuid)
    if not area:
        raise ValueError("Area not found")
    await require_scope(actor, Perm.ZONE_DELETE, db, resource=area)
    await _require_gov_zone_authority(db, actor)
    await area_repository.soft_delete(db, db_obj=area)


async def promote_mark_zone(
    db: AsyncSession, *, actor: User, uuid: str, status: str, information_source: str | None
) -> HazardousZone:
    """Turn a mark zone into a hazardous zone, keeping its uuid, name, note and geometry.

    This is the only change of kind there is, and it only goes one way.
    """
    area = await area_repository.get_by_uuid_active(db, uuid)
    if not area:
        raise ValueError("Area not found")
    if area.property_name != "mark_zone":
        raise ValueError("Only a mark zone can be promoted to a hazardous zone")
    await require_scope(actor, Perm.ZONE_EDIT, db, resource=area)
    await _require_gov_zone_authority(db, actor)
    _check_fields("hazardous_zone", {"status": status})

    area_uuid = area.uuid
    await db.execute(
        insert(HazardousZone.__table__).values(
            uuid=area_uuid, status=status, information_source=information_source
        )
    )
    await db.execute(
        update(BaseGeometry.__table__)
        .where(BaseGeometry.__table__.c.uuid == area_uuid)
        .values(property_name="hazardous_zone", updated_at=func.now())
    )
    await db.execute(
        update(AreaPolygon.__table__)
        .where(AreaPolygon.__table__.c.uuid == area_uuid)
        .values(is_public=True)
    )
    await db.commit()
    db.expunge(area)
    return await hazardous_zone_repository.get_by_uuid_active(db, area_uuid)


async def assign_zone_to_team(
    db: AsyncSession, *, actor: User, zone_uuid: str, team_uuid: str
) -> TeamZoneAssign:
    """Assign a team zone to a team, establishing `zone` scope for it (checkpoint 1 only).

    Idempotent: an existing link is returned unchanged, so its `assigned_by` is the original
    assigner. The team must be active when assigned; going inactive later keeps the scope.
    """
    await require_scope(actor, Perm.ZONE_ASSIGN, db)
    await _require_gov_zone_authority(db, actor)

    if not await team_zone_repository.get_by_uuid_active(db, zone_uuid):
        raise ValueError("Team zone not found")

    team = await db.scalar(select(Team).where(Team.uuid == team_uuid, Team.delete_at.is_(None)))
    if team is None:
        raise ValueError("Team not found")
    if team.status != "active":
        raise ValueError("Team is not active")

    existing = await team_zone_assign_repository.get_assignment(db, team_uuid=team_uuid, zone_uuid=zone_uuid)
    if existing is not None:
        return existing

    try:
        actor_uid = actor.uuid
        assignment = await team_zone_assign_repository.create(
            db,
            obj_in={
                "team_uuid": team_uuid,
                "zone_uuid": zone_uuid,
                "assigned_by": str(actor_uid),
            },
        )
        # 觸發 zone_assigned 通知 (Urgent 等級，送給 NGO Admin)
        zone_obj = await team_zone_repository.get_by_uuid_active(db, zone_uuid)
        zone_name = (zone_obj.name if zone_obj else None) or "工作分區"
        admins = await NotificationRecipientResolver.resolve_team_admin(db, team_uuid=team_uuid)
        await NotificationService.dispatch(
            db,
            event_type="zone_assigned",
            title=f"⚠️ 新指派工作區域：{zone_name}",
            body=f"您的團隊已獲指派負責工作分區「{zone_name}」，請進行評估與派工。",
            priority="urgent",
            actor_uuid=actor_uid,
            ref_type="work_zone",
            ref_uuid=zone_uuid,
            explicit_recipients=admins,
        )
        await db.refresh(assignment)
        return assignment
    except IntegrityError as exc:
        # A concurrent assign won the race to uq_team_zone; stay idempotent by returning its row.
        await db.rollback()
        won = await team_zone_assign_repository.get_assignment(db, team_uuid=team_uuid, zone_uuid=zone_uuid)
        if won is not None:
            return won
        raise ValueError("Failed to assign team zone to team") from exc


async def remove_zone_from_team(db: AsyncSession, *, actor: User, zone_uuid: str, team_uuid: str) -> None:
    """Remove a team zone <-> team assignment (checkpoint 1 only, symmetric with assign).

    A team zone always keeps at least one team, so removing the last one is refused.
    """
    await require_scope(actor, Perm.ZONE_ASSIGN, db)
    await _require_gov_zone_authority(db, actor)
    actor_uid = actor.uuid

    existing = await team_zone_assign_repository.get_assignment(db, team_uuid=team_uuid, zone_uuid=zone_uuid)
    if existing is None:
        raise ValueError("This team is not assigned to this team zone")
    if len(await team_zone_assign_repository.teams_by_zones(db, [zone_uuid])) <= 1:
        raise ValueError("A team zone needs at least one team; delete the zone instead")
    await team_zone_assign_repository.remove(db, uuid=existing.uuid)

    # 觸發 zone_unassigned 通知 (High 等級，送給 NGO Admin)
    zone_obj = await team_zone_repository.get_by_uuid_active(db, zone_uuid)
    zone_name = (zone_obj.name if zone_obj else None) or "工作分區"
    admins = await NotificationRecipientResolver.resolve_team_admin(db, team_uuid=team_uuid)
    await NotificationService.dispatch(
        db,
        event_type="zone_unassigned",
        title=f"工作區域指派已解除：{zone_name}",
        body=f"您的團隊對工作分區「{zone_name}」的指派已解除。",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="work_zone",
        ref_uuid=zone_uuid,
        explicit_recipients=admins,
    )
