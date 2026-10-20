"""The AI 重複審核 queue (Spec 025): read the pair cards the dedup layers leave behind.

`ai_duplicate.view` reads cards and their events. It governs the dedup records only; the engine in
`app/dedup_engine/` never checks it. Submitting new work goes through `services/dedup_submission`,
which writes the cards this module reads.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import ENTITY_KINDS, PAIR_SOURCE_LAYERS, PAIR_STATUSES, DedupAuditEvent, DuplicatePair
from app.repositories.dedup_repository import dedup_audit_event_repository, duplicate_pair_repository
from app.services.authz import require_scope

# ADR-339: what still waits for a reviewer. `dup_ignored` is a submitter's "create anyway";
# `suggested` is for the slow layer, listed now so it needs no API change when it lands.
PENDING_STATUSES = ("dup_ignored", "suggested")
DEFAULT_LIMIT = 50
MAX_LIMIT = 200
DEFAULT_SORT = "-created_at"

_SORTS = {
    "created_at": (DuplicatePair.created_at.asc(),),
    "-created_at": (DuplicatePair.created_at.desc(),),
    # A card made by hand has no score; it goes last whichever way the scores run.
    "similarity": (DuplicatePair.similarity.asc().nulls_last(),),
    "-similarity": (DuplicatePair.similarity.desc().nulls_last(),),
}


class DuplicatePairNotFoundError(ValueError):
    """No live card has that uuid."""


@dataclass(frozen=True)
class EntitySummary:
    """One side of a card: the fields a reviewer compares (ADR-340).

    `title` is a task's name, a station's name or a ticket's title; `type` and `status` likewise
    come from whichever kind it is (a station's status is its operational status). `ticket_uuid`
    and `ticket_title` are set for tasks only. A deleted side carries its uuid and nothing else.
    """

    uuid: str
    deleted: bool = False
    title: str | None = None
    type: str | None = None
    status: str | None = None
    ticket_uuid: str | None = None
    ticket_title: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    created_by: str | None = None
    created_at: datetime | None = None


@dataclass(frozen=True)
class PairItem:
    """A card with both of its sides."""

    pair: DuplicatePair
    low: EntitySummary
    high: EntitySummary


@dataclass(frozen=True)
class PairPage:
    """One page of cards and how many match in all."""

    items: list[PairItem]
    total: int


@dataclass(frozen=True)
class PairDetail:
    """One card, its sides and every event recorded on it, oldest first."""

    item: PairItem
    events: list[DedupAuditEvent]


def _checked(values: Sequence[str] | None, allowed: Sequence[str], name: str) -> list[str] | None:
    if values is None:
        return None
    unknown = sorted(set(values) - set(allowed))
    if unknown:
        raise ValueError(f"Unknown {name}: {', '.join(unknown)}")
    return list(values)


def _checked_page(sort: str, skip: int, limit: int) -> None:
    if sort not in _SORTS:
        raise ValueError(f"Unknown sort: {sort}")
    if skip < 0:
        raise ValueError("skip must not be negative")
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")


async def list_pairs(
    db: AsyncSession,
    *,
    actor: User,
    statuses: Sequence[str] | None = None,
    entity_kinds: Sequence[str] | None = None,
    source_layers: Sequence[str] | None = None,
    sort: str = DEFAULT_SORT,
    skip: int = 0,
    limit: int = DEFAULT_LIMIT,
) -> PairPage:
    """Cards matching the filters, pending ones by default, newest first, with both sides."""
    await require_scope(actor, Perm.AI_DUP_VIEW, db)
    statuses = _checked(statuses, PAIR_STATUSES, "status") or list(PENDING_STATUSES)
    entity_kinds = _checked(entity_kinds, ENTITY_KINDS, "entity kind")
    source_layers = _checked(source_layers, PAIR_SOURCE_LAYERS, "source layer")
    _checked_page(sort, skip, limit)

    pairs, total = await duplicate_pair_repository.list_live(
        db,
        statuses=statuses,
        entity_kinds=entity_kinds,
        source_layers=source_layers,
        # The uuid breaks ties, so a page boundary never repeats or skips a card.
        order_by=(*_SORTS[sort], DuplicatePair.uuid),
        skip=skip,
        limit=limit,
    )
    return PairPage(items=await _with_sides(db, pairs), total=total)


async def get_pair(db: AsyncSession, *, actor: User, pair_uuid: uuid.UUID) -> PairDetail:
    """One live card with its sides and events."""
    await require_scope(actor, Perm.AI_DUP_VIEW, db)
    pair = await duplicate_pair_repository.get_live(db, pair_uuid)
    if pair is None:
        raise DuplicatePairNotFoundError("Duplicate pair not found")
    (item,) = await _with_sides(db, [pair])
    return PairDetail(item=item, events=await dedup_audit_event_repository.for_pair(db, pair.uuid))


async def _with_sides(db: AsyncSession, pairs: Sequence[DuplicatePair]) -> list[PairItem]:
    """Attach both sides, loading each entity kind once (ADR-340)."""
    wanted: dict[str, set] = {}
    for pair in pairs:
        wanted.setdefault(pair.entity_kind, set()).update((pair.low_uuid, pair.high_uuid))
    rows = {}
    for kind, uuids in wanted.items():
        found = await duplicate_pair_repository.entity_summaries(db, kind, uuids)
        rows.update({(kind, key): row for key, row in found.items()})
    return [
        PairItem(
            pair=pair,
            low=_summary(rows.get((pair.entity_kind, str(pair.low_uuid))), pair.low_uuid),
            high=_summary(rows.get((pair.entity_kind, str(pair.high_uuid))), pair.high_uuid),
        )
        for pair in pairs
    ]


def _summary(row: dict | None, entity_uuid) -> EntitySummary:
    if row is None:
        return EntitySummary(uuid=str(entity_uuid), deleted=True)
    return EntitySummary(
        uuid=str(row["uuid"]),
        title=row.get("title"),
        type=row.get("type"),
        status=row.get("status"),
        ticket_uuid=str(row["ticket_uuid"]) if row.get("ticket_uuid") else None,
        ticket_title=row.get("ticket_title"),
        longitude=row.get("longitude"),
        latitude=row.get("latitude"),
        created_by=str(row["created_by"]) if row.get("created_by") else None,
        created_at=row.get("created_at"),
    )

