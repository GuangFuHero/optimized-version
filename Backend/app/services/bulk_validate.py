"""Per-row validation for bulk import (feature 015, ADR-117/123).

This is the one write path with no form in front of it and nobody reading the rows one by
one, so it is the one that validates. ADR-117 overrides 013's ADR-092 *here only*: a single
GraphQL write still stores whatever it is given, because a person is looking at it. A type
error typed into a form is one bad row; the same error in a column is the whole table.

Errors are collected, never raised on the first one — a file with three problems should come
back with three problems, not one at a time (ADR-112).
"""

from dataclasses import dataclass

from app.services.bulk_columns import (
    BOOLEAN,
    DYNAMIC_PREFIX,
    ENUM,
    FLOAT,
    INTEGER,
    ColumnSpec,
)

# Both masks the API can produce for a contact field (app/graphql/masking.py). Neither
# character can occur in a real phone number or address, which is what makes this reliable.
MASK_MARKERS = ("◯", "*")
_CONTACT_COLUMNS = ("contact_phone", "contact_name", "contact_email")

_TRUE = frozenset({"true", "1", "yes", "y", "是"})
_FALSE = frozenset({"false", "0", "no", "n", "否"})

LATITUDE_RANGE = (-90.0, 90.0)
LONGITUDE_RANGE = (-180.0, 180.0)


@dataclass(frozen=True)
class RowError:
    """One problem with one row, addressed the way the user sees the file."""

    line: int
    column: str
    message: str


def _line_of(index: int) -> int:
    """Spreadsheet line number for a zero-based data-row index (the header is line 1)."""
    return index + 2


def _to_integer(value: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"「{value}」不是整數") from exc


def _to_float(value: str) -> float:
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"「{value}」不是數字") from exc


def _to_boolean(value: str) -> bool:
    lowered = value.casefold()
    if lowered in _TRUE:
        return True
    if lowered in _FALSE:
        return False
    raise ValueError(f"「{value}」不是是/否值")


def _to_enum(value: str, options: tuple[str, ...]) -> str:
    if value not in options:
        raise ValueError(f"「{value}」不是允許的值；可用：{'、'.join(options)}")
    return value


def coerce(column: ColumnSpec, raw: str):
    """Convert one cell to its typed value, raising ValueError with a readable message."""
    value = (raw or "").strip()
    if not value:
        return None
    if column.data_type == INTEGER:
        return _to_integer(value)
    if column.data_type == FLOAT:
        return _to_float(value)
    if column.data_type == BOOLEAN:
        return _to_boolean(value)
    if column.data_type == ENUM:
        return _to_enum(value, column.enum_options or ())
    return value


def _check_masked_contact(row: dict[str, str], line: int) -> list[RowError]:
    """Refuse a row whose contact fields came back out of an export masked (ADR-109).

    Failing loudly beats the alternative: a masked phone never matches (ADR-107), so letting
    it through would quietly create a duplicate ticket and report success.
    """
    errors = []
    for column in _CONTACT_COLUMNS:
        value = (row.get(column) or "").strip()
        if value and any(marker in value for marker in MASK_MARKERS):
            errors.append(
                RowError(
                    line=line,
                    column=column,
                    message="這一欄是遮罩過的值——你沒有這筆資料的 PII 權限，不能匯回",
                )
            )
    return errors


def _check_coordinates(row: dict[str, str], line: int, *, is_update: bool) -> list[RowError]:
    """A new row needs a valid point; an existing one keeps the point it already has."""
    errors = []
    pairs = (("latitude", LATITUDE_RANGE), ("longitude", LONGITUDE_RANGE))
    for column, (low, high) in pairs:
        value = (row.get(column) or "").strip()
        if not value:
            if not is_update:
                errors.append(RowError(line=line, column=column, message="新增資料時必填"))
            continue
        try:
            number = float(value)
        except ValueError:
            errors.append(RowError(line=line, column=column, message=f"「{value}」不是座標數字"))
            continue
        if not low <= number <= high:
            errors.append(
                RowError(line=line, column=column, message=f"座標超出範圍（{low}~{high}）")
            )
    return errors


def validate_row(
    columns: tuple[ColumnSpec, ...],
    row: dict[str, str],
    *,
    index: int,
    is_update: bool,
) -> list[RowError]:
    """Return every problem with one row; an empty list means it is writable as-is."""
    line = _line_of(index)
    known = {column.header: column for column in columns}
    errors: list[RowError] = []

    errors += _check_masked_contact(row, line)
    errors += _check_coordinates(row, line, is_update=is_update)

    for header, raw in row.items():
        value = (raw or "").strip()
        column = known.get(header)

        if column is None:
            # ADR-117: a `prop.` header the config does not define is a real error, but only
            # when it actually carries a value — an empty stray column harms nothing. Fixed
            # headers we do not recognise are simply ignored, since a file may legitimately
            # carry extra notes columns.
            if value and header.startswith(DYNAMIC_PREFIX):
                errors.append(
                    RowError(line=line, column=header, message="這個動態欄位不在目前的欄位設定裡")
                )
            continue

        if header in ("latitude", "longitude"):
            continue  # already checked, including the create-time requirement

        if not value:
            if not is_update and column.required_on_create:
                errors.append(RowError(line=line, column=header, message="新增資料時必填"))
            continue

        try:
            coerce(column, value)
        except ValueError as exc:
            errors.append(RowError(line=line, column=header, message=str(exc)))

    return errors


def writable_values(
    columns: tuple[ColumnSpec, ...], row: dict[str, str], *, is_update: bool
) -> dict[str, object]:
    """Return the typed values this row may actually write, by column field name.

    Blank means "leave it alone" (ADR-121), so blanks never reach the caller — which is also
    why there is no way to clear a field through an import.
    """
    values: dict[str, object] = {}
    for column in columns:
        if is_update and not column.writable_on_update:
            continue
        if not is_update and not column.writable_on_create:
            continue
        raw = (row.get(column.header) or "").strip()
        if not raw:
            continue
        values[column.field] = coerce(column, raw)
    return values
