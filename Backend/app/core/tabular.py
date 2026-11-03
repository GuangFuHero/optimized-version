"""CSV/XLSX reading and writing for bulk files (feature 015, ADR-115).

A pure format layer: it knows a table is headers plus rows of text, and nothing about
stations, tickets, or permissions. Every value comes back as `str` — interpreting one is the
validation layer's job, and doing it here would give the two formats a chance to disagree
about what a cell meant.

Both formats exist because both sources are real: a government roster usually arrives as
CSV, while internal maintenance happens in Excel. The writers spend their effort on the
three places Excel reinterprets a cell it was handed as text — see `TEXT_COLUMNS`, the BOM,
and `_looks_like_formula` below.
"""

import csv
import io
import itertools
import zipfile
from collections.abc import Callable
from dataclasses import dataclass

from openpyxl import Workbook, load_workbook

CSV_EXTENSION = ".csv"
XLSX_EXTENSION = ".xlsx"
SUPPORTED_EXTENSIONS = (CSV_EXTENSION, XLSX_EXTENSION)

# Excel infers a type for every cell it opens. Left alone it reads 0912345678 as the number
# 912345678, and `contact_phone` is a ticket's match key (ADR-107) — a silently dropped
# leading zero turns a whole round-trip into "nothing matched, everything is new". Writing
# these as text-formatted cells is what prevents that on the way back out of Excel too.
TEXT_COLUMNS = frozenset({"uuid", "contact_phone", "contact_name", "name", "title", "no", "floor", "room"})

_TEXT_CELL_FORMAT = "@"
# Excel reads a BOM-less UTF-8 CSV as the local codepage, which mangles every CJK name.
_BOM = "﻿"

# A cell whose text starts with one of these is *executed* by Excel and LibreOffice when the
# file is opened. `station.contribute` is deliberately open crowd-sourcing (ADR-111), so the
# person who writes a station name is not the person who opens the export — the writers
# neutralize the leading character rather than trusting the value (ADR-208).
_FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")
_CSV_FORMULA_GUARD = "'"

# An .xlsx is a zip: a 1.4 MB upload inside the 2 MB cap can expand to hundreds of MB of
# sheet XML. The archive's declared sizes are checked before anything is decompressed, so a
# file that will be rejected costs a directory read rather than a parse (ADR-209).
MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024


class TableFormatError(ValueError):
    """The uploaded file cannot be read as a table (mapped to 400 by the endpoint)."""


@dataclass(frozen=True)
class Table:
    """A parsed file: the header row, and one dict per data row keyed by header.

    `headers` is kept separately rather than derived from the first row because a header-only
    file is a legitimate import template (ADR-119) and has no first row to derive from.

    `lines` holds each row's line number in the spreadsheet, as the user sees it: the blank rows
    dropped, a title row and a label row above the header (#285) all still count. Empty when the
    caller built the table by hand; `line_of` then falls back to "the header is line 1".
    """

    headers: tuple[str, ...]
    rows: tuple[dict[str, str], ...]
    lines: tuple[int, ...] = ()

    def line_of(self, index: int) -> int:
        """The spreadsheet line of data row `index`."""
        return self.lines[index] if index < len(self.lines) else index + 2


# A label row (#285) is told from a code row by how many of its cells are codes: an export's code
# row names every column, a person's Chinese labels name none. Three, so a stray `uuid` in a
# hand-written title row does not pass for the code row.
MIN_CODE_CELLS = 3


def _is_code_row(row, is_code) -> bool:
    return sum(1 for value in row if is_code(_cell_to_text(value))) >= MIN_CODE_CELLS


def _extension_of(filename: str) -> str:
    lowered = filename.lower()
    for extension in SUPPORTED_EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    raise TableFormatError(f"不支援的檔案格式「{filename}」；請使用 {' 或 '.join(SUPPORTED_EXTENSIONS)}")


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


