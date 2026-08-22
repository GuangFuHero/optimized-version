"""Bulk import of stations and tickets (feature 015, ADR-106/112/114).

Nothing here writes to the database directly. Every row goes through the same
`create_*` / `update_*` service a GraphQL mutation would call, so an imported row is
authorized, validated and audited exactly like one typed in by hand (ADR-110). If a change
here ever seems to need bypassing one of them, the design has been misread.

Rows are processed one at a time and a failure is collected rather than raised (ADR-112):
the good rows land, the bad ones come back as a report the user can fix and re-upload.
"""

import base64
from dataclasses import dataclass, field
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.tabular import Table, read_table, write_csv, write_xlsx
from app.models.auth import User
from app.repositories.geo_repository import station_property_repository
from app.repositories.tickets_repository import task_property_repository, ticket_repository
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.authz import require_scope, stable_actor
from app.services.bulk_columns import (
    ColumnSpec,
    dynamic_columns_skipped_for_station,
    station_columns,
    ticket_columns,
)
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
from app.services.bulk_validate import RowError, validate_row, writable_values

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


# --- shared plumbing ---


def _check_limits(raw: bytes, table: Table) -> None:
    if len(raw) > MAX_BYTES:
        raise BulkImportError(
            f"檔案超過 {MAX_BYTES // 1024 // 1024} MB 上限，請分批匯入"
        )
    if len(table.rows) > MAX_ROWS:
        raise BulkImportError(f"一次最多 {MAX_ROWS} 列，這份檔有 {len(table.rows)} 列，請分批匯入")


def _apply_mapping(row: dict[str, str], mapping: dict[str, str]) -> dict[str, str]:
    """Rename the file's headers onto column headers; unmapped names pass through as-is."""
    return {mapping.get(header, header): value for header, value in row.items()}


def _suggest_mapping(headers: tuple[str, ...], columns: tuple[ColumnSpec, ...]) -> dict[str, str]:
    """Pair up headers that already match a column name, case- and space-insensitively."""
    known = {column.header.casefold(): column.header for column in columns}
    return {
        header: known[header.strip().casefold()]
        for header in headers
        if header.strip().casefold() in known
    }


def _error(line: int, column: str, message: str) -> RowError:
    return RowError(line=line, column=column, message=message)


def _as_report(table: Table, failures: dict[int, list[RowError]], *, filename: str) -> ReportFile | None:
    """Render the failed rows plus an `error` column, in the format they were uploaded in.

    The report reflects *this* run: after a commit some rows exist that did not before, so
    re-deriving it later from the same file would not give the same answer.
    """
    if not failures:
        return None
    headers = (*table.headers, "error")
    rows = [
        {**table.rows[index], "error": "；".join(f"{e.column}: {e.message}" for e in errors)}
        for index, errors in sorted(failures.items())
    ]
    is_csv = filename.lower().endswith(".csv")
    content = write_csv(headers, rows) if is_csv else write_xlsx(headers, rows)
    stem = filename.rsplit(".", 1)[0]
    extension = "csv" if is_csv else "xlsx"
    return ReportFile(
        filename=f"{stem}-errors.{extension}",
        media_type="text/csv; charset=utf-8" if is_csv
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content_base64=base64.b64encode(content).decode(),
    )


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
    return _error(
        line, column,
        f"比對到 {len(candidates)} 筆現有資料（{'、'.join(candidates)}），請先人工處理再匯入",
    )


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


async def _plan_stations(
    db: AsyncSession, *, station_type: str, rows: list[dict[str, str]], columns
) -> list[RowPlan]:
    index = await build_station_index(db)
    keys = [station_key(row.get("name"), row.get("county"), row.get("city")) for row in rows]
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
                index=position, row=row,
                match_uuid=match.uuid if is_update else None,
                is_update=is_update, errors=tuple(errors),
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
                db, actor=actor, station_uuid=station_uuid,
                property_type=_DEFAULT_PROPERTY_TYPE, property_name=name,
                quantity=quantity, weightings=_DEFAULT_WEIGHTING,
            )


