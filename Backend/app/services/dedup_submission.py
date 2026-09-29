"""Two-phase create for the interactive GraphQL path (Spec 020 §5, ADR-296/299).

First submission: validate, then ask the dedup engine. A match returns `Suspected` and creates
nothing — the submitter decides. No match creates as usual.

Acknowledged submission (`acknowledged_duplicate_of` set): validate, create without checking
again (so the submitter is never shown a second hint), and card the pair — all in one commit.

Batch import does not come through here; it calls `create_ticket` / `create_station` directly.

`submit_new_ticket` / `submit_new_task` / `submit_new_station` are the ADR-304 versions: the
engine is asked about the whole submission, and a single suspect anywhere holds all of it.
`submit_ticket` / `submit_station` are Phase 1's, kept until GraphQL switches (plan Task 22/23).
"""

from dataclasses import dataclass, replace
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import NewStation, NewTask, NewTicket, Suspect, kind_of_ref, task_ref
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.repositories.tickets_repository import ticket_repository
from app.services import dedup as dedup_service
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.dedup_snapshot import (
    station_draft,
    station_submission,
    task_draft,
    ticket_draft,
    ticket_submission,
)


@dataclass(frozen=True)
class Created:
    """The entity was created."""

    entity: Tickets | Station


@dataclass(frozen=True)
class Suspected:
    """Nothing was created: `related_uuid` looks like the same thing."""

    related_uuid: str


async def submit_ticket(
    db: AsyncSession,
    *,
    actor: User,
    acknowledged_duplicate_of: str | None,
    geometry: dict,
    title: str,
    description: str | None,
    contact_name: str,
    contact_email: str | None,
    contact_phone: str | None,
    priority: str,
    task_type: str | None,
    visibility: str,
    disaster_types: list[str] | None = None,
    person_trapped_reported: str | None = None,
    immediate_danger_reported: str | None = None,
    secondary_location: dict | None = None,
) -> Created | Suspected:
    """Create a ticket, or return the open ticket it seems to duplicate."""
    now = datetime.now(UTC)
    fields = await ticket_service.validate_ticket(
        db,
        actor=actor,
        geometry=geometry,
        title=title,
        description=description,
        contact_name=contact_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
        priority=priority,
        task_type=task_type,
        visibility=visibility,
        disaster_types=disaster_types,
        person_trapped_reported=person_trapped_reported,
        immediate_danger_reported=immediate_danger_reported,
        secondary_location=secondary_location,
    )
    actor_uuid = str(actor.uuid)
    submission = ticket_submission(fields, now=now)
    phone = fields.values.get("contact_phone")

    if acknowledged_duplicate_of is None:
        match = await dedup_service.find_match(
            db, kind="ticket", submission=submission, submission_phone=phone, actor=actor, now=now
        )
        if match is not None:
            await dedup_service.record_hint_shown(db, kind="ticket", match=match, actor_uuid=actor_uuid)
            await db.commit()
            return Suspected(related_uuid=match.candidate_uuid)

    ticket = await ticket_service.insert_ticket(db, actor=actor, fields=fields)
    if acknowledged_duplicate_of is not None:
        # The new row's created_at is a server default and unloaded after the flush; the
        # snapshot keeps the request time instead of reading it back.
        created = replace(submission, uuid=str(ticket.uuid), status="pending")
        await dedup_service.record_acknowledged(
            db,
            kind="ticket",
            created=created,
            submission_phone=phone,
            acknowledged_uuid=acknowledged_duplicate_of,
            actor_uuid=actor_uuid,
            now=now,
        )
    await db.commit()
    await db.refresh(ticket)
    return Created(entity=ticket)


