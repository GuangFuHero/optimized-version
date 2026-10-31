"""The two whole tickets behind a duplicate pair card, for the 重複審核 page (Spec 028 §2, ADR-373/374).

A fast-layer card compares one need with another (`ticket_task`), but a resolve acts on whole
tickets, so the reviewer has to see both tickets in full first: their fields, contacts, every live
need with its headcount and items, and where the ticket is. `version` lets a resolve tell whether
either ticket changed since the reviewer read it.

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
from app.models.property_config import TaskPropertyConfig
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
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
    # How the item reads: its need type's configured label, else its key (ADR-095, ADR-446).
    # Read for the reviewer, not compared: it stays out of the version.
    display_label: str = ""


@dataclass(frozen=True)
class PhotoForReview:
    """One live photo on a ticket (ADR-384)."""

    uuid: str
    url: str
    created_at: datetime | None


@dataclass(frozen=True)
class LocationForReview:
    """Where the ticket is, as far as the reviewer compares it (ADR-440).

    The address down to the room, or the pole. The free text about the place (landmark, space,
    access) is left out: it is not what tells two tickets apart, and it stays out of the version.
    """

    location_type: str
    full_address: str | None
    building_section: str | None
    floor: str | None
    room: str | None
    pole_id: str | None


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
    # One key per person on the need, the same for a person across this card's two tickets and
    # different on any other card (ADR-445): the page counts a fold by the keys it unites. Empty
    # when read without a card, as a resolve reads. Moves with claims, so it stays out of the version.
    claimant_keys: tuple[str, ...] = ()


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
    location: LocationForReview | None = None


# What a claim moves, which must not move the version (ADR-374): a need's headcount and the status
# a claim fills, and the ticket status (and audit status) worked out from them.
_TICKET_SKIPPED = {"version", "status", "audit_status", "tasks", "photos"}
_TASK_SKIPPED = {"claim_count", "status", "properties", "claimant_keys"}
_PROPERTY_SKIPPED = {"display_label"}


def ticket_version(ticket: TicketForReview) -> str:
    """An opaque digest of what the reviewer compared (ADR-374).

    Made from the content itself, not from `updated_at`, which also moves for what the reviewer
    does not compare, such as a status worked out again after a claim. Every field the
    reviewer can compare or edit goes in — the ticket's, each live need's and item's, its photos
    and disaster-field answers (ADR-384, 385) and where it is (ADR-440) — with needs, items and
    photos sorted by uuid.
    What a claim moves stays out: the headcount is checked under the locks when resolving, and a
    claim need not send the reviewer back.
    """
    content = {k: v for k, v in asdict(ticket).items() if k not in _TICKET_SKIPPED}
    content["tasks"] = sorted(
        (
            {
                **{k: v for k, v in asdict(task).items() if k not in _TASK_SKIPPED},
                "properties": sorted(
                    (
                        {k: v for k, v in asdict(p).items() if k not in _PROPERTY_SKIPPED}
                        for p in task.properties
                    ),
                    key=lambda p: p["uuid"],
                ),
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


async def tickets_for_review(
    db: AsyncSession, ticket_uuids: Iterable[str], *, card_uuid: str | None = None
) -> dict[str, TicketForReview]:
    """The live tickets among `ticket_uuids`, keyed by uuid string; a cancelled or deleted one is absent.

    With `card_uuid`, each need lists its claimant keys for that card (ADR-445).
    """
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
    return {str(ticket.uuid): _ticket(ticket, lon, lat, parts, card_uuid) for ticket, lon, lat in ticket_rows}


def claimant_key(card_uuid: str, actor_uuid) -> str:
    """A person's key on one card (ADR-445): stable within the card, unrelated across cards."""
    return hashlib.sha256(f"{card_uuid}:{actor_uuid}".encode()).hexdigest()[:16]


@dataclass(frozen=True)
class _Parts:
    """Everything under the live tickets, one query each."""

    tasks: list
    properties: list
    claims: dict  # need uuid -> the people on it
    labels: dict  # (need type, item key) -> configured label
    photos: list
    details: list
    locations: dict


