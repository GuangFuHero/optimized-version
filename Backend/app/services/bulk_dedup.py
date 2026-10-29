"""The fast dedup layer for bulk import (ADR-398).

An import asks the engine about every row it would create, the whole file before anything is
written: a commit then compares against the same database its preview did, and no row is held
because an earlier row of the same file was just created. Rows are only compared with what is
already in the database, never with each other.

Each submission is one row (a new station, or a task added to a ticket already there) or one
new ticket with the rows that file its tasks. A row's decision, `acknowledged_duplicate_of`,
means what it means on `createTicket`: the importer saw the suspect and files the row anyway,
which counts only when it names that suspect (ADR-400).
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
    task_ref,
)
from app.models.auth import User
from app.repositories.dedup_repository import duplicate_pair_repository
from app.services import dedup as dedup_service

_EARTH_RADIUS_M = 6_371_008.8


@dataclass(frozen=True)
class RowDraft:
    """One submission to the engine, and the file line each of its drafts came from.

    For a ticket the file creates, `first_line` is the line that creates it and `followers` the
    lines after it, which attach to it: held, it holds them too (ADR-211).
    """

    submission: Submission
    lines: Mapping[str, int]
    first_line: int | None = None
    followers: tuple[int, ...] = ()


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

    `row_title` and `row_task_name` are the row's own, so it can be set beside the one it looks
    like without reading the file again: a station's name, or a task's name under its ticket's
    title. For a task, `title` is its ticket's; for a station, its name. No similarity: what the
    number means changes with the engine's version. No contact details. `followers` are the lines
    held with it, when it is the line that creates a new ticket.
    """

    line: int
    row_title: str | None
    row_task_name: str | None
    related_kind: str
    related_uuid: str
    related_ticket_uuid: str | None
    title: str | None
    task_name: str | None
    type: str | None
    status: str | None
    distance_m: int | None
    created_at: datetime | None
    followers: tuple[int, ...] = ()


async def compare(
    db: AsyncSession,
    *,
    actor: User,
    drafts: list[RowDraft] | None,
    decisions: Mapping[int, str],
    now: datetime,
) -> Comparison:
    """Ask the engine about every submission once, and settle each row's decision. Writes nothing.

    A decision files its row anyway only when it names the suspect the engine finds for that
    line now (ADR-400); otherwise the row is held like any other. After the engine first fails,
    it is not asked about the rest of the file: each call may wait out `ENGINE_TIMEOUT_S`, and the
    rows land fail-open either way, decisions carded unscored as for a single create.

    `drafts` is None when rows to create could not be put to the engine at all. Must run before
    the import writes anything: every engine call is guarded on that (`dedup._guarded`).
    """
    if drafts is None:
        return Comparison(suspects={}, pairs={}, complete=False)
    suspects: dict[int, Suspect] = {}
    pairs: dict[int, dedup_service.AcknowledgedPair] = {}
    complete = True
    for draft in drafts:
        named = dedup_service.acknowledged_uuids(
            {draft_ref: decisions.get(line) for draft_ref, line in draft.lines.items()}
        )
        found = None
        if complete:
            found = await dedup_service.try_check_submission(
                db, submission=draft.submission, acknowledged=frozenset(), actor=actor, now=now
            )
        if found is None:
            complete = False
            borne, found = await dedup_service.unchecked_pairs(db, named), []
        else:
            borne = dedup_service.borne_out(found, named)
        for pair in borne:
            pairs[draft.lines[pair.draft_ref]] = pair
        filed = {pair.draft_ref for pair in borne}
        for suspect in found:
            if suspect.draft_ref in draft.lines and suspect.draft_ref not in filed:
                suspects[draft.lines[suspect.draft_ref]] = suspect
    return Comparison(suspects=suspects, pairs=pairs, complete=complete)


def held_with(comparison: Comparison, drafts: list[RowDraft] | None) -> dict[int, int]:
    """The lines held because the line creating their ticket is: each, and that first line."""
    return {
        line: draft.first_line
        for draft in drafts or []
        if draft.first_line in comparison.suspects
        for line in draft.followers
    }


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
    own = await _lines(db, drafts or [])
    followers = {draft.first_line: draft.followers for draft in drafts or [] if draft.first_line is not None}

    rows = []
    for line in sorted(comparison.suspects):
        suspect = comparison.suspects[line]
        summary = summaries.get(_canonical(suspect.related_uuid), {})
        is_task = suspect.related_kind == "ticket_task"
        row = own.get(line, _Line())
        at = row.at
        rows.append(
            SuspectedRow(
                line=line,
                row_title=row.title,
                row_task_name=row.task_name,
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
                followers=followers.get(line, ()),
            )
        )
    return tuple(rows)


@dataclass(frozen=True)
class _Line:
    """What one line of the file submits: where it is, and the names the file gives it."""

    at: GeoPoint | None = None
    title: str | None = None
    task_name: str | None = None


async def _lines(db: AsyncSession, drafts: list[RowDraft]) -> dict[int, _Line]:
    """Each line's submission. A task added to a ticket is at that ticket, under its title."""
    lines: dict[int, _Line] = {}
    added: dict[int, tuple[str, str]] = {}
    for draft in drafts:
        submission = draft.submission
        if isinstance(submission, NewTicket):
            task_names = {task_ref(i): task.task_name for i, task in enumerate(submission.tasks)}
        for draft_ref, line in draft.lines.items():
            if isinstance(submission, NewStation):
                lines[line] = _Line(submission.station.location, submission.station.name)
            elif isinstance(submission, NewTicket):
                ticket = submission.ticket
                lines[line] = _Line(ticket.location, ticket.title, task_names.get(draft_ref))
            elif isinstance(submission, NewTask):
                added[line] = (_canonical(submission.ticket_uuid), submission.task.task_name)
    if added:
        uuids = {ticket_uuid for ticket_uuid, _ in added.values()}
        tickets = await duplicate_pair_repository.entity_summaries(db, "ticket", uuids)
        for line, (ticket_uuid, task_name) in added.items():
            ticket = tickets.get(ticket_uuid)
            at = GeoPoint(ticket["longitude"], ticket["latitude"]) if ticket else None
            lines[line] = _Line(at, ticket["title"] if ticket else None, task_name)
    return lines


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
