"""Per-request Strawberry DataLoaders that batch nested-field DB lookups.

Each loader collapses an N+1 access pattern into a single
``SELECT ... WHERE parent_uuid IN (:uuids)`` query per nesting level.
Loaders are constructed fresh by :func:`build_loaders` for every GraphQL
request via ``app.graphql.context.get_context``; they must NOT be cached
across requests because DataLoaders memoise their own results.

Every list loader passes an explicit ``order_by`` ending on a unique column, so the order is
total. Without one, a batched ``WHERE parent_uuid IN (...)`` returns rows in whatever order
the plan produced, and the same field can come back differently twice running.
"""

from collections import defaultdict

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.dataloader import DataLoader

from app.db.h3 import h3_cell_text, h3_centroid
from app.graphql.geo.types import (
    CrowdSourcingType,
    SecondaryLocationType,
    StationPropertyType,
)
from app.graphql.scalars import geom_to_geojson
from app.graphql.suggestions.types import StationSuggestionMergeType, StationSuggestionType
from app.graphql.tickets.types import (
    PhotoType,
    TaskAssignmentType,
    TaskPropertyType,
    TicketDisasterDetailType,
    TicketTaskType,
)
from app.graphql.work_zone.types import AssignedTeamType
from app.models.geo import BaseGeometry
from app.models.photo import Photo
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import (
    CrowdSourcing,
    StationProperty,
    StationSuggestionMerge,
    StationUpdateSuggestion,
)
from app.models.team import Team
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.repositories.team_repository import team_zone_assign_repository


def build_loaders(db: AsyncSession) -> dict[str, DataLoader]:
    """Build all nested-field loaders for a single GraphQL request.

    Returns a dict keyed by loader name so resolvers can do
    ``info.context["loaders"]["photos_by_ticket"].load(uuid)``.
    """
    # Photos are keyed by base_geometries.uuid regardless of subtype, so the ticket and
    # station loaders run the identical query. Share ONE instance under both names —
    # two would mean two caches, and the same rows fetched twice per request.
    photos_by_geometry = DataLoader(load_fn=_make_photos_by_geometry_loader(db))
    return {
        "secondary_location_by_geometry": DataLoader(
            load_fn=_make_one_to_one_loader(
                db, SecondaryLocation, "geometry_uuid", SecondaryLocationType
            )
        ),
        "station_properties_by_station": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, StationProperty, "station_uuid", StationPropertyType,
                # Groups the form by facility/supply/service, then by name within each.
                order_by=(
                    StationProperty.property_type,
                    StationProperty.property_name,
                    StationProperty.uuid,
                ),
            )
        ),
        "crowd_sourcings_by_property": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, CrowdSourcing, "item_uuid", CrowdSourcingType,
                # A feed, not a form: newest rating first.
                order_by=(CrowdSourcing.created_at.desc(), CrowdSourcing.uuid),
            )
        ),
        # Keyed by station and covering its properties too, so a station list with nested
        # properties still costs one query.
        "pending_suggestions_by_station": DataLoader(
            load_fn=_make_pending_suggestions_by_station_loader(db)
        ),
        "suggestion_merges_by_station": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, StationSuggestionMerge, "station_uuid", StationSuggestionMergeType,
                soft_delete=True,
                # Newest decision first, since that is the one a revoke would target.
                order_by=(StationSuggestionMerge.created_at.desc(), StationSuggestionMerge.uuid),
            )
        ),
        "photos_by_ticket": photos_by_geometry,
        "photos_by_station": photos_by_geometry,
        "disaster_details_by_ticket": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TicketDisasterDetail, "ticket_uuid", TicketDisasterDetailType,
                soft_delete=True,
                # Must match the write path's ordering, or the same values come back one
                # way from a write and another from a read. Already total: the unique
                # constraint makes this pair unique per ticket.
                order_by=(
                    TicketDisasterDetail.property_name,
                    TicketDisasterDetail.value,
                ),
            )
        ),
        "tasks_by_ticket": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TicketTask, "ticket_uuid", TicketTaskType, soft_delete=True,
                # A worklist reads chronologically, oldest first.
                order_by=(TicketTask.created_at, TicketTask.uuid),
            )
        ),
        "task_properties_by_task": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TaskProperty, "task_uuid", TaskPropertyType, soft_delete=True,
                # By field name, so the values line up with the form's field order.
                order_by=(TaskProperty.property_name, TaskProperty.uuid),
            )
        ),
        "task_assignments_by_task": DataLoader(
            load_fn=_make_one_to_many_loader(
                db, TaskAssignment, "task_uuid", TaskAssignmentType,
                # This table has no `created_at`; `assigned_at` is the timestamp.
                order_by=(TaskAssignment.assigned_at, TaskAssignment.uuid),
            )
        ),
        "teams_by_zone": DataLoader(load_fn=_make_teams_by_zone_loader(db)),
        "team_by_uuid": DataLoader(load_fn=_make_team_by_uuid_loader(db)),
        # The three below serve the ticket.view_detail boundary (ADR-281): the ticket a task
        # or property is judged by, and the coarse point shown in place of the exact one.
        "ticket_by_uuid": DataLoader(load_fn=_make_ticket_by_uuid_loader(db)),
        "ticket_uuid_by_task": DataLoader(load_fn=_make_ticket_uuid_by_task_loader(db)),
        "coarse_point": DataLoader(load_fn=_make_coarse_point_loader(db)),
    }