def _rows_from(
    headers: tuple[str, ...], numbered_rows, max_rows: int | None = None
) -> tuple[tuple[dict[str, str], ...], tuple[int, ...]]:
    """Zip each raw row onto the headers, dropping rows that are entirely blank.

    Spreadsheets routinely report thousands of empty rows below the data; a short row is
    padded rather than refused, since a trailing blank column is not a structural problem.
    `numbered_rows` yields `(line, row)`; the lines of the kept rows come back beside them.

    `max_rows` stops the read one row past the caller's limit — enough for the caller to see
    that the file is over it, without parsing the rest (ADR-209). Blank rows do not count,
    so the trailing emptiness a spreadsheet writes out never consumes the allowance.
    """
    rows = []
    lines = []
    for line, raw in numbered_rows:
        values = [_cell_to_text(v) for v in raw][: len(headers)]
        values += [""] * (len(headers) - len(values))
        if not any(values):
            continue
        rows.append(dict(zip(headers, values, strict=True)))
        lines.append(line)
        if max_rows is not None and len(rows) > max_rows:
            break
    return tuple(rows), tuple(lines)


def _skip_label_row(header, rest, is_code):
    """Step past an export's label row (#285) to the code row under it, when there is one.

    The label row is the header found, the row after it is a code row, and the label row is not
    one itself. A file with only the code row, or with headers of its own, is read as before.
    `header` and the items of `rest` are `(line, row)`.
    """
    if is_code is None or _is_code_row(header[1], is_code):
        return header, rest
    following = _next_filled(rest)
    if following is None:
        return header, iter(())
    if _is_code_row(following[1], is_code):
        return following, rest
    return header, itertools.chain((following,), rest)


def _looks_like_formula(value: str) -> bool:
    """True when a spreadsheet would execute this text instead of displaying it.

    A negative number is the reason this is not a plain prefix test: `longitude` is routinely
    `-121.5`, and guarding that would break the column's own type check on the way back in.
    """
    if not value.startswith(_FORMULA_LEADERS):
        return False
    try:
        float(value)
    except ValueError:
        return True
    return False


def _read_csv(raw: bytes, max_rows: int | None, is_code) -> Table:
    try:
        # utf-8-sig strips our own BOM when present and is plain UTF-8 when it is not.
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise TableFormatError("檔案不是 UTF-8 編碼；請在試算表軟體以「CSV UTF-8」另存後再上傳") from exc

    # A record is a spreadsheet row, so it is numbered as one; a quoted newline inside a cell
    # does not start a new row.
    numbered = enumerate(csv.reader(io.StringIO(text)), start=1)
    header = next(numbered, None)
    if header is None:
        raise TableFormatError("檔案是空的")
    header, numbered = _skip_label_row(header, numbered, is_code)
    headers = _clean_headers(header[1])
    rows, lines = _rows_from(headers, numbered, max_rows)
    return Table(headers=headers, rows=rows, lines=lines)


def _check_uncompressed_size(raw: bytes) -> None:
    """Reject an archive that declares more sheet data than the parser is willing to spend.

    Read from the zip directory, so this costs no decompression — the point is to spend
    nothing on a file that is going to be refused anyway (ADR-209).
    """
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            declared = sum(entry.file_size for entry in archive.infolist())
    except zipfile.BadZipFile as exc:
        raise TableFormatError("無法讀取這個 .xlsx 檔") from exc
    if declared > MAX_UNCOMPRESSED_BYTES:
        raise TableFormatError(
            f"這個 .xlsx 解壓後超過 {MAX_UNCOMPRESSED_BYTES // 1024 // 1024} MB，請分批匯入"
        )


def _filled_cells(row) -> int:
    return sum(1 for value in row if _cell_to_text(value))


def _next_filled(numbered_rows):
    """The next `(line, row)` with a filled cell, or None."""
    return next((item for item in numbered_rows if _filled_cells(item[1])), None)


def _header_and_rest(raw_rows):
    """Find the header row of a sheet, skipping the title or blank rows a spreadsheet puts above it.

    Numbers exports a table's name as a one-cell row over its header row, and a sheet can start
    a few rows down. Blank rows are passed over outright, and a filled row is passed over only
    while the next filled row is wider — so a single-column sheet keeps its first row as the
    header, and a blank spacer under a title does not make the title look like one. Blank rows
    dropped here would be dropped as data rows anyway. Rows are `(line, row)`.
    """
    current = _next_filled(raw_rows)
    while current is not None:
        following = _next_filled(raw_rows)
        if following is None:
            return current, iter(())
        if _filled_cells(current[1]) > 1 or _filled_cells(following[1]) <= _filled_cells(current[1]):
            return current, itertools.chain((following,), raw_rows)
        current = following
    return None, raw_rows


