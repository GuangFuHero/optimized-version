"""GraphQL mutations for stations, closure areas, and station properties."""

from uuid import UUID

import strawberry
from shapely.geometry import shape

from app.graphql.context import check_permission
from app.graphql.geo.types import (
    ClosureAreaType,
    CreateClosureAreaInput,
    CreateCrowdSourcingInput,
    CreateStationInput,
    CreateStationPropertyInput,
    CrowdSourcingType,
    StationPropertyType,
    StationType,
    UpdateClosureAreaInput,
    UpdateStationInput,
    UpdateStationPropertyInput,
)
from app.graphql.scalars import geojson_to_geom
from app.repositories.geo_repository import (
    closure_area_repository,
    crowd_sourcing_repository,
    station_property_repository,
    station_repository,
)


def _validate_point(geojson: dict) -> None:
    """Raise ValueError if geojson is not a valid Point within lon/lat bounds."""
    geom = shape(geojson)
    if geom.geom_type != "Point":
        raise ValueError("Station geometry must be a Point")
    x, y = geom.coords[0][:2]
    if not (-180 <= x <= 180 and -90 <= y <= 90):
        raise ValueError("Invalid coordinates")


def _validate_polygon(geojson: dict) -> None:
    """Raise ValueError if geojson is not a Polygon or MultiPolygon."""
    geom = shape(geojson)
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("Closure area geometry must be Polygon or MultiPolygon")


