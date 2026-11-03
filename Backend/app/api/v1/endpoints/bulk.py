"""Bulk export/import REST endpoints (feature 015, ADR-114).

REST rather than GraphQL: this is file upload and file download, which GraphQL has no good
answer for. The write path still goes through the same service layer every GraphQL mutation
uses, so a bulk row is authorized exactly like a hand-typed one (ADR-110).

Deliberately stateless — `preview` and `commit` each receive the file, and nothing is stored
between them (ADR-114). `commit` re-runs the full validation, so a caller who swaps the file
between the two calls gets validation errors, not a bypass.
"""

import json
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.tabular import TableFormatError
from app.models.auth import User
from app.schemas.bulk import (
    BulkImportResponse,
    BulkPreviewResponse,
    OwnTeamResponse,
    TicketExportCountsResponse,
)
from app.services import bulk_export, bulk_import
from app.services.bulk_export import CSV_FORMAT, SUPPORTED_FORMATS, BulkExportError
from app.services.bulk_import import BulkImportError

router = APIRouter()


def _content_disposition(filename: str) -> str:
    """Name the download in a header that survives a non-ASCII type (RFC 6266, ADR-214).

    Starlette encodes headers as latin-1, so a CJK `station_type` interpolated raw here is a
    500 rather than a download. `filename*` carries the real name percent-encoded; the plain
    `filename` is the ASCII fallback, with everything a header cannot safely carry — quotes,
    separators, control characters — reduced to `_`.
    """
    ascii_name = "".join(c if c.isascii() and (c.isalnum() or c in "-_.") else "_" for c in filename)
    encoded = quote(filename, safe="")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded}"


def _as_response(exported: bulk_export.ExportFile) -> Response:
    """Stream the rendered file back as an attachment."""
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={"Content-Disposition": _content_disposition(exported.filename)},
    )