async def submit_station(
    db: AsyncSession,
    *,
    actor: User,
    acknowledged_duplicate_of: str | None,
    geometry: dict,
    type: str | None,
    name: str | None,
    description: str | None,
    op_hour: str | None,
    level: int,
    comment: str | None,
    source: str,
    visibility: str,
    contact_name: str | None = None,
    contact_email: str | None = None,
    contact_phone: str | None = None,
    operational_status: str = "active",
    secondary_location: dict | None = None,
) -> Created | Suspected:
    """Register a station, or return the serving station it seems to duplicate."""
    now = datetime.now(UTC)
    fields = await station_service.validate_station(
        db,
        actor=actor,
        geometry=geometry,
        type=type,
        name=name,
        description=description,
        op_hour=op_hour,
        level=level,
        comment=comment,
        source=source,
        visibility=visibility,
        contact_name=contact_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
        operational_status=operational_status,
        secondary_location=secondary_location,
    )
    actor_uuid = str(actor.uuid)
    submission = station_submission(fields, now=now)
    phone = fields.values.get("contact_phone")

    if acknowledged_duplicate_of is None:
        match = await dedup_service.find_match(
            db, kind="station", submission=submission, submission_phone=phone, actor=actor, now=now
        )
        if match is not None:
            await dedup_service.record_hint_shown(db, kind="station", match=match, actor_uuid=actor_uuid)
            await db.commit()
            return Suspected(related_uuid=match.candidate_uuid)

    station = await station_service.insert_station(db, actor=actor, fields=fields)
    if acknowledged_duplicate_of is not None:
        created = replace(submission, uuid=str(station.uuid))
        await dedup_service.record_acknowledged(
            db,
            kind="station",
            created=created,
            submission_phone=phone,
            acknowledged_uuid=acknowledged_duplicate_of,
            actor_uuid=actor_uuid,
            now=now,
        )
    await db.commit()
    await db.refresh(station)
    await station_service.announce_station_created(db, station=station, actor_uuid=actor_uuid)
    return Created(entity=station)


# --- ADR-304 ------------------------------------------------------------------------------


@dataclass(frozen=True)
class TaskSubmission:
    """One task as the create input carries it, with its own acknowledgement (ADR-301)."""

    task_type: str
    task_name: str
    task_description: str | None = None
    quantity: int | None = None
    source: str = "user"
    visibility: str = "public"
    route_uuid: str | None = None
    acknowledged_duplicate_of: str | None = None


@dataclass(frozen=True)
class SubmissionCreated:
    """Everything was created: the entity and, for a ticket, its tasks in draft order."""

    entity: Tickets | Station | TicketTask
    tasks: tuple[TicketTask, ...] = ()


@dataclass(frozen=True)
class SubmissionHeld:
    """Nothing was created: these parts look like something already there."""

    suspects: tuple[Suspect, ...]


async def submit_new_ticket(
    db: AsyncSession,
    *,
    actor: User,
    tasks: list[TaskSubmission],
    acknowledged_duplicate_of: str | None = None,
    **ticket_fields,
) -> SubmissionCreated | SubmissionHeld:
    """Create a ticket with its tasks, or hold all of it when any part looks like a duplicate (§5.1).

    `ticket_fields` are `create_ticket`'s keyword arguments. Each task carries its own
    acknowledgement, so reordering or dropping drafts between the two submissions keeps every
    acknowledgement on the right task.
    """
    now = datetime.now(UTC)
    fields = await ticket_service.validate_ticket(db, actor=actor, **ticket_fields)
    task_fields = [
        await ticket_service.validate_ticket_task(db, actor=actor, **_task_kwargs(t)) for t in tasks
    ]
    actor_uuid = str(actor.uuid)
    submission = NewTicket(ticket=ticket_draft(fields), tasks=tuple(task_draft(f) for f in task_fields))
    acknowledged = {"ticket": acknowledged_duplicate_of} | {
        task_ref(i): t.acknowledged_duplicate_of for i, t in enumerate(tasks)
    }

    held = await _hold_if_suspected(
        db, submission=submission, acknowledged=acknowledged, actor=actor, now=now
    )
    if held is not None:
        return held

    ticket = await ticket_service.insert_ticket(db, actor=actor, fields=fields)
    created_tasks = [
        await ticket_service.insert_ticket_task(db, actor=actor, ticket_uuid=str(ticket.uuid), fields=f)
        for f in task_fields
    ]
    created = {"ticket": str(ticket.uuid)} | {task_ref(i): str(t.uuid) for i, t in enumerate(created_tasks)}
    await _record_acknowledged(db, submission, acknowledged, created, actor_uuid, now)
    await db.commit()
    await db.refresh(ticket)
    for task in created_tasks:
        await db.refresh(task)
    return SubmissionCreated(entity=ticket, tasks=tuple(created_tasks))


