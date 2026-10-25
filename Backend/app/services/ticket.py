"""Ticket write actions (ticket / task / task-property / assignment).

Same flat-service style as station.py: `db` first, keyword-only args, each function owns
its own authz + validation + persistence (ADR-013/014/015/022).
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import validate_disaster_types
from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom, geom_to_geojson
from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.repositories.auth_repository import user_repository
from app.repositories.geo_repository import (
    building_map_ticket_repository,
    secondary_location_repository,
)
from app.repositories.photo_repository import photo_repository
from app.repositories.tickets_repository import (
    task_assignment_repository,
    task_property_repository,
    ticket_disaster_detail_repository,
    ticket_repository,
    ticket_task_repository,
)
from app.services.address import apply_address, point_of
from app.services.authz import require_scope
from app.services.building_map import place_ticket
from app.services.geo_validation import (
    check_address_lengths,
    normalize_contact_fields,
    validate_point,
)
from app.services.notification_service import NotificationService
from app.services.photo import normalize_photo_url
from app.services.ticket_audit import lock_ticket, void_stale_verdict
from app.services.ticket_status import recompute_ticket_status

# Size limits for `set_ticket_disaster_details` (ADR-267). ADR-092 leaves the vocabulary
# unchecked but bounded nothing, so ticket.edit on one ticket was a megabyte store — the
# values are publicly readable and copied into `audit_logs`. Generous against the seeded form
# (14 fields, largest a 4-option multi_select) and still a hard ceiling.
MAX_DISASTER_DETAIL_FIELDS = 100
MAX_DISASTER_DETAIL_VALUES = 50
MAX_DISASTER_DETAIL_VALUE_LENGTH = 500
# Matches `ticket_disaster_details.property_name`: a longer key used to reach the column and
# come back as "Unexpected error." rather than naming itself.
MAX_DISASTER_DETAIL_KEY_LENGTH = 100

# A task in one of these states takes no more volunteers: done, or called off. Note the task
# vocabulary spells it `canceled`, unlike the ticket-level `cancelled` below.
CLOSED_TASK_STATUSES = frozenset({"fulfilled", "canceled"})
# A ticket in one of these states takes no more volunteers on any of its tasks, whatever each
# task's own status says. Now that a ticket's status is worked out from its needs and only
# deleting it cancels it, that matters only for tickets closed by hand before then, whose needs
# were left pending.
CLOSED_TICKET_STATUSES = frozenset({"completed", "cancelled"})

# The kinds of help a need can ask for — the values `CreateTicketTaskInput.taskType` documents
# and `chart_render` labels. Enforced only by `create_help_request`; `create_ticket_task`
# still stores whatever it is sent. The site's GraphQL input lists them as `NeedKind`
# (graphql/tickets/types.py): keep the two in step.
TASK_TYPES = frozenset({"rescue", "supply", "medical", "hr"})
# Every need but a rescue must say how many (ADR-291 point 7): without a quantity a need never
# fills, so its ticket never completes. A rescue may not know how many it takes, as the design
# leaves it out of the 缺額 count; it alone may come without one, and then has no cap. Written as
# the exception rather than a list, so a kind the back office configured itself (ADR-214) counts too.
QUANTITY_OPTIONAL_TASK_TYPES = frozenset({"rescue"})
# `tickets.title` and `ticket_tasks.task_name` are both String(200).
TICKET_TITLE_MAX_LENGTH = 200
TASK_NAME_MAX_LENGTH = 200
# Photo links a citizen may file with a request — the site's own limit, the same number its
# form stops at (the prototype's TK_PHOTO_MAX in wg-photos.jsx).
HELP_REQUEST_PHOTO_MAX = 10
# Needs a request may be filed with at once. The prototype sets no limit; without one, a single
# request could file thousands. Needs added later, one 「再加一件」 at a time, are not counted.
HELP_REQUEST_NEED_MAX = 20


async def _task_scope_target(db: AsyncSession, task: TicketTask) -> SimpleNamespace:
    """Scope target for a ticket task (ADR-052, direction B).

    A TicketTask has no geometry of its own, so `zone` scope could never match it
    directly (in_scope's ZONE branch needs resource.geometry). Direction B: the task
    borrows its parent ticket's location for the zone check, so a team's `zone`-scoped
    ticket.edit / ticket.assign reaches the tasks under tickets sitting inside its
    TeamZone. `own` is unchanged — it still means the task's own creator.
    """
    parent = await ticket_repository.get_by_uuid_active(db, task.ticket_uuid)
    return SimpleNamespace(
        created_by=task.created_by,
        team_uuid=None,
        geometry=parent.geometry if parent else None,
    )


async def _assignment_scope_target(db: AsyncSession, assignment: TaskAssignment) -> SimpleNamespace:
    """Scope target for a task assignment (ADR-045 + ADR-052).

    `own` means "I am the assignee" (actor_uuid), not "I created this row" (ADR-045).
    `zone` borrows the assignment's task's parent-ticket location (ADR-052, direction B),
    so a coordinator with ticket.assign=zone can manage assignments on tasks inside their
    TeamZone.
    """
    task = await ticket_task_repository.get_by_uuid_active(db, assignment.task_uuid)
    parent = await ticket_repository.get_by_uuid_active(db, task.ticket_uuid) if task else None
    return SimpleNamespace(
        created_by=str(assignment.actor_uuid),
        team_uuid=None,
        geometry=parent.geometry if parent else None,
    )


@dataclass(frozen=True)
class TicketFields:
    """A ticket that passed authz and validation but is not written yet.

    `values` are the normalized column values, ready for `ticket_repository.add`; `point` is
    the validated GeoJSON Point they were built from. With `building_map_uuid`, the point and
    address are the building's.
    """

    point: dict
    values: dict
    secondary_location: dict | None
    building_map_uuid: str | None = None


async def validate_ticket(
    db: AsyncSession,
    *,
    actor: User,
    geometry: dict | None,
    title: str,
    description: str | None,
    contact_name: str,
    contact_email: str | None,
    contact_phone: str | None,
    priority: str,
    task_type: str | None,
    disaster_types: list[str] | None = None,
    person_trapped_reported: str | None = None,
    immediate_danger_reported: str | None = None,
    secondary_location: dict | None = None,
    building_map_uuid: str | None = None,
) -> TicketFields:
    """Checkpoint 1 plus every input check `create_ticket` makes, without writing anything.

    `disaster_types` is validated against the vocabulary table before anything is written: a
    ticket filed under a disaster that does not exist would store cleanly and then render an
    empty disaster-field form, telling the reporter nothing was asked of them.
    """
    await require_scope(actor, Perm.TICKET_ADD, db)
    if building_map_uuid:
        geometry, secondary_location = await place_ticket(db, building_map_uuid, geometry, secondary_location)
    if geometry is None:
        raise ValueError("geometry or buildingMapUuid is required")
    disaster_types = await validate_disaster_types(db, disaster_types or [])
    validate_point(geometry, entity="Ticket")
    contacts = normalize_contact_fields(
        {
            "contact_name": contact_name,
            "contact_email": contact_email,
            "contact_phone": contact_phone,
        },
        # tickets.contact_name is NOT NULL, unlike the station column of the same name, so a
        # whitespace-only value has to be refused here rather than normalized to None.
        required=frozenset({"contact_name"}),
    )
    if building_map_uuid:
        # The building's address is copied in already split and graded.
        check_address_lengths(secondary_location)
    else:
        secondary_location = apply_address(secondary_location, point=point_of(geometry))
    return TicketFields(
        point=geometry,
        values={
            "title": title,
            "description": description,
            # Normalized, not raw — same reason as create_station in station.py.
            **contacts,
            "priority": priority,
            "task_type": task_type,
            "disaster_types": disaster_types,
            "person_trapped_reported": person_trapped_reported,
            "immediate_danger_reported": immediate_danger_reported,
        },
        secondary_location=secondary_location,
        building_map_uuid=building_map_uuid,
    )


async def insert_ticket(db: AsyncSession, *, actor: User, fields: TicketFields) -> Tickets:
    """Write a validated ticket and its address, and flush. The caller owns the commit.

    `secondary_location` is new in feature 018. Stations have been able to carry an address
    since they existed; tickets could not, which meant the one record that most needs a door
    number — somebody asking to be found — had only a map pin.
    """
    ticket = await ticket_repository.add(
        db,
        obj_in={
            "property_name": "request",
            "geometry": geojson_to_geom(fields.point),
            "created_by": str(actor.uuid),
            "status": "pending",
            **fields.values,
        },
    )
    if fields.secondary_location:
        # A ticket's uuid IS its base_geometries.uuid (joined-table inheritance), which is
        # what secondary_locations.geometry_uuid points at — the same key the station path
        # uses, so one address table serves both.
        await secondary_location_repository.add(
            db, obj_in={"geometry_uuid": str(ticket.uuid), **fields.secondary_location}
        )
    if fields.building_map_uuid:
        await building_map_ticket_repository.add(
            db,
            obj_in={"ticket_uuid": str(ticket.uuid), "building_map_uuid": fields.building_map_uuid},
        )
    return ticket


async def create_ticket(
    db: AsyncSession,
    *,
    actor: User,
    geometry: dict | None,
    title: str,
    description: str | None,
    contact_name: str,
    contact_email: str | None,
    contact_phone: str | None,
    priority: str,
    task_type: str | None,
    disaster_types: list[str] | None = None,
    person_trapped_reported: str | None = None,
    immediate_danger_reported: str | None = None,
    secondary_location: dict | None = None,
    building_map_uuid: str | None = None,
) -> Tickets:
    """Create a support ticket (checkpoint 1 only — a new ticket has no prior owner).

    Validate, insert, and one commit that makes the ticket + address pair atomic, exactly as
    `station.py::create_station` does. Batch import calls this; the interactive GraphQL path
    goes through `dedup_submission.submit_new_ticket`, which runs the same two steps around a
    duplicate check.
    """
    fields = await validate_ticket(
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
        disaster_types=disaster_types,
        person_trapped_reported=person_trapped_reported,
        immediate_danger_reported=immediate_danger_reported,
        secondary_location=secondary_location,
        building_map_uuid=building_map_uuid,
    )
    ticket = await insert_ticket(db, actor=actor, fields=fields)
    await db.commit()
    await db.refresh(ticket)
    return ticket


def _validate_help_request_task(task: dict) -> None:
    """Refuse a need the public site could not have meant: its kind, a name, and its size."""
    if task["task_type"] not in TASK_TYPES:
        raise ValueError(f"Unknown task type: {task['task_type']}")
    if not task["task_name"].strip():
        raise ValueError("task_name is required")
    _validate_need_size(task["task_type"], task["task_name"], task.get("quantity"))


def _validate_need_size(task_type: str, task_name: str, quantity: int | None) -> None:
    """Refuse a name its column cannot hold, a quantity that asks for nobody, or none where needed.

    Past the column's limit the database raises an error the client only sees as "Unexpected
    error."; a zero quantity would read as full the moment it was filed (`_lock_task_with_room`);
    and a need of a kind that counts heads without one would never fill (ADR-291 point 7).
    """
    if len(task_name) > TASK_NAME_MAX_LENGTH:
        raise ValueError(f"task_name must be at most {TASK_NAME_MAX_LENGTH} characters")
    if quantity is None:
        if task_type not in QUANTITY_OPTIONAL_TASK_TYPES:
            raise ValueError(f"quantity is required for a {task_type} task")
    elif quantity < 1:
        raise ValueError("quantity must be at least 1")


def _checked_photo_links(photo_urls: list[str] | None) -> list[str]:
    """The photo links of a request as they will be stored, or refuse them all.

    Links only — the platform keeps no image (TM-IMG-101). Each goes through
    `normalize_photo_url`, as a station's photo does, and the checked string is the one stored;
    a link repeated is kept, as the site's form lets it be (TM-IMG-125).
    """
    links = photo_urls or []
    if len(links) > HELP_REQUEST_PHOTO_MAX:
        raise ValueError(f"At most {HELP_REQUEST_PHOTO_MAX} photos are allowed")
    return [normalize_photo_url(link) for link in links]


async def create_help_request(
    db: AsyncSession,
    *,
    actor: User,
    geometry: dict,
    title: str,
    description: str | None,
    contact_name: str,
    contact_phone: str | None,
    secondary_location: dict | None,
    tasks: list[dict],
    photo_urls: list[str] | None = None,
    contact_email: str | None = None,
) -> Tickets:
    """File a citizen's request for help: the ticket, every need and photo link, in one commit.

    The public site's 「請求協助」. `create_ticket` followed by one `create_ticket_task` per need
    commits each step on its own, so a failure part-way leaves a ticket with some of its needs
    missing and a retry files a second ticket. Here nothing is written unless all of it is.

    The site never asks how urgent a request is: priority is `medium`, and staff adjust it
    afterwards. The ticket's own `task_type` is the first need's, as the admin form sets it. An
    email is optional; the account's own is never filled in for it.

    Photo links (「現場照片（選填）」) become the ticket's photos, read back by
    `TicketType.photos` and withheld from whoever cannot see the ticket's detail.
    """
    await require_scope(actor, Perm.TICKET_ADD, db)
    if not title.strip():
        raise ValueError("title is required")
    if len(title) > TICKET_TITLE_MAX_LENGTH:
        raise ValueError(f"title must be at most {TICKET_TITLE_MAX_LENGTH} characters")
    if not tasks:
        raise ValueError("At least one task is required")
    if len(tasks) > HELP_REQUEST_NEED_MAX:
        raise ValueError(f"At most {HELP_REQUEST_NEED_MAX} tasks are allowed")
    # Every need and photo link is checked before anything is written, so one bad one refuses
    # the request rather than leaving the ones before it filed.
    for task in tasks:
        _validate_help_request_task(task)
    photo_links = _checked_photo_links(photo_urls)
    validate_point(geometry, entity="Ticket")
    contacts = normalize_contact_fields(
        {"contact_name": contact_name, "contact_email": contact_email, "contact_phone": contact_phone},
        required=frozenset({"contact_name"}),
    )
    secondary_location = apply_address(secondary_location, point=point_of(geometry))
    creator = str(actor.uuid)
    ticket = await ticket_repository.add(
        db,
        obj_in={
            "property_name": "request",
            "geometry": geojson_to_geom(geometry),
            "created_by": creator,
            "title": title,
            "description": description,
            **contacts,
            "status": "pending",
            "priority": "medium",
            "task_type": tasks[0]["task_type"],
        },
    )
    if secondary_location:
        await secondary_location_repository.add(
            db, obj_in={"geometry_uuid": str(ticket.uuid), **secondary_location}
        )
    for position, task in enumerate(tasks):
        await ticket_task_repository.add(
            db,
            obj_in={
                "ticket_uuid": str(ticket.uuid),
                "task_type": task["task_type"],
                "task_name": task["task_name"],
                "task_description": task.get("task_description"),
                "quantity": task.get("quantity"),
                "source": "user",
                "created_by": creator,
                # One transaction means one `now()` for every need, and the tasks loader
                # breaks that tie on uuid — random. A microsecond apart keeps them in the order
                # the requester listed them (第 1 件、第 2 件…) on the database's own clock.
                "created_at": func.now() + timedelta(microseconds=position),
            },
        )
    for position, url in enumerate(photo_links):
        await photo_repository.add(
            db,
            obj_in={
                # 'geometry': the ticket's base_geometries row, which the photo loader reads.
                "ref_uuid": str(ticket.uuid),
                "ref_type": "geometry",
                "url": url,
                "created_by": creator,
                # As for the needs: the loader sorts on created_at, then uuid.
                "created_at": func.now() + timedelta(microseconds=position),
            },
        )
    await db.commit()
    await db.refresh(ticket)
    return ticket


async def list_my_tickets(db: AsyncSession, *, actor: User) -> list[Tickets]:
    """The tickets `actor` filed — 「我的任務 › 我建立的」.

    Newest first and unpaged: one person files few, which is also why `created_by` carries no
    index. Every status is listed, since following a ticket to completion is what the list
    is for; a deleted ticket drops off. No capability check: these are the caller's own tickets,
    each still masked per field by TicketType like anywhere else. `created_by` is the person, so
    the list is the same whichever identity they act as.
    """
    rows = await db.scalars(
        select(Tickets)
        .where(Tickets.created_by == str(actor.uuid), Tickets.delete_at.is_(None))
        .order_by(Tickets.created_at.desc(), Tickets.uuid.desc())
    )
    return list(rows.all())


async def update_ticket(
    db: AsyncSession,
    *,
    actor: User,
    uuid: str,
    changes: dict,
    secondary_location: dict | None = None,
) -> Tickets:
    """Update a ticket, checked against the loaded ticket with ticket.edit.

    `changes` is the already-diffed field dict. It never carries `status`: a ticket's status is
    worked out from its needs (`ticket_status.recompute_ticket_status`), not set by hand. Nor the
    audit fields, which only `ticket_audit.audit_ticket` writes; a content change here can void
    the verdict, though (`ticket_audit.void_stale_verdict`).

    `secondary_location` replaces the ticket's address, creating the row if the ticket was
    filed without one (ADR-268). Create-only would mean a mistyped door number stays wrong
    for the rescue team that has to find it.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)
    if secondary_location is not None:
        secondary_location = apply_address(
            secondary_location, point=point_of(geom_to_geojson(ticket.geometry))
        )
        await _replace_secondary_location(db, str(ticket.uuid), secondary_location)

    obj_in = dict(changes)
    if "disaster_types" in obj_in:
        # `keep`: the ticket's current types pass even if retired since it was filed, so
        # dropping one type does not require the others still to be active (ADR-266).
        obj_in["disaster_types"] = await validate_disaster_types(
            db, obj_in["disaster_types"] or [], keep=ticket.disaster_types or []
        )
    for field, value in obj_in.items():
        if hasattr(ticket, field):
            setattr(ticket, field, value)
    await db.flush()
    await void_stale_verdict(db, str(ticket.uuid))
    await db.commit()
    await db.refresh(ticket)
    return ticket