async def _write_station(db: AsyncSession, *, actor: User, plan: RowPlan, columns, station_type: str) -> str:
    values = writable_values(columns, plan.row, is_update=plan.is_update)
    fixed, dynamic = _split_dynamic(columns, values)
    geometry = _point_of(plan.row)

    if plan.is_update:
        await station_service.update_station(
            db, actor=actor, uuid=plan.match_uuid, geometry=geometry, changes=fixed
        )
        station_uuid = plan.match_uuid
    else:
        address = {key: fixed.pop(key) for key in
                   ("county", "city", "lane", "alley", "no", "floor", "room") if key in fixed}
        station = await station_service.create_station(
            db, actor=actor, geometry=geometry,
            type=fixed.get("type") or station_type,
            name=fixed.get("name"),
            description=fixed.get("description"),
            op_hour=fixed.get("op_hour"),
            level=fixed.get("level") or 0,
            comment=fixed.get("comment"),
            # Provenance: a station that appeared through a file, not through the map UI.
            source=fixed.get("source") or "import",
            visibility=fixed.get("visibility") or "public",
            secondary_location={"location_type": "address", **address} if address else None,
        )
        station_uuid = str(station.uuid)

    await _write_station_properties(db, actor=actor, station_uuid=station_uuid, dynamic=dynamic)
    return station_uuid


# --- tickets ---


async def _plan_tickets(
    db: AsyncSession, *, task_type: str, rows: list[dict[str, str]], columns
) -> tuple[list[RowPlan], object]:
    index = await build_ticket_index(db)
    keys = [ticket_key(row.get("title"), row.get("contact_phone")) for row in rows]
    task_keys = [
        (*key, (row.get("task_name") or "").strip())
        for key, row in zip(keys, rows, strict=True)
    ]
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

        # A ticket key repeated inside one file is one ticket on several lines, one per task
        # (ADR-120) — not a duplicate. The first line creates it; the rest attach to it, and
        # the writer resolves the uuid once it exists.
        is_update = match.kind == MATCHED or key in seen_keys
        seen_keys.add(key)

        errors += validate_row(columns, row, index=position, is_update=is_update)
        plans.append(
            RowPlan(
                index=position, row=row,
                match_uuid=match.uuid if match.kind == MATCHED else None,
                is_update=is_update, errors=tuple(errors),
            )
        )
    return plans, index


async def _write_task_properties(
    db: AsyncSession, *, actor: User, task_uuid: str, dynamic: dict
) -> None:
    if not dynamic:
        return
    existing = {
        row.property_name: row
        for row in await task_property_repository.list_by_task(db, task_uuid)
    }
    for name, value in dynamic.items():
        text = "" if value is None else str(value)
        if name in existing:
            await ticket_service.update_task_property(
                db, actor=actor, uuid=str(existing[name].uuid), changes={"property_value": text}
            )
        else:
            await ticket_service.create_task_property(
                db, actor=actor, task_uuid=task_uuid, property_name=name,
                property_value=text, quantity=None, comment=None,
            )


