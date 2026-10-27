"""Two-phase create for the interactive GraphQL path.

The engine is asked about the whole submission. Any suspect holds all of it: nothing is
created (so nothing is left half-created), the API returns `Suspected`, and the submitter
decides. No suspect creates as usual.

A draft may carry `acknowledged_duplicate_of`: the entity the submitter was shown and
confirmed this draft is not a duplicate of. Acknowledgements are scored first; a draft whose
acknowledged entity scoring found skips the check, so the same hint is not shown again. Every other draft,
including one whose acknowledgement names nothing, is checked and can still be held. On
create, the scored pairs are carded in the same commit.

Every engine call happens before anything is written, so a failed call can roll back the
transaction. Before the engine is asked, the submission's area is locked, so a near-simultaneous
submission there waits for this one to commit and then sees it (ADR-396). Every new ticket comes
through here, the site's help request included. Batch import does not; it calls `create_ticket` /
`create_station` directly.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import NewStation, NewTask, NewTicket, Suspect, kind_of_ref, task_ref
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import dedup as dedup_service
from app.services import dedup_area_lock, dedup_review
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.dedup_snapshot import (
    station_draft,
    task_draft,
    ticket_draft,
)


@dataclass(frozen=True)
class TaskSubmission:
    """One task as the create input carries it, with its own acknowledgement."""

    task_type: str
    task_name: str
    task_description: str | None = None
    quantity: int | None = None
    source: str = "user"
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
    **ticket_fields,
) -> SubmissionCreated | SubmissionHeld:
    """Create a ticket with its tasks, or hold all of it when any part looks like a duplicate.

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
    acknowledged = {task_ref(i): t.acknowledged_duplicate_of for i, t in enumerate(tasks)}

    await dedup_area_lock.lock_area_at(db, submission.ticket.location)
    pairs = await _score_acknowledged(db, submission, acknowledged, actor, now)
    held = await _hold_if_suspected(
        db, submission=submission, acknowledged={p.draft_ref for p in pairs}, actor=actor, now=now
    )
    if held is not None:
        return held

    ticket = await ticket_service.insert_ticket(db, actor=actor, fields=fields)
    created_tasks = [
        await ticket_service.insert_ticket_task(db, actor=actor, ticket_uuid=str(ticket.uuid), fields=f)
        for f in task_fields
    ]
    created = {task_ref(i): str(t.uuid) for i, t in enumerate(created_tasks)}
    carded = await _record_acknowledged(db, pairs, created, actor_uuid)
    await db.commit()
    await dedup_review.notify_new_cards(db, count=carded, actor=actor, actor_uuid=actor_uuid)
    await db.refresh(ticket)
    for task in created_tasks:
        await db.refresh(task)
    return SubmissionCreated(entity=ticket, tasks=tuple(created_tasks))


async def submit_help_request(
    db: AsyncSession,
    *,
    actor: User,
    tasks: list[dict],
    **request_fields,
) -> SubmissionCreated | SubmissionHeld:
    """File the site's help request (請求協助), or hold all of it when any need looks like a duplicate.

    The only way a help request is filed. `request_fields` are `validate_help_request`'s other
    keyword arguments. Each need may carry `acknowledged_duplicate_of`, as a `createTicket` task
    does. A held request writes nothing: no ticket, address, need or photo; a filed one is written
    in one commit.
    """
    now = datetime.now(UTC)
    needs = [{k: v for k, v in task.items() if k != "acknowledged_duplicate_of"} for task in tasks]
    fields = await ticket_service.validate_help_request(db, actor=actor, tasks=needs, **request_fields)
    actor_uuid = str(actor.uuid)
    submission = NewTicket(
        ticket=ticket_draft(fields.ticket), tasks=tuple(task_draft(f) for f in fields.needs)
    )
    acknowledged = {task_ref(i): task.get("acknowledged_duplicate_of") for i, task in enumerate(tasks)}

    pairs = await _score_acknowledged(db, submission, acknowledged, actor, now)
    held = await _hold_if_suspected(
        db, submission=submission, acknowledged={p.draft_ref for p in pairs}, actor=actor, now=now
    )
    if held is not None:
        return held

    ticket, created_tasks = await ticket_service.insert_help_request(db, actor=actor, fields=fields)
    created = {task_ref(i): str(t.uuid) for i, t in enumerate(created_tasks)}
    carded = await _record_acknowledged(db, pairs, created, actor_uuid)
    await db.commit()
    await dedup_review.notify_new_cards(db, count=carded, actor=actor, actor_uuid=actor_uuid)
    await db.refresh(ticket)
    for task in created_tasks:
        await db.refresh(task)
    return SubmissionCreated(entity=ticket, tasks=tuple(created_tasks))


