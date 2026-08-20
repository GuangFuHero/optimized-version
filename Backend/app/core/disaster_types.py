"""Disaster-type label handling for feature 013 (ADR-090/091).

A disaster type is matched by exact string equality on both sides — the config row says
which types enable a field, `project_settings` says which types this deployment is running.
A mismatch silently hides fields rather than raising, so the labels have to agree exactly.

The convention is **lower-case English** (`flood`, `landslide`), matching what the codebase
already does informally: `seed_mock_scenarios.sql:640` writes `disaster_type='flood'` and
the ticket GraphQL descriptions give `'earthquake'`, `'flood'` as examples.

There is deliberately NO closed vocabulary here yet. The set of real disaster types is the
same content `Spec/013-project-settings-activity/spec.md:28` puts out of scope — it comes
from PM-Scure's "三種災難情境下的動態欄位", not from this repository. Inventing an enum here
would guess at names that document already owns. When that vocabulary lands, a `DisasterType`
enum belongs in this module and the callers below become validation instead of coercion.

Normalizing on write is sufficient: both `disaster_types` columns are created by migration
07ac630e0009, so no pre-existing mixed-case rows can exist.
"""

from collections.abc import Iterable


def normalize_disaster_types(values: Iterable[str]) -> list[str]:
    """Trim and lower-case disaster labels, dropping blanks and duplicates, keeping order.

    An empty result is meaningful, not missing data: on a config row it means "enabled for
    every disaster type", and on the settings row it means "deployment unconfigured, filter
    nothing".
    """
    normalized: dict[str, None] = {}
    for value in values:
        label = value.strip().lower()
        if label:
            normalized[label] = None
    return list(normalized)