async def _write_ticket(
    db: AsyncSession, *, actor: User, plan: RowPlan, columns, task_type: str, index
) -> str:
    # Resolved against the LIVE index, not the plan: a row can become an update mid-file by
    # attaching to a ticket an earlier row of this same import created (ADR-120).
    key = ticket_key(plan.row.get("title"), plan.row.get("contact_phone"))
    resolved = index.look_up(key)
    is_update = resolved.kind == MATCHED

    values = writable_values(columns, plan.row, is_update=is_update)
    fixed, dynamic = _split_dynamic(columns, values)
    task_fields = {key_name: fixed.pop(key_name) for key_name in
                   ("task_type", "task_name", "task_description", "task_quantity") if key_name in fixed}

    if is_update:
        ticket_uuid = resolved.uuid
        status = fixed.pop("status", None)
        current = await ticket_repository.get_by_uuid_active(db, ticket_uuid)
        # ADR-122: an untouched export carries the row's own status back. Sending it as a
        # change would make every completed ticket fail its own state machine, so only a
        # genuine difference is passed on.
        if current is not None and status == current.status:
            status = None
        if fixed or status:
            await ticket_service.update_ticket(
                db, actor=actor, uuid=ticket_uuid, status=status, changes=fixed
            )
    else:
        fixed.pop("status", None)  # `create_ticket` always writes "pending"
        ticket = await ticket_service.create_ticket(
            db, actor=actor, geometry=_point_of(plan.row),
            title=fixed.get("title"),
            description=fixed.get("description"),
            contact_name=fixed.get("contact_name"),
            contact_email=fixed.get("contact_email"),
            contact_phone=fixed.get("contact_phone"),
            priority=fixed.get("priority") or "low",
            task_type=task_type,
            visibility=fixed.get("visibility") or "public",
            disaster_type=fixed.get("disaster_type"),
        )
        ticket_uuid = str(ticket.uuid)
        index.register(key, ticket_uuid)

    task_name = task_fields.get("task_name") or (plan.row.get("task_name") or "").strip()
    task_uuid = await _write_task(
        db, actor=actor, ticket_uuid=ticket_uuid, task_type=task_type,
        task_name=task_name, task_fields=task_fields,
    )
    if task_uuid:
        await _write_task_properties(db, actor=actor, task_uuid=task_uuid, dynamic=dynamic)
    return ticket_uuid


async def _write_task(
    db: AsyncSession, *, actor: User, ticket_uuid: str, task_type: str, task_name: str, task_fields: dict
) -> str | None:
    """Create or update the one task this row stands for (ADR-120)."""
    if not task_name:
        return None
    match = await match_task(db, ticket_uuid=ticket_uuid, task_type=task_type, task_name=task_name)
    if match.kind == MATCHED:
        changes = {k: v for k, v in task_fields.items() if k == "task_description"}
        if changes:
            await ticket_service.update_ticket_task(db, actor=actor, uuid=match.uuid, changes=changes)
        return match.uuid

    task = await ticket_service.create_ticket_task(
        db, actor=actor, ticket_uuid=ticket_uuid, task_type=task_type, task_name=task_name,
        task_description=task_fields.get("task_description"),
        quantity=task_fields.get("task_quantity"),
        source="import", visibility="public", route_uuid=None,
    )
    return str(task.uuid)


# --- public entry points ---


async def _read(
    raw: bytes, filename: str, mapping: dict[str, str] | None
) -> tuple[Table, list[dict[str, str]]]:
    table = read_table(raw, filename)
    _check_limits(raw, table)
    return table, [_apply_mapping(row, mapping or {}) for row in table.rows]


def _preview_of(
    table: Table, plans: list[RowPlan], columns, *, skipped=()
) -> PreviewResult:
    suggested = _suggest_mapping(table.headers, columns)
    errors = tuple(error for plan in plans for error in plan.errors)
    return PreviewResult(
        detected_headers=table.headers,
        suggested_mapping=suggested,
        unmapped_headers=tuple(h for h in table.headers if h not in suggested),
        sample_rows=table.rows[:PREVIEW_ROWS],
        row_count=len(plans),
        to_create=sum(1 for plan in plans if plan.ok and not plan.is_update),
        to_update=sum(1 for plan in plans if plan.ok and plan.is_update),
        errors=errors,
        skipped_columns=skipped,
    )


