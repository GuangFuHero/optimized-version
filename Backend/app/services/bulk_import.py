"""Bulk import of stations and tickets (feature 015, ADR-106/112/114).

Nothing here writes to the database directly. Every row goes through the same services a
GraphQL mutation does — `validate_*` and `insert_*` for a create, as the two-phase create
does, `update_*` for an update — so an imported row is authorized, validated and audited
exactly like one typed in by hand (ADR-110). If a change here ever seems to need bypassing one
of them, the design has been misread.

Rows are processed one at a time and a failure is collected rather than raised (ADR-112):
the good rows land, the bad ones come back as a report the user can fix and re-upload.

Every row that creates something is first put to the fast dedup layer, the whole file before
any row is written (ADR-398, `bulk_dedup`). A suspected row is created only when the importer
says to; otherwise it is held and joins the report.
"""

import base64
import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.address import parse_tw_address
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.core.tabular import Table, read_table, write_csv, write_xlsx
from app.dedup_engine.contract import NewStation, NewTask, NewTicket, task_ref
from app.models.auth import User
from app.repositories.geo_repository import station_property_repository
from app.repositories.tickets_repository import task_property_repository
from app.services import bulk_dedup, dedup_review
from app.services import dedup as dedup_service
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.authz import refresh_actor, require_scope, stable_actor
from app.services.bulk_columns import (
    ColumnSpec,
    dynamic_columns_skipped_for_station,
    station_columns,
    ticket_columns,
)
from app.services.bulk_dedup import Comparison, RowDraft, SuspectedRow
from app.services.bulk_match import (
    AMBIGUOUS,
    MATCHED,
    build_station_index,
    build_ticket_index,
    duplicate_key_rows,
    match_task,
    station_key,
    ticket_key,
)
from app.services.bulk_validate import RowError, validate_row, values_for, writable_values
from app.services.dedup_snapshot import station_draft, task_draft, ticket_draft

# ADR-116. A row costs a match look-up plus a PostGIS point-in-polygon scope check, and this
# runs inside one synchronous request — there is no background worker in this project.
MAX_ROWS = 500
MAX_BYTES = 2 * 1024 * 1024
PREVIEW_ROWS = 20

# `station_properties` rows are attached through station.contribute, not station.add — that
# capability is deliberately open crowd-sourcing (see app/services/station.py). Everyone the
# seed grants an import capability to also holds it (ADR-111).
_DEFAULT_PROPERTY_TYPE = "supply"
_DEFAULT_WEIGHTING = 1.0

# Where an import's hints and pair cards say they came in (ADR-398): an importer works from someone
# else's list, so filing a row anyway means less than it does from someone on the spot.
_DEDUP_ENTRY = "bulk_import"


logger = logging.getLogger(__name__)


class BulkImportError(ValueError):
    """The upload cannot be processed at all (mapped to 400 by the endpoint)."""


@dataclass(frozen=True)
class ReportFile:
    """The failed rows, rendered back in the format they arrived in (ADR-112)."""

    filename: str
    media_type: str
    content_base64: str


@dataclass(frozen=True)
class PreviewResult:
    """What `preview` tells the user before anything is written."""

    detected_headers: tuple[str, ...]
    suggested_mapping: dict[str, str]
    unmapped_headers: tuple[str, ...]
    sample_rows: tuple[dict[str, str], ...]
    row_count: int
    to_create: int
    to_update: int
    errors: tuple[RowError, ...]
    skipped_columns: tuple[dict[str, str], ...] = ()
    suspected: int = 0
    suspects: tuple[SuspectedRow, ...] = ()
    dedup_checked: bool = True


@dataclass(frozen=True)
class ImportOutcome:
    """What `commit` reports afterwards."""

    batch_id: str
    created: int
    updated: int
    failed: int
    errors: tuple[RowError, ...] = ()
    error_report: ReportFile | None = None
    partial_rows: tuple[int, ...] = field(default=())
    suspected: int = 0
    suspects: tuple[SuspectedRow, ...] = ()
    dedup_checked: bool = True
    declined: int = 0


# --- shared plumbing ---


def _check_size(raw: bytes) -> None:
    """Refuse an oversized upload before it is parsed (ADR-209)."""
    if len(raw) > MAX_BYTES:
        raise BulkImportError(f"檔案超過 {MAX_BYTES // 1024 // 1024} MB 上限，請分批匯入")


def _check_rows(table: Table) -> None:
    """Refuse a file with more rows than one synchronous request will take (ADR-116).

    `read_table` stops one row past `MAX_ROWS`, so the count is "more than the limit" rather
    than the file's real length — the exact number would cost the parse this check exists to
    avoid (ADR-209).
    """
    if len(table.rows) > MAX_ROWS:
        raise BulkImportError(f"一次最多 {MAX_ROWS} 列，這份檔超過上限，請分批匯入")


def _apply_mapping(row: dict[str, str], mapping: dict[str, str]) -> dict[str, str]:
    """Rename the file's headers onto column headers; unmapped names pass through as-is."""
    return {mapping.get(header, header): value for header, value in row.items()}


def _suggest_mapping(headers: tuple[str, ...], columns: tuple[ColumnSpec, ...]) -> dict[str, str]:
    """Pair up headers that already match a column name, case- and space-insensitively."""
    known = {column.header.casefold(): column.header for column in columns}
    return {
        header: known[header.strip().casefold()] for header in headers if header.strip().casefold() in known
    }