def _make_one_to_many_loader(
    db: AsyncSession, model, parent_column: str, gql_type,
    soft_delete: bool = False, order_by=None,
):
    """Build a load function: ``list[parent_uuid] -> list[list[gql_type]]``.

    Issues one ``WHERE parent_column IN (:uuids)`` query, groups results by
    parent uuid, returns lists aligned to the input order (empty list when a
    parent has no children).

    ``order_by`` is a tuple of columns applied to the batched query. End it on a unique
    column so the order is total; rows are grouped below in arrival order, so this is the
    only place the per-parent order is decided.
    """
    column = getattr(model, parent_column)

    async def load_fn(parent_uuids: list[str]) -> list[list]:
        stmt = select(model).where(column.in_(parent_uuids))
        if soft_delete:
            stmt = stmt.where(model.delete_at.is_(None))
        if order_by is not None:
            stmt = stmt.order_by(*order_by)
        rows = (await db.execute(stmt)).scalars().all()
        grouped: dict[str, list] = defaultdict(list)
        for row in rows:
            grouped[str(getattr(row, parent_column))].append(gql_type.from_model(row))
        return [grouped[str(uuid)] for uuid in parent_uuids]

    return load_fn


def _make_pending_suggestions_by_station_loader(db: AsyncSession):
    """Build a load function: ``list[station_uuid] -> list[list[StationSuggestionType]]``.

    Returns the pending suggestions on each station and on its active properties, newest first.
    """
    prop_station = cast(StationProperty.station_uuid, String)
    station_key = func.coalesce(prop_station, StationUpdateSuggestion.target_uuid)

    async def load_fn(station_uuids: list[str]) -> list[list]:
        keys = [str(uuid) for uuid in station_uuids]
        stmt = (
            select(StationUpdateSuggestion, station_key)
            .outerjoin(
                StationProperty,
                (cast(StationProperty.uuid, String) == StationUpdateSuggestion.target_uuid)
                & StationProperty.delete_at.is_(None),
            )
            .where(
                StationUpdateSuggestion.status == "pending",
                StationUpdateSuggestion.delete_at.is_(None),
                or_(StationUpdateSuggestion.target_uuid.in_(keys), prop_station.in_(keys)),
            )
            .order_by(StationUpdateSuggestion.created_at.desc(), StationUpdateSuggestion.uuid)
        )
        grouped: dict[str, list] = defaultdict(list)
        for row, key in (await db.execute(stmt)).all():
            grouped[key].append(StationSuggestionType.from_model(row))
        return [grouped[key] for key in keys]

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
        stmt = (
            select(Photo)
            .where(
                Photo.ref_type == "geometry",
                Photo.ref_uuid.in_(geometry_uuids),
                Photo.delete_at.is_(None),
            )
            # Oldest first, so a gallery keeps its order between loads.
            .order_by(Photo.created_at, Photo.uuid)
        )
        rows = (await db.execute(stmt)).scalars().all()
        grouped: dict[str, list[PhotoType]] = defaultdict(list)
        for row in rows:
            grouped[str(row.ref_uuid)].append(PhotoType.from_model(row))
        return [grouped[str(uuid)] for uuid in geometry_uuids]

    return load_fn


