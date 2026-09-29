"""Two-phase create for the interactive GraphQL path (Spec 020 §5, ADR-296/299).

First submission: validate, then ask the dedup engine. A match returns `Suspected` and creates
nothing — the submitter decides. No match creates as usual.

Acknowledged submission (`acknowledged_duplicate_of` set): validate, create without checking
again (so the submitter is never shown a second hint), and card the pair — all in one commit.

Batch import does not come through here; it calls `create_ticket` / `create_station` directly.

The engine is asked about the whole submission (ADR-304); a single suspect anywhere holds all of
it, so nothing half-created is ever left behind.
"""

from dataclasses import dataclass
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
    task_draft,
    ticket_draft,
)


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
