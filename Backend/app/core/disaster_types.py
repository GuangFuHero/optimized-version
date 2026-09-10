"""Disaster-type label handling (feature 013 ADR-090/091, closed by feature 018 ADR-244).

A disaster type is matched by exact string equality on both sides — a config row says which
types enable a field, a ticket says which types it is, `project_settings` says which types this
deployment is running. A mismatch silently hides fields rather than raising, so the labels have
to agree exactly. The convention is lower-case English (`flood`, `landslide`).

Feature 013 left the vocabulary deliberately open, because the real set came from PM's spec
rather than this repository, and predicted that "when that vocabulary lands, a `DisasterType`
enum belongs in this module and the callers below become validation instead of coercion".

Half of that came true. The vocabulary landed — 水災 · 土石流 · 疫情 · 核／輻射 · 火災 · 地震 —
and the callers do now validate. But it is **not** an enum: operators have to be able to add a
type through GraphQL when a disaster nobody planned for arrives, and an enum would need a
deploy. The vocabulary lives in the `disaster_types` table; this module is the thing that
checks against it. See `app/models/disaster_type.py`.

`normalize_disaster_types` stays pure and synchronous — it is called from repository code that
already holds a session, and threading a DB round-trip through it would make every caller
async for a lookup most of them can do once. `validate_disaster_types` is the async half.
"""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.disaster_type import DisasterType


def normalize_disaster_types(values: Iterable[str]) -> list[str]:
    """Trim, lower-case, de-duplicate and **sort** disaster labels, dropping blanks.

    An empty result is meaningful, not missing data. On a config row it means "enabled for
    every disaster type"; on `project_settings` it means "deployment unconfigured, filter
    nothing"; on a ticket it means the reporter did not say, which shows only the universal
    fields.

    Sorting was added by ADR-246 and is load-bearing rather than cosmetic:
    `ticket_analytics._duplicate_pair_condition` decides whether two tickets are duplicates by
    comparing their `disaster_types` arrays with `==`, and PostgreSQL array equality is
    order-sensitive. Without a canonical order, `{flood,fire}` and `{fire,flood}` would read as
    two different disasters and the duplicate would go unflagged.
    """
    normalized = {value.strip().lower() for value in values}
    return sorted(label for label in normalized if label)


async def validate_disaster_types(db: AsyncSession, values: Iterable[str]) -> list[str]:
    """Normalize, then reject any label that is not an active `disaster_types.key`.

    Raises `ValueError` — allow-listed by the `MaskErrors` extension in
    `app/graphql/schema.py`, so the caller is told which label was wrong instead of getting
    "Unexpected error."

    Inactive types are refused for *writes* while staying readable, which is what `is_active`
    is for: a type retired mid-response must not silently vanish from the tickets already
    filed under it, but nothing new should be filed under it either.
    """
    labels = normalize_disaster_types(values)
    if not labels:
        return labels
    result = await db.execute(
        select(DisasterType.key).where(
            DisasterType.key.in_(labels), DisasterType.is_active.is_(True)
        )
    )
    known = set(result.scalars().all())
    unknown = [label for label in labels if label not in known]
    if unknown:
        raise ValueError(
            f"未知或已停用的災害型別：{', '.join(unknown)}。"
            f"請先於災害型別設定新增，或改用既有的代碼。"
        )
    return labels
