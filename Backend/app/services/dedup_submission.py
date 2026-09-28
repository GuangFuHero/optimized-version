"""Two-phase create for the interactive GraphQL path (Spec 020 §5, ADR-296/299).

First submission: validate, then ask the dedup engine. A match returns `Suspected` and creates
nothing — the submitter decides. No match creates as usual.

Acknowledged submission (`acknowledged_duplicate_of` set): validate, create without checking
again (so the submitter is never shown a second hint), and card the pair — all in one commit.

Batch import does not come through here; it calls `create_ticket` / `create_station` directly.
"""

from dataclasses import dataclass, replace
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.services import dedup as dedup_service
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.dedup_snapshot import station_submission, ticket_submission


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
