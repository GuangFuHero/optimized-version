"""Response shapes for the bulk export/import endpoints (feature 015)."""

from pydantic import BaseModel, Field

from app.services.bulk_import import ImportOutcome, PreviewResult


class RowErrorResponse(BaseModel):
    """One problem with one row, addressed the way the user sees the file."""

    line: int = Field(description="試算表的列號，表頭是第 1 列")
    column: str = Field(description="出問題的欄位；`-` 代表整列層級的問題")
    message: str


class BulkPreviewResponse(BaseModel):
    """What `preview` reports before anything is written."""

    detected_headers: list[str]
    suggested_mapping: dict[str, str] = Field(description="檔案欄位 → 系統欄位的自動配對")
    unmapped_headers: list[str] = Field(description="配不到系統欄位的檔案欄位")
    sample_rows: list[dict[str, str]]
    row_count: int
    to_create: int
    to_update: int
    errors: list[RowErrorResponse]
    skipped_columns: list[dict[str, str]] = Field(
        default_factory=list, description="設定裡有、但這種檔案存不下的動態欄位（ADR-118）"
    )

    @classmethod
    def of(cls, result: PreviewResult) -> "BulkPreviewResponse":
        """Build the response from the service result."""
        return cls(
            detected_headers=list(result.detected_headers),
            suggested_mapping=result.suggested_mapping,
            unmapped_headers=list(result.unmapped_headers),
            sample_rows=[dict(row) for row in result.sample_rows],
            row_count=result.row_count,
            to_create=result.to_create,
            to_update=result.to_update,
            errors=[RowErrorResponse(**vars(error)) for error in result.errors],
            skipped_columns=list(result.skipped_columns),
        )


class ErrorReportResponse(BaseModel):
    """The failed rows rendered back in the uploaded format, base64-encoded.

    Carried inline rather than behind a download URL: the endpoints are stateless (ADR-114),
    and the report describes *this* run — after a commit, re-deriving it from the same file
    would not produce the same answer, because some of those rows now exist.
    """

    filename: str
    media_type: str
    content_base64: str


class BulkImportResponse(BaseModel):
    """What `commit` reports afterwards."""

    batch_id: str = Field(description="這次匯入的識別碼；目前只在這個回應裡（ADR-124）")
    created: int
    updated: int
    failed: int
    errors: list[RowErrorResponse]
    error_report: ErrorReportResponse | None = None
    partial_rows: list[int] = Field(
        default_factory=list,
        description="主資料已寫入、但後續步驟因權限失敗的列號——這幾列處於半完成狀態",
    )

    @classmethod
    def of(cls, outcome: ImportOutcome) -> "BulkImportResponse":
        """Build the response from the service outcome."""
        return cls(
            batch_id=outcome.batch_id,
            created=outcome.created,
            updated=outcome.updated,
            failed=outcome.failed,
            errors=[RowErrorResponse(**vars(error)) for error in outcome.errors],
            error_report=(
                ErrorReportResponse(**vars(outcome.error_report)) if outcome.error_report else None
            ),
            partial_rows=list(outcome.partial_rows),
        )
