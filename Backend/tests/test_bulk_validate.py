"""Per-row validation for bulk import (feature 015, ADR-117/121/123)."""

import os

os.environ["ENV"] = "testing"

import pytest

from app.graphql.masking import mask_phone
from app.services.bulk_columns import (
    BOOLEAN,
    DYNAMIC_PREFIX,
    ENUM,
    INTEGER,
    ColumnSpec,
)
from app.services.bulk_validate import validate_row, writable_values

COLUMNS = (
    ColumnSpec(header="uuid", field="uuid", writable_on_create=False, writable_on_update=False),
    ColumnSpec(header="name", field="name", required_on_create=True, writable_on_update=False),
    ColumnSpec(header="comment", field="comment"),
    ColumnSpec(header="latitude", field="latitude", data_type="Float", required_on_create=True),
    ColumnSpec(header="longitude", field="longitude", data_type="Float", required_on_create=True),
    ColumnSpec(header="contact_phone", field="contact_phone", writable_on_update=False),
    ColumnSpec(
        header="visibility", field="visibility", data_type=ENUM,
        enum_options=("public", "restricted", "internal"),
    ),
    ColumnSpec(
        header=f"{DYNAMIC_PREFIX}capacity_total", field="capacity_total",
        data_type=INTEGER, is_dynamic=True,
    ),
    ColumnSpec(
        header=f"{DYNAMIC_PREFIX}pet_friendly", field="pet_friendly",
        data_type=BOOLEAN, is_dynamic=True,
    ),
)

VALID = {
    "uuid": "", "name": "光復國小", "comment": "", "latitude": "25.0", "longitude": "121.5",
    "contact_phone": "0912345678", "visibility": "public",
    f"{DYNAMIC_PREFIX}capacity_total": "120", f"{DYNAMIC_PREFIX}pet_friendly": "true",
}


def _errors(row, *, is_update=False, index=0):
    return validate_row(COLUMNS, row, index=index, is_update=is_update)


def _columns_with_errors(row, **kwargs):
    return {error.column for error in _errors(row, **kwargs)}


# --- clean rows ---


def test_a_complete_row_has_no_errors():
    """A well-formed create row passes cleanly."""
    assert _errors(VALID) == []


def test_an_update_row_may_leave_everything_blank():
    """Blank means "leave it alone" (ADR-121), so a sparse update file is legitimate."""
    row = dict.fromkeys(VALID, "")
    row["name"] = "光復國小"

    assert _errors(row, is_update=True) == []


# --- types (ADR-117) ---


def test_a_non_numeric_dynamic_value_names_its_own_column():
    """The message has to point at the column, not just say "invalid row"."""
    errors = _errors({**VALID, f"{DYNAMIC_PREFIX}capacity_total": "abc"})

    assert [e.column for e in errors] == [f"{DYNAMIC_PREFIX}capacity_total"]
    assert "整數" in errors[0].message


def test_a_decimal_is_not_an_integer():
    """An Integer field must reject 1.5, not silently truncate it."""
    assert f"{DYNAMIC_PREFIX}capacity_total" in _columns_with_errors(
        {**VALID, f"{DYNAMIC_PREFIX}capacity_total": "1.5"}
    )


def test_a_value_outside_the_enum_options_lists_what_is_allowed():
    """The message has to say what the user may type instead."""
    errors = _errors({**VALID, "visibility": "everyone"})

    assert "public" in errors[0].message


def test_a_boolean_accepts_the_forms_a_spreadsheet_produces():
    """Excel and hand-typed files both produce several spellings of yes/no."""
    for value in ("true", "TRUE", "1", "no", "否"):
        assert _errors({**VALID, f"{DYNAMIC_PREFIX}pet_friendly": value}) == []


def test_a_dynamic_column_the_config_does_not_define_fails_the_row():
    """ADR-117 overrides ADR-092 on this path only."""
    errors = _errors({**VALID, f"{DYNAMIC_PREFIX}unknown_field": "7"})

    assert [e.column for e in errors] == [f"{DYNAMIC_PREFIX}unknown_field"]


def test_an_unknown_dynamic_column_left_empty_harms_nothing():
    """A stray empty column is not worth failing a row over."""
    assert _errors({**VALID, f"{DYNAMIC_PREFIX}unknown_field": ""}) == []


def test_an_unknown_fixed_column_is_ignored():
    """A file may carry the operator's own notes column; that is not an error."""
    assert _errors({**VALID, "internal_note": "call first"}) == []


# --- required (ADR-123) ---


def test_creating_without_coordinates_fails_both_columns():
    """A new row needs a point, and both halves are named so the fix is obvious (ADR-123)."""
    errors = _columns_with_errors({**VALID, "latitude": "", "longitude": ""})

    assert errors == {"latitude", "longitude"}


def test_updating_without_coordinates_keeps_the_existing_point():
    """Blank coordinates on an update mean keep the point it already has."""
    assert _errors({**VALID, "latitude": "", "longitude": ""}, is_update=True) == []


def test_a_coordinate_outside_the_world_is_refused():
    """A latitude of 999 is a typo, not a location."""
    assert "latitude" in _columns_with_errors({**VALID, "latitude": "999"})


def test_creating_without_a_required_name_fails():
    """The station name is the match key; a new row cannot omit it."""
    assert "name" in _columns_with_errors({**VALID, "name": ""})


# --- masked PII (ADR-109) ---


def test_a_masked_phone_is_refused_with_a_reason_about_permission():
    """A masked value never matches, so letting it through would create a silent duplicate."""
    errors = _errors({**VALID, "contact_phone": mask_phone("0912345678")})

    assert [e.column for e in errors] == ["contact_phone"]
    assert "PII" in errors[0].message


def test_a_masked_name_is_refused_too():
    """The mask glyph cannot occur in a real name, so it is a reliable signal."""
    assert "contact_name" in _columns_with_errors({**VALID, "contact_name": "王◯◯"})


# --- addressing ---


def test_errors_are_numbered_as_the_spreadsheet_shows_them():
    """The header is line 1, so the first data row is line 2."""
    assert _errors({**VALID, "name": ""}, index=0)[0].line == 2
    assert _errors({**VALID, "name": ""}, index=5)[0].line == 7


def test_every_problem_in_a_row_comes_back_at_once():
    """One fix per re-upload would make a broken file take all afternoon (ADR-112)."""
    row = {**VALID, "latitude": "", "longitude": "", f"{DYNAMIC_PREFIX}capacity_total": "abc"}

    assert len(_errors(row)) == 3


# --- writable values ---


def test_blank_cells_never_reach_the_writer():
    """This is what makes blank mean "leave alone" rather than "clear" (ADR-121)."""
    values = writable_values(COLUMNS, {**VALID, "comment": ""}, is_update=True)

    assert "comment" not in values


def test_match_key_and_read_only_columns_are_dropped_on_update():
    """Writing a match key back is a guaranteed no-op, so it never reaches the service (ADR-108)."""
    values = writable_values(COLUMNS, VALID, is_update=True)

    assert "name" not in values
    assert "contact_phone" not in values
    assert "uuid" not in values
    assert values["visibility"] == "public"


def test_values_come_back_typed_not_as_text():
    """The writer receives ints and bools, not the strings the file carried."""
    values = writable_values(COLUMNS, VALID, is_update=False)

    assert values["capacity_total"] == 120
    assert values["pet_friendly"] is True
    assert values["latitude"] == pytest.approx(25.0)