@strawberry.type
class GeoMutation:
    """Mutations for creating, updating, and deleting stations and closure areas."""

    @strawberry.mutation
    async def create_station(self, info: strawberry.types.Info, input: CreateStationInput) -> StationType:
        """Create a new map station.

        Validates the geometry as a Point within valid lon/lat bounds. Optionally
        attaches a secondary address or pole location. Requires map:create permission.
        Returns the created station.
        """
        await check_permission(info, "map", "create")
        _validate_point(input.geometry)
        sl_dict = None
        if input.secondary_location is not None:
            sl = input.secondary_location
            sl_dict = {
                "location_type": sl.location_type,
                "county": sl.county, "city": sl.city, "lane": sl.lane, "alley": sl.alley,
                "no": sl.no, "floor": sl.floor, "room": sl.room,
                "pole_id": sl.pole_id, "pole_type": sl.pole_type, "pole_note": sl.pole_note,
            }
        station = await station_repository.create_with_secondary_location(
            info.context["db"],
            obj_in={
                "geometry": geojson_to_geom(input.geometry),
                "created_by": str(info.context["user"].uuid),
                "type": input.type, "name": input.name, "description": input.description,
                "op_hour": input.op_hour, "level": input.level, "comment": input.comment,
                "source": input.source, "visibility": input.visibility,
            },
            secondary_location=sl_dict,
        )
        return StationType.from_model(station)

    @strawberry.mutation
    async def update_station(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateStationInput
    ) -> StationType:
        """Update an existing station's geometry, metadata, or visibility.

        Only provided fields are applied (UNSET values are skipped). Enforces
        map:edit permission with ownership check (own scope). Returns the updated station.
        """
        db = info.context["db"]
        station = await station_repository.get_by_uuid_active(db, str(uuid))
        if not station:
            raise ValueError("Station not found")
        await check_permission(info, "map", "edit", owner_uuid=station.created_by)

        obj_in = {}
        if input.geometry is not None:
            _validate_point(input.geometry)
            obj_in["geometry"] = geojson_to_geom(input.geometry)
        if input.level is not None:
            obj_in["level"] = input.level
        if input.visibility is not None:
            obj_in["visibility"] = input.visibility
        for field in ("type", "name", "description", "op_hour", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                obj_in[field] = val

        station = await station_repository.update(db, db_obj=station, obj_in=obj_in)
        return StationType.from_model(station)

    @strawberry.mutation
    async def delete_station(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a station by setting its delete_at timestamp.

        Requires map:delete permission with ownership check. Returns True on success.
        """
        db = info.context["db"]
        station = await station_repository.get_by_uuid_active(db, str(uuid))
        if not station:
            raise ValueError("Station not found")
        await check_permission(info, "map", "delete", owner_uuid=station.created_by)
        await station_repository.soft_delete(db, db_obj=station)
        return True

    @strawberry.mutation
    async def create_closure_area(
        self, info: strawberry.types.Info, input: CreateClosureAreaInput
    ) -> ClosureAreaType:
        """Create a new road or area closure with a Polygon/MultiPolygon geometry.

        Validates geometry type. Requires map:create permission. Returns the created closure area.
        """
        await check_permission(info, "map", "create")
        _validate_polygon(input.geometry)
        area = await closure_area_repository.create(info.context["db"], obj_in={
            "property_name": "closure_area",
            "geometry": geojson_to_geom(input.geometry),
            "created_by": str(info.context["user"].uuid),
            "status": input.status,
            "information_source": input.information_source,
            "comment": input.comment,
        })
        return ClosureAreaType.from_model(area)

    @strawberry.mutation
    async def update_closure_area(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateClosureAreaInput,
    ) -> ClosureAreaType:
        """Update a closure area's geometry, status, or notes.

        UNSET fields are skipped. Requires map:edit permission with ownership check.
        Returns the updated closure area.
        """
        db = info.context["db"]
        area = await closure_area_repository.get_by_uuid_active(db, str(uuid))
        if not area:
            raise ValueError("Closure area not found")
        await check_permission(info, "map", "edit", owner_uuid=area.created_by)

        obj_in = {}
        if input.geometry is not None:
            _validate_polygon(input.geometry)
            obj_in["geometry"] = geojson_to_geom(input.geometry)
        if input.status is not None:
            obj_in["status"] = input.status
        for field in ("information_source", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                obj_in[field] = val

        area = await closure_area_repository.update(db, db_obj=area, obj_in=obj_in)
        return ClosureAreaType.from_model(area)


@strawberry.type
class StationPropertyMutation:
    """Mutations for station properties and crowd-sourcing entries."""

    @strawberry.mutation
    async def create_station_property(
        self, info: strawberry.types.Info, input: CreateStationPropertyInput,
    ) -> StationPropertyType:
        """Add a new property (supply item, service) to a station.

        Verifies the station exists. Requires map:create permission.
        Returns the created StationPropertyType.
        """
        await check_permission(info, "map", "create")
        db = info.context["db"]
        if not await station_repository.get_by_uuid_active(db, input.station_uuid):
            raise ValueError("Station not found")
        prop = await station_property_repository.create(db, obj_in={
            "station_uuid": input.station_uuid,
            "property_type": input.property_type,
            "property_name": input.property_name,
            "quantity": input.quantity,
            "weightings": input.weightings,
            "status": "pending",
            "created_by": str(info.context["user"].uuid),
        })
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_station_property(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateStationPropertyInput,
    ) -> StationPropertyType:
        """Update a station property's status, weightings, or quantity.

        Requires map:edit permission with ownership check. Returns the updated property.
        """
        db = info.context["db"]
        prop = await station_property_repository.get_by_uuid_active(db, str(uuid))
        if not prop:
            raise ValueError("Station property not found")
        await check_permission(info, "map", "edit", owner_uuid=prop.created_by)

        obj_in = {}
        if input.status is not None:
            obj_in["status"] = input.status
        if input.weightings is not None:
            obj_in["weightings"] = input.weightings
        if input.quantity is not strawberry.UNSET:
            obj_in["quantity"] = input.quantity

        prop = await station_property_repository.update(db, db_obj=prop, obj_in=obj_in)
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def create_crowd_sourcing(
        self, info: strawberry.types.Info, input: CreateCrowdSourcingInput,
    ) -> CrowdSourcingType:
        """Submit or update a crowd-sourced rating for a station property.

        If the user has already rated this item, updates the existing entry (rating + credibility).
        Otherwise creates a new entry. Requires map:create permission.
        Returns the created or updated CrowdSourcingType.
        """
        await check_permission(info, "map", "create")
        db = info.context["db"]
        user = info.context["user"]

        prop = await station_property_repository.get_by_uuid_active(db, input.item_uuid)
        if not prop or prop.station_uuid != input.station_uuid:
            raise ValueError("Item not found for this station")

        cs = await crowd_sourcing_repository.upsert(
            db,
            station_uuid=input.station_uuid,
            item_uuid=input.item_uuid,
            user_uuid=str(user.uuid),
            credibility_score=user.credibility_score,
            rating=input.rating,
            distance=input.distance_from_geometry,
        )
        return CrowdSourcingType.from_model(cs)
