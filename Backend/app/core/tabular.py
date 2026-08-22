"""CSV/XLSX reading and writing for bulk files (feature 015, ADR-115).

A pure format layer: it knows a table is headers plus rows of text, and nothing about
stations, tickets, or permissions. Every value comes back as `str` — interpreting one is the
validation layer's job, and doing it here would give the two formats a chance to disagree
about what a cell meant.

Both formats exist because both sources are real: a government roster usually arrives as
CSV, while internal maintenance happens in Excel. The writers spend their effort on the two
places Excel silently destroys data — see `TEXT_COLUMNS` and the BOM below.
"""

import csv
import io
from dataclasses import dataclass

from openpyxl import Workbook, load_workbook

CSV_EXTENSION = ".csv"
XLSX_EXTENSION = ".xlsx"
SUPPORTED_EXTENSIONS = (CSV_EXTENSION, XLSX_EXTENSION)

# Excel infers a type for every cell it opens. Left alone it reads 0912345678 as the number
# 912345678, and `contact_phone` is a ticket's match key (ADR-107) — a silently dropped
# leading zero turns a whole round-trip into "nothing matched, everything is new". Writing
# these as text-formatted cells is what prevents that on the way back out of Excel too.
TEXT_COLUMNS = frozenset(
    {"uuid", "contact_phone", "contact_name", "name", "title", "no", "floor", "room"}
)

_TEXT_CELL_FORMAT = "@"
# Excel reads a BOM-less UTF-8 CSV as the local codepage, which mangles every CJK name.
_BOM = "﻿"


class TableFormatError(ValueError):
    """The uploaded file cannot be read as a table (mapped to 400 by the endpoint)."""


@dataclass(frozen=True)
class Table:
    """A parsed file: the header row, and one dict per data row keyed by header.

    `headers` is kept separately rather than derived from the first row because a header-only
    file is a legitimate import template (ADR-119) and has no first row to derive from.
    """

    headers: tuple[str, ...]
    rows: tuple[dict[str, str], ...]


def _extension_of(filename: str) -> str:
    lowered = filename.lower()
    for extension in SUPPORTED_EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    raise TableFormatError(
        f"不支援的檔案格式「{filename}」；請使用 {' 或 '.join(SUPPORTED_EXTENSIONS)}"
    )


def _clean_headers(raw_headers: list) -> tuple[str, ...]:
    """Trim, then refuse anything that cannot be mapped to a column.

    A blank or duplicated header is refused rather than repaired: both mean one column's
    values would silently vanish, and guessing which one the user meant is worse than making
    them fix the file.
    """
    headers = [str(h).strip() if h is not None else "" for h in raw_headers]
    while headers and headers[-1] == "":
        headers.pop()  # trailing empty columns are an artefact of the tool that wrote the file

    if not headers:
        raise TableFormatError("檔案沒有表頭列")
    if "" in headers:
        raise TableFormatError(f"第 {headers.index('') + 1} 欄沒有欄位名稱")

    duplicates = sorted({h for h in headers if headers.count(h) > 1})
    if duplicates:
        raise TableFormatError(f"表頭有重複的欄位名稱：{'、'.join(duplicates)}")

    return tuple(headers)


def _cell_to_text(value) -> str:
    """Render one cell as text, without inventing a decimal tail.

    openpyxl hands whole numbers back as floats, so an Integer column read straight from a
    spreadsheet would arrive as "200.0" and fail its own type check.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _rows_from(headers: tuple[str, ...], raw_rows) -> tuple[dict[str, str], ...]:
    """Zip each raw row onto the headers, dropping rows that are entirely blank.

    Spreadsheets routinely report thousands of empty rows below the data; a short row is
    padded rather than refused, since a trailing blank column is not a structural problem.
    """
    rows = []
    for raw in raw_rows:
        values = [_cell_to_text(v) for v in raw][: len(headers)]
        values += [""] * (len(headers) - len(values))
        if any(values):
            rows.append(dict(zip(headers, values, strict=True)))
    return tuple(rows)


def _read_csv(raw: bytes) -> Table:
    try:
        # utf-8-sig strips our own BOM when present and is plain UTF-8 when it is not.
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise TableFormatError(
            "檔案不是 UTF-8 編碼；請在試算表軟體以「CSV UTF-8」另存後再上傳"
        ) from exc

    reader = list(csv.reader(io.StringIO(text)))
    if not reader:
        raise TableFormatError("檔案是空的")
    headers = _clean_headers(reader[0])
    return Table(headers=headers, rows=_rows_from(headers, reader[1:]))


def _read_xlsx(raw: bytes) -> Table:
    try:
        workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as exc:  # openpyxl raises a family of unrelated types here
        raise TableFormatError("無法讀取這個 .xlsx 檔") from exc

    sheet = workbook.active
    raw_rows = list(sheet.iter_rows(values_only=True))
    workbook.close()

    if not raw_rows:
        raise TableFormatError("檔案是空的")
    headers = _clean_headers(list(raw_rows[0]))
    return Table(headers=headers, rows=_rows_from(headers, raw_rows[1:]))


def read_table(raw: bytes, filename: str) -> Table:
    """Parse an uploaded CSV or XLSX into headers plus rows of text."""
    if not raw:
        raise TableFormatError("檔案是空的")
    if _extension_of(filename) == CSV_EXTENSION:
        return _read_csv(raw)
    return _read_xlsx(raw)


def write_csv(headers, rows) -> bytes:
    """Render a table as UTF-8 CSV with a BOM, so Excel opens CJK text correctly.

    The BOM does not stop Excel from re-inferring cell types when the user saves — nothing in
    a CSV can. That is what `write_xlsx` is for; this format stays available because plenty
    of external sources only speak CSV.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(header, "") for header in headers])
    return (_BOM + buffer.getvalue()).encode()


def write_xlsx(headers, rows, *, text_columns=TEXT_COLUMNS) -> bytes:
    """Render a table as .xlsx, writing the hazardous columns as text-formatted cells."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(list(headers))

    text_indexes = [i + 1 for i, header in enumerate(headers) if header in text_columns]
    for row in rows:
        sheet.append([row.get(header, "") for header in headers])
        for index in text_indexes:
            sheet.cell(row=sheet.max_row, column=index).number_format = _TEXT_CELL_FORMAT

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