async def submit_new_task(
    db: AsyncSession, *, actor: User, ticket_uuid: str, task: TaskSubmission
) -> SubmissionCreated | SubmissionHeld:
    """Add a task to an existing ticket, or hold it when it looks like a duplicate.

    All of `create_ticket_task`'s rules run before the engine is asked, so a caller who may not
    add to this ticket never learns what is nearby. A held task writes nothing, so a completed
    ticket is not reopened by it.
    """
    now = datetime.now(UTC)
    fields = await ticket_service.validate_added_task(
        db, actor=actor, ticket_uuid=ticket_uuid, **_task_kwargs(task)
    )
    actor_uuid = str(actor.uuid)
    submission = NewTask(ticket_uuid=ticket_uuid, task=task_draft(fields))
    acknowledged = {task_ref(0): task.acknowledged_duplicate_of}

    await dedup_area_lock.lock_area_of_ticket(db, ticket_uuid)
    pairs = await _score_acknowledged(db, submission, acknowledged, actor, now)
    held = await _hold_if_suspected(
        db, submission=submission, acknowledged={p.draft_ref for p in pairs}, actor=actor, now=now
    )
    if held is not None:
        return held

    created_task = await ticket_service.insert_added_task(
        db, actor=actor, ticket_uuid=ticket_uuid, fields=fields
    )
    carded = await _record_acknowledged(db, pairs, {task_ref(0): str(created_task.uuid)}, actor_uuid)
    await db.commit()
    await dedup_review.notify_new_cards(db, count=carded, actor=actor, actor_uuid=actor_uuid)
    await db.refresh(created_task)
    return SubmissionCreated(entity=created_task)


async def submit_new_station(
    db: AsyncSession, *, actor: User, acknowledged_duplicate_of: str | None, **station_fields
) -> SubmissionCreated | SubmissionHeld:
    """Register a station, or hold it when it looks like a serving one."""
    now = datetime.now(UTC)
    fields = await station_service.validate_station(db, actor=actor, **station_fields)
    actor_uuid = str(actor.uuid)
    submission = NewStation(station=station_draft(fields))
    acknowledged = {"station": acknowledged_duplicate_of}

    await dedup_area_lock.lock_area_at(db, submission.station.location)
    pairs = await _score_acknowledged(db, submission, acknowledged, actor, now)
    held = await _hold_if_suspected(
        db, submission=submission, acknowledged={p.draft_ref for p in pairs}, actor=actor, now=now
    )
    if held is not None:
        return held

    station = await station_service.insert_station(db, actor=actor, fields=fields)
    carded = await _record_acknowledged(db, pairs, {"station": str(station.uuid)}, actor_uuid)
    await db.commit()
    await dedup_review.notify_new_cards(db, count=carded, actor=actor, actor_uuid=actor_uuid)
    await db.refresh(station)
    await station_service.announce_station_created(db, station=station, actor_uuid=actor_uuid)
    return SubmissionCreated(entity=station)


async def _hold_if_suspected(db, *, submission, acknowledged, actor, now) -> SubmissionHeld | None:
    """Ask the engine; on any suspect, audit each one, commit that, and hold the submission."""
    suspects = await dedup_service.check_submission(
        db,
        submission=submission,
        acknowledged=frozenset(acknowledged),
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


async def _score_acknowledged(
    db, submission, acknowledged, actor, now
) -> list[dedup_service.AcknowledgedPair]:
    """Score each acknowledged draft against the entity it names.

    Returns only the pairs whose related entity exists.
    """
    pairs = []
    for draft_ref, related_uuid in acknowledged.items():
        if related_uuid:
            pair = await dedup_service.score_acknowledged(
                db,
                submission=submission,
                draft_ref=draft_ref,
                related_kind=kind_of_ref(draft_ref),
                related_uuid=related_uuid,
                actor=actor,
                now=now,
            )
            if pair is not None:
                pairs.append(pair)
    return pairs


async def _record_acknowledged(db, pairs, created, actor_uuid) -> int:
    """Card each scored pair against the entity made from its draft; returns how many were carded."""
    carded = 0
    for pair in pairs:
        if pair.draft_ref in created:
            await dedup_service.record_pair_ignored(
                db, pair=pair, created_uuid=created[pair.draft_ref], actor_uuid=actor_uuid
            )
            carded += 1
    return carded


def _task_kwargs(task: TaskSubmission) -> dict:
    return {
        "task_type": task.task_type,
        "task_name": task.task_name,
        "task_description": task.task_description,
        "quantity": task.quantity,
        "source": task.source,
        "route_uuid": task.route_uuid,
    }