async def _replace_secondary_location(db: AsyncSession, geometry_uuid: str, values: dict) -> None:
    """Overwrite the address row for a geometry, or create it when there is none.

    A whole-input replacement, so clearing a member means sending it null, not omitting it.
    Flush only: `update_ticket` commits.
    """
    existing = await secondary_location_repository.get_by_geometry(db, geometry_uuid)
    if existing is None:
        await secondary_location_repository.add(db, obj_in={"geometry_uuid": geometry_uuid, **values})
        return
    for field, value in values.items():
        setattr(existing, field, value)
    await db.flush()


async def set_ticket_disaster_details(
    db: AsyncSession, *, actor: User, ticket_uuid: str, details: dict[str, list[str]]
) -> list[TicketDisasterDetail]:
    """Replace a ticket's disaster-field values wholesale.

    `details` maps `property_name` to its selected values — one entry for a single-valued
    field, several for a `multi_select`. An empty list clears the field; a `property_name`
    absent from the mapping is also cleared, because this is a replacement, not a patch. That
    choice matches how the form actually submits: the reporter sees every field at once and
    sends back the whole answer set, so a merge would make un-answering a question impossible.

    Per ADR-092 nothing here is checked against `ticket_property_config` — not the key, not
    the value. A field retired between the form loading and it being submitted still stores,
    because losing a trapped person's answer to a config change would be far worse than
    keeping a row whose definition has moved on.

    *Size* is checked, which ADR-092 never covered — see the MAX_DISASTER_DETAIL_* constants
    above (ADR-267).

    Delete-then-insert inside one transaction, committed once, so a reader never observes the
    ticket mid-swap with half its answers gone.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, ticket_uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)
    _check_disaster_detail_size(details)

    await ticket_disaster_detail_repository.delete_for_ticket(db, ticket_uuid)
    for property_name, values in details.items():
        # dict.fromkeys, not set(): duplicates would violate the unique constraint, but the
        # reporter's ordering is the one thing worth keeping when it survives at all.
        for value in dict.fromkeys(v for v in values if v is not None and v != ""):
            await ticket_disaster_detail_repository.add(
                db,
                obj_in={
                    "ticket_uuid": ticket_uuid,
                    "property_name": property_name,
                    "value": value,
                },
            )
    await db.flush()
    await void_stale_verdict(db, ticket_uuid)
    await db.commit()
    return await ticket_disaster_detail_repository.list_by_ticket(db, ticket_uuid)


def _check_disaster_detail_size(details: dict[str, list[str]]) -> None:
    """Reject a detail payload that exceeds the ADR-267 ceilings, naming what broke.

    `ValueError` is allow-listed by the `MaskErrors` extension, so the reporter is told which
    key or value was too big rather than getting "Unexpected error."
    """
    if len(details) > MAX_DISASTER_DETAIL_FIELDS:
        raise ValueError(f"一次最多只能填寫 {MAX_DISASTER_DETAIL_FIELDS} 個災害欄位")
    for property_name, values in details.items():
        if len(property_name) > MAX_DISASTER_DETAIL_KEY_LENGTH:
            raise ValueError(f"欄位名稱長度上限為 {MAX_DISASTER_DETAIL_KEY_LENGTH} 字：{property_name[:20]}…")
        if len(values) > MAX_DISASTER_DETAIL_VALUES:
            raise ValueError(f"欄位「{property_name}」的選項數量上限為 {MAX_DISASTER_DETAIL_VALUES}")
        for value in values:
            if value is not None and len(value) > MAX_DISASTER_DETAIL_VALUE_LENGTH:
                raise ValueError(
                    f"欄位「{property_name}」的單一值長度上限為 {MAX_DISASTER_DETAIL_VALUE_LENGTH} 字"
                )


async def delete_ticket(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Delete a whole ticket — the requester's 「刪除整張單」.

    ticket.delete, checked before the locks. Any ticket not already deleted can go. It is
    cancelled and soft-deleted — a disaster help-request is never destroyed, only hidden, and the
    audit trigger records the deletion either way. Cancelled is final: a cancelled ticket's status
    is never worked out again (recompute_ticket_status), so it is not called.

    Every need still on it goes with it the way delete_ticket_task deletes one; a need deleted
    earlier keeps its record, and its people were told then. The people on the needs stay
    recorded. The ticket is locked first and then its needs in uuid order, the order every writer
    keeps, and all of it commits once. Everyone on those needs then hears, once however many of
    them they were on.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_DELETE, db, resource=ticket)

    ticket = await db.scalar(
        select(Tickets)
        .where(Tickets.uuid == uuid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if ticket.delete_at is not None:
        # Deleted by a concurrent call while this one waited for the lock.
        raise ValueError("Ticket not found")
    needs = (
        await db.scalars(
            select(TicketTask)
            .where(TicketTask.ticket_uuid == uuid, TicketTask.delete_at.is_(None))
            .order_by(TicketTask.uuid)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).all()
    now = datetime.now(UTC)
    ticket.status = "cancelled"
    ticket.delete_at = now
    for need in needs:
        mark_need_deleted(need, now)
    claimants = set()
    if needs:
        on_needs = await db.scalars(
            select(TaskAssignment.actor_uuid).where(TaskAssignment.task_uuid.in_([n.uuid for n in needs]))
        )
        claimants = {str(person) for person in on_needs}
    ticket_id, ticket_title, actor_uid = ticket.uuid, ticket.title, actor.uuid
    await db.commit()

    await NotificationService.dispatch(
        db,
        event_type="ticket_deleted",
        title=f"你承接的求助「{ticket_title}」已刪除",
        body="整張求助單已經刪除，你承接的需求都不用前往了。",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="ticket",
        ref_uuid=ticket_id,
        explicit_recipients=list(claimants),
    )


def mark_need_deleted(task: TicketTask, now: datetime) -> None:
    """Cancel and soft-delete a need at once; completed_at goes with the fulfilled state it leaves."""
    task.status = "canceled"
    task.canceled_at = now
    task.completed_at = None
    task.delete_at = now


async def delete_ticket_task(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Delete one need — the requester's 「刪除這筆需求」.

    ticket.delete on the need's ticket, as for deleting the whole ticket, checked before the
    locks: for a signed-in citizen that means their own ticket, whoever added the need. Any need
    not already deleted can go, one that has everyone it asked for included, since the
    requester's plans can change after people signed up.

    The need is canceled and soft-deleted at once, so no query shows it and nothing brings it
    back; completed_at goes with the fulfilled state it leaves. The people on it stay recorded.
    The ticket's status is worked out again, and all of it commits once, under the locks on the
    ticket and then the need (_lock_ticket_and_task). Everyone on the need then hears they need
    not go.
    """
    unlocked = await ticket_task_repository.get_by_uuid_active(db, uuid)
    ticket = await ticket_repository.get_by_uuid_active(db, unlocked.ticket_uuid) if unlocked else None
    if not ticket:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_DELETE, db, resource=ticket)

    ticket, task = await _lock_ticket_and_task(db, task_uuid=uuid)
    mark_need_deleted(task, datetime.now(UTC))
    await db.flush()
    await recompute_ticket_status(db, ticket_uuid=str(ticket.uuid))
    claimants = [str(a.actor_uuid) for a in await task_assignment_repository.list_by_task(db, uuid)]
    task_id, task_name, ticket_title, actor_uid = task.uuid, task.task_name, ticket.title, actor.uuid
    await db.commit()

    await NotificationService.dispatch(
        db,
        event_type="task_deleted",
        title=f"你承接的「{task_name}」已刪除",
        body=f"{ticket_title}　這筆需求已經刪除，不用前往了。",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=claimants,
    )


