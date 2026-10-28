"""Resolve a duplicate pair card: keep one ticket, fold the other into it (Spec 028 §3.5, ADR-365).

`ai_duplicate.review` only (ADR-366): the reviewer needs no ticket.edit or ticket.delete, since
this one action is all they can do to the tickets and every use of it is recorded. In one
transaction: lock the card, both tickets and their needs; check nothing the reviewer compared has
changed (ADR-374); plan (`dedup_resolve_plan.build_plan`); write the tickets, needs, items and
claims; mark the card `confirmed_duplicate`; record a `merged` event holding everything as it was (ADR-375).
There is no undo (ADR-376): the event is what a person restores from.

The paired entities are touched here and only here; confirm and reject still change the card
alone (ADR-341).
"""

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime

from sqlalchemy import delete, func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import validate_disaster_types
from app.core.permissions import Perm
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import touch
from app.models.photo import Photo
from app.models.request import Tickets
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services.authz import require_scope
from app.services.dedup_resolve_notices import send_resolve_notices
from app.services.dedup_resolve_plan import RESOLVABLE_KINDS, ResolvePlan, ResolveRefused, build_plan
from app.services.dedup_review import (
    CONFIRMED_DUPLICATE,
    PENDING_STATUSES,
    DuplicatePairConflictError,
    PairDetail,
    checked_note,
    has_merged_event,
    lock_pair,
    pair_detail,
)
from app.services.dedup_review_tickets import TicketForReview, ticket_uuids_for_pair, tickets_for_review
from app.services.geo_validation import normalize_contact_fields
from app.services.ticket import mark_need_deleted
from app.services.ticket_audit import void_stale_verdict
from app.services.ticket_status import OPEN_NEED_STATUSES, recompute_ticket_status

RESOLVABLE_STATUSES = (*PENDING_STATUSES, CONFIRMED_DUPLICATE)


@dataclass(frozen=True)
class ResolveOutcome:
    """Who a resolve touched and how, for the notices sent after it commits (Spec 028 §6)."""

    plan: ResolvePlan
    primary_title: str
    primary_owner: str | None
    secondary_title: str
    secondary_owner: str | None
    moved_people: dict[str, tuple[str, ...]]
    canceled_people: dict[str, tuple[str, ...]]
    task_names: dict[str, str]
    secondary_task_uuids: frozenset[str]
    contact_changed: bool = False
    staying_people: tuple[str, ...] = ()


@dataclass(frozen=True)
class ResolveResult:
    """The card as it now stands, and what the notices need."""

    detail: PairDetail
    outcome: ResolveOutcome


async def resolve(db: AsyncSession, *, actor: User, pair_uuid: uuid.UUID, request) -> ResolveResult:
    """Carry out `request` (a ResolveRequest) on the card, or refuse it.

    404 for a missing card; DuplicatePairConflictError (409) for a card already resolved or
    decided, a ticket gone, or a ticket changed since the reviewer read it; ResolveRefused or
    ValueError (422) for a request that cannot be carried out.
    """
    await require_scope(actor, Perm.AI_DUP_REVIEW, db)
    note = checked_note(request.note)
    reviewer = actor.uuid  # read before the commit expires `actor`
    pair = await lock_pair(db, pair_uuid)
    if pair.status not in RESOLVABLE_STATUSES or await has_merged_event(db, pair):
        raise DuplicatePairConflictError(f"Duplicate pair is {pair.status} and cannot be resolved")
    if pair.entity_kind not in RESOLVABLE_KINDS:
        raise ResolveRefused("Only ticket and need cards can be resolved")

    low, high, claimants = await _locked_snapshot(db, pair, request)
    plan = build_plan(request, pair_kind=pair.entity_kind, low=low, high=high, claimants=claimants)
    primary, secondary = (low, high) if plan.primary_uuid == low.uuid else (high, low)
    ticket_changes = await _checked_ticket_changes(db, plan.ticket_changes, primary)

    now = await db.scalar(select(func.clock_timestamp()))  # the database's clock, as every stamp is
    tasks = await _tasks_by_uuid(db, (primary.uuid, secondary.uuid))
    await _write(db, plan, ticket_changes, tasks, now)

    before_status = pair.status
    pair.status = CONFIRMED_DUPLICATE
    pair.reviewed_by = reviewer
    pair.reviewed_at = now
    after = (await tickets_for_review(db, (plan.primary_uuid,)))[plan.primary_uuid]
    db.add(_merged_event(pair, plan, request, reviewer, note, before_status, (low, high), claimants, after))
    outcome = _outcome(plan, primary, after, secondary, claimants, tasks)
    await db.commit()

    await send_resolve_notices(db, outcome=outcome, actor=actor, actor_uuid=reviewer)
    await db.refresh(pair)
    return ResolveResult(detail=await pair_detail(db, pair), outcome=outcome)