@router.get(
    "/stations/export",
    summary="匯出資源站點（CSV / XLSX）",
    description="表頭兩列：第一列中文欄名，第二列欄位代號；匯入時看到第二列是代號就用它當表頭。",
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
    """Export one station type's rows, limited to what the caller's scope reaches.

    Two header rows: Chinese labels, then the field codes the importer maps by.
    """
    try:
        exported = await bulk_export.export_stations(
            db, actor=current_user, station_type=station_type, file_format=file_format
        )
    except BulkExportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _as_response(exported)


_RESPONSIBLE_TEAM_DESCRIPTION = (
    "組織分配：只要落在這個團隊責任區的單，跟 GraphQL `tickets` 的 responsibleTeamUuid 同一套"
    "（匯出那一刻算）。只比對呼叫者看得到細節（ticket.view_detail）的單，其他單一律不符合"
)
_UNASSIGNED_DESCRIPTION = (
    "組織分配：只要不在任何責任區的單（未指派），跟 `tickets` 的 unassignedOnly 同一套；"
    "同樣只比對看得到細節的單。不能跟 responsible_team_uuid 一起用（400）"
)


def _team_params(
    responsible_team_uuid: UUID | None = Query(None, description=_RESPONSIBLE_TEAM_DESCRIPTION),
    unassigned_only: bool = Query(False, description=_UNASSIGNED_DESCRIPTION),
) -> dict:
    return {"responsible_team_uuid": responsible_team_uuid, "unassigned_only": unassigned_only}


@router.get(
    "/tickets/export/counts",
    summary="各任務型別匯出會有幾列",
    responses={
        400: {"description": "responsible_team_uuid 和 unassigned_only 同時給"},
        403: {"description": "Permission Denied"},
    },
)
async def count_ticket_exports(
    team: dict = Depends(_team_params),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
) -> TicketExportCountsResponse:
    """Count each task type's export rows in the caller's scope, with the most one export may hold.

    Narrowed by 組織分配 exactly as `/tickets/export` is. A type with no rows is left out; 全部種類
    is their sum. A count over `max_rows` is still the real one, so a page can say that type's
    export will be refused before anyone asks for it. `own_team` is set when the caller's
    ticket.export reaches only their team's 責任區.
    """
    try:
        counts = await bulk_export.count_ticket_exports(db, actor=current_user, **team)
    except BulkExportError as exc:
        raise _bad_request(exc) from exc
    own = await bulk_export.own_export_team(db, actor=current_user)
    return TicketExportCountsResponse(
        counts=counts,
        max_rows=bulk_export.MAX_EXPORT_ROWS,
        own_team=OwnTeamResponse(uuid=own.uuid, name=own.name) if own else None,
    )


@router.get(
    "/tickets/export",
    summary="匯出求助單（CSV / XLSX）",
    description=(
        "一列是一張單加一個需求。表頭兩列：第一列中文欄名，第二列欄位代號；匯入時看到第二列是代號"
        "就用它當表頭。task_type=all 是全部種類一份檔，只有固定欄位、沒有各種需求自己的 prop.* 欄位。"
        "列表的其他篩選（狀態、優先級、行政區域、時間、搜尋）不帶進匯出。"
    ),
    responses={
        400: {"description": "型別或格式不對、超過上限、組織分配兩個一起給、範本選了 all"},
        403: {"description": "Permission Denied"},
    },
)
async def export_tickets(
    task_type: str = Query(
        description="要匯出的任務型別，例如 rescue；all 是全部種類（只有固定欄位，不能配 template）"
    ),
    file_format: str = Query(
        CSV_FORMAT, alias="format", description=f"檔案格式：{' / '.join(SUPPORTED_FORMATS)}"
    ),
    template: bool = Query(
        False,
        description=(
            "只回標題列，給匯入當範本：欄位跟匯出一樣、沒有資料；要 ticket.import，不要 ticket.export。"
            "不看組織分配"
        ),
    ),
    team: dict = Depends(_team_params),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Export one task type's rows, or every type's with `all`; contact fields are masked per row (ADR-109).

    With `template`, the two header rows alone, for an importer to fill in.
    """
    try:
        if template:
            exported = await bulk_export.ticket_import_template(
                db, actor=current_user, task_type=task_type, file_format=file_format
            )
        else:
            exported = await bulk_export.export_tickets(
                db, actor=current_user, task_type=task_type, file_format=file_format, **team
            )
    except BulkExportError as exc:
        raise _bad_request(exc) from exc
    return _as_response(exported)


def _parse_mapping(raw: str | None) -> dict[str, str]:
    """Parse the confirmed column mapping, which arrives as a JSON object in the form data."""
    if not raw:
        return {}
    try:
        mapping = json.loads(raw)
    except (json.JSONDecodeError, RecursionError) as exc:
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


_DECISIONS_SHAPE = "decisions 必須是 [{line: 列號, acknowledged_duplicate_of: uuid}] 的陣列"


def _parse_decisions(raw: str | None) -> dict[int, str]:
    """Parse the suspected rows to file anyway, by line (ADR-398), from a JSON array in the form data."""
    if not raw:
        return {}
    try:
        decisions = json.loads(raw)
    except (json.JSONDecodeError, RecursionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="decisions 不是合法的 JSON"
        ) from exc
    if not isinstance(decisions, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_DECISIONS_SHAPE)
    parsed: dict[int, str] = {}
    for decision in decisions:
        if not (
            isinstance(decision, dict)
            and type(decision.get("line")) is int  # not a bool, which isinstance would let through
            and isinstance(decision.get("acknowledged_duplicate_of"), str)
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_DECISIONS_SHAPE)
        if decision["line"] in parsed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"decisions 裡第 {decision['line']} 列出現了兩次",
            )
        parsed[decision["line"]] = decision["acknowledged_duplicate_of"]
    return parsed


_DECISIONS_DESCRIPTION = (
    "仍要建立的疑似重複列，JSON 陣列：[{line, acknowledged_duplicate_of}]，"
    "acknowledged_duplicate_of 是預覽給的 related_uuid。沒列的疑似重複列不建立（ADR-398）"
)

_DECLINED_SHAPE = "declined 必須是列號的陣列，例如 [4, 9]"


def _parse_declined(raw: str | None, decisions: dict[int, str]) -> frozenset[int]:
    """Parse the suspected rows not to create, by line (ADR-398), from a JSON array in the form data."""
    if not raw:
        return frozenset()
    try:
        declined = json.loads(raw)
    except (json.JSONDecodeError, RecursionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="declined 不是合法的 JSON"
        ) from exc
    # `type(...) is int`, not isinstance: a bool would pass that.
    if not isinstance(declined, list) or not all(type(line) is int for line in declined):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_DECLINED_SHAPE)
    lines: set[int] = set()
    for line in declined:
        if line in lines:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=f"declined 裡第 {line} 列出現了兩次"
            )
        if line in decisions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=f"第 {line} 列同時在 decisions 和 declined"
            )
        lines.add(line)
    return frozenset(lines)


_DECLINED_DESCRIPTION = (
    "選了不建立的疑似重複列，列號的 JSON 陣列，例如 [4, 9]："
    "預覽的 suspects 扣掉 decisions 的列，沒決定的也算。這些列一律不建立，送出時引擎沒回答也一樣（ADR-398）"
)


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
            db,
            actor=current_user,
            raw=raw,
            filename=filename,
            station_type=station_type,
            mapping=_parse_mapping(mapping),
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
            db,
            actor=current_user,
            raw=raw,
            filename=filename,
            task_type=task_type,
            mapping=_parse_mapping(mapping),
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
    decisions: str | None = Form(None, description=_DECISIONS_DESCRIPTION),
    declined: str | None = Form(None, description=_DECLINED_DESCRIPTION),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Write the file row by row; failed and held rows come back as a downloadable report."""
    raw, filename = await _read_upload(file)
    decided = _parse_decisions(decisions)
    try:
        outcome = await bulk_import.commit_stations(
            db,
            actor=current_user,
            raw=raw,
            filename=filename,
            station_type=station_type,
            mapping=_parse_mapping(mapping),
            decisions=decided,
            declined=_parse_declined(declined, decided),
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
    decisions: str | None = Form(None, description=_DECISIONS_DESCRIPTION),
    declined: str | None = Form(None, description=_DECLINED_DESCRIPTION),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Write the file row by row. Same contract as the station commit."""
    raw, filename = await _read_upload(file)
    decided = _parse_decisions(decisions)
    try:
        outcome = await bulk_import.commit_tickets(
            db,
            actor=current_user,
            raw=raw,
            filename=filename,
            task_type=task_type,
            mapping=_parse_mapping(mapping),
            decisions=decided,
            declined=_parse_declined(declined, decided),
        )
    except (BulkImportError, TableFormatError) as exc:
        raise _bad_request(exc) from exc
    return BulkImportResponse.of(outcome)
