"""GraphQL mutations for stations, closure areas, and station properties.

Thin per ADR-014: parse input, call the service function (which owns authz, validation,
and persistence), map the result back to a GraphQL type. See app/services/station.py and
app/services/closure_area.py.
"""

from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
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
from app.services import closure_area as closure_area_service
from app.services import station as station_service


@strawberry.type
class GeoMutation:
    """Mutations for creating, updating, and deleting stations and closure areas."""

    @strawberry.mutation
    async def create_station(self, info: strawberry.types.Info, input: CreateStationInput) -> StationType:
        """Create a new map station.

        Validates the geometry as a Point within valid lon/lat bounds. Optionally
        attaches a secondary address or pole location. Requires station.make permission.
        Returns the created station.
        """
        sl_dict = None
        if input.secondary_location is not None:
            sl = input.secondary_location
            sl_dict = {
                "location_type": sl.location_type,
                "county": sl.county, "city": sl.city, "lane": sl.lane, "alley": sl.alley,
                "no": sl.no, "floor": sl.floor, "room": sl.room,
                "pole_id": sl.pole_id, "pole_type": sl.pole_type, "pole_note": sl.pole_note,
            }
        station = await station_service.create_station(
            info.context["db"],
            actor=require_authenticated(info),
            geometry=input.geometry,
            type=input.type, name=input.name, description=input.description,
            op_hour=input.op_hour, level=input.level, comment=input.comment,
            source=input.source, visibility=input.visibility.value,
            secondary_location=sl_dict,
        )
        return StationType.from_model(station)

    @strawberry.mutation
    async def update_station(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateStationInput
    ) -> StationType:
        """Update an existing station's geometry, metadata, or visibility.

        Only provided fields are applied (UNSET values are skipped). Enforces
        station.edit permission with scope check (own/team/gov/ngo/zone/all — checkpoint 2
        against the loaded station). Returns the updated station.
        """
        changes = {}
        if input.level is not None:
            changes["level"] = input.level
        if input.visibility is not None:
            changes["visibility"] = input.visibility.value
        for field in ("type", "name", "description", "op_hour", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val

        station = await station_service.update_station(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), geometry=input.geometry, changes=changes,
        )
        return StationType.from_model(station)

    @strawberry.mutation
    async def delete_station(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a station by setting its delete_at timestamp.

        Requires station.delete permission with scope check. Returns True on success.
        """
        await station_service.delete_station(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True

    @strawberry.mutation
    async def create_closure_area(
        self, info: strawberry.types.Info, input: CreateClosureAreaInput
    ) -> ClosureAreaType:
        """Create a new road or area closure with a Polygon/MultiPolygon geometry.

        Validates geometry type. Requires map.make permission. Returns the created closure area.
        """
        area = await closure_area_service.create_closure_area(
            info.context["db"], actor=require_authenticated(info),
            geometry=input.geometry, status=input.status,
            information_source=input.information_source, comment=input.comment,
        )
        return ClosureAreaType.from_model(area)

    @strawberry.mutation
    async def update_closure_area(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateClosureAreaInput,
    ) -> ClosureAreaType:
        """Update a closure area's geometry, status, or notes.

        UNSET fields are skipped. Requires map.edit permission with scope check.
        Returns the updated closure area.
        """
        changes = {}
        if input.status is not None:
            changes["status"] = input.status
        for field in ("information_source", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val

        area = await closure_area_service.update_closure_area(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), geometry=input.geometry, changes=changes,
        )
        return ClosureAreaType.from_model(area)

    @strawberry.mutation
    async def delete_closure_area(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a closure area (sets delete_at).

        Requires map.delete permission with scope check. Returns True on success.
        """
        await closure_area_service.delete_closure_area(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True


@strawberry.type
class StationPropertyMutation:
    """Mutations for station properties and crowd-sourcing entries."""

    @strawberry.mutation
    async def create_station_property(
        self, info: strawberry.types.Info, input: CreateStationPropertyInput,
    ) -> StationPropertyType:
        """Add a new property (supply item, service) to a station.

        Verifies the station exists. Requires station.edit permission (checkpoint 1 only —
        matches prior behavior, which did not scope-check against the parent station).
        Returns the created StationPropertyType.
        """
        prop = await station_service.create_station_property(
            info.context["db"], actor=require_authenticated(info),
            station_uuid=input.station_uuid, property_type=input.property_type,
            property_name=input.property_name, quantity=input.quantity,
            weightings=input.weightings,
        )
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_station_property(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateStationPropertyInput,
    ) -> StationPropertyType:
        """Update a station property's status, weightings, or quantity.

        Requires station.edit permission with scope check. Returns the updated property.
        """
        changes = {}
        if input.status is not None:
            changes["status"] = input.status
        if input.weightings is not None:
            changes["weightings"] = input.weightings
        if input.quantity is not strawberry.UNSET:
            changes["quantity"] = input.quantity

        prop = await station_service.update_station_property(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid), changes=changes
        )
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def create_crowd_sourcing(
        self, info: strawberry.types.Info, input: CreateCrowdSourcingInput,
    ) -> CrowdSourcingType:
        """Submit or update a crowd-sourced rating for a station property.

        If the user has already rated this item, updates the existing entry (rating + credibility).
        Otherwise creates a new entry. Requires station.edit permission (checkpoint 1 only,
        matching prior behavior — same tier as map:create previously required).
        Returns the created or updated CrowdSourcingType.
        """
        cs = await station_service.rate_station_property(
            info.context["db"], actor=require_authenticated(info),
            station_uuid=input.station_uuid, item_uuid=input.item_uuid,
            rating=input.rating, distance_from_geometry=input.distance_from_geometry,
        )
        return CrowdSourcingType.from_model(cs)