async def _write(db: AsyncSession, plan: ResolvePlan, ticket_changes: dict, tasks, now: datetime) -> None:
    """Everything the plan changes on the tickets, then the primary's status and verdict."""
    await _write_primary(db, plan.primary_uuid, ticket_changes)
    await _write_needs(db, plan, tasks, now)
    await _write_items(db, plan, now)
    await _write_photos_and_answers(db, plan, now)
    await _cancel_secondary(db, plan, now)
    await db.flush()
    await recompute_ticket_status(db, ticket_uuid=plan.primary_uuid)
    await void_stale_verdict(db, plan.primary_uuid)
    # Last, so no later write stamps its own time: both tickets read the merge time, related rows included.
    for ticket_uuid in (plan.primary_uuid, plan.secondary_uuid):
        touch(await db.get(Tickets, ticket_uuid), at=now)
    await db.flush()


async def _locked_snapshot(db: AsyncSession, pair: DuplicatePair, request):
    """Lock both tickets and their live needs, read them fresh, check them against what was seen.

    Ticket rows first, then needs, each in uuid order (ADR-291). What the reviewer saw is the
    request's `expected_versions` (ADR-374).
    """
    low_uuid, high_uuid = await ticket_uuids_for_pair(db, pair)
    if not low_uuid or not high_uuid:
        raise DuplicatePairConflictError("A side of this card is gone")
    for ticket_uuid in sorted((low_uuid, high_uuid)):
        await db.scalar(select(Tickets.uuid).where(Tickets.uuid == ticket_uuid).with_for_update())
    await db.scalars(
        select(TicketTask.uuid)
        .where(TicketTask.ticket_uuid.in_((low_uuid, high_uuid)), TicketTask.delete_at.is_(None))
        .order_by(TicketTask.uuid)
        .with_for_update()
    )
    found = await tickets_for_review(db, (low_uuid, high_uuid))
    low, high = found.get(low_uuid), found.get(high_uuid)
    if low is None or high is None:
        raise DuplicatePairConflictError("A ticket on this card has been cancelled")
    seen = request.expected_versions
    if (low.version, high.version) != (seen.low, seen.high):
        raise DuplicatePairConflictError("A ticket changed since it was compared; read it again")
    task_ids = [task.uuid for ticket in (low, high) for task in ticket.tasks]
    rows = await db.execute(
        select(TaskAssignment.task_uuid, TaskAssignment.actor_uuid).where(
            TaskAssignment.task_uuid.in_(task_ids)
        )
    )
    claimants: dict[str, set[str]] = {}
    for task_uuid, person in rows.all():
        claimants.setdefault(str(task_uuid), set()).add(str(person))
    return low, high, claimants


async def _checked_ticket_changes(db: AsyncSession, changes: dict, primary: TicketForReview) -> dict:
    """The vocabulary and contact checks `build_plan` cannot make without the database."""
    changes = normalize_contact_fields(changes, required=frozenset({"contact_name"}))
    if "disaster_types" in changes:
        changes["disaster_types"] = await validate_disaster_types(
            db, changes["disaster_types"] or [], keep=primary.disaster_types
        )
    return changes


async def _tasks_by_uuid(db: AsyncSession, ticket_uuids) -> dict[str, TicketTask]:
    rows = await db.scalars(
        select(TicketTask)
        .where(TicketTask.ticket_uuid.in_(ticket_uuids), TicketTask.delete_at.is_(None))
        .execution_options(populate_existing=True)
    )
    return {str(task.uuid): task for task in rows.all()}


