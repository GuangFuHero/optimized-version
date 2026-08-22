"""Bulk export of stations and tickets (feature 015, ADR-109/119).

Export is a second read path onto data the GraphQL layer already guards, so it repeats the
same two decisions rather than inventing its own: `scope_filter` decides which rows are in
the file, and the per-row `ticket.view_pii` check decides whether a contact field is written
in the clear or masked. Skipping either would leave the tiers guarding the screen and not
the export button.

Columns and their order come from `bulk_columns`, which the importer also reads — that is
what makes an exported file a valid import template rather than two implementations
happening to agree (ADR-119).
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope, scope_filter
from app.core.security import resolve_scope
from app.core.tabular import TEXT_COLUMNS, write_csv, write_xlsx
from app.graphql.masking import mask_email, mask_name, mask_phone
from app.graphql.scalars import geom_to_geojson
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import StationProperty
from app.models.ticket_task import TaskProperty, TicketTask
from app.services.authz import require_scope, stable_actor
from app.services.bulk_columns import station_columns, ticket_columns

CSV_FORMAT = "csv"
XLSX_FORMAT = "xlsx"
SUPPORTED_FORMATS = (CSV_FORMAT, XLSX_FORMAT)

_MEDIA_TYPES = {
    CSV_FORMAT: "text/csv; charset=utf-8",
    XLSX_FORMAT: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# Deliberately generous: an export is a read, and its reach is already bounded by the
# caller's scope. The cap exists so one click cannot pin a connection open indefinitely.
MAX_EXPORT_ROWS = 10_000


class BulkExportError(ValueError):
    """The export cannot be produced as asked (mapped to 400 by the endpoint)."""


@dataclass(frozen=True)
class ExportFile:
    """A rendered file ready to stream back."""

    content: bytes
    filename: str
    media_type: str


def _text(value) -> str:
    """Render one model value as the file's text form."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _coordinates(geometry) -> tuple[str, str]:
    """Return (latitude, longitude) as text; blank when the row somehow has no point."""
    geojson = geom_to_geojson(geometry)
    if not geojson or geojson.get("type") != "Point":
        return "", ""
    longitude, latitude = geojson["coordinates"][:2]
    return _text(latitude), _text(longitude)


def _render(columns, rows, *, stem: str, file_format: str) -> ExportFile:
    if file_format not in SUPPORTED_FORMATS:
        raise BulkExportError(f"不支援的匯出格式「{file_format}」；請使用 {' 或 '.join(SUPPORTED_FORMATS)}")
    headers = tuple(column.header for column in columns)
    content = (
        write_csv(headers, rows)
        if file_format == CSV_FORMAT
        else write_xlsx(headers, rows, text_columns=TEXT_COLUMNS)
    )
    return ExportFile(
        content=content,
        filename=f"{stem}.{file_format}",
        media_type=_MEDIA_TYPES[file_format],
    )


# --- stations ---


async def _station_rows(db: AsyncSession, stations: list[Station]) -> dict:
    """Fetch the address and dynamic values for a page of stations in two queries, not 2N."""
    uuids = [str(s.uuid) for s in stations]
    if not uuids:
        return {"addresses": {}, "properties": {}}

    addresses = {
        str(row.geometry_uuid): row
        for row in (
            await db.execute(
                select(SecondaryLocation).where(
                    SecondaryLocation.geometry_uuid.in_(uuids),
                    SecondaryLocation.location_type == "address",
                )
            )
        ).scalars()
    }
    properties: dict[str, dict[str, StationProperty]] = {}
    for row in (
        await db.execute(
            select(StationProperty).where(
                StationProperty.station_uuid.in_(uuids), StationProperty.delete_at.is_(None)
            )
        )
    ).scalars():
        properties.setdefault(str(row.station_uuid), {})[row.property_name] = row
    return {"addresses": addresses, "properties": properties}


_ADDRESS_FIELDS = ("county", "city", "lane", "alley", "no", "floor", "room")


def _station_row(station: Station, address, properties: dict, columns) -> dict[str, str]:
    latitude, longitude = _coordinates(station.geometry)
    row = {
        "uuid": _text(station.uuid),
        "latitude": latitude,
        "longitude": longitude,
    }
    for field in ("name", "type", "description", "op_hour", "level", "comment", "source",
                  "visibility", "verification_status", "is_official", "confidence_score",
                  "created_at", "updated_at"):
        row[field] = _text(getattr(station, field, None))
    for field in _ADDRESS_FIELDS:
        row[field] = _text(getattr(address, field, None)) if address else ""
    for column in columns:
        if column.is_dynamic:
            prop = properties.get(column.field)
            row[column.header] = _text(prop.quantity) if prop else ""
    return row