async def submit_new_task(
    db: AsyncSession, *, actor: User, ticket_uuid: str, task: TaskSubmission
) -> SubmissionCreated | SubmissionHeld:
    """Add a task to an existing ticket, or hold it when it looks like a duplicate (§5.2)."""
    now = datetime.now(UTC)
    fields = await ticket_service.validate_ticket_task(db, actor=actor, **_task_kwargs(task))
    if not await ticket_repository.get_by_uuid_active(db, ticket_uuid):
        raise ValueError("Ticket not found")
    actor_uuid = str(actor.uuid)
    submission = NewTask(ticket_uuid=ticket_uuid, task=task_draft(fields))
    acknowledged = {task_ref(0): task.acknowledged_duplicate_of}

    held = await _hold_if_suspected(
        db, submission=submission, acknowledged=acknowledged, actor=actor, now=now
    )
    if held is not None:
        return held

    created_task = await ticket_service.insert_ticket_task(
        db, actor=actor, ticket_uuid=ticket_uuid, fields=fields
    )
    await _record_acknowledged(
        db, submission, acknowledged, {task_ref(0): str(created_task.uuid)}, actor_uuid, now
    )
    await db.commit()
    await db.refresh(created_task)
    return SubmissionCreated(entity=created_task)


async def submit_new_station(
    db: AsyncSession, *, actor: User, acknowledged_duplicate_of: str | None, **station_fields
) -> SubmissionCreated | SubmissionHeld:
    """Register a station, or hold it when it looks like a serving one (§5.3)."""
    now = datetime.now(UTC)
    fields = await station_service.validate_station(db, actor=actor, **station_fields)
    actor_uuid = str(actor.uuid)
    submission = NewStation(station=station_draft(fields))
    acknowledged = {"station": acknowledged_duplicate_of}

    held = await _hold_if_suspected(
        db, submission=submission, acknowledged=acknowledged, actor=actor, now=now
    )
    if held is not None:
        return held

    station = await station_service.insert_station(db, actor=actor, fields=fields)
    await _record_acknowledged(db, submission, acknowledged, {"station": str(station.uuid)}, actor_uuid, now)
    await db.commit()
    await db.refresh(station)
    await station_service.announce_station_created(db, station=station, actor_uuid=actor_uuid)
    return SubmissionCreated(entity=station)


async def _hold_if_suspected(db, *, submission, acknowledged, actor, now) -> SubmissionHeld | None:
    """Ask the engine; on any suspect, audit each one, commit that, and hold the submission."""
    suspects = await dedup_service.check_submission(
        db,
        submission=submission,
        acknowledged=frozenset(ref for ref, ack in acknowledged.items() if ack),
        actor=actor,
        now=now,
    )
    if not suspects:
        return None
    actor_uuid = str(actor.uuid)
    for suspect in suspects:
        await dedup_service.record_suspect_shown(db, suspect=suspect, actor_uuid=actor_uuid)
    await db.commit()
    return SubmissionHeld(suspects=tuple(suspects))


async def _record_acknowledged(db, submission, acknowledged, created, actor_uuid, now) -> None:
    """Card each acknowledged draft against what the submitter said it is not a duplicate of."""
    for draft_ref, related_uuid in acknowledged.items():
        if related_uuid and draft_ref in created:
            await dedup_service.record_pair_ignored(
                db,
                submission=submission,
                draft_ref=draft_ref,
                created_uuid=created[draft_ref],
                related_kind=kind_of_ref(draft_ref),
                related_uuid=related_uuid,
                actor_uuid=actor_uuid,
                now=now,
            )


def _task_kwargs(task: TaskSubmission) -> dict:
    return {
        "task_type": task.task_type,
        "task_name": task.task_name,
        "task_description": task.task_description,
        "quantity": task.quantity,
        "source": task.source,
        "visibility": task.visibility,
        "route_uuid": task.route_uuid,
    }