async def _write_primary(db: AsyncSession, primary_uuid: str, changes: dict) -> None:
    if not changes:
        return
    ticket = await db.get(Tickets, primary_uuid)
    for name, value in changes.items():
        setattr(ticket, name, value)


async def _write_needs(
    db: AsyncSession, plan: ResolvePlan, tasks: dict[str, TicketTask], now: datetime
) -> None:
    """Fold, move, change and cancel needs; move the people on folded needs; settle each kept need."""
    if plan.dropped_assignments:
        # Someone already on the need it folds into keeps that place; this one goes (ADR-369).
        await db.execute(
            delete(TaskAssignment).where(
                tuple_(TaskAssignment.task_uuid, TaskAssignment.actor_uuid).in_(plan.dropped_assignments)
            )
        )
    for absorbed_uuid, into_uuid in plan.absorbed.items():
        await db.execute(
            update(TaskAssignment)
            .where(TaskAssignment.task_uuid == absorbed_uuid)
            .values(task_uuid=into_uuid)
        )
        absorbed = tasks[absorbed_uuid]
        mark_need_deleted(absorbed, now)
        absorbed.merged_into_uuid = into_uuid
    for canceled_uuid in plan.canceled_tasks:
        mark_need_deleted(tasks[canceled_uuid], now)
    for kept in plan.kept_tasks:
        task = tasks[kept.uuid]
        for name, value in kept.changes.items():
            setattr(task, name, value)
        if kept.moved:
            task.ticket_uuid = plan.primary_uuid
        _settle(task, kept.headcount, now)


def _settle(task: TicketTask, headcount: int, now: datetime) -> None:
    """A kept need's status after its quantity and people changed (ADR-370).

    Stopped by hand stays stopped. Full is fulfilled; a need that was full and now has room is
    open again. Anything else stays as it is.
    """
    if task.recruiting_stopped_at is not None:
        return
    full = task.quantity is not None and headcount >= task.quantity
    if full and task.status in OPEN_NEED_STATUSES:
        task.status = "fulfilled"
        task.completed_at = now
    elif not full and task.status == "fulfilled":
        task.status = "pending"
        task.completed_at = None


async def _write_items(db: AsyncSession, plan: ResolvePlan, now: datetime) -> None:
    for prop_uuid, task_uuid in plan.property_moves.items():
        await db.execute(
            update(TaskProperty).where(TaskProperty.uuid == prop_uuid).values(task_uuid=task_uuid)
        )
    for prop_uuid, changes in plan.property_changes.items():
        await db.execute(update(TaskProperty).where(TaskProperty.uuid == prop_uuid).values(**changes))
    if plan.canceled_properties:
        await db.execute(
            update(TaskProperty).where(TaskProperty.uuid.in_(plan.canceled_properties)).values(delete_at=now)
        )


async def _write_photos_and_answers(db: AsyncSession, plan: ResolvePlan, now: datetime) -> None:
    """Move the other ticket's kept photos over, soft-delete cancelled ones, replace the answers.

    Photos: ADR-384. The primary's disaster answers are replaced whole when the request gives
    them (ADR-385), as setTicketDisasterDetails does.
    """
    if plan.moved_photos:
        await db.execute(
            update(Photo).where(Photo.uuid.in_(plan.moved_photos)).values(ref_uuid=plan.primary_uuid)
        )
    if plan.canceled_photos:
        await db.execute(update(Photo).where(Photo.uuid.in_(plan.canceled_photos)).values(delete_at=now))
    if plan.disaster_details is None:
        return
    await db.execute(
        delete(TicketDisasterDetail).where(TicketDisasterDetail.ticket_uuid == plan.primary_uuid)
    )
    for name, values in plan.disaster_details.items():
        # dict.fromkeys keeps the order sent and drops repeats, as setTicketDisasterDetails does.
        for value in dict.fromkeys(v for v in values if v):
            db.add(TicketDisasterDetail(ticket_uuid=plan.primary_uuid, property_name=name, value=value))