async def export_stations(
    db: AsyncSession, *, actor: User, station_type: str, file_format: str = CSV_FORMAT
) -> ExportFile:
    """Render every station of `station_type` the caller may see as a CSV/XLSX file.

    An empty result still produces a file: a header-only export is the import template
    (ADR-119), and handing back a blank template is the intended way to start from nothing.
    """
    async with stable_actor(db, actor):
        scope = await require_scope(actor, Perm.STATION_EXPORT, db)
        columns = await station_columns(db, station_type)

        stations = list(
            (
                await db.execute(
                    select(Station)
                    .where(
                        Station.delete_at.is_(None),
                        Station.type == station_type,
                        *scope_filter(scope, actor=actor, model=Station),
                    )
                    .order_by(Station.created_at)
                    .limit(MAX_EXPORT_ROWS)
                )
            ).scalars()
        )
        related = await _station_rows(db, stations)
        rows = [
            _station_row(
                station,
                related["addresses"].get(str(station.uuid)),
                related["properties"].get(str(station.uuid), {}),
                columns,
            )
            for station in stations
        ]
        return _render(columns, rows, stem=f"stations-{station_type}", file_format=file_format)


# --- tickets ---


async def _pii_decider(db: AsyncSession, actor: User):
    """Return an `async (ticket) -> bool` answering "may this caller see this row's PII".

    Resolves the capability once and only falls back to a per-row geometry check when the
    scope actually needs one — `all` and `none` are decided without touching the database
    again (mirrors app/graphql/tickets/types.py:375).
    """
    scope = await resolve_scope(actor, Perm.TICKET_VIEW_PII, db)
    if scope == Scope.ALL:
        return lambda ticket: _always(True)
    if scope == Scope.NONE:
        return lambda ticket: _always(False)

    def decide(ticket):
        return in_scope(scope, actor=actor, resource=ticket, db=db)

    return decide


async def _always(value: bool) -> bool:
    return value


def _contact_fields(ticket: Tickets, *, visible: bool) -> dict[str, str]:
    """Write the contact columns in the clear, or masked exactly as the API masks them."""
    if visible:
        return {
            "contact_name": _text(ticket.contact_name),
            "contact_email": _text(ticket.contact_email),
            "contact_phone": _text(ticket.contact_phone),
        }
    return {
        "contact_name": _text(mask_name(ticket.contact_name)),
        "contact_email": _text(mask_email(ticket.contact_email)),
        "contact_phone": _text(mask_phone(ticket.contact_phone)),
    }


async def export_tickets(
    db: AsyncSession, *, actor: User, task_type: str, file_format: str = CSV_FORMAT
) -> ExportFile:
    """Render one row per (ticket, task) pair of `task_type` the caller may see (ADR-120)."""
    async with stable_actor(db, actor):
        scope = await require_scope(actor, Perm.TICKET_EXPORT, db)
        columns = await ticket_columns(db, task_type)
        may_see_pii = await _pii_decider(db, actor)

        pairs = list(
            (
                await db.execute(
                    select(TicketTask, Tickets)
                    .join(Tickets, Tickets.uuid == TicketTask.ticket_uuid)
                    .where(
                        TicketTask.delete_at.is_(None),
                        Tickets.delete_at.is_(None),
                        TicketTask.task_type == task_type,
                        *scope_filter(scope, actor=actor, model=Tickets),
                    )
                    .order_by(TicketTask.created_at)
                    .limit(MAX_EXPORT_ROWS)
                )
            ).all()
        )

        task_uuids = [str(task.uuid) for task, _ in pairs]
        properties: dict[str, dict[str, TaskProperty]] = {}
        if task_uuids:
            for row in (
                await db.execute(
                    select(TaskProperty).where(
                        TaskProperty.task_uuid.in_(task_uuids), TaskProperty.delete_at.is_(None)
                    )
                )
            ).scalars():
                properties.setdefault(str(row.task_uuid), {})[row.property_name] = row

        rows = []
        for task, ticket in pairs:
            latitude, longitude = _coordinates(ticket.geometry)
            row = {
                "uuid": _text(ticket.uuid),
                "latitude": latitude,
                "longitude": longitude,
                "task_type": _text(task.task_type),
                "task_name": _text(task.task_name),
                "task_description": _text(task.task_description),
                "task_quantity": _text(task.quantity),
                **_contact_fields(ticket, visible=await may_see_pii(ticket)),
            }
            for field in ("title", "description", "status", "priority", "disaster_type",
                          "visibility", "verification_status", "review_note", "created_at"):
                row[field] = _text(getattr(ticket, field, None))
            for column in columns:
                if column.is_dynamic:
                    prop = properties.get(str(task.uuid), {}).get(column.field)
                    row[column.header] = _text(prop.property_value) if prop else ""
            rows.append(row)

        return _render(columns, rows, stem=f"tickets-{task_type}", file_format=file_format)