@dataclass(frozen=True)
class TaskFields:
    """A ticket task that passed authz and validation but is not written yet.

    Carries no ticket: a new ticket's tasks are validated before the ticket exists.
    """

    values: dict


async def validate_ticket_task(
    db: AsyncSession,
    *,
    actor: User,
    task_type: str,
    task_name: str,
    task_description: str | None,
    quantity: int | None,
    source: str,
    route_uuid: str | None,
) -> TaskFields:
    """Checks for a task filed with a new ticket, without writing: ticket.add, its name and size."""
    await require_scope(actor, Perm.TICKET_ADD, db)
    _validate_need_size(task_type, task_name, quantity)
    return TaskFields(
        values={
            "task_type": task_type,
            "task_name": task_name,
            "task_description": task_description,
            "quantity": quantity,
            "source": source,
            "route_uuid": route_uuid,
        }
    )


async def insert_ticket_task(
    db: AsyncSession, *, actor: User, ticket_uuid: str, fields: TaskFields
) -> TicketTask:
    """Write a validated task under `ticket_uuid` and flush. The caller owns the commit."""
    return await ticket_task_repository.add(
        db, obj_in={"ticket_uuid": ticket_uuid, "created_by": str(actor.uuid), **fields.values}
    )


async def validate_added_task(
    db: AsyncSession,
    *,
    actor: User,
    ticket_uuid: str,
    task_type: str,
    task_name: str,
    task_description: str | None,
    quantity: int | None,
    source: str,
    route_uuid: str | None,
) -> TaskFields:
    """Every check for adding a need to an existing ticket (the site's 「再加一件」), without writing.

    ticket.edit on the ticket: a signed-in citizen adds to their own ticket only, while
    back-office roles keep their ticket.edit's reach. A ticket cancelled by hand before statuses
    were derived takes no need, since cancelled is final and nobody could claim it.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, ticket_uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)
    if ticket.status == "cancelled":
        raise ValueError("Ticket is no longer open")
    _validate_need_size(task_type, task_name, quantity)
    return TaskFields(
        values={
            "task_type": task_type,
            "task_name": task_name,
            "task_description": task_description,
            "quantity": quantity,
            "source": source,
            "route_uuid": route_uuid,
        }
    )


async def insert_added_task(
    db: AsyncSession, *, actor: User, ticket_uuid: str, fields: TaskFields
) -> TicketTask:
    """Lock the ticket, add the need, work the ticket's status out, and flush. The caller commits.

    The ticket is locked first, the order every writer keeps, and read again under the lock, so a
    ticket deleted meanwhile takes no need. A completed ticket takes one and is open again: left
    completed, it would turn away every claim on the need (_lock_task_with_room).
    """
    ticket = await db.scalar(
        select(Tickets)
        .where(Tickets.uuid == ticket_uuid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if ticket is None or ticket.delete_at is not None:
        raise ValueError("Ticket not found")
    task = await insert_ticket_task(db, actor=actor, ticket_uuid=ticket_uuid, fields=fields)
    await recompute_ticket_status(db, ticket_uuid=ticket_uuid)
    await void_stale_verdict(db, ticket_uuid)
    return task


async def create_ticket_task(
    db: AsyncSession,
    *,
    actor: User,
    ticket_uuid: str,
    task_type: str,
    task_name: str,
    task_description: str | None,
    quantity: int | None,
    source: str,
    route_uuid: str | None,
) -> TicketTask:
    """Add a need to a ticket and commit, without a duplicate check.

    The interactive GraphQL path goes through `dedup_submission.submit_new_task`, which runs the
    same two steps around a duplicate check.
    """
    fields = await validate_added_task(
        db,
        actor=actor,
        ticket_uuid=ticket_uuid,
        task_type=task_type,
        task_name=task_name,
        task_description=task_description,
        quantity=quantity,
        source=source,
        route_uuid=route_uuid,
    )
    task = await insert_added_task(db, actor=actor, ticket_uuid=ticket_uuid, fields=fields)
    await db.commit()
    await db.refresh(task)
    return task


async def import_ticket_task(
    db: AsyncSession,
    *,
    actor: User,
    ticket_uuid: str,
    task_type: str,
    task_name: str,
    task_description: str | None,
    quantity: int | None,
    source: str,
    route_uuid: str | None,
) -> TicketTask:
    """Add a need for a bulk import row (ADR-120).

    ticket.add alone, the rule createTicketTask had before 2026-09-28: who may import what is the
    back office's to decide, not the public site's. The row's columns were checked by the import
    itself (bulk_columns); the name and quantity are checked again here, as for any need, in case
    a caller skips that.
    """
    await require_scope(actor, Perm.TICKET_ADD, db)
    _validate_need_size(task_type, task_name, quantity)
    fields = TaskFields(
        values={
            "task_type": task_type,
            "task_name": task_name,
            "task_description": task_description,
            "quantity": quantity,
            "source": source,
            "route_uuid": route_uuid,
        }
    )
    task = await insert_added_task(db, actor=actor, ticket_uuid=ticket_uuid, fields=fields)
    await db.commit()
    await db.refresh(task)
    return task


async def update_ticket_task(db: AsyncSession, *, actor: User, uuid: str, changes: dict) -> TicketTask:
    """Update a ticket task, checked against the task with ticket.edit.

    A need borrows its ticket's location, so `zone` reaches it (_task_scope_target). A change to
    what the need asks for can void the ticket's verdict (`ticket_audit.void_stale_verdict`).

    A task's status is not editable (ADR-293): it moves only through the actions that own it —
    a claim filling it, a release reopening it, the requester stopping recruitment, a deletion —
    each of which keeps its timestamps and sends its notice. An edit that could set it would
    reopen a need its requester stopped, or close one silently; `changes` naming it is refused.
    """
    if "status" in changes:
        raise ValueError(
            "A task's status changes only by claiming, releasing, stopping recruitment or deleting"
        )
    task = await ticket_task_repository.get_by_uuid_active(db, uuid)
    if not task:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=await _task_scope_target(db, task))
    # The ticket before the need, the order every writer keeps: voiding the verdict locks it.
    await lock_ticket(db, str(task.ticket_uuid))
    task = await _need_still_on(db, task.uuid, task.ticket_uuid)

    for field, value in changes.items():
        if hasattr(task, field):
            setattr(task, field, value)
    await db.flush()
    await void_stale_verdict(db, str(task.ticket_uuid))
    await db.commit()
    updated_task = task
    await db.refresh(updated_task)
    return updated_task


async def create_task_property(
    db: AsyncSession,
    *,
    actor: User,
    task_uuid: str,
    property_name: str,
    property_value: str,
    quantity: int | None,
    comment: str | None,
) -> TaskProperty:
    """Add a structured property to a ticket task — createTaskProperty.

    ticket.edit on the parent task, as updateTaskProperty asks: ticket.add alone, which every
    signed-in account holds at `all`, let anyone attach properties to someone else's need. A need
    borrows its ticket's location, so `zone` reaches it (_task_scope_target).
    """
    task = await ticket_task_repository.get_by_uuid_active(db, task_uuid)
    if not task:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=await _task_scope_target(db, task))
    return await _add_task_property(
        db,
        task=task,
        property_name=property_name,
        property_value=property_value,
        quantity=quantity,
        comment=comment,
    )


async def import_task_property(
    db: AsyncSession,
    *,
    actor: User,
    task_uuid: str,
    property_name: str,
    property_value: str,
) -> TaskProperty:
    """Add a structured property for a bulk import row (ADR-120).

    ticket.add alone, as import_ticket_task: the row's need is one the import just added or
    matched, and who may import what is the back office's to decide, not the public site's.
    """
    await require_scope(actor, Perm.TICKET_ADD, db)
    task = await ticket_task_repository.get_by_uuid_active(db, task_uuid)
    if not task:
        raise ValueError("Ticket task not found")
    return await _add_task_property(
        db,
        task=task,
        property_name=property_name,
        property_value=property_value,
        quantity=None,
        comment=None,
    )


async def _add_task_property(
    db: AsyncSession,
    *,
    task: TicketTask,
    property_name: str,
    property_value: str,
    quantity: int | None,
    comment: str | None,
) -> TaskProperty:
    """Write the property, void the ticket's verdict if it no longer holds, and commit."""
    ticket_uuid = str(task.ticket_uuid)
    # The ticket before the need, the order every writer keeps: the new row holds the need too.
    await lock_ticket(db, ticket_uuid)
    await _need_still_on(db, task.uuid, ticket_uuid)
    prop = await task_property_repository.add(
        db,
        obj_in={
            "task_uuid": str(task.uuid),
            "property_name": property_name,
            "property_value": property_value,
            "quantity": quantity,
            "comment": comment,
        },
    )
    await void_stale_verdict(db, ticket_uuid)
    await db.commit()
    await db.refresh(prop)
    return prop


