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
from app.graphql.tickets.types import PhotoType
from app.services import closure_area as closure_area_service
from app.services import photo as photo_service
from app.services import station as station_service


@strawberry.type
class GeoMutation:
    """Mutations for creating, updating, and deleting stations and closure areas."""

    @strawberry.mutation
    async def create_station(self, info: strawberry.types.Info, input: CreateStationInput) -> StationType:
        """Create a new map station.

        Validates the geometry as a Point within valid lon/lat bounds. Optionally
        attaches a secondary address or pole location. Requires station.add permission.
        Returns the created station.
        """
        sl_dict = input.secondary_location.to_dict() if input.secondary_location else None
        station = await station_service.create_station(
            info.context["db"],
            actor=require_authenticated(info),
            geometry=input.geometry,
            type=input.type,
            name=input.name,
            description=input.description,
            op_hour=input.op_hour,
            level=input.level,
            comment=input.comment,
            source=input.source,
            visibility=input.visibility.value,
            contact_name=input.contact_name,
            contact_email=input.contact_email,
            contact_phone=input.contact_phone,
            operational_status=input.operational_status.value,
            secondary_location=sl_dict,
        )
        return StationType.from_model(station)

    @strawberry.mutation
    async def attach_station_photo(
        self, info: strawberry.types.Info, station_uuid: UUID, url: str
    ) -> PhotoType:
        """Attach a photo to a station.

        Open crowd-sourcing (station.contribute) — anyone holding the capability may
        attach a photo to any station, matching the property/rating contribution model.
        Returns the created PhotoType.
        """
        photo = await photo_service.attach_photo_to_geometry(
            info.context["db"],
            actor=require_authenticated(info),
            base_geometry_uuid=str(station_uuid),
            url=url,
        )
        return PhotoType.from_model(photo)

    @strawberry.mutation
    async def detach_station_photo(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a station photo. Returns True on success.

        The uploader may remove their own photo with the station.contribute that created it.
        Removing anyone else's is moderation: it requires station.review, and the caller must
        also be in scope for the station the photo hangs off. Anything that is not an active
        station photo errors as "not found", including a ticket photo's uuid — both kinds
        share one table, and that check runs before the uploader exemption.
        """
        await photo_service.detach_station_photo(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True

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
        if input.operational_status is not None:
            changes["operational_status"] = input.operational_status.value
        for field in (
            "type",
            "name",
            "description",
            "op_hour",
            "comment",
            "contact_name",
            "contact_email",
            "contact_phone",
        ):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val

        sl = input.secondary_location
        station = await station_service.update_station(
            info.context["db"],
            actor=require_authenticated(info),
            uuid=str(uuid),
            geometry=input.geometry,
            changes=changes,
            secondary_location=sl.to_dict() if sl not in (None, strawberry.UNSET) else None,
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

        Validates geometry type. Requires map.add permission. Returns the created closure area.
        """
        area = await closure_area_service.create_closure_area(
            info.context["db"],
            actor=require_authenticated(info),
            geometry=input.geometry,
            status=input.status,
            information_source=input.information_source,
            comment=input.comment,
        )
        return ClosureAreaType.from_model(area)

    @strawberry.mutation
    async def update_closure_area(
        self,
        info: strawberry.types.Info,
        uuid: UUID,
        input: UpdateClosureAreaInput,
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
            info.context["db"],
            actor=require_authenticated(info),
            uuid=str(uuid),
            geometry=input.geometry,
            changes=changes,
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
        self,
        info: strawberry.types.Info,
        input: CreateStationPropertyInput,
    ) -> StationPropertyType:
        """Add a new property (supply item, service) to a station.

        Verifies the station exists. Requires station.edit permission (checkpoint 1 only —
        matches prior behavior, which did not scope-check against the parent station).
        Returns the created StationPropertyType.
        """
        prop = await station_service.create_station_property(
            info.context["db"],
            actor=require_authenticated(info),
            station_uuid=input.station_uuid,
            property_type=input.property_type,
            property_name=input.property_name,
            quantity=input.quantity,
            weightings=input.weightings,
        )
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_station_property(
        self,
        info: strawberry.types.Info,
        uuid: UUID,
        input: UpdateStationPropertyInput,
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
        self,
        info: strawberry.types.Info,
        input: CreateCrowdSourcingInput,
    ) -> CrowdSourcingType:
        """Submit or update a crowd-sourced rating for a station property.

        If the user has already rated this item, updates the existing entry (rating + credibility).
        Otherwise creates a new entry. Requires station.edit permission (checkpoint 1 only,
        matching prior behavior — same tier as map:create previously required).
        Returns the created or updated CrowdSourcingType.
        """
        cs = await station_service.rate_station_property(
            info.context["db"],
            actor=require_authenticated(info),
            station_uuid=input.station_uuid,
            item_uuid=input.item_uuid,
            rating=input.rating,
            distance_from_geometry=input.distance_from_geometry,
        )
        return CrowdSourcingType.from_model(cs)
