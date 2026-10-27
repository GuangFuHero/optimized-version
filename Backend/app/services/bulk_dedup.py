"""The fast dedup layer for bulk import (ADR-398).

An import asks the engine about every row it would create, the whole file before anything is
written: a commit then compares against the same database its preview did, and no row is held
because an earlier row of the same file was just created. Rows are only compared with what is
already in the database, never with each other.

Each submission is one row (a new station, or a task added to a ticket already there) or one
new ticket with the rows that file its tasks. A row's decision, `acknowledged_duplicate_of`,
means what it means on `createTicket`: the importer saw the suspect and files the row anyway.
"""

import math
import uuid as _uuid
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import (
    GeoPoint,
    NewStation,
    NewTask,
    NewTicket,
    Submission,
    Suspect,
    kind_of_ref,
)
from app.models.auth import User
from app.repositories.dedup_repository import duplicate_pair_repository
from app.services import dedup as dedup_service

_EARTH_RADIUS_M = 6_371_008.8


@dataclass(frozen=True)
class RowDraft:
    """One submission to the engine, and the file line each of its drafts came from."""

    submission: Submission
    lines: Mapping[str, int]


@dataclass(frozen=True)
class Comparison:
    """What the engine said about one file's rows, by line.

    `suspects` are the rows held unless the importer files them anyway; `pairs` are the
    acknowledgements that named something real, to be carded when their row is created.
    `complete` is False when a row to create went uncompared.
    """

    suspects: Mapping[int, Suspect]
    pairs: Mapping[int, dedup_service.AcknowledgedPair]
    complete: bool


@dataclass(frozen=True)
class SuspectedRow:
    """A row that looks like something already there, with what the importer is shown of it.

    For a task, `title` is its ticket's; for a station, its name. No similarity: what the number
    means changes with the engine's version. No contact details.
    """

    line: int
    related_kind: str
    related_uuid: str
    related_ticket_uuid: str | None
    title: str | None
    task_name: str | None
    type: str | None
    status: str | None
    distance_m: int | None
    created_at: datetime | None


async def compare(
    db: AsyncSession,
    *,
    actor: User,
    drafts: list[RowDraft] | None,
    decisions: Mapping[int, str],
    now: datetime,
) -> Comparison:
    """Score each acknowledged row, then ask the engine about every submission. Writes nothing.

    `drafts` is None when rows to create could not be put to the engine at all. Must run before
    the import writes anything: every engine call is guarded on that (`dedup._guarded`).
    """
    if drafts is None:
        return Comparison(suspects={}, pairs={}, complete=False)
    suspects: dict[int, Suspect] = {}
    pairs: dict[int, dedup_service.AcknowledgedPair] = {}
    complete = True
    for draft in drafts:
        acknowledged = set()
        for draft_ref, line in draft.lines.items():
            related = decisions.get(line)
            if not related:
                continue
            pair = await dedup_service.score_acknowledged(
                db,
                submission=draft.submission,
                draft_ref=draft_ref,
                related_kind=kind_of_ref(draft_ref),
                related_uuid=related,
                actor=actor,
                now=now,
            )
            if pair is not None:
                pairs[line] = pair
                acknowledged.add(draft_ref)
        found = await dedup_service.try_check_submission(
            db, submission=draft.submission, acknowledged=frozenset(acknowledged), actor=actor, now=now
        )
        if found is None:
            complete = False
            continue
        for suspect in found:
            if suspect.draft_ref in draft.lines:
                suspects[draft.lines[suspect.draft_ref]] = suspect
    return Comparison(suspects=suspects, pairs=pairs, complete=complete)


async def describe(
    db: AsyncSession, comparison: Comparison, drafts: list[RowDraft] | None
) -> tuple[SuspectedRow, ...]:
    """Each suspected row with a summary of what it looks like, in line order.

    One query per kind, as the review queue reads its cards (ADR-340).
    """
    if not comparison.suspects:
        return ()
    related = defaultdict(set)
    for suspect in comparison.suspects.values():
        related[suspect.related_kind].add(_canonical(suspect.related_uuid))
    summaries: dict[str, dict] = {}
    for kind, uuids in related.items():
        summaries |= await duplicate_pair_repository.entity_summaries(db, kind, uuids)
    where = await _locations(db, drafts or [])

    rows = []
    for line in sorted(comparison.suspects):
        suspect = comparison.suspects[line]
        summary = summaries.get(_canonical(suspect.related_uuid), {})
        is_task = suspect.related_kind == "ticket_task"
        at = where.get(line)
        rows.append(
            SuspectedRow(
                line=line,
                related_kind=suspect.related_kind,
                related_uuid=suspect.related_uuid,
                related_ticket_uuid=suspect.related_ticket_uuid,
                title=summary.get("ticket_title" if is_task else "title"),
                task_name=summary.get("title") if is_task else None,
                type=summary.get("type"),
                status=summary.get("status"),
                distance_m=(
                    _metres_between(at, summary["longitude"], summary["latitude"])
                    if at is not None and summary
                    else None
                ),
                created_at=summary.get("created_at"),
            )
        )
    return tuple(rows)


async def _locations(db: AsyncSession, drafts: list[RowDraft]) -> dict[int, GeoPoint]:
    """Where each line's submission is. A task added to a ticket is at that ticket."""
    where: dict[int, GeoPoint] = {}
    added: dict[int, str] = {}
    for draft in drafts:
        submission = draft.submission
        for line in draft.lines.values():
            if isinstance(submission, NewStation):
                where[line] = submission.station.location
            elif isinstance(submission, NewTicket):
                where[line] = submission.ticket.location
            elif isinstance(submission, NewTask):
                added[line] = _canonical(submission.ticket_uuid)
    if added:
        tickets = await duplicate_pair_repository.entity_summaries(db, "ticket", set(added.values()))
        for line, ticket_uuid in added.items():
            if ticket_uuid in tickets:
                where[line] = GeoPoint(tickets[ticket_uuid]["longitude"], tickets[ticket_uuid]["latitude"])
    return where


def _metres_between(at: GeoPoint, lon: float, lat: float) -> int:
    """Great-circle distance, to the metre."""
    phi1, phi2 = math.radians(at.lat), math.radians(lat)
    half_chord = (
        math.sin((phi2 - phi1) / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon - at.lon) / 2) ** 2
    )
    return round(2 * _EARTH_RADIUS_M * math.asin(math.sqrt(half_chord)))


def _canonical(uuid: str) -> str:
    """A uuid as Postgres prints it, which is how the summaries are keyed."""
    try:
        return str(_uuid.UUID(str(uuid)))
    except ValueError:
        return str(uuid)