def _error(line: int, column: str, message: str) -> RowError:
    return RowError(line=line, column=column, message=message)


def _error_column_name(headers: tuple[str, ...]) -> str:
    """A name for the report's error column that the uploaded file does not already use.

    `error` is a plausible column name in a real roster, and `_clean_headers` refuses duplicate
    headers on read (`app/core/tabular.py:92`). Appending it blindly produced a report that
    could not be re-uploaded — 表頭有重複的欄位名稱：error — which breaks ADR-112's whole loop
    of "fix what it says, re-upload, done" for exactly the files that need it.
    """
    if "error" not in headers:
        return "error"
    suffix = 1
    while f"error_{suffix}" in headers:
        suffix += 1
    return f"error_{suffix}"


def _as_report(table: Table, failures: dict[int, list[RowError]], *, filename: str) -> ReportFile | None:
    """Render the failed rows plus an error column, in the format they were uploaded in.

    The report reflects *this* run: after a commit some rows exist that did not before, so
    re-deriving it later from the same file would not give the same answer.
    """
    if not failures:
        return None
    error_column = _error_column_name(table.headers)
    headers = (*table.headers, error_column)
    rows = [
        {**table.rows[index], error_column: "；".join(f"{e.column}: {e.message}" for e in errors)}
        for index, errors in sorted(failures.items())
    ]
    is_csv = filename.lower().endswith(".csv")
    content = write_csv(headers, rows) if is_csv else write_xlsx(headers, rows)
    stem = filename.rsplit(".", 1)[0]
    extension = "csv" if is_csv else "xlsx"
    return ReportFile(
        filename=f"{stem}-errors.{extension}",
        media_type="text/csv; charset=utf-8"
        if is_csv
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content_base64=base64.b64encode(content).decode(),
    )


@dataclass
class RowProgress:
    """Whether this row already committed something when it failed (ADR-212).

    Deliberately mutable, and deliberately not part of `RowPlan`: the writer is the only
    thing that knows how far a row got, and `_write_all` needs that answer on the exception
    path, where a return value cannot reach it. `carded`: the row's acknowledged pair card is
    committed (ADR-398), so reviewers hear about it even if a later step of the row fails.
    """

    parent_written: bool = False
    carded: bool = False


@dataclass(frozen=True)
class RowPlan:
    """What one row turned out to be: an update, a creation, or a failure."""

    index: int
    row: dict[str, str]
    match_uuid: str | None
    is_update: bool
    errors: tuple[RowError, ...]

    @property
    def line(self) -> int:
        """Spreadsheet line number, counting the header as line 1."""
        return self.index + 2

    @property
    def ok(self) -> bool:
        """True when this row can be written as-is."""
        return not self.errors


def _collision_error(line: int, others: tuple[int, ...], column: str) -> RowError:
    lines = "、".join(str(other) for other in others)
    return _error(line, column, f"檔案內第 {lines} 列有相同的比對鍵，這幾列一律不匯入")


def _ambiguous_error(line: int, candidates: tuple[str, ...], column: str) -> RowError:
    """Report that the row matched several rows, without naming them (ADR-210).

    `preview` is gated on `*.import` only, and the index it matches against covers the whole
    table — so the uuids here would tell a caller with no read capability that those rows
    exist. The count is what the user needs to act on; the identifiers are not.
    """
    return _error(line, column, f"比對到 {len(candidates)} 筆現有資料，請先人工處理再匯入")


def _type_mismatch_error(line: int, column: str, declared: str, expected: str) -> RowError:
    return _error(line, column, f"這一列是「{declared}」，但這次匯入的是「{expected}」")


def _point_of(row: dict[str, str]) -> dict | None:
    """Build a GeoJSON Point from the two coordinate columns, or None when blank (ADR-123)."""
    latitude = (row.get("latitude") or "").strip()
    longitude = (row.get("longitude") or "").strip()
    if not latitude or not longitude:
        return None
    return {"type": "Point", "coordinates": [float(longitude), float(latitude)]}


def _split_dynamic(columns: tuple[ColumnSpec, ...], values: dict) -> tuple[dict, dict]:
    """Separate the EAV values from the row's own columns."""
    dynamic_fields = {column.field for column in columns if column.is_dynamic}
    dynamic = {k: v for k, v in values.items() if k in dynamic_fields}
    fixed = {k: v for k, v in values.items() if k not in dynamic_fields}
    fixed.pop("latitude", None)
    fixed.pop("longitude", None)
    return fixed, dynamic


# --- stations ---


def _station_key(row: dict[str, str]) -> tuple:
    """A file row's match key, with 縣市 and 鄉鎮市區 read from its address line."""
    parts = parse_tw_address(row.get("address"))
    return station_key(row.get("name"), parts.county, parts.town)