def _read_xlsx(raw: bytes, max_rows: int | None, is_code) -> Table:
    _check_uncompressed_size(raw)
    try:
        workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as exc:  # openpyxl raises a family of unrelated types here
        raise TableFormatError("無法讀取這個 .xlsx 檔") from exc

    sheet = workbook.active
    # The read-only sheet yields from row 1, empty rows included, so counting is numbering.
    numbered = enumerate(sheet.iter_rows(values_only=True), start=1)
    header, raw_rows = _header_and_rest(numbered)
    if header is None:
        workbook.close()
        raise TableFormatError("檔案是空的")
    header, raw_rows = _skip_label_row(header, raw_rows, is_code)
    headers = _clean_headers(list(header[1]))
    rows, lines = _rows_from(headers, raw_rows, max_rows)
    workbook.close()
    return Table(headers=headers, rows=rows, lines=lines)


def read_table(
    raw: bytes, filename: str, *, max_rows: int | None = None, is_code: Callable[[str], bool] | None = None
) -> Table:
    """Parse an uploaded CSV or XLSX into headers plus rows of text.

    `max_rows` bounds the work: parsing stops one row past it, so the caller's own row limit
    costs a rejection rather than a full parse (ADR-209).

    `is_code` says whether a header cell is one of the file type's column codes. Given, a label
    row above the code row — the first of an export's two header rows (#285) — is skipped: see
    `_skip_label_row`.
    """
    if not raw:
        raise TableFormatError("檔案是空的")
    if _extension_of(filename) == CSV_EXTENSION:
        return _read_csv(raw, max_rows, is_code)
    return _read_xlsx(raw, max_rows, is_code)


def _csv_safe(value) -> str:
    """Prefix a formula-looking value so the spreadsheet displays it instead of running it.

    CSV carries no cell type, so the leading apostrophe is the only place to say "text" —
    unlike `write_xlsx`, which can type the cell and leave the value untouched (ADR-208).
    """
    text = "" if value is None else str(value)
    return _CSV_FORMULA_GUARD + text if _looks_like_formula(text) else text


def write_csv(headers, rows, *, labels=None) -> bytes:
    """Render a table as UTF-8 CSV with a BOM, so Excel opens CJK text correctly.

    The BOM does not stop Excel from re-inferring cell types when the user saves — nothing in
    a CSV can. That is what `write_xlsx` is for; this format stays available because plenty
    of external sources only speak CSV.

    `labels`, given, is written as a row of its own above the headers (#285).
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    if labels is not None:
        writer.writerow([_csv_safe(label) for label in labels])
    writer.writerow([_csv_safe(header) for header in headers])
    for row in rows:
        writer.writerow([_csv_safe(row.get(header, "")) for header in headers])
    return (_BOM + buffer.getvalue()).encode()


_STRING_CELL_TYPE = "s"


def _write_row(sheet, values: list[str], text_indexes: list[int]) -> None:
    """Append one row, typing every cell as a string before Excel gets to guess.

    `number_format` cannot undo this: openpyxl decides the cell's type when the value is
    assigned, so a value starting with `=` is already a formula by the time a format is set.
    Forcing the type is what keeps the value both inert and unchanged (ADR-208).
    """
    sheet.append(values)
    for column in range(1, len(values) + 1):
        cell = sheet.cell(row=sheet.max_row, column=column)
        if cell.value not in (None, ""):
            cell.data_type = _STRING_CELL_TYPE
        if column in text_indexes:
            cell.number_format = _TEXT_CELL_FORMAT


def write_xlsx(headers, rows, *, text_columns=TEXT_COLUMNS, labels=None) -> bytes:
    """Render a table as .xlsx, writing every cell as text (see `_write_row`).

    `labels`, given, is written as a row of its own above the headers (#285).
    """
    workbook = Workbook()
    sheet = workbook.active
    if labels is not None:
        _write_row(sheet, [str(label) for label in labels], [])
    _write_row(sheet, [str(header) for header in headers], [])

    text_indexes = [i + 1 for i, header in enumerate(headers) if header in text_columns]
    for row in rows:
        values = ["" if row.get(header) is None else str(row.get(header, "")) for header in headers]
        _write_row(sheet, values, text_indexes)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
