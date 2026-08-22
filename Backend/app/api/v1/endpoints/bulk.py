"""Bulk export/import REST endpoints (feature 015, ADR-114).

REST rather than GraphQL: this is file upload and file download, which GraphQL has no good
answer for. The write path still goes through the same service layer every GraphQL mutation
uses, so a bulk row is authorized exactly like a hand-typed one (ADR-110).

Deliberately stateless — `preview` and `commit` each receive the file, and nothing is stored
between them (ADR-114). `commit` re-runs the full validation, so a caller who swaps the file
between the two calls gets validation errors, not a bypass.
"""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.tabular import TableFormatError
from app.models.auth import User
from app.schemas.bulk import BulkImportResponse, BulkPreviewResponse
from app.services import bulk_export, bulk_import
from app.services.bulk_export import CSV_FORMAT, SUPPORTED_FORMATS, BulkExportError
from app.services.bulk_import import BulkImportError

router = APIRouter()


def _as_response(exported: bulk_export.ExportFile) -> Response:
    """Stream the rendered file back as an attachment."""
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
    )


@router.get(
    "/stations/export",
    summary="匯出資源站點（CSV / XLSX）",
    responses={403: {"description": "Permission Denied"}},
)
async def export_stations(
    station_type: str = Query(description="要匯出的站點型別，例如 shelter"),
    file_format: str = Query(
        CSV_FORMAT, alias="format", description=f"檔案格式：{' / '.join(SUPPORTED_FORMATS)}"
    ),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Export one station type's rows, limited to what the caller's scope reaches."""
    try:
        exported = await bulk_export.export_stations(
            db, actor=current_user, station_type=station_type, file_format=file_format
        )
    except BulkExportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _as_response(exported)


@router.get(
    "/tickets/export",
    summary="匯出求助單（CSV / XLSX）",
    responses={403: {"description": "Permission Denied"}},
)
async def export_tickets(
    task_type: str = Query(description="要匯出的任務型別，例如 rescue"),
    file_format: str = Query(
        CSV_FORMAT, alias="format", description=f"檔案格式：{' / '.join(SUPPORTED_FORMATS)}"
    ),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Export one task type's rows; contact fields are masked per row (ADR-109)."""
    try:
        exported = await bulk_export.export_tickets(
            db, actor=current_user, task_type=task_type, file_format=file_format
        )
    except BulkExportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _as_response(exported)


def _parse_mapping(raw: str | None) -> dict[str, str]:
    """Parse the confirmed column mapping, which arrives as a JSON object in the form data."""
    if not raw:
        return {}
    try:
        mapping = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="mapping 不是合法的 JSON"
        ) from exc
    if not isinstance(mapping, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in mapping.items()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="mapping 必須是 {檔案欄位: 系統欄位} 的物件"
        )
    return mapping


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    raw = await file.read()
    return raw, file.filename or ""


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/stations/import/preview",
    response_model=BulkPreviewResponse,
    summary="預覽資源站點匯入（不寫入）",
    responses={400: {"description": "檔案無法解析或超過上限"}, 403: {"description": "Permission Denied"}},
)
async def preview_station_import(
    station_type: str = Query(description="這份檔案的站點型別"),
    file: UploadFile = File(description="CSV 或 XLSX"),
    mapping: str | None = Form(None, description="欄位映射 JSON；第一次呼叫可省略"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Dry-run the file and report every problem at once. Writes nothing (ADR-112)."""
    raw, filename = await _read_upload(file)
    try:
        result = await bulk_import.preview_stations(
            db, actor=current_user, raw=raw, filename=filename,
            station_type=station_type, mapping=_parse_mapping(mapping),
        )
    except (BulkImportError, TableFormatError) as exc:
        raise _bad_request(exc) from exc
    return BulkPreviewResponse.of(result)


@router.post(
    "/tickets/import/preview",
    response_model=BulkPreviewResponse,
    summary="預覽求助單匯入（不寫入）",
    responses={400: {"description": "檔案無法解析或超過上限"}, 403: {"description": "Permission Denied"}},
)
async def preview_ticket_import(
    task_type: str = Query(description="這份檔案的任務型別"),
    file: UploadFile = File(description="CSV 或 XLSX"),
    mapping: str | None = Form(None, description="欄位映射 JSON；第一次呼叫可省略"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Dry-run the file. Same contract as the station preview."""
    raw, filename = await _read_upload(file)
    try:
        result = await bulk_import.preview_tickets(
            db, actor=current_user, raw=raw, filename=filename,
            task_type=task_type, mapping=_parse_mapping(mapping),
        )
    except (BulkImportError, TableFormatError) as exc:
        raise _bad_request(exc) from exc
    return BulkPreviewResponse.of(result)


@router.post(
    "/stations/import/commit",
    response_model=BulkImportResponse,
    summary="執行資源站點匯入",
    responses={400: {"description": "檔案無法解析或超過上限"}, 403: {"description": "Permission Denied"}},
)
async def commit_station_import(
    station_type: str = Query(description="這份檔案的站點型別"),
    file: UploadFile = File(description="與 preview 相同的那份檔"),
    mapping: str | None = Form(None, description="preview 確認過的欄位映射 JSON"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Write the file row by row; failed rows come back as a downloadable report."""
    raw, filename = await _read_upload(file)
    try:
        outcome = await bulk_import.commit_stations(
            db, actor=current_user, raw=raw, filename=filename,
            station_type=station_type, mapping=_parse_mapping(mapping),
        )
    except (BulkImportError, TableFormatError) as exc:
        raise _bad_request(exc) from exc
    return BulkImportResponse.of(outcome)


@router.post(
    "/tickets/import/commit",
    response_model=BulkImportResponse,
    summary="執行求助單匯入",
    responses={400: {"description": "檔案無法解析或超過上限"}, 403: {"description": "Permission Denied"}},
)
async def commit_ticket_import(
    task_type: str = Query(description="這份檔案的任務型別"),
    file: UploadFile = File(description="與 preview 相同的那份檔"),
    mapping: str | None = Form(None, description="preview 確認過的欄位映射 JSON"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Write the file row by row. Same contract as the station commit."""
    raw, filename = await _read_upload(file)
    try:
        outcome = await bulk_import.commit_tickets(
            db, actor=current_user, raw=raw, filename=filename,
            task_type=task_type, mapping=_parse_mapping(mapping),
        )
    except (BulkImportError, TableFormatError) as exc:
        raise _bad_request(exc) from exc
    return BulkImportResponse.of(outcome)
