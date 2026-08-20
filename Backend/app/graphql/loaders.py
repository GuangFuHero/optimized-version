"""Per-request Strawberry DataLoaders that batch nested-field DB lookups.

Each loader collapses an N+1 access pattern into a single
``SELECT ... WHERE parent_uuid IN (:uuids)`` query per nesting level.
Loaders are constructed fresh by :func:`build_loaders` for every GraphQL
request via ``app.graphql.context.get_context``; they must NOT be cached
across requests because DataLoaders memoise their own results.
"""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.dataloader import DataLoader

from app.graphql.geo.types import (
    CrowdSourcingType,
    SecondaryLocationType,
    StationPropertyType,
)
from app.graphql.tickets.types import (
    PhotoType,
    TaskAssignmentType,
    TaskPropertyType,
    TicketTaskType,
)
from app.graphql.work_zone.types import AssignedTeamType
from app.models.photo import Photo
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import CrowdSourcing, StationProperty
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.repositories.team_repository import team_zone_assign_repository


def build_loaders(db: AsyncSession) -> dict[str, DataLoader]:
    """Build all nested-field loaders for a single GraphQL request.

    Returns a dict keyed by loader name so resolvers can do
    ``info.context["loaders"]["photos_by_ticket"].load(uuid)``.
    """
    return {
        "secondary_location_by_geometry": DataLoader(
            load_fn=_make_one_to_one_loader(
                db, SecondaryLocation, "geometry_uuid", SecondaryLocationType
            )
        ),
        "station_properties_by_station": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, StationProperty, "station_uuid", StationPropertyType
            )
        ),
        "crowd_sourcings_by_property": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, CrowdSourcing, "item_uuid", CrowdSourcingType
            )
        ),
        "photos_by_ticket": DataLoader(load_fn=_make_photos_by_geometry_loader(db)),
        "photos_by_station": DataLoader(load_fn=_make_photos_by_geometry_loader(db)),
        "tasks_by_ticket": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TicketTask, "ticket_uuid", TicketTaskType, soft_delete=True
            )
        ),
        "task_properties_by_task": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TaskProperty, "task_uuid", TaskPropertyType, soft_delete=True
            )
        ),
        "task_assignments_by_task": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TaskAssignment, "task_uuid", TaskAssignmentType
            )
        ),
        "teams_by_zone": DataLoader(load_fn=_make_teams_by_zone_loader(db)),
    }


def _make_one_to_many_loader(
    db: AsyncSession, model, parent_column: str, gql_type, soft_delete: bool = False
):
    """Build a load function: ``list[parent_uuid] -> list[list[gql_type]]``.

    Issues one ``WHERE parent_column IN (:uuids)`` query, groups results by
    parent uuid, returns lists aligned to the input order (empty list when a
    parent has no children).
    """
    column = getattr(model, parent_column)

    async def load_fn(parent_uuids: list[str]) -> list[list]:
        stmt = select(model).where(column.in_(parent_uuids))
        if soft_delete:
            stmt = stmt.where(model.delete_at.is_(None))
        rows = (await db.execute(stmt)).scalars().all()
        grouped: dict[str, list] = defaultdict(list)
        for row in rows:
            grouped[str(getattr(row, parent_column))].append(gql_type.from_model(row))
        return [grouped[str(uuid)] for uuid in parent_uuids]

    return load_fn


def _make_one_to_one_loader(
    db: AsyncSession, model, parent_column: str, gql_type
):
    """Build a load function: ``list[parent_uuid] -> list[gql_type | None]``."""
    column = getattr(model, parent_column)

    async def load_fn(parent_uuids: list[str]) -> list:
        rows = (
            await db.execute(select(model).where(column.in_(parent_uuids)))
        ).scalars().all()
        by_parent = {str(getattr(r, parent_column)): gql_type.from_model(r) for r in rows}
        return [by_parent.get(str(uuid)) for uuid in parent_uuids]

    return load_fn


def _make_photos_by_geometry_loader(db: AsyncSession):
    """Polymorphic photos: filter by ``ref_type='geometry'`` in addition to ref_uuid.

    ``ref_uuid`` is a base_geometries.uuid, which is also a ticket's or a station's own
    uuid (shared PK via joined-table inheritance) — so this one loader serves both
    ``photos_by_ticket`` and ``photos_by_station``.
    """

    async def load_fn(geometry_uuids: list[str]) -> list[list[PhotoType]]:
        rows = (
            await db.execute(
                select(Photo).where(
                    Photo.ref_type == "geometry",
                    Photo.ref_uuid.in_(geometry_uuids),
                    Photo.delete_at.is_(None),
                )
            )
        ).scalars().all()
        grouped: dict[str, list[PhotoType]] = defaultdict(list)
        for row in rows:
            grouped[str(row.ref_uuid)].append(PhotoType.from_model(row))
        return [grouped[str(uuid)] for uuid in geometry_uuids]

    return load_fn


def _make_teams_by_zone_loader(db: AsyncSession):
    """Batch-load the teams each work zone is delegated to (soft-deleted teams excluded)."""

    async def load_fn(zone_uuids: list[str]) -> list[list[AssignedTeamType]]:
        pairs = await team_zone_assign_repository.teams_by_zones(db, list(zone_uuids))
        grouped: dict[str, list[AssignedTeamType]] = defaultdict(list)
        for zone_uuid, team in pairs:
            grouped[zone_uuid].append(AssignedTeamType.from_model(team))
        return [grouped[str(uuid)] for uuid in zone_uuids]

    return load_fn
