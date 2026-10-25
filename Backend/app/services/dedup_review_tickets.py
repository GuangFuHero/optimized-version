"""The two whole tickets behind a duplicate pair card, for the AI 重複審核 page (Spec 028 §2, ADR-373/373).

A fast-layer card compares one need with another (`ticket_task`), but a resolve acts on whole
tickets, so the reviewer has to see both tickets in full first: their fields, contacts, every live
need with its headcount and items. `version` lets a resolve tell whether either ticket changed
since the reviewer read it.

Read with `ai_duplicate.view` (checked by the caller, `dedup_review.get_pair`). A fixed number of
queries, however many needs and items the tickets have.
"""

import hashlib
import json
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dedup import DuplicatePair
from app.models.photo import Photo
from app.models.request import Tickets
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask


@dataclass(frozen=True)
class PropertyForReview:
    """One live item under a need."""

    uuid: str
    property_name: str
    property_value: str
    quantity: int | None
    status: str | None
    comment: str | None


@dataclass(frozen=True)
class PhotoForReview:
    """One live photo on a ticket (ADR-384)."""

    uuid: str
    url: str
    created_at: datetime | None


@dataclass(frozen=True)
class TaskForReview:
    """One live need, how many people are on it, and its items."""

    uuid: str
    task_type: str
    task_name: str
    task_description: str | None
    quantity: int | None
    status: str
    claim_count: int
    recruiting_stopped: bool
    properties: tuple[PropertyForReview, ...]


@dataclass(frozen=True)
class TicketForReview:
    """A whole live ticket as the reviewer compares it.

    Contacts are unmasked: the reviewer holds ai_duplicate.view, and picking the right contact is
    part of the decision (ADR-373).
    """

    uuid: str
    version: str
    title: str
    description: str | None
    priority: str
    task_type: str | None
    disaster_types: tuple[str, ...]
    person_trapped_reported: str | None
    immediate_danger_reported: str | None
    contact_name: str
    contact_phone: str | None
    contact_email: str | None
    longitude: float | None
    latitude: float | None
    status: str
    audit_status: str
    created_by: str | None
    created_at: datetime | None
    tasks: tuple[TaskForReview, ...]
    photos: tuple[PhotoForReview, ...] = ()
    disaster_details: dict[str, tuple[str, ...]] = field(default_factory=dict)


# What a claim moves, which must not move the version (ADR-374): a need's headcount and the status
# a claim fills, and the ticket status (and audit status) worked out from them.
_TICKET_SKIPPED = {"version", "status", "audit_status", "tasks", "photos"}
_TASK_SKIPPED = {"claim_count", "status", "properties"}


