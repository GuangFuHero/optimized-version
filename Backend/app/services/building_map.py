"""Building-map write actions, and the floor and area rules a ticket filed inside one follows.

Same flat-service style as closure_area.py: `db` first, keyword-only args, each function owns
its own authz + validation + persistence.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom, geom_to_geojson
from app.models.auth import User
from app.models.geo import BuildingMap
from app.repositories.geo_repository import building_map_repository, secondary_location_repository
from app.services.authz import require_scope
from app.services.geo_validation import validate_point

# Offered on every floor that has areas, so a reporter in an unlisted space can still file.
OTHER_AREA = "其他"
ADDRESS_PARTS = ("county", "city", "lane", "alley", "no")
MAX_FLOORS_ABOVE_GROUND = 200
MAX_FLOORS_BELOW_GROUND = 20
MAX_NAME_LENGTH = 100
# The area is stored in secondary_locations.room, which is String(20).
MAX_AREA_LENGTH = 20


def floor_labels(above: int, below: int) -> list[str]:
    """The building's floor labels, top floor first: 3F, 2F, 1F, B1, B2."""
    return [f"{n}F" for n in range(above, 0, -1)] + [f"B{n}" for n in range(1, below + 1)]


def _validate_name(name: str) -> str:
    name = name.strip()
    if not 1 <= len(name) <= MAX_NAME_LENGTH:
        raise ValueError(f"Name must be 1-{MAX_NAME_LENGTH} characters")
    return name


def _validate_layout(above: int, below: int, floor_areas: dict[str, list[str]]) -> dict:
    """Check the floor counts and return the areas cleaned, keyed by floor label.

    Blank-padded and duplicate names are folded, and `其他` is dropped because it is always offered.
    """
    if not 1 <= above <= MAX_FLOORS_ABOVE_GROUND:
        raise ValueError(f"floorsAboveGround must be 1-{MAX_FLOORS_ABOVE_GROUND}")
    if not 0 <= below <= MAX_FLOORS_BELOW_GROUND:
        raise ValueError(f"floorsBelowGround must be 0-{MAX_FLOORS_BELOW_GROUND}")
    labels = set(floor_labels(above, below))
    cleaned: dict[str, list[str]] = {}
    for floor, areas in floor_areas.items():
        if floor not in labels:
            raise ValueError(f"Floor '{floor}' is not in this building")
        names: list[str] = []
        for area in areas:
            area = area.strip()
            if not 1 <= len(area) <= MAX_AREA_LENGTH:
                raise ValueError(f"Area names must be 1-{MAX_AREA_LENGTH} characters")
            if area != OTHER_AREA and area not in names:
                names.append(area)
        if names:
            cleaned[floor] = names
    return cleaned


async def create_building_map(
    db: AsyncSession,
    *,
    actor: User,
    name: str,
    geometry: dict,
    secondary_location: dict,
    floors_above_ground: int,
    floors_below_ground: int,
    floor_areas: dict[str, list[str]],
) -> BuildingMap:
    """Create a building map and its address in one commit (checkpoint 1 only)."""
    await require_scope(actor, Perm.MAP_ADD, db)
    validate_point(geometry, entity="Building map")
    if any(secondary_location.get(k) for k in ("building_section", "floor", "room")):
        raise ValueError("A building map's address has no building section, floor or room")
    building = await building_map_repository.add(
        db,
        obj_in={
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor.uuid),
            "name": _validate_name(name),
            "floors_above_ground": floors_above_ground,
            "floors_below_ground": floors_below_ground,
            "floor_areas": _validate_layout(floors_above_ground, floors_below_ground, floor_areas),
        },
    )
    await secondary_location_repository.add(
        db,
        obj_in={**secondary_location, "geometry_uuid": str(building.uuid), "location_type": "address"},
    )
    await db.commit()
    await db.refresh(building)
    return building


async def update_building_map(
    db: AsyncSession, *, actor: User, uuid: str, geometry: dict | None = None, changes: dict
) -> BuildingMap:
    """Update a building map (checkpoint 1 map.edit, then checkpoint 2 against the loaded map).

    The layout is re-checked as a whole, so shrinking the floor count cannot strand an area list.
    """
    building = await building_map_repository.get_by_uuid_active(db, uuid)
    if not building:
        raise ValueError("Building map not found")
    await require_scope(actor, Perm.MAP_EDIT, db, resource=building)

    obj_in = dict(changes)
    if "name" in obj_in:
        obj_in["name"] = _validate_name(obj_in["name"])
    obj_in["floor_areas"] = _validate_layout(
        obj_in.get("floors_above_ground", building.floors_above_ground),
        obj_in.get("floors_below_ground", building.floors_below_ground),
        obj_in.get("floor_areas", building.floor_areas or {}),
    )
    if geometry is not None:
        validate_point(geometry, entity="Building map")
        obj_in["geometry"] = geojson_to_geom(geometry)
    return await building_map_repository.update(db, db_obj=building, obj_in=obj_in)


async def delete_building_map(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete a building map (checkpoint 1 map.delete, then checkpoint 2 against it)."""
    building = await building_map_repository.get_by_uuid_active(db, uuid)
    if not building:
        raise ValueError("Building map not found")
    await require_scope(actor, Perm.MAP_DELETE, db, resource=building)
    await building_map_repository.soft_delete(db, db_obj=building)


async def place_ticket(
    db: AsyncSession, building_map_uuid: str, geometry: dict | None, location: dict | None
) -> tuple[dict, dict]:
    """Return a ticket's point and address: the building's, plus the reporter's floor and room.

    Unlike dynamic-field configs, the layout is enforced, and `其他` keeps an unlisted space fileable.
    """
    if geometry is not None:
        raise ValueError("Omit geometry when filing under a building map; its point is used")
    building = await building_map_repository.get_by_uuid_active(db, building_map_uuid)
    if not building:
        raise ValueError("Building map not found")
    location = dict(location or {})
    floor = location.get("floor")
    if floor not in floor_labels(building.floors_above_ground, building.floors_below_ground):
        raise ValueError(f"Floor '{floor}' is not in this building")
    areas = (building.floor_areas or {}).get(floor) or []
    if areas and location.get("room") not in [*areas, OTHER_AREA]:
        raise ValueError(f"Room on {floor} must be one of {areas} or '{OTHER_AREA}'")
    address = await secondary_location_repository.get_by_geometry(db, str(building.uuid))
    location["location_type"] = "address"
    if address is not None:
        location |= {k: getattr(address, k) for k in ADDRESS_PARTS}
    return geom_to_geojson(building.geometry), location