async def update_task_property(db: AsyncSession, *, actor: User, uuid: str, changes: dict) -> TaskProperty:
    """Update a task property (checkpoint 2 scope-checked against the *parent* task).

    A new name or value can void the ticket's verdict; quantity, status and comment cannot.
    """
    prop = await task_property_repository.get_by_uuid_active(db, uuid)
    if not prop:
        raise ValueError("Task property not found")
    task = await ticket_task_repository.get_by_uuid_active(db, prop.task_uuid)
    if not task:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=await _task_scope_target(db, task))
    ticket_uuid = str(task.ticket_uuid)
    await lock_ticket(db, ticket_uuid)  # the ticket before the need, as in _add_task_property
    await _need_still_on(db, task.uuid, ticket_uuid)
    on_task = await db.scalar(select(TaskProperty.task_uuid).where(TaskProperty.uuid == prop.uuid))
    if str(on_task) != str(task.uuid):
        # The item itself moved to the need its need folded into (ADR-388).
        raise ValueError(MOVED_DURING_DEDUP)
    for field, value in changes.items():
        if hasattr(prop, field):
            setattr(prop, field, value)
    await db.flush()
    await void_stale_verdict(db, ticket_uuid)
    await db.commit()
    await db.refresh(prop)
    return prop


async def assign_task_actor(
    db: AsyncSession, *, actor: User, task_uuid: str, actor_uuid: str | None, role: str | None
) -> TaskAssignment:
    """Link a person to a task — self-signup when actor_uuid is omitted/equals the caller.

    Self-signup needs only ticket.assign (checkpoint 1); assigning someone else also
    scope-checks the task (checkpoint 2). The same actor can't be linked to a task twice.

    A fulfilled or canceled task takes nobody, nor does a task of a completed or cancelled
    ticket. A volunteer claims a need, not a ticket (PUB-PS-140), and a task with a `quantity`
    takes nobody more once it has that many people — not even from a coordinator assigning
    someone else (ADR-291, reversing d847624): to send more, they open another need. A task
    without one has no cap, as the requester never said how many. The claim that brings a task
    to its `quantity` marks it fulfilled in the same commit (ADR-291): it has everyone it asked
    for, and they still go — fulfilled is not "done". The ticket's status is worked out again in
    the same commit. The need's ticket and then the need are locked FOR UPDATE from
    the count to the commit (_lock_ticket_and_task), so two people racing for the last place
    cannot both get it. Authorization runs first, so a caller who will be refused never takes
    the locks. A task whose ticket was deleted is gone with it.

    Three notices go out: the assignee hears they were assigned (dispatch() drops it for a
    self-signup), the requester hears who is coming, and when this claim fills the need,
    everyone already on it hears it is complete.
    """
    current_uuid = str(actor.uuid)
    target_actor = actor_uuid or current_uuid
    self_signup = target_actor == current_uuid
    if self_signup:
        await require_scope(actor, Perm.TICKET_ASSIGN, db)
        assignee_name = actor.name
    else:
        unlocked = await ticket_task_repository.get_by_uuid_active(db, task_uuid)
        if not unlocked:
            raise ValueError("Ticket task not found")
        await require_scope(actor, Perm.TICKET_ASSIGN, db, resource=await _task_scope_target(db, unlocked))
        assignee = await user_repository.get_by_uuid_active(db, target_actor)
        if not assignee:
            raise ValueError("User not found")
        assignee_name = assignee.name

    ticket, task, claimed = await _lock_task_with_room(db, task_uuid=task_uuid, target_actor=target_actor)

    # Plain values before the commit (expire_on_commit in tests), and the count taken under
    # the lock: `fills` must be decided here, not recounted after the lock is released.
    task_name = task.task_name
    task_id = task.uuid
    quantity = task.quantity
    fills = quantity is not None and claimed + 1 == quantity
    ticket_title = ticket.title
    requester = str(ticket.created_by) if ticket.created_by else None
    actor_uid = actor.uuid
    try:
        assignment = await task_assignment_repository.add(
            db,
            obj_in={
                "task_uuid": task_uuid,
                "actor_uuid": target_actor,
                "role": role,
                "status": "accepted",
            },
        )
        if fills:
            task.status = "fulfilled"
            task.completed_at = datetime.now(UTC)
        await db.flush()
        await recompute_ticket_status(db, ticket_uuid=str(ticket.uuid))
        await db.commit()
    except IntegrityError as exc:
        # Concurrent duplicate lost the race to uq_assignment_task_actor (PR #24 [10]) —
        # surface the same clean domain error instead of a raw 500.
        await db.rollback()
        raise ValueError("Actor already assigned to this task") from exc
    # 觸發 task_assignment_created 通知 (High)
    await NotificationService.dispatch(
        db,
        event_type="task_assignment_created",
        title=f"📋 您有新的任務指派：{task_name}",
        body=f"您已獲指派負責工單任務「{task_name}」。",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=[target_actor],
    )
    if requester is not None and requester != target_actor:
        await _notify_claim(
            db,
            task_id=task_id,
            task_name=task_name,
            ticket_title=ticket_title,
            requester=requester,
            actor_uid=actor_uid,
            assignee_name=assignee_name,
            claimed=claimed + 1,
            quantity=quantity,
        )
    if fills:
        await _notify_need_full(
            db,
            task_id=task_id,
            task_name=task_name,
            ticket_title=ticket_title,
            newcomer=target_actor,
            actor_uid=actor_uid,
        )
    await db.refresh(assignment)
    return assignment


