"""Audit-log read API (Spec/026, ADR-358). Thin per ADR-014; see app/services/audit_log.py."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.schemas.audit_log import AuditLogItem
from app.services import audit_log as audit_log_service
from app.services.audit_log import MAX_PAGE, AuditExportTooLarge, AuditFilters, redact_applicant_details

router = APIRouter()


@router.get(
    "/audit-logs",
    response_model=list[AuditLogItem],
    summary="讀取稽核紀錄",
    responses={403: {"description": "Neither audit.view at all nor team.audit.view"}},
)
async def list_audit_logs(
    table: str | None = None,
    row_id: UUID | None = None,
    actor_uuid: UUID | None = None,
    since: datetime | None = Query(None, alias="from"),
    until: datetime | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Newest first. A super admin or data auditor reads every change; a team admin their team's."""
    page = await audit_log_service.list_audit_logs(
        db,
        actor=current_user,
        filters=AuditFilters(table=table, row_id=row_id, actor_uuid=actor_uuid, since=since, until=until),
        limit=limit,
        offset=offset,
    )
    items = [AuditLogItem.model_validate(row) for row in page.rows]
    if not page.platform_view:
        # A team admin does not read where other people connected from.
        items = [item.model_copy(update={"client_ip": None}) for item in items]
    if not page.reads_applicant_details:
        items = [
            item.model_copy(
                update={
                    "old_values": redact_applicant_details(item.table_name, item.old_values),
                    "new_values": redact_applicant_details(item.table_name, item.new_values),
                }
            )
            for item in items
        ]
    return items


@router.get(
    "/audit-logs/export",
    response_class=Response,
    summary="匯出稽核紀錄（CSV）",
    responses={
        200: {"content": {"text/csv": {}}, "description": "The filtered log, newest first"},
        403: {"description": "No audit.export at all (super admins only)"},
        422: {"description": "More rows than one file carries; narrow the range"},
    },
)
async def export_audit_logs(
    table: str | None = None,
    row_id: UUID | None = None,
    actor_uuid: UUID | None = None,
    since: datetime | None = Query(None, alias="from"),
    until: datetime | None = Query(None, alias="to"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """The same filters as the list, as one CSV file (ADR-414). Super admins only."""
    try:
        content = await audit_log_service.export_audit_logs(
            db,
            actor=current_user,
            filters=AuditFilters(table=table, row_id=row_id, actor_uuid=actor_uuid, since=since, until=until),
        )
    except AuditExportTooLarge as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
    filename = f"audit-logs-{datetime.now(UTC):%Y%m%d-%H%M%S}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