async def _plan_stations(
    db: AsyncSession, *, station_type: str, rows: list[dict[str, str]], columns
) -> list[RowPlan]:
    index = await build_station_index(db)
    keys = [_station_key(row) for row in rows]
    collisions = duplicate_key_rows(keys)

    plans = []
    for position, (row, key) in enumerate(zip(rows, keys, strict=True)):
        line = position + 2
        errors: list[RowError] = []
        if position in collisions:
            errors.append(_collision_error(line, collisions[position], "name"))

        declared = (row.get("type") or "").strip()
        if declared and declared != station_type:
            errors.append(_type_mismatch_error(line, "type", declared, station_type))

        match = index.look_up(key)
        if match.kind == AMBIGUOUS:
            errors.append(_ambiguous_error(line, match.candidates, "name"))

        is_update = match.kind == MATCHED
        errors += validate_row(columns, row, index=position, is_update=is_update)
        plans.append(
            RowPlan(
                index=position,
                row=row,
                match_uuid=match.uuid if is_update else None,
                is_update=is_update,
                errors=tuple(errors),
            )
        )
    return plans


async def _write_station_properties(
    db: AsyncSession, *, actor: User, station_uuid: str, dynamic: dict
) -> None:
    """Upsert each dynamic value, reusing the same services the GraphQL mutations call."""
    if not dynamic:
        return
    existing = {
        row.property_name: row
        for row in (
            await db.execute(
                select(station_property_repository.model).where(
                    station_property_repository.model.station_uuid == station_uuid,
                    station_property_repository.model.delete_at.is_(None),
                )
            )
        ).scalars()
    }
    for name, quantity in dynamic.items():
        if name in existing:
            await station_service.update_station_property(
                db, actor=actor, uuid=str(existing[name].uuid), changes={"quantity": quantity}
            )
        else:
            await station_service.create_station_property(
                db,
                actor=actor,
                station_uuid=station_uuid,
                property_type=_DEFAULT_PROPERTY_TYPE,
                property_name=name,
                quantity=quantity,
                weightings=_DEFAULT_WEIGHTING,
            )


def _new_station(columns, row: dict[str, str], station_type: str) -> dict:
    """`validate_station`'s arguments for a row that creates a station."""
    fixed, _ = _split_dynamic(columns, writable_values(columns, row, is_update=False))
    address = {
        column: fixed.pop(key)
        for key, column in (("address", "full_address"), ("floor", "floor"), ("room", "room"))
        if key in fixed
    }
    return {
        "geometry": _point_of(row),
        "type": fixed.get("type") or station_type,
        "name": fixed.get("name"),
        "description": fixed.get("description"),
        "op_hour": fixed.get("op_hour"),
        "level": fixed.get("level") or 0,
        "comment": fixed.get("comment"),
        # Bulk import is admin-only, and an admin-created station is official (ADMIN-026),
        # so `source` is an export-only column (bulk_columns.py).
        "source": "official",
        "visibility": fixed.get("visibility") or "public",
        "secondary_location": {"location_type": "address", **address} if address else None,
    }


async def _station_drafts(
    db: AsyncSession, *, actor: User, plans: list[RowPlan], columns, station_type: str
) -> list[RowDraft] | None:
    """One `NewStation` per row that creates a station (ADR-398).

    None when there are such rows but the caller may not add stations: they fail when written
    anyway, so the engine is not asked about them for someone who could not create them. A row
    the station service refuses is left out too; it fails, and is reported, when written.
    """
    creating = [plan for plan in plans if plan.ok and not plan.is_update]
    if creating and await resolve_scope(actor, Perm.STATION_ADD, db) == Scope.NONE:
        return None
    drafts = []
    for plan in creating:
        try:
            fields = await station_service.validate_station(
                db, actor=actor, **_new_station(columns, plan.row, station_type)
            )
        except (HTTPException, ValueError):
            continue
        drafts.append(RowDraft(NewStation(station=station_draft(fields)), {"station": plan.line}))
    return drafts


async def _write_station(
    db: AsyncSession,
    *,
    actor: User,
    plan: RowPlan,
    columns,
    station_type: str,
    progress: RowProgress,
    pair: dedup_service.AcknowledgedPair | None,
) -> str:
    values = writable_values(columns, plan.row, is_update=plan.is_update)
    fixed, dynamic = _split_dynamic(columns, values)

    if plan.is_update:
        await station_service.update_station(
            db, actor=actor, uuid=plan.match_uuid, geometry=_point_of(plan.row), changes=fixed
        )
        progress.parent_written = True
        station_uuid = plan.match_uuid
    else:
        station_uuid = await _create_station(
            db, actor=actor, values=_new_station(columns, plan.row, station_type), pair=pair
        )
        progress.parent_written = True
        progress.carded = pair is not None

    await _write_station_properties(db, actor=actor, station_uuid=station_uuid, dynamic=dynamic)
    return station_uuid


async def _create_station(
    db: AsyncSession, *, actor: User, values: dict, pair: dedup_service.AcknowledgedPair | None
) -> str:
    """`create_station`, with the row's acknowledged pair carded in the same commit (ADR-398)."""
    fields = await station_service.validate_station(db, actor=actor, **values)
    station = await station_service.insert_station(db, actor=actor, fields=fields)
    await _card(db, actor=actor, pair=pair, created_uuid=str(station.uuid))
    await db.commit()
    await db.refresh(station)
    await station_service.announce_station_created(db, station=station, actor_uuid=actor.uuid)
    return str(station.uuid)


# --- tickets ---

_TASK_COLUMNS = ("task_type", "task_name", "task_description", "task_quantity")