async def list_my_claims(
    db: AsyncSession, *, actor: User
) -> list[tuple[TaskAssignment, TicketTask, Tickets]]:
    """Every task `actor` is assigned to, with the task and its ticket — 「我承接的」.

    Newest claim first, unpaged: one volunteer's claims stay few. A fulfilled task stays listed,
    since its volunteers still go, and so does a canceled one, since seeing that is how they
    learn not to; a deleted task or ticket drops off. No capability check: these are the
    caller's own rows, and each ticket is still masked per field by TicketType like anywhere
    else.
    """
    rows = await db.execute(
        select(TaskAssignment, TicketTask, Tickets)
        .join(TicketTask, TicketTask.uuid == TaskAssignment.task_uuid)
        .join(Tickets, Tickets.uuid == TicketTask.ticket_uuid)
        .where(
            TaskAssignment.actor_uuid == actor.uuid,
            TicketTask.delete_at.is_(None),
            Tickets.delete_at.is_(None),
        )
        .order_by(TaskAssignment.assigned_at.desc(), TaskAssignment.uuid)
    )
    return [tuple(row) for row in rows.all()]


async def stop_recruiting(db: AsyncSession, *, actor: User, task_uuid: str) -> TicketTask:
    """Stop recruiting for one need — the requester's 「停止招募」 (ADR-292).

    ticket.edit on the need's ticket, as for any edit to it, checked before the locks. The need
    becomes fulfilled with its quantity cut to the people already on it — a need that never had
    one gets that count too — and recruiting_stopped_at records that it was stopped by hand, so
    it never reopens and its list is final: nobody on it can give their place back
    (unassign_task_actor). To recruit again, the requester opens another need. A need nobody
    claimed has no one to keep, so it is refused: the requester deletes it instead. Nor can a
    need that is no longer open be stopped. The ticket's status is worked out again, and all of
    it commits once.

    Everyone on the need hears, once it has committed, that it stopped and that they still go.
    Returns the need.
    """
    unlocked = await ticket_task_repository.get_by_uuid_active(db, task_uuid)
    ticket = await ticket_repository.get_by_uuid_active(db, unlocked.ticket_uuid) if unlocked else None
    if not ticket:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)

    ticket, task = await _lock_ticket_and_task(db, task_uuid=task_uuid)
    if task.status in CLOSED_TASK_STATUSES or ticket.status in CLOSED_TICKET_STATUSES:
        raise ValueError("Task is no longer open")
    claimants = [str(a.actor_uuid) for a in await task_assignment_repository.list_by_task(db, task_uuid)]
    if not claimants:
        raise ValueError("Nobody has claimed this task")
    now = datetime.now(UTC)
    task.status = "fulfilled"
    task.quantity = len(claimants)
    task.completed_at = now
    task.recruiting_stopped_at = now
    await db.flush()
    await recompute_ticket_status(db, ticket_uuid=str(ticket.uuid))
    task_id, task_name, ticket_title, actor_uid = task.uuid, task.task_name, ticket.title, actor.uuid
    await db.commit()

    await NotificationService.dispatch(
        db,
        event_type="task_recruiting_stopped",
        title=f"「{task_name}」已停止招募",
        body=f"{ticket_title}　建單者已停止招募，你仍在名單上，時間到請照常前往。",
        priority="medium",
        actor_uuid=actor_uid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=claimants,
    )
    await db.refresh(task)
    return task