async def preview_stations(
    db: AsyncSession, *, actor: User, raw: bytes, filename: str,
    station_type: str, mapping: dict[str, str] | None = None,
) -> PreviewResult:
    """Dry-run a station file: report every problem at once, write nothing (ADR-112/114).

    Checked against `station.import` like `commit` is — otherwise it would be a way for
    someone without the capability to probe what is in the database (ADR-110).
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
        return _preview_of(table, plans, columns, skipped=skipped)


async def preview_tickets(
    db: AsyncSession, *, actor: User, raw: bytes, filename: str,
    task_type: str, mapping: dict[str, str] | None = None,
) -> PreviewResult:
    """Dry-run a ticket file. Same contract as `preview_stations`."""
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.TICKET_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await ticket_columns(db, task_type)
        plans, _ = await _plan_tickets(db, task_type=task_type, rows=rows, columns=columns)
        return _preview_of(table, plans, columns)


async def _commit(
    db: AsyncSession, *, table: Table, plans: list[RowPlan], write, filename: str
) -> ImportOutcome:
    """Write every writable row, collecting failures instead of stopping at the first.

    Each service call commits on its own, so a row that fails after its parent row was
    already written stays half-applied. That is reported separately rather than hidden:
    validation runs first, so the realistic cause is a permission the caller lacks for the
    dependent write (for example station.contribute for a dynamic value).
    """
    failures: dict[int, list[RowError]] = {
        plan.index: list(plan.errors) for plan in plans if not plan.ok
    }
    created = updated = 0
    partial: list[int] = []

    created, updated, partial = await _write_all(db, plans, write, failures)

    errors = tuple(error for _, row_errors in sorted(failures.items()) for error in row_errors)
    return ImportOutcome(
        batch_id=str(uuid4()),
        created=created,
        updated=updated,
        failed=len(failures),
        errors=errors,
        error_report=_as_report(table, failures, filename=filename),
        partial_rows=tuple(partial),
    )


async def _write_all(db, plans, write, failures) -> tuple[int, int, list[int]]:
    """Run every writable row, recording a failure instead of stopping at the first."""
    created = updated = 0
    partial: list[int] = []
    for plan in plans:
        if not plan.ok:
            continue
        try:
            await write(plan)
        except HTTPException as exc:
            await db.rollback()
            failures[plan.index] = [_error(plan.line, "-", f"權限不足：{exc.detail}")]
            partial.append(plan.line)
            continue
        except ValueError as exc:
            await db.rollback()
            failures[plan.index] = [_error(plan.line, "-", str(exc))]
            continue
        if plan.is_update:
            updated += 1
        else:
            created += 1
    return created, updated, partial


async def commit_stations(
    db: AsyncSession, *, actor: User, raw: bytes, filename: str,
    station_type: str, mapping: dict[str, str] | None = None,
) -> ImportOutcome:
    """Import a station file: matched rows are updated, unmatched ones created (ADR-106)."""
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.STATION_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await station_columns(db, station_type)
        plans = await _plan_stations(db, station_type=station_type, rows=rows, columns=columns)

        async def write(plan: RowPlan) -> None:
            await _write_station(
                db, actor=actor, plan=plan, columns=columns, station_type=station_type
            )

        return await _commit(db, table=table, plans=plans, write=write, filename=filename)


async def commit_tickets(
    db: AsyncSession, *, actor: User, raw: bytes, filename: str,
    task_type: str, mapping: dict[str, str] | None = None,
) -> ImportOutcome:
    """Import a ticket file: one row is one ticket plus one task (ADR-120)."""
    async with stable_actor(db, actor):
        await require_scope(actor, Perm.TICKET_IMPORT, db)
        table, rows = await _read(raw, filename, mapping)
        columns = await ticket_columns(db, task_type)
        plans, index = await _plan_tickets(db, task_type=task_type, rows=rows, columns=columns)

        async def write(plan: RowPlan) -> None:
            await _write_ticket(
                db, actor=actor, plan=plan, columns=columns, task_type=task_type, index=index
            )

        return await _commit(db, table=table, plans=plans, write=write, filename=filename)