async def _cancel_secondary(db: AsyncSession, plan: ResolvePlan, now: datetime) -> None:
    """The other ticket is cancelled and soft-deleted as delete_ticket does, pointing at the primary."""
    ticket = await db.get(Tickets, plan.secondary_uuid)
    ticket.status = "cancelled"
    ticket.delete_at = now
    ticket.replaced_by_uuid = plan.primary_uuid


def _jsonable(value):
    return json.loads(json.dumps(value, default=str, ensure_ascii=False))


def _with_people(ticket: TicketForReview, claimants: dict[str, set[str]]) -> dict:
    """A ticket as recorded in the event: as the reviewer saw it, plus who was on each need."""
    record = asdict(ticket)
    for task in record["tasks"]:
        task["people"] = sorted(claimants.get(task["uuid"], set()))
    return record


def _merged_event(
    pair, plan, request, reviewer, note, before_status, sides, claimants, after
) -> DedupAuditEvent:
    low, high = sides
    return DedupAuditEvent(
        entity_kind=pair.entity_kind,
        event_type="merged",
        pair_uuid=pair.uuid,
        duplicate_group_uuid=pair.duplicate_group_uuid,
        primary_uuid=plan.primary_uuid,
        duplicate_uuid=plan.secondary_uuid,
        actor_uuid=reviewer,
        source_layer="manual",
        decision_reason=note,
        before_state=_jsonable(
            {
                "pair_status": before_status,
                "tickets": {"low": _with_people(low, claimants), "high": _with_people(high, claimants)},
            }
        ),
        after_state=_jsonable({"pair_status": CONFIRMED_DUPLICATE, "ticket": asdict(after)}),
        affected_refs=_jsonable(
            {
                "request": request.model_dump(mode="json"),
                "absorbed": plan.absorbed,
                "moved": [k.uuid for k in plan.kept_tasks if k.moved],
                "canceled_tasks": list(plan.canceled_tasks),
                "dropped_assignments": [list(pair_) for pair_ in plan.dropped_assignments],
                "moved_properties": plan.property_moves,
                "canceled_properties": list(plan.canceled_properties),
                "moved_photos": list(plan.moved_photos),
                "canceled_photos": list(plan.canceled_photos),
                "disaster_details": plan.disaster_details,
            }
        ),
        reversible=False,
    )


_CONTACT_FIELDS = ("contact_name", "contact_phone", "contact_email")


def _outcome(plan, before, after, secondary, claimants, tasks) -> ResolveOutcome:
    """`before` is the primary as the reviewer saw it, `after` as the resolve left it (ADR-382)."""
    dropped = set(plan.dropped_assignments)
    # Whoever now answers to the primary ticket's contact: the people on a folded need who moved
    # over, and the people on a need moved over whole (ADR-379).
    moved = {
        absorbed: tuple(sorted(p for p in claimants.get(absorbed, set()) if (absorbed, p) not in dropped))
        for absorbed in plan.absorbed
    }
    moved |= {k.uuid: tuple(sorted(claimants.get(k.uuid, set()))) for k in plan.kept_tasks if k.moved}
    canceled = {task: tuple(sorted(claimants.get(task, set()))) for task in plan.canceled_tasks}
    # The people on the primary's own kept needs, who did not move and so heard nothing of the
    # contact in `dedup_task_merged` (ADR-389).
    arrived = {person for people in moved.values() for person in people}
    staying = {
        person for k in plan.kept_tasks if not k.moved for person in claimants.get(k.uuid, set())
    } - arrived
    return ResolveOutcome(
        plan=plan,
        primary_title=after.title,
        primary_owner=after.created_by,
        secondary_title=secondary.title,
        secondary_owner=secondary.created_by,
        moved_people=moved,
        canceled_people=canceled,
        task_names={uuid: task.task_name for uuid, task in tasks.items()},
        secondary_task_uuids=frozenset(task.uuid for task in secondary.tasks),
        contact_changed=any(getattr(before, f) != getattr(after, f) for f in _CONTACT_FIELDS),
        staying_people=tuple(sorted(staying)),
    )