def _make_ticket_by_uuid_loader(db: AsyncSession):
    """Batch-load tickets by uuid, for the `own`/`zone` detail check of their tasks.

    Soft-deleted tickets included on purpose: this answers "whose is it and where", and a
    task still reachable through `ticketTasks` must be judged by its ticket either way.
    """

    async def load_fn(ticket_uuids: list[str]) -> list[Tickets | None]:
        rows = (
            await db.execute(select(Tickets).where(Tickets.uuid.in_(ticket_uuids)))
        ).scalars().all()
        by_uuid = {str(row.uuid): row for row in rows}
        return [by_uuid.get(str(uuid)) for uuid in ticket_uuids]

    return load_fn


def _make_ticket_uuid_by_task_loader(db: AsyncSession):
    """Batch-load the ticket each task belongs to — a task property's only route to a scope."""

    async def load_fn(task_uuids: list[str]) -> list[str | None]:
        rows = (
            await db.execute(
                select(TicketTask.uuid, TicketTask.ticket_uuid).where(TicketTask.uuid.in_(task_uuids))
            )
        ).all()
        by_task = {str(task_uuid): str(ticket_uuid) for task_uuid, ticket_uuid in rows}
        return [by_task.get(str(uuid)) for uuid in task_uuids]

    return load_fn


def _make_coarse_point_loader(db: AsyncSession):
    """Batch-load the coarse location, keyed ``(ticket_uuid, resolution)`` (ADR-281/283).

    Each value is ``{"point": <GeoJSON of the cell centre>, "cell": <H3 index hex string>}``,
    or None when the row is gone. Both come from one statement so the point and the cell a
    client groups by can never disagree.

    One statement per resolution in the batch — in practice one, since a request carries one
    `zoom`. Selected from `base_geometries` directly: the point lives there, and selecting
    `Tickets.geometry` as a bare column would put both halves of the joined inheritance in
    the FROM clause with nothing joining them.
    """

    async def load_fn(keys: list[tuple[str, int]]) -> list[dict | None]:
        by_resolution: dict[int, list[str]] = defaultdict(list)
        for uuid, resolution in keys:
            by_resolution[resolution].append(uuid)
        coarse: dict[tuple[str, int], dict] = {}
        for resolution, uuids in by_resolution.items():
            rows = await db.execute(
                select(
                    BaseGeometry.uuid,
                    h3_centroid(BaseGeometry.geometry, resolution),
                    h3_cell_text(BaseGeometry.geometry, resolution),
                ).where(BaseGeometry.uuid.in_(uuids))
            )
            for uuid, centre, cell in rows:
                coarse[(str(uuid), resolution)] = {"point": geom_to_geojson(centre), "cell": cell}
        return [coarse.get((str(uuid), resolution)) for uuid, resolution in keys]

    return load_fn


def _make_team_by_uuid_loader(db: AsyncSession):
    """Batch-load the team each station is assigned to (ADR-285).

    Soft-deleted teams come back as None, so a station still pointing at one reads as
    unassigned (ADR-285 decision 8) — the timeline keeps the old name; the station itself does
    not claim a team that no longer exists.
    """

    async def load_fn(team_uuids: list[str]) -> list[AssignedTeamType | None]:
        rows = (
            await db.execute(select(Team).where(Team.uuid.in_(team_uuids), Team.delete_at.is_(None)))
        ).scalars().all()
        by_uuid = {str(row.uuid): AssignedTeamType.from_model(row) for row in rows}
        return [by_uuid.get(str(uuid)) for uuid in team_uuids]

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