async def _plan_tickets(
    db: AsyncSession, *, task_type: str, rows: list[dict[str, str]], columns
) -> tuple[list[RowPlan], object]:
    index = await build_ticket_index(db)
    keys = [ticket_key(row.get("title"), row.get("contact_phone")) for row in rows]
    task_keys = [(*key, (row.get("task_name") or "").strip()) for key, row in zip(keys, rows, strict=True)]
    collisions = duplicate_key_rows(task_keys)

    seen_keys: set[tuple] = set()
    plans = []
    for position, (row, key) in enumerate(zip(rows, keys, strict=True)):
        line = position + 2
        errors: list[RowError] = []
        if position in collisions:
            errors.append(_collision_error(line, collisions[position], "title"))

        declared = (row.get("task_type") or "").strip()
        if declared and declared != task_type:
            errors.append(_type_mismatch_error(line, "task_type", declared, task_type))

        match = index.look_up(key)
        if match.kind == AMBIGUOUS:
            errors.append(_ambiguous_error(line, match.candidates, "title"))

        # Any need but a rescue must say how many (ADR-291 point 7). A row whose ticket is not
        # in the database yet adds a need for certain, so it fails here, before its ticket is
        # written; one attaching to a ticket that is may match a need it has, and is left to
        # validate_imported_task.
        if (
            match.kind != MATCHED
            and task_type not in ticket_service.QUANTITY_OPTIONAL_TASK_TYPES
            and not (row.get("task_quantity") or "").strip()
        ):
            errors.append(_error(line, "task_quantity", "救援以外的需求都要填人數"))

        # A ticket key repeated inside one file is one ticket on several lines, one per task
        # (ADR-120) — not a duplicate. The first line creates it; the rest attach to it, and
        # the writer resolves the uuid once it exists.
        is_update = match.kind == MATCHED or key in seen_keys
        errors += validate_row(columns, row, index=position, is_update=is_update)

        # Only a row that will actually be written can be the line a later row attaches to.
        # Planning a follower as an update when its leader failed validation drops every
        # create-only column from it and then writes it as a create anyway (ADR-211).
        if not errors:
            seen_keys.add(key)
        plans.append(
            RowPlan(
                index=position,
                row=row,
                match_uuid=match.uuid if match.kind == MATCHED else None,
                is_update=is_update,
                errors=tuple(errors),
            )
        )
    return plans, index


async def _write_task_properties(db: AsyncSession, *, actor: User, task_uuid: str, dynamic: dict) -> None:
    if not dynamic:
        return
    existing = {row.property_name: row for row in await task_property_repository.list_by_task(db, task_uuid)}
    for name, value in dynamic.items():
        text = "" if value is None else str(value)
        if name in existing:
            await ticket_service.update_task_property(
                db, actor=actor, uuid=str(existing[name].uuid), changes={"property_value": text}
            )
        else:
            await ticket_service.import_task_property(
                db,
                actor=actor,
                task_uuid=task_uuid,
                property_name=name,
                property_value=text,
            )


async def _write_ticket(
    db: AsyncSession,
    *,
    actor: User,
    plan: RowPlan,
    columns,
    task_type: str,
    index,
    progress: RowProgress,
    pair: dedup_service.AcknowledgedPair | None,
) -> str:
    # Resolved against the LIVE index, not the plan: a row can become an update mid-file by
    # attaching to a ticket an earlier row of this same import created (ADR-120).
    key = ticket_key(plan.row.get("title"), plan.row.get("contact_phone"))
    resolved = index.look_up(key)
    is_update = resolved.kind == MATCHED

    # The plan said "attach to the ticket an earlier line creates"; by the time this row runs
    # that ticket does not exist, because that line failed at write time. Its create-only
    # columns were already dropped as an update's would be, so creating it here would write a
    # ticket with no title and no coordinates. Fail the row instead (ADR-211).
    if plan.is_update and not is_update:
        raise ValueError("同一份檔案中建立這張單的那一列沒有匯入成功，這一列一併不匯入")

    values = writable_values(columns, plan.row, is_update=is_update)
    fixed, dynamic = _split_dynamic(columns, values)
    task_fields = {key_name: fixed.pop(key_name) for key_name in _TASK_COLUMNS if key_name in fixed}

    task = _new_task(columns, plan.row, is_update=is_update, task_type=task_type)
    if is_update:
        ticket_uuid = resolved.uuid
        if fixed:
            await ticket_service.update_ticket(db, actor=actor, uuid=ticket_uuid, changes=fixed)
            progress.parent_written = True
        task_uuid = await _write_task(
            db, actor=actor, ticket_uuid=ticket_uuid, task=task, task_fields=task_fields, pair=pair
        )
    else:
        ticket_uuid, task_uuid = await _create_ticket(
            db, actor=actor, values=_new_ticket(columns, plan.row, task_type), task=task, pair=pair
        )
        progress.parent_written = True
        index.register(key, ticket_uuid)

    if task_uuid:
        progress.parent_written = True
        progress.carded = pair is not None
        await _write_task_properties(db, actor=actor, task_uuid=task_uuid, dynamic=dynamic)
    return ticket_uuid