# A dedup resolve (Spec 028) moves needs to the ticket it keeps, and claims and items to the need
# they fold into. A writer that read where a row lived before taking the ticket's lock may have
# queued behind that resolve; it re-reads under the lock and stops rather than act on the
# cancelled ticket or check its scope against the wrong one (ADR-388).
MOVED_DURING_DEDUP = (
    "This need was merged into another ticket while you were working on it; reload and try again"
)


async def _need_still_on(db: AsyncSession, task_uuid, ticket_uuid) -> TicketTask:
    """The need, read again under its ticket's lock; refused if a dedup resolve moved it meanwhile."""
    task = await db.scalar(
        select(TicketTask).where(TicketTask.uuid == task_uuid).execution_options(populate_existing=True)
    )
    if task is None:
        raise ValueError("Ticket task not found")
    if str(task.ticket_uuid) != str(ticket_uuid):
        raise ValueError(MOVED_DURING_DEDUP)
    return task


async def _lock_ticket_and_task(
    db: AsyncSession, *, task_uuid: str, live_only: bool = True
) -> tuple[Tickets, TicketTask]:
    """Lock a need's ticket, then the need, FOR UPDATE: the order agreed for writes (ADR-291).

    A ticket's status is worked out from all of its needs (recompute_ticket_status), so whatever
    changes a need holds its ticket as well, and taking the two in one fixed order makes writers
    on the same ticket queue instead of deadlocking. The need's ticket is read unlocked first; only
    a dedup resolve moves a need to another ticket, and one that did so while this waited for the
    ticket's lock is refused (ADR-388).

    A deleted need, or a need of a deleted ticket, is not found — checked under the locks, so a
    deletion cannot slip in between. `live_only=False` locks it anyway, for a release: giving a
    place back asks nothing of the need.
    """
    ticket_uuid = await db.scalar(select(TicketTask.ticket_uuid).where(TicketTask.uuid == task_uuid))
    if ticket_uuid is None:
        raise ValueError("Ticket task not found")
    ticket = await db.scalar(
        select(Tickets)
        .where(Tickets.uuid == ticket_uuid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    task = await db.scalar(
        select(TicketTask)
        .where(TicketTask.uuid == task_uuid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if task is not None and str(task.ticket_uuid) != str(ticket_uuid):
        raise ValueError(MOVED_DURING_DEDUP)
    if task is None or (live_only and (ticket.delete_at is not None or task.delete_at is not None)):
        raise ValueError("Ticket task not found")
    return ticket, task


async def _lock_task_with_room(
    db: AsyncSession, *, task_uuid: str, target_actor: str
) -> tuple[Tickets, TicketTask, int]:
    """Lock the ticket, then the need (_lock_ticket_and_task); check the need can take `target_actor`.

    Returns the ticket, the need and the need's count. The locks are held until the caller
    commits. The quantity cap binds everyone, a coordinator assigning someone else included
    (ADR-291).

    A need that has as many people as it asked for says it is full rather than closed — filled
    by claims, or stopped by its requester with the quantity cut to the headcount — so the site
    shows 已滿, not 已結束. Its ticket's status is checked after the count too: filling a
    ticket's last open need completes the ticket, and whoever comes next should still hear the
    need is full. A canceled need is no longer open whatever its count, and so is a need with
    room left that is fulfilled or on a closed ticket.
    """
    ticket, task = await _lock_ticket_and_task(db, task_uuid=task_uuid)
    if task.status == "canceled":
        raise ValueError("Task is no longer open")
    if await task_assignment_repository.get_by_task_and_actor(db, task_uuid, target_actor):
        raise ValueError("Actor already assigned to this task")
    claimed = await _claim_count(db, task_uuid)
    if task.quantity is not None and claimed >= task.quantity:
        raise ValueError("Task is full")
    if task.status in CLOSED_TASK_STATUSES or ticket.status in CLOSED_TICKET_STATUSES:
        raise ValueError("Task is no longer open")
    return ticket, task, claimed


async def _claim_count(db: AsyncSession, task_uuid) -> int:
    """How many people are on the need — read under its lock, so it cannot move meanwhile."""
    return await db.scalar(
        select(func.count()).select_from(TaskAssignment).where(TaskAssignment.task_uuid == task_uuid)
    )


async def _notify_claim(
    db: AsyncSession,
    *,
    task_id,
    task_name: str,
    ticket_title: str,
    requester: str,
    actor_uid,
    assignee_name: str | None,
    claimed: int,
    quantity: int | None,
) -> None:
    """Tell the requester someone is coming, and who (prototype site-actions.jsx:473-483).

    Named after the person going, whether they signed up or a coordinator sent them. The
    caller skips a requester who is that person; one who is the actor dispatch() leaves out.
    """
    count = f"{claimed}/{quantity}" if quantity is not None else f"{claimed}"
    await NotificationService.dispatch(
        db,
        event_type="task_claimed",
        title=f"{assignee_name or '一位志工'} 承接了你的「{task_name}」",
        body=f"{ticket_title}　目前 {count} 人",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=[requester],
    )


async def _notify_need_full(
    db: AsyncSession,
    *,
    task_id,
    task_name: str,
    ticket_title: str,
    newcomer: str,
    actor_uid,
) -> None:
    """Tell everyone already on a need that this claim completed it (site-actions.jsx:484-496).

    Sent only at the moment the need fills — sent later it would say nothing new. The one
    whose claim filled it just saw that for themselves.
    """
    assignments = await task_assignment_repository.list_by_task(db, str(task_id))
    others = [str(a.actor_uuid) for a in assignments if str(a.actor_uuid) != newcomer]
    await NotificationService.dispatch(
        db,
        event_type="task_full",
        title=f"「{task_name}」已經湊齊人了",
        body=f"{ticket_title}　你仍然在名單上，時間到請照常前往。",
        priority="medium",
        actor_uuid=actor_uid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=others,
    )


async def unassign_task_actor(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Give back a place on a need, locked and committed like a claim (ADR-291).

    The assignee may give back their own and a coordinator anyone's, but nobody once recruiting was
    stopped by hand (ADR-292); someone removed by another person is told, unless the need was deleted
    and they were already told not to come.
    """
    assignment = await task_assignment_repository.get_by_uuid(db, uuid)
    if not assignment:
        raise ValueError("Task assignment not found")
    await require_scope(
        actor, Perm.TICKET_ASSIGN, db, resource=await _assignment_scope_target(db, assignment)
    )
    ticket, task = await _lock_ticket_and_task(db, task_uuid=str(assignment.task_uuid), live_only=False)
    on_task = await db.scalar(select(TaskAssignment.task_uuid).where(TaskAssignment.uuid == uuid))
    if on_task is not None and str(on_task) != str(task.uuid):
        # Its need was folded into another by a dedup resolve while this waited (ADR-388).
        raise ValueError(MOVED_DURING_DEDUP)
    if task.recruiting_stopped_at is not None:
        raise ValueError("Recruiting has stopped for this task")
    removed = await db.scalar(
        delete(TaskAssignment).where(TaskAssignment.uuid == uuid).returning(TaskAssignment.uuid)
    )
    if removed is None:
        # Given back by a concurrent call while this one waited for the locks.
        await db.rollback()
        raise ValueError("Task assignment not found")
    # Fulfilled but not stopped by hand (refused above) means it filled by itself; reopen it once
    # there is room again. An over-subscribed need from before the cap bound coordinators
    # (ADR-291) can still be full after losing one, and stays fulfilled.
    if (
        task.status == "fulfilled"
        and task.quantity is not None
        and await _claim_count(db, task.uuid) < task.quantity
    ):
        task.status = "pending"
        task.completed_at = None
    await db.flush()
    await recompute_ticket_status(db, ticket_uuid=str(ticket.uuid))
    task_id, task_name, deleted = task.uuid, task.task_name, task.delete_at is not None
    ticket_title, removed_actor, actor_uid = ticket.title, str(assignment.actor_uuid), actor.uuid
    await db.commit()

    if deleted:
        return
    await NotificationService.dispatch(
        db,
        event_type="task_assignment_removed",
        title=f"你已被移出「{task_name}」",
        body=f"{ticket_title}　你已不在這筆需求的名單上，不用前往了。",
        priority="high",
        actor_uuid=actor_uid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=[removed_actor],
    )


async def update_task_assignment(
    db: AsyncSession, *, actor: User, uuid: str, changes: dict
) -> TaskAssignment:
    """Update a task assignment's status/role. Assignee updates own (=own), coordinator any (=all).

    Not once the need or its ticket is deleted (ADR-293): the claims on it are kept as the record
    of who was on it when it went, and stay as they were then. The need is not found, as for a
    claim or a stop; giving the place back still works (unassign_task_actor). Checked after
    authorization, so a caller who may not change the claim cannot tell whether it was deleted.
    """
    assignment = await task_assignment_repository.get_by_uuid(db, uuid)
    if not assignment:
        raise ValueError("Task assignment not found")
    await require_scope(
        actor, Perm.TICKET_ASSIGN, db, resource=await _assignment_scope_target(db, assignment)
    )
    task = await ticket_task_repository.get_by_uuid_active(db, assignment.task_uuid)
    if not task or not await ticket_repository.get_by_uuid_active(db, task.ticket_uuid):
        raise ValueError("Ticket task not found")
    return await task_assignment_repository.update(db, db_obj=assignment, obj_in=changes)