async def _parts(db: AsyncSession, live: list[str]) -> _Parts:
    tasks = (
        await db.scalars(
            select(TicketTask)
            .where(TicketTask.ticket_uuid.in_(live), TicketTask.delete_at.is_(None))
            .order_by(TicketTask.created_at, TicketTask.uuid)
        )
    ).all()
    task_ids = [task.uuid for task in tasks]
    properties, claims, labels = [], {}, {}
    if task_ids:
        properties = (
            await db.scalars(
                select(TaskProperty)
                .where(TaskProperty.task_uuid.in_(task_ids), TaskProperty.delete_at.is_(None))
                .order_by(TaskProperty.created_at, TaskProperty.uuid)
            )
        ).all()
        for task_uuid, person in (
            await db.execute(
                select(TaskAssignment.task_uuid, TaskAssignment.actor_uuid).where(
                    TaskAssignment.task_uuid.in_(task_ids)
                )
            )
        ).all():
            claims.setdefault(task_uuid, []).append(person)
        if properties:
            # One query for every item's label, however many items (ADR-446).
            keys = {prop.property_name for prop in properties}
            types = {task.task_type for task in tasks}
            labels = {
                (config.task_type, config.property_name): config.label
                for config in await db.scalars(
                    select(TaskPropertyConfig).where(
                        TaskPropertyConfig.task_type.in_(types), TaskPropertyConfig.property_name.in_(keys)
                    )
                )
                if config.label
            }
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
    # One row per geometry by convention, not by constraint: take the first by uuid, as
    # `secondary_location_repository.get_by_geometry` does.
    locations: dict[str, SecondaryLocation] = {}
    for location in await db.scalars(
        select(SecondaryLocation)
        .where(SecondaryLocation.geometry_uuid.in_(live))
        .order_by(SecondaryLocation.uuid)
    ):
        locations.setdefault(str(location.geometry_uuid), location)
    return _Parts(
        tasks=tasks,
        properties=properties,
        claims=claims,
        labels=labels,
        photos=photos,
        details=details,
        locations=locations,
    )


def _ticket(ticket: Tickets, lon, lat, parts: _Parts, card_uuid: str | None) -> TicketForReview:
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
                claim_count=len(parts.claims.get(task.uuid, ())),
                claimant_keys=_claimant_keys(card_uuid, parts.claims.get(task.uuid, ())),
                recruiting_stopped=task.recruiting_stopped_at is not None,
                properties=tuple(
                    PropertyForReview(
                        uuid=str(prop.uuid),
                        property_name=prop.property_name,
                        property_value=prop.property_value,
                        quantity=prop.quantity,
                        status=prop.status,
                        comment=prop.comment,
                        display_label=_label(parts.labels, task.task_type, prop.property_name),
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
        location=_location(parts.locations.get(str(ticket.uuid))),
    )
    return replace(review, version=ticket_version(review))


def _claimant_keys(card_uuid: str | None, people) -> tuple[str, ...]:
    if not card_uuid:
        return ()
    return tuple(sorted(claimant_key(card_uuid, person) for person in people))


def _label(labels: dict, task_type: str, property_name: str) -> str:
    return labels.get((task_type, property_name)) or property_name


def _location(row: SecondaryLocation | None) -> LocationForReview | None:
    if row is None:
        return None
    return LocationForReview(
        location_type=row.location_type,
        full_address=row.full_address,
        building_section=row.building_section,
        floor=row.floor,
        room=row.room,
        pole_id=row.pole_id,
    )


async def tickets_for_pair(
    db: AsyncSession, pair: DuplicatePair
) -> tuple[TicketForReview | None, TicketForReview | None] | None:
    """Both sides' tickets, or None for a card that is not about tickets (a station card)."""
    if pair.entity_kind not in ("ticket", "ticket_task"):
        return None
    low, high = await ticket_uuids_for_pair(db, pair)
    found = await tickets_for_review(db, (low, high), card_uuid=str(pair.uuid))
    return found.get(low) if low else None, found.get(high) if high else None