async def _create_ticket(
    db: AsyncSession,
    *,
    actor: User,
    values: dict,
    task: dict,
    pair: dedup_service.AcknowledgedPair | None,
) -> tuple[str, str | None]:
    """The row's new ticket, its task and the task's pair card, in one commit (ADR-398).

    Not `create_ticket` and then the task, a commit each: a task that cannot be written would
    leave a ticket without it behind, and the card has to land with the task it is about.
    """
    fields = await ticket_service.validate_ticket(db, actor=actor, **values)
    task_fields = (
        await ticket_service.validate_imported_task(db, actor=actor, **task) if task["task_name"] else None
    )
    ticket = await ticket_service.insert_ticket(db, actor=actor, fields=fields)
    ticket_uuid = str(ticket.uuid)
    task_uuid = None
    if task_fields is not None:
        created = await ticket_service.insert_added_task(
            db, actor=actor, ticket_uuid=ticket_uuid, fields=task_fields
        )
        task_uuid = str(created.uuid)
        await _card(db, actor=actor, pair=pair, created_uuid=task_uuid)
    await db.commit()
    return ticket_uuid, task_uuid


async def _write_task(
    db: AsyncSession,
    *,
    actor: User,
    ticket_uuid: str,
    task: dict,
    task_fields: dict,
    pair: dedup_service.AcknowledgedPair | None,
) -> str | None:
    """Create or update the one task this row stands for, under a ticket that exists (ADR-120).

    `task` is what creating it writes (`_new_task`); a matched task takes only the writable
    `task_fields`, so it keeps ADR-108's rule that create-only columns are never written by an
    update (ADR-240). A created task's pair card lands in its commit (ADR-398).
    """
    if not task["task_name"]:
        return None
    match = await match_task(
        db, ticket_uuid=ticket_uuid, task_type=task["task_type"], task_name=task["task_name"]
    )
    if match.kind == MATCHED:
        changes = {k: v for k, v in task_fields.items() if k == "task_description"}
        if changes:
            await ticket_service.update_ticket_task(db, actor=actor, uuid=match.uuid, changes=changes)
        return match.uuid

    fields = await ticket_service.validate_imported_task(db, actor=actor, **task)
    created = await ticket_service.insert_added_task(db, actor=actor, ticket_uuid=ticket_uuid, fields=fields)
    task_uuid = str(created.uuid)
    await _card(db, actor=actor, pair=pair, created_uuid=task_uuid)
    await db.commit()
    return task_uuid


async def _card(
    db: AsyncSession, *, actor: User, pair: dedup_service.AcknowledgedPair | None, created_uuid: str
) -> None:
    """Card the pair the importer filed anyway, against what its row created. Does not commit.

    The row was shown its hint in the preview, so the hint is recorded as shown first, as a single
    create records it on the submission it held (ADR-303). An unscored pair had no hint to show.
    """
    if pair is None:
        return
    actor_uuid = str(actor.uuid)
    if pair.suspect is not None:
        await dedup_service.record_suspect_shown(
            db, suspect=pair.suspect, actor_uuid=actor_uuid, entry=_DEDUP_ENTRY
        )
    await dedup_service.record_pair_ignored(
        db, pair=pair, created_uuid=created_uuid, actor_uuid=actor_uuid, entry=_DEDUP_ENTRY
    )


def _new_ticket(columns, row: dict[str, str], task_type: str) -> dict:
    """`validate_ticket`'s arguments for the row that creates a ticket."""
    fixed, _ = _split_dynamic(columns, writable_values(columns, row, is_update=False))
    return {
        "geometry": _point_of(row),
        "title": fixed.get("title"),
        "description": fixed.get("description"),
        "contact_name": fixed.get("contact_name"),
        "contact_email": fixed.get("contact_email"),
        "contact_phone": fixed.get("contact_phone"),
        "priority": fixed.get("priority") or "low",
        "task_type": task_type,
        "disaster_types": fixed.get("disaster_types"),
    }


def _new_task(columns, row: dict[str, str], *, is_update: bool, task_type: str) -> dict:
    """`validate_imported_task`'s arguments for the task a row creates; a blank name means none.

    "The ticket is an update" does not mean "the task is an update": a row attaching a NEW task
    to a matched ticket still creates it, and by then `writable_values` has dropped every
    create-only column. Written as NULL, the row still reported success (ADR-240), so the name,
    description and quantity are read off the row itself.
    """
    fixed, _ = _split_dynamic(columns, writable_values(columns, row, is_update=is_update))
    creating = {
        **values_for(columns, row, ("task_description", "task_quantity")),
        **{key_name: fixed[key_name] for key_name in _TASK_COLUMNS if key_name in fixed},
    }
    return {
        "task_type": task_type,
        "task_name": fixed.get("task_name") or (row.get("task_name") or "").strip(),
        "task_description": creating.get("task_description"),
        "quantity": creating.get("task_quantity"),
    }


async def _ticket_drafts(
    db: AsyncSession, *, actor: User, plans: list[RowPlan], columns, task_type: str
) -> list[RowDraft] | None:
    """What to ask the engine about a ticket file (ADR-398).

    A ticket the file creates goes as one `NewTicket`, each of its lines' tasks as `task:i`: the
    later lines attach to a ticket that does not exist yet, so the engine could not place a
    `NewTask` for them. A line adding a task to a ticket already there goes as a `NewTask`. A
    line whose task its ticket already has is an update, and is not asked about. None, and rows
    the services refuse are left out, as for stations (`_station_drafts`).
    """
    new_tickets, added = await _ticket_rows_creating(db, plans=plans, columns=columns, task_type=task_type)
    if (new_tickets or added) and await resolve_scope(actor, Perm.TICKET_ADD, db) == Scope.NONE:
        return None

    drafts = []
    for lines in new_tickets:
        draft = await _new_ticket_draft(db, actor=actor, lines=lines, columns=columns, task_type=task_type)
        if draft is not None:
            drafts.append(draft)
    for plan, task in added:
        checked = await _checked_task(db, actor=actor, task=task)
        if checked is not None:
            drafts.append(
                RowDraft(
                    NewTask(ticket_uuid=plan.match_uuid, task=task_draft(checked)), {task_ref(0): plan.line}
                )
            )
    return drafts


