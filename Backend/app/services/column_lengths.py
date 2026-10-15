"""Refuse a value longer than its column before the database does.

Past a `varchar(n)`'s width the driver raises, and the schema's `MaskErrors` turns that into an
opaque "Unexpected error." (graphql/schema.py). Checked here first, the caller hears which field
was too long and by how much it may run.
"""


def check_lengths(model, **fields) -> None:
    """Refuse a value longer than its column, which the database would reject as a server fault."""
    for name, value in fields.items():
        limit = getattr(model.__table__.c[name].type, "length", None)
        if limit and isinstance(value, str) and len(value) > limit:
            raise ValueError(f"{name} must be at most {limit} characters")