def ticket_version(ticket: TicketForReview) -> str:
    """An opaque digest of what the reviewer compared (ADR-374).

    Made from the content itself, not from `updated_at`: a ticket's `updated_at` lives on
    `base_geometries`, which an edit to the ticket's own columns does not touch. Every field the
    reviewer can compare or edit goes in — the ticket's, each live need's and item's, its photos
    and disaster-field answers (ADR-384, 384) — with needs, items and photos sorted by uuid.
    What a claim moves stays out: the headcount is checked under the locks when resolving, and a
    claim need not send the reviewer back.
    """
    content = {k: v for k, v in asdict(ticket).items() if k not in _TICKET_SKIPPED}
    content["tasks"] = sorted(
        (
            {
                **{k: v for k, v in asdict(task).items() if k not in _TASK_SKIPPED},
                "properties": sorted((asdict(p) for p in task.properties), key=lambda p: p["uuid"]),
            }
            for task in ticket.tasks
        ),
        key=lambda t: t["uuid"],
    )
    content["photos"] = sorted((asdict(p) for p in ticket.photos), key=lambda p: p["uuid"])
    digest = json.dumps(content, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(digest.encode()).hexdigest()


async def ticket_uuids_for_pair(db: AsyncSession, pair: DuplicatePair) -> tuple[str | None, str | None]:
    """The ticket on each side: the side itself for a ticket card, the need's ticket for a need card.

    A need card whose need was deleted still names its ticket; whether that ticket is live is for
    `tickets_for_review` to say. A station card has none.
    """
    sides = (str(pair.low_uuid), str(pair.high_uuid))
    if pair.entity_kind == "ticket":
        return sides
    if pair.entity_kind != "ticket_task":
        return None, None
    rows = await db.execute(select(TicketTask.uuid, TicketTask.ticket_uuid).where(TicketTask.uuid.in_(sides)))
    owner = {str(task): str(ticket) for task, ticket in rows.all()}
    return owner.get(sides[0]), owner.get(sides[1])


async def tickets_for_review(db: AsyncSession, ticket_uuids: Iterable[str]) -> dict[str, TicketForReview]:
    """The live tickets among `ticket_uuids`, keyed by uuid string; a cancelled or deleted one is absent."""
    wanted = [uuid for uuid in ticket_uuids if uuid]
    if not wanted:
        return {}
    centroid = func.ST_Centroid(Tickets.geometry)
    ticket_rows = (
        await db.execute(
            select(Tickets, func.ST_X(centroid), func.ST_Y(centroid)).where(
                Tickets.uuid.in_(wanted), Tickets.delete_at.is_(None), Tickets.status != "cancelled"
            )
        )
    ).all()
    if not ticket_rows:
        return {}
    live = [str(ticket.uuid) for ticket, _, _ in ticket_rows]
    parts = await _parts(db, live)
    return {str(ticket.uuid): _ticket(ticket, lon, lat, parts) for ticket, lon, lat in ticket_rows}


@dataclass(frozen=True)
class _Parts:
    """Everything under the live tickets, one query each."""

    tasks: list
    properties: list
    claims: dict
    photos: list
    details: list


async def _parts(db: AsyncSession, live: list[str]) -> _Parts:
    tasks = (
        await db.scalars(
            select(TicketTask)
            .where(TicketTask.ticket_uuid.in_(live), TicketTask.delete_at.is_(None))
            .order_by(TicketTask.created_at, TicketTask.uuid)
        )
    ).all()
    task_ids = [task.uuid for task in tasks]
    properties, claims = [], {}
    if task_ids:
        properties = (
            await db.scalars(
                select(TaskProperty)
                .where(TaskProperty.task_uuid.in_(task_ids), TaskProperty.delete_at.is_(None))
                .order_by(TaskProperty.created_at, TaskProperty.uuid)
            )
        ).all()
        claims = dict(
            (
                await db.execute(
                    select(TaskAssignment.task_uuid, func.count())
                    .where(TaskAssignment.task_uuid.in_(task_ids))
                    .group_by(TaskAssignment.task_uuid)
                )
            ).all()
        )
    photos = (
        await db.scalars(
            select(Photo)
            .where(Photo.ref_type == "geometry", Photo.ref_uuid.in_(live), Photo.delete_at.is_(None))
            .order_by(Photo.created_at, Photo.uuid)
        )
    ).all()
    details = (
        await db.scalars(
            select(TicketDisasterDetail)
            .where(TicketDisasterDetail.ticket_uuid.in_(live), TicketDisasterDetail.delete_at.is_(None))
            # The order every reader of these rows uses (tickets_repository.list_by_ticket, the
            # GraphQL loader): rows written in one transaction share created_at, so anything else
            # reshuffles a multi-select between reads — and would move the version with it.
            .order_by(TicketDisasterDetail.property_name, TicketDisasterDetail.value)
        )
    ).all()
    return _Parts(tasks=tasks, properties=properties, claims=claims, photos=photos, details=details)


def _ticket(ticket: Tickets, lon, lat, parts: _Parts) -> TicketForReview:
    own_tasks = [task for task in parts.tasks if str(task.ticket_uuid) == str(ticket.uuid)]
    answers: dict[str, list[str]] = {}
    for detail in parts.details:
        if str(detail.ticket_uuid) == str(ticket.uuid):
            answers.setdefault(detail.property_name, []).append(detail.value)
    review = TicketForReview(
        uuid=str(ticket.uuid),
        version="",
        title=ticket.title,
        description=ticket.description,
        priority=ticket.priority,
        task_type=ticket.task_type,
        disaster_types=tuple(ticket.disaster_types or ()),
        person_trapped_reported=ticket.person_trapped_reported,
        immediate_danger_reported=ticket.immediate_danger_reported,
        contact_name=ticket.contact_name,
        contact_phone=ticket.contact_phone,
        contact_email=ticket.contact_email,
        longitude=lon,
        latitude=lat,
        status=ticket.status,
        audit_status=ticket.audit_status,
        created_by=str(ticket.created_by) if ticket.created_by else None,
        created_at=ticket.created_at,
        tasks=tuple(
            TaskForReview(
                uuid=str(task.uuid),
                task_type=task.task_type,
                task_name=task.task_name,
                task_description=task.task_description,
                quantity=task.quantity,
                status=task.status,
                claim_count=parts.claims.get(task.uuid, 0),
                recruiting_stopped=task.recruiting_stopped_at is not None,
                properties=tuple(
                    PropertyForReview(
                        uuid=str(prop.uuid),
                        property_name=prop.property_name,
                        property_value=prop.property_value,
                        quantity=prop.quantity,
                        status=prop.status,
                        comment=prop.comment,
                    )
                    for prop in parts.properties
                    if prop.task_uuid == task.uuid
                ),
            )
            for task in own_tasks
        ),
        photos=tuple(
            PhotoForReview(uuid=str(photo.uuid), url=photo.url, created_at=photo.created_at)
            for photo in parts.photos
            if str(photo.ref_uuid) == str(ticket.uuid)
        ),
        disaster_details={name: tuple(values) for name, values in answers.items()},
    )
    return replace(review, version=ticket_version(review))


async def tickets_for_pair(
    db: AsyncSession, pair: DuplicatePair
) -> tuple[TicketForReview | None, TicketForReview | None] | None:
    """Both sides' tickets, or None for a card that is not about tickets (a station card)."""
    if pair.entity_kind not in ("ticket", "ticket_task"):
        return None
    low, high = await ticket_uuids_for_pair(db, pair)
    found = await tickets_for_review(db, (low, high))
    return found.get(low) if low else None, found.get(high) if high else None