async def _ticket_rows_creating(
    db: AsyncSession, *, plans: list[RowPlan], columns, task_type: str
) -> tuple[list[list[RowPlan]], list[tuple[RowPlan, dict]]]:
    """The lines of each ticket the file creates, first line first; and the lines adding a task."""
    new_tickets: dict[tuple, list[RowPlan]] = {}
    added: list[tuple[RowPlan, dict]] = []
    for plan in plans:
        if not plan.ok:
            continue
        if plan.match_uuid is None:
            key = ticket_key(plan.row.get("title"), plan.row.get("contact_phone"))
            new_tickets.setdefault(key, []).append(plan)
            continue
        task = _new_task(columns, plan.row, is_update=True, task_type=task_type)
        if task["task_name"]:
            match = await match_task(
                db, ticket_uuid=plan.match_uuid, task_type=task_type, task_name=task["task_name"]
            )
            if match.kind != MATCHED:
                added.append((plan, task))
    return list(new_tickets.values()), added


async def _new_ticket_draft(
    db: AsyncSession, *, actor: User, lines: list[RowPlan], columns, task_type: str
) -> RowDraft | None:
    """One new ticket's `NewTicket`: the first line's ticket, and every line's task as `task:i`."""
    try:
        ticket = await ticket_service.validate_ticket(
            db, actor=actor, **_new_ticket(columns, lines[0].row, task_type)
        )
    except (HTTPException, ValueError):
        return None
    tasks, refs = [], {}
    for plan in lines:
        task = await _checked_task(
            db, actor=actor, task=_new_task(columns, plan.row, is_update=plan.is_update, task_type=task_type)
        )
        if task is not None:
            refs[task_ref(len(tasks))] = plan.line
            tasks.append(task_draft(task))
    return RowDraft(
        NewTicket(ticket=ticket_draft(ticket), tasks=tuple(tasks)),
        refs,
        first_line=lines[0].line,
        followers=tuple(plan.line for plan in lines[1:]),
    )


async def _checked_task(db: AsyncSession, *, actor: User, task: dict):
    """The row's task as the engine is told about it, or None when it has none or is refused."""
    if not task["task_name"]:
        return None
    try:
        return await ticket_service.validate_imported_task(db, actor=actor, **task)
    except (HTTPException, ValueError):
        return None


# --- public entry points ---


async def _read(
    raw: bytes, filename: str, mapping: dict[str, str] | None
) -> tuple[Table, list[dict[str, str]]]:
    """Parse the upload, with both limits bounding the work rather than only its result."""
    _check_size(raw)
    table = read_table(raw, filename, max_rows=MAX_ROWS)
    _check_rows(table)
    return table, [_apply_mapping(row, mapping or {}) for row in table.rows]


def _preview_of(
    table: Table,
    plans: list[RowPlan],
    columns,
    *,
    comparison: Comparison,
    suspects: tuple[SuspectedRow, ...],
    following: Mapping[int, int],
    skipped=(),
) -> PreviewResult:
    suggested = _suggest_mapping(table.headers, columns)
    errors = tuple(error for plan in plans for error in plan.errors)
    # A suspected row is created only if the importer says so at commit (ADR-398), and so are the
    # lines attaching to the ticket it creates.
    landing = [
        plan
        for plan in plans
        if plan.ok and plan.line not in comparison.suspects and plan.line not in following
    ]
    return PreviewResult(
        detected_headers=table.headers,
        suggested_mapping=suggested,
        unmapped_headers=tuple(h for h in table.headers if h not in suggested),
        sample_rows=table.rows[:PREVIEW_ROWS],
        row_count=len(plans),
        to_create=sum(1 for plan in landing if not plan.is_update),
        to_update=sum(1 for plan in landing if plan.is_update),
        errors=errors,
        skipped_columns=skipped,
        suspected=len(comparison.suspects),
        suspects=suspects,
        dedup_checked=comparison.complete,
    )


async def preview_stations(
    db: AsyncSession,
    *,
    actor: User,
    raw: bytes,
    filename: str,
    station_type: str,
    mapping: dict[str, str] | None = None,
) -> PreviewResult:
    """Dry-run a station file: report every problem at once, write nothing (ADR-112/114).

    Checked against `station.import` like `commit` is — otherwise it would be a way for
    someone without the capability to probe what is in the database (ADR-110). Each new
    station is put to the fast dedup layer; what it looks like comes back, to be decided at
    commit (ADR-398).
    """
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.STATION_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await station_columns(db, station_type)
        plans = await _plan_stations(db, station_type=station_type, rows=rows, columns=columns)
        skipped = tuple(
            {"property_name": s.property_name, "data_type": s.data_type, "reason": s.reason}
            for s in await dynamic_columns_skipped_for_station(db, station_type)
        )
        drafts = await _station_drafts(
            db, actor=actor, plans=plans, columns=columns, station_type=station_type
        )
        comparison = await bulk_dedup.compare(
            db, actor=actor, drafts=drafts, decisions={}, now=datetime.now(UTC)
        )
        suspects = await bulk_dedup.describe(db, comparison, drafts)
        return _preview_of(
            table, plans, columns, comparison=comparison, suspects=suspects, following={}, skipped=skipped
        )


