"""The optional filters of the analytics endpoints, and the values the catalog publishes for them.

A filter is a WHERE clause list against `Tickets` or `Station`, the same shape as the caller's RBAC
row filter, so the endpoints append it to `extra_filters` and every metric already applies it.
Because the two are only ever ANDed, a filter narrows the caller's scope and never widens it.
"""

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.schemas.analytics import (
    AreaCounty,
    AreaTown,
    DomainFilters,
    FilterOption,
    StationStatus,
    TicketStatus,
    TicketTaskType,
)
from app.services.chart_render import display_name


def _in_area(geometry_uuid, *, county: str | None, town: str | None, village: str | None) -> list:
    """The address filter: the row's address has all the parts given.

    EXISTS, not a join, so a row with two address rows still counts once.
    """
    parts = [
        column == value
        for column, value in (
            (SecondaryLocation.county, county),
            (SecondaryLocation.town, town),
            (SecondaryLocation.village, village),
        )
        if value
    ]
    if not parts:
        return []
    return [
        exists().where(
            SecondaryLocation.geometry_uuid == geometry_uuid,
            SecondaryLocation.location_type == "address",
            *parts,
        )
    ]


def ticket_filters(
    *,
    task_type: TicketTaskType | None,
    status: TicketStatus | None,
    county: str | None,
    town: str | None,
    village: str | None,
) -> list:
    """WHERE clauses against `Tickets` for the ticket endpoints' filter params."""
    clauses = []
    if task_type is not None:
        clauses.append(Tickets.task_type == task_type.value)
    if status is not None:
        clauses.append(Tickets.status == status.value)
    return [*clauses, *_in_area(Tickets.uuid, county=county, town=town, village=village)]


def station_filters(
    *,
    station_type: str | None,
    status: StationStatus | None,
    county: str | None,
    town: str | None,
    village: str | None,
) -> list:
    """WHERE clauses against `Station` for the station endpoints' filter params."""
    clauses = []
    if station_type:
        clauses.append(Station.type == station_type)
    if status is not None:
        clauses.append(Station.operational_status == status.value)
    return [*clauses, *_in_area(Station.uuid, county=county, town=town, village=village)]


def _options(values) -> list[FilterOption]:
    return [FilterOption(value=v, label=display_name(v)) for v in values]


async def _areas(db: AsyncSession, model, scope: list) -> list[AreaCounty]:
    """The 縣市 > 鄉鎮市區 > 村里 of the addresses of the live rows of `model` inside `scope`."""
    rows = await db.execute(
        select(SecondaryLocation.county, SecondaryLocation.town, SecondaryLocation.village)
        .join(model, model.uuid == SecondaryLocation.geometry_uuid)
        .where(
            SecondaryLocation.location_type == "address",
            SecondaryLocation.county.is_not(None),
            model.delete_at.is_(None),
            *scope,
        )
        .distinct()
        .order_by(SecondaryLocation.county, SecondaryLocation.town, SecondaryLocation.village)
    )
    tree: dict[str, dict[str, list[str]]] = {}
    for county, town, village in rows:
        towns = tree.setdefault(county, {})
        if town is not None:
            villages = towns.setdefault(town, [])
            if village is not None:
                villages.append(village)
    return [
        AreaCounty(
            county=county,
            towns=[AreaTown(town=town, villages=villages) for town, villages in towns.items()],
        )
        for county, towns in tree.items()
    ]


async def catalog_filters(
    db: AsyncSession, *, ticket_scope: list | None, station_scope: list | None
) -> dict[str, DomainFilters]:
    """Each domain's filter values. A scope is the caller's row filter, or None when they may not chart it.

    Statuses and ticket task types are fixed vocabularies. Station types and every area come from
    the rows the caller may chart, so the catalog never names a place or type they cannot see.
    """
    station_types = []
    if station_scope is not None:
        station_types = (
            await db.scalars(
                select(Station.type)
                .where(Station.type.is_not(None), Station.delete_at.is_(None), *station_scope)
                .distinct()
                .order_by(Station.type)
            )
        ).all()
    return {
        "tickets": DomainFilters(
            types=_options(t.value for t in TicketTaskType),
            statuses=_options(s.value for s in TicketStatus),
            areas=[] if ticket_scope is None else await _areas(db, Tickets, ticket_scope),
        ),
        "stations": DomainFilters(
            types=_options(station_types),
            statuses=_options(s.value for s in StationStatus),
            areas=[] if station_scope is None else await _areas(db, Station, station_scope),
        ),
    }
