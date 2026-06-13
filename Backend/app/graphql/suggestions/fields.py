"""Code-derived schema of which station/property fields users may suggest changes to.

The frontend reads this (via the ``suggestableFields`` query) to render the right input
widget per field. The same schema validates ``new_value`` on create and coerces it to the
column's Python type on approval, so validation and application can never drift apart.
"""

# Each entry: (field_name, data_type, enum_options). data_type ∈ {"string","integer","enum"}.
# enum_options is None unless data_type == "enum".
SUGGESTABLE_FIELDS: dict[str, list[tuple[str, str, list[str] | None]]] = {
    "station": [
        ("type", "string", None),
        ("name", "string", None),
        ("description", "string", None),
        ("op_hour", "string", None),
        ("level", "integer", None),
        ("comment", "string", None),
        ("visibility", "enum", ["public", "restricted", "internal"]),
    ],
    "station_property": [
        ("property_name", "string", None),
        ("quantity", "integer", None),
        ("comment", "string", None),
    ],
}

VALID_TARGET_TYPES = tuple(SUGGESTABLE_FIELDS.keys())


def get_field_spec(target_type: str, field_name: str) -> tuple[str, str, list[str] | None]:
    """Return the (name, data_type, enum_options) spec for a target field.

    Raises ValueError if the target_type is unknown or the field is not suggestable.
    """
    if target_type not in SUGGESTABLE_FIELDS:
        raise ValueError(f"Unknown target_type '{target_type}'")
    for spec in SUGGESTABLE_FIELDS[target_type]:
        if spec[0] == field_name:
            return spec
    raise ValueError(f"Field '{field_name}' is not suggestable for {target_type}")


def coerce_and_validate(target_type: str, field_name: str, raw: str) -> str | int:
    """Validate a raw string value against the field's data type and coerce it.

    Returns the value typed for the target column (int for integer fields, str otherwise).
    Raises ValueError on a bad field, non-integer integer, or out-of-set enum value.
    """
    _, data_type, enum_options = get_field_spec(target_type, field_name)
    if data_type == "integer":
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"'{field_name}' expects an integer, got '{raw}'") from None
    if data_type == "enum":
        if raw not in (enum_options or []):
            raise ValueError(f"'{raw}' is not a valid value for '{field_name}'")
        return raw
    return raw