async def preview_tickets(
    db: AsyncSession,
    *,
    actor: User,
    raw: bytes,
    filename: str,
    task_type: str,
    mapping: dict[str, str] | None = None,
) -> PreviewResult:
    """Dry-run a ticket file. Same contract as `preview_stations`."""
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.TICKET_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await ticket_columns(db, task_type)
        plans, _ = await _plan_tickets(db, task_type=task_type, rows=rows, columns=columns)
        drafts = await _ticket_drafts(db, actor=actor, plans=plans, columns=columns, task_type=task_type)
        comparison = await bulk_dedup.compare(
            db, actor=actor, drafts=drafts, decisions={}, now=datetime.now(UTC)
        )
        suspects = await bulk_dedup.describe(db, comparison, drafts)
        following = bulk_dedup.held_with(comparison, drafts)
        return _preview_of(
            table, plans, columns, comparison=comparison, suspects=suspects, following=following
        )


async def _commit(
    db: AsyncSession,
    *,
    actor: User,
    table: Table,
    plans: list[RowPlan],
    write,
    filename: str,
    comparison: Comparison,
    suspects: tuple[SuspectedRow, ...],
    following: Mapping[int, int],
) -> ImportOutcome:
    """Write every writable row, collecting failures instead of stopping at the first.

    Each service call commits on its own, so a row that fails after its parent row was
    already written stays half-applied. That is reported separately rather than hidden:
    validation runs first, so the realistic cause is a permission the caller lacks for the
    dependent write (for example station.contribute for a dynamic value).

    A suspected row the importer did not file anyway is held (ADR-398), with the lines attaching
    to the ticket it creates: not written, and put in the report beside the failures, though not
    counted as ones. So is a row the importer declined, and it is counted apart, not as a suspect.
    Reviewers hear once about every pair card the import left.
    """
    failures: dict[int, list[RowError]] = {plan.index: list(plan.errors) for plan in plans if not plan.ok}
    held = await _hold(
        db, actor=actor, plans=plans, comparison=comparison, suspects=suspects, following=following
    )

    created, updated, partial, carded = await _write_all(
        db, actor, [plan for plan in plans if plan.index not in held], write, failures
    )
    await dedup_review.notify_new_cards(db, count=carded, actor=actor, actor_uuid=str(actor.uuid))

    errors = tuple(error for _, row_errors in sorted(failures.items()) for error in row_errors)
    return ImportOutcome(
        batch_id=str(uuid4()),
        created=created,
        updated=updated,
        failed=len(failures),
        errors=errors,
        error_report=_as_report(table, failures | held, filename=filename),
        partial_rows=tuple(partial),
        suspected=len(comparison.suspects),
        suspects=tuple(row for row in suspects if row.line not in comparison.declined),
        dedup_checked=comparison.complete,
        declined=len(comparison.declined),
    )


async def _hold(
    db: AsyncSession,
    *,
    actor: User,
    plans: list[RowPlan],
    comparison: Comparison,
    suspects: tuple[SuspectedRow, ...],
    following: Mapping[int, int],
) -> dict[int, list[RowError]]:
    """Record the hint each held row was shown, and say in its report line why it was not created.

    A hint shown and nothing created is the hint taken (ADR-303), as for a single create. A declined
    row the engine suspected again is held as a suspected one is; otherwise it was shown no hint this
    time, and nothing is recorded. A line held with its ticket's first line says which line that is.
    """
    if not comparison.suspects and not comparison.declined:
        return {}
    shown = {row.line: row for row in suspects}
    actor_uuid = str(actor.uuid)
    held = {}
    for plan in plans:
        declined = plan.line in comparison.declined
        suspect = comparison.declined[plan.line] if declined else comparison.suspects.get(plan.line)
        if suspect is not None:
            await dedup_service.record_suspect_shown(
                db, suspect=suspect, actor_uuid=actor_uuid, entry=_DEDUP_ENTRY
            )
            message = _held_message(shown.get(plan.line))
        elif declined:
            message = "選了不建立，未建立"
        elif plan.line in following:
            first = following[plan.line]
            why = "選了不建立" if first in comparison.declined else "疑似重複，未建立"
            message = f"同一張單的第 {first} 列{why}，這一列跟著未建立"
        else:
            continue
        held[plan.index] = [_error(plan.line, "-", message)]
    await db.commit()
    return held


def _held_message(row: SuspectedRow | None) -> str:
    """Why a suspected row was not created, naming what it looks like."""
    if row is None or row.title is None:
        return "疑似重複，未建立"
    looks_like = f"「{row.title}」的「{row.task_name}」" if row.task_name else f"「{row.title}」"
    distance = f"，相距約 {row.distance_m} 公尺" if row.distance_m is not None else ""
    return f"疑似重複，未建立：很像{looks_like}{distance}"


async def _write_all(db, actor, plans, write, failures) -> tuple[int, int, list[int], int]:
    """Run every writable row, recording a failure instead of stopping at the first.

    A row is reported as partial when it failed *after* committing something, whichever
    exception carried it there — a permission refusal on the row's very first call leaves
    nothing behind, and a `ValueError` raised by a dependent write leaves plenty (ADR-212).
    Also returns how many rows committed a pair card, failed afterwards or not.
    """
    created = updated = carded = 0
    partial: list[int] = []
    for plan in plans:
        if not plan.ok:
            continue
        progress = RowProgress()
        try:
            await write(plan, progress)
        except (HTTPException, ValueError, SQLAlchemyError) as exc:
            carded += progress.carded
            # `SQLAlchemyError` is the backstop, not the plan: `coerce` now checks every
            # bounded column's width and the int4 range, so a driver-level `DataError` should
            # not get this far. But a per-row loop must not be able to abandon a half-written
            # file whatever the driver raises — the failure shape ADR-211/213 removed, reached
            # through a trigger they did not cover (ADR-241).
            await _recover(db, actor)
            if isinstance(exc, HTTPException):
                detail = f"權限不足：{exc.detail}"
            elif isinstance(exc, SQLAlchemyError):
                detail = "資料庫拒絕了這一列，請檢查欄位長度與格式"
                logger.warning("bulk import row %s rejected by the database", plan.line, exc_info=exc)
            else:
                detail = str(exc)
            failures[plan.index] = [_error(plan.line, "-", detail)]
            if progress.parent_written:
                partial.append(plan.line)
            continue
        carded += progress.carded
        if plan.is_update:
            updated += 1
        else:
            created += 1
    return created, updated, partial, carded


async def _recover(db: AsyncSession, actor: User) -> None:
    """Roll the failed row back and put the actor back in a usable state (ADR-213).

    `rollback` expires every loaded object regardless of `expire_on_commit`, which is the
    only thing `stable_actor` suspends. Without this the next row's `require_scope` would
    lazily reload `actor` and raise MissingGreenlet, turning one bad row into a 500 for the
    whole file.
    """
    await db.rollback()
    await refresh_actor(db, actor)


async def commit_stations(
    db: AsyncSession,
    *,
    actor: User,
    raw: bytes,
    filename: str,
    station_type: str,
    mapping: dict[str, str] | None = None,
    decisions: dict[int, str] | None = None,
    declined: frozenset[int] = frozenset(),
) -> ImportOutcome:
    """Import a station file: matched rows are updated, unmatched ones created (ADR-106).

    Every new station is put to the fast dedup layer before any row is written. A suspected one
    is created only when `decisions` maps its line to what it was shown to look like (ADR-398). A
    line in `declined` is not created, whatever the engine says this time.
    """
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.STATION_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await station_columns(db, station_type)
        plans = await _plan_stations(db, station_type=station_type, rows=rows, columns=columns)
        drafts = await _station_drafts(
            db, actor=actor, plans=plans, columns=columns, station_type=station_type
        )
        comparison = await bulk_dedup.compare(
            db,
            actor=actor,
            drafts=drafts,
            decisions=decisions or {},
            now=datetime.now(UTC),
            declined=declined,
        )
        suspects = await bulk_dedup.describe(db, comparison, drafts)

        async def write(plan: RowPlan, progress: RowProgress) -> None:
            await _write_station(
                db,
                actor=actor,
                plan=plan,
                columns=columns,
                station_type=station_type,
                progress=progress,
                pair=comparison.pairs.get(plan.line),
            )

        return await _commit(
            db,
            actor=actor,
            table=table,
            plans=plans,
            write=write,
            filename=filename,
            comparison=comparison,
            suspects=suspects,
            following=bulk_dedup.held_with(comparison, drafts),
        )


async def commit_tickets(
    db: AsyncSession,
    *,
    actor: User,
    raw: bytes,
    filename: str,
    task_type: str,
    mapping: dict[str, str] | None = None,
    decisions: dict[int, str] | None = None,
    declined: frozenset[int] = frozenset(),
) -> ImportOutcome:
    """Import a ticket file: one row is one ticket plus one task (ADR-120).

    Every new task is put to the fast dedup layer before any row is written, as for stations
    (`commit_stations`, ADR-398). A declined first line holds the lines after it.
    """
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.TICKET_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await ticket_columns(db, task_type)
        plans, index = await _plan_tickets(db, task_type=task_type, rows=rows, columns=columns)
        drafts = await _ticket_drafts(db, actor=actor, plans=plans, columns=columns, task_type=task_type)
        comparison = await bulk_dedup.compare(
            db,
            actor=actor,
            drafts=drafts,
            decisions=decisions or {},
            now=datetime.now(UTC),
            declined=declined,
        )
        suspects = await bulk_dedup.describe(db, comparison, drafts)

        async def write(plan: RowPlan, progress: RowProgress) -> None:
            await _write_ticket(
                db,
                actor=actor,
                plan=plan,
                columns=columns,
                task_type=task_type,
                index=index,
                progress=progress,
                pair=comparison.pairs.get(plan.line),
            )

        return await _commit(
            db,
            actor=actor,
            table=table,
            plans=plans,
            write=write,
            filename=filename,
            comparison=comparison,
            suspects=suspects,
            following=bulk_dedup.held_with(comparison, drafts),
        )
