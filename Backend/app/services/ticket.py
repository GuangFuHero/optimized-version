"""Ticket write actions (ticket / task / task-property / assignment).

Same flat-service style as station.py: `db` first, keyword-only args, each function owns
its own authz + validation + persistence (ADR-013/014/015/022).
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import validate_disaster_types
from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom
from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.repositories.auth_repository import user_repository
from app.repositories.geo_repository import secondary_location_repository
from app.repositories.tickets_repository import (
    task_assignment_repository,
    task_property_repository,
    ticket_disaster_detail_repository,
    ticket_repository,
    ticket_task_repository,
)
from app.services.authz import require_scope
from app.services.geo_validation import normalize_contact_fields, validate_point
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService
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
# A ticket in one of these states takes no more volunteers on any of its tasks, whatever
# each task's own status says: update_ticket closes the ticket alone and leaves them pending.
CLOSED_TICKET_STATUSES = frozenset({"completed", "cancelled"})

# The kinds of help a need can ask for — the values `CreateTicketTaskInput.taskType` documents
# and `chart_render` labels. Enforced only by `create_help_request`; `create_ticket_task`
# still stores whatever it is sent.
TASK_TYPES = frozenset({"rescue", "supply", "medical", "hr"})
# `tickets.title` and `ticket_tasks.task_name` are both String(200).
TICKET_TITLE_MAX_LENGTH = 200
TASK_NAME_MAX_LENGTH = 200

# What a notice calls each state — the site's own words (Frontend ticket/status.ts and the
# task detail panel), never the enum. An unknown value falls through as itself, so a new
# state shows up rather than vanishing.
TASK_STATUS_LABELS = {
    "pending": "待處理", "in_progress": "處理中", "fulfilled": "已完成", "canceled": "已取消",
}
MODERATION_STATUS_LABELS = {"pending_review": "待審核", "approved": "已通過", "rejected": "已退回"}


async def _task_scope_target(db: AsyncSession, task: TicketTask) -> SimpleNamespace:
    """Scope target for a ticket task (ADR-052, direction B).

    A TicketTask has no geometry of its own, so `zone` scope could never match it
    directly (in_scope's ZONE branch needs resource.geometry). Direction B: the task
    borrows its parent ticket's location for the zone check, so a team's `zone`-scoped
    ticket.edit / ticket.assign reaches the tasks under tickets sitting inside its
    WorkZone. `own` is unchanged — it still means the task's own creator.
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
    WorkZone.
    """
    task = await ticket_task_repository.get_by_uuid_active(db, assignment.task_uuid)
    parent = await ticket_repository.get_by_uuid_active(db, task.ticket_uuid) if task else None
    return SimpleNamespace(
        created_by=str(assignment.actor_uuid),
        team_uuid=None,
        geometry=parent.geometry if parent else None,
    )


async def create_ticket(
    db: AsyncSession,
    *,
    actor: User,
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
) -> Tickets:
    """Create a support ticket (checkpoint 1 only — a new ticket has no prior owner).

    `disaster_types` is validated against the vocabulary table before anything is written: a
    ticket filed under a disaster that does not exist would store cleanly and then render an
    empty disaster-field form, telling the reporter nothing was asked of them.

    `secondary_location` is new in feature 018. Stations have been able to carry an address
    since they existed; tickets could not, which meant the one record that most needs a door
    number — somebody asking to be found — had only a map pin. Owns the two-table orchestration
    and the single commit that makes it atomic, exactly as `station.py::create_station` does.
    """
    await require_scope(actor, Perm.TICKET_ADD, db)
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
    ticket = await ticket_repository.add(
        db,
        obj_in={
            "property_name": "request",
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor.uuid),
            "title": title,
            "description": description,
            # Normalized, not raw — same reason as create_station in station.py.
            **contacts,
            "status": "pending",
            "priority": priority,
            "task_type": task_type,
            "visibility": visibility,
            "disaster_types": disaster_types,
            "person_trapped_reported": person_trapped_reported,
            "immediate_danger_reported": immediate_danger_reported,
        },
    )
    if secondary_location:
        # A ticket's uuid IS its base_geometries.uuid (joined-table inheritance), which is
        # what secondary_locations.geometry_uuid points at — the same key the station path
        # uses, so one address table serves both.
        await secondary_location_repository.add(
            db, obj_in={"geometry_uuid": str(ticket.uuid), **secondary_location}
        )
    await db.commit()
    await db.refresh(ticket)
    return ticket


def _validate_help_request_task(task: dict) -> None:
    """Refuse a need the public site could not have meant.

    `create_ticket_task` checks none of this and lets the column limit raise a database error
    the client only sees as "Unexpected error.". A zero quantity would read as full the moment
    it was filed (`_lock_task_with_room`).
    """
    if task["task_type"] not in TASK_TYPES:
        raise ValueError(f"Unknown task type: {task['task_type']}")
    name = task["task_name"]
    if not name.strip():
        raise ValueError("task_name is required")
    if len(name) > TASK_NAME_MAX_LENGTH:
        raise ValueError(f"task_name must be at most {TASK_NAME_MAX_LENGTH} characters")
    quantity = task.get("quantity")
    if quantity is not None and quantity < 1:
        raise ValueError("quantity must be at least 1")


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
) -> Tickets:
    """File a citizen's request for help: the ticket and every need on it, in one commit.

    The public site's 「請求協助」 (spec note/help-request-spec.md, D1). `create_ticket` followed
    by one `create_ticket_task` per need commits each step on its own, so a failure part-way
    leaves a ticket with some of its needs missing and a retry files a second ticket. Here
    nothing is written unless all of it is.

    The site never asks how urgent a request is or who may see it: priority is `medium` and
    visibility `public`, and staff adjust both afterwards. The ticket's own `task_type` is the
    first need's, as the admin form sets it.
    """
    await require_scope(actor, Perm.TICKET_ADD, db)
    if not title.strip():
        raise ValueError("title is required")
    if len(title) > TICKET_TITLE_MAX_LENGTH:
        raise ValueError(f"title must be at most {TICKET_TITLE_MAX_LENGTH} characters")
    if not tasks:
        raise ValueError("At least one task is required")
    # Every need is checked before anything is written, so one bad need refuses the request
    # rather than leaving the ones before it filed.
    for task in tasks:
        _validate_help_request_task(task)
    validate_point(geometry, entity="Ticket")
    contacts = normalize_contact_fields(
        {"contact_name": contact_name, "contact_email": None, "contact_phone": contact_phone},
        required=frozenset({"contact_name"}),
    )
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
            "visibility": "public",
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
                "visibility": "public",
                "created_by": creator,
                # One transaction means one `now()` for every need, and the tasks loader
                # breaks that tie on uuid — random. A microsecond apart keeps them in the order
                # the requester listed them (第 1 件、第 2 件…) on the database's own clock.
                "created_at": func.now() + timedelta(microseconds=position),
            },
        )
    await db.commit()
    await db.refresh(ticket)
    return ticket


async def update_ticket(
    db: AsyncSession, *, actor: User, uuid: str, changes: dict,
    secondary_location: dict | None = None,
) -> Tickets:
    """Update a ticket (checkpoint 1 ticket.edit, then checkpoint 2 against the loaded ticket).

    `changes` is the already-diffed field dict. It never carries `status`: a ticket's status
    is worked out from its needs (`ticket_status.recompute_ticket_status`), not set by hand.

    `secondary_location` replaces the ticket's address, creating the row if the ticket was
    filed without one (ADR-268). Create-only would mean a mistyped door number stays wrong
    for the rescue team that has to find it.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)
    if secondary_location is not None:
        await _replace_secondary_location(db, str(ticket.uuid), secondary_location)

    obj_in = dict(changes)
    if "disaster_types" in obj_in:
        # `keep`: the ticket's current types pass even if retired since it was filed, so
        # dropping one type does not require the others still to be active (ADR-266).
        obj_in["disaster_types"] = await validate_disaster_types(
            db, obj_in["disaster_types"] or [], keep=ticket.disaster_types or []
        )
    return await ticket_repository.update(db, db_obj=ticket, obj_in=obj_in)


async def _replace_secondary_location(
    db: AsyncSession, geometry_uuid: str, values: dict
) -> None:
    """Overwrite the address row for a geometry, or create it when there is none.

    A whole-input replacement, so clearing a member means sending it null, not omitting it.
    Flush only: `update_ticket` always ends in a repository `update()`, which is the commit.
    """
    existing = await secondary_location_repository.get_by_geometry(db, geometry_uuid)
    if existing is None:
        await secondary_location_repository.add(
            db, obj_in={"geometry_uuid": geometry_uuid, **values}
        )
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
            raise ValueError(
                f"欄位名稱長度上限為 {MAX_DISASTER_DETAIL_KEY_LENGTH} 字：{property_name[:20]}…"
            )
        if len(values) > MAX_DISASTER_DETAIL_VALUES:
            raise ValueError(
                f"欄位「{property_name}」的選項數量上限為 {MAX_DISASTER_DETAIL_VALUES}"
            )
        for value in values:
            if value is not None and len(value) > MAX_DISASTER_DETAIL_VALUE_LENGTH:
                raise ValueError(
                    f"欄位「{property_name}」的單一值長度上限為 "
                    f"{MAX_DISASTER_DETAIL_VALUE_LENGTH} 字"
                )


async def review_ticket(
    db: AsyncSession, *, actor: User, uuid: str, verification_status: str, review_note: str | None = None
) -> Tickets:
    """Verify/approve a ticket — a *review* action gated by ticket.review, not ticket.edit.

    Setting verification_status (unverified → ai_verified / human_verified) is an approval
    decision, so it needs the separate `ticket.review` capability (ADR-049 catalog audit),
    checkpoint 2 against the loaded ticket.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_REVIEW, db, resource=ticket)
    obj_in = {"verification_status": verification_status}
    if review_note is not None:
        obj_in["review_note"] = review_note
    return await ticket_repository.update(db, db_obj=ticket, obj_in=obj_in)


async def delete_ticket(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete a ticket (checkpoint 1 ticket.delete, then checkpoint 2 against it).

    Soft delete (sets delete_at) — a disaster help-request is never truly destroyed, only
    hidden from active lists; the audit trigger records the deletion either way.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_DELETE, db, resource=ticket)
    await ticket_repository.soft_delete(db, db_obj=ticket)


async def delete_ticket_task(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Delete one need — the requester's 「刪除這筆需求」 (team decision 2026-09-28).

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
    now = datetime.now(UTC)
    task.status = "canceled"
    task.canceled_at = now
    task.completed_at = None
    task.delete_at = now
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
    visibility: str,
    route_uuid: str | None,
) -> TicketTask:
    """Create a task under a ticket (checkpoint 1 only — no scope check against the parent)."""
    await require_scope(actor, Perm.TICKET_ADD, db)
    if not await ticket_repository.get_by_uuid_active(db, ticket_uuid):
        raise ValueError("Ticket not found")
    return await ticket_task_repository.create(
        db,
        obj_in={
            "ticket_uuid": ticket_uuid,
            "task_type": task_type,
            "task_name": task_name,
            "task_description": task_description,
            "quantity": quantity,
            "source": source,
            "visibility": visibility,
            "route_uuid": route_uuid,
            "created_by": str(actor.uuid),
        },
    )


async def update_ticket_task(db: AsyncSession, *, actor: User, uuid: str, changes: dict) -> TicketTask:
    """Update a ticket task (checkpoint 1 ticket.edit, then checkpoint 2 against the task).

    TicketTask carries no team_uuid, so only `own`/`all` scope can match it.

    `completed_at` / `canceled_at` are maintained here, not by the caller — see below for
    why each is cleared as well as set.
    """
    task = await ticket_task_repository.get_by_uuid_active(db, uuid)
    if not task:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=await _task_scope_target(db, task))

    old_mod = task.moderation_status
    old_status = task.status
    old_dup = task.is_duplicate
    task_id = task.uuid
    task_name = task.task_name
    task_created_by = str(task.created_by)

    obj_in = dict(changes)
    new_status = obj_in.get("status")
    if new_status is not None and new_status != old_status:
        # Each timestamp records when the task entered that state, and is cleared when it
        # leaves. Clearing matters because analytics plots a task on the day its timestamp
        # gives: a re-opened task keeping a stale completed_at still reads as finished.
        if new_status == "fulfilled":
            obj_in["completed_at"] = datetime.now(UTC)
        elif old_status == "fulfilled":
            obj_in["completed_at"] = None
        if new_status == "canceled":
            obj_in["canceled_at"] = datetime.now(UTC)
        elif old_status == "canceled":
            obj_in["canceled_at"] = None

    actor_uid = actor.uuid
    updated_task = await ticket_task_repository.update(db, db_obj=task, obj_in=obj_in)
    mod_status = updated_task.moderation_status
    exec_status = updated_task.status

    # 1. 審核狀態變更通知 (High)
    if "moderation_status" in changes and changes["moderation_status"] != old_mod:
        assignments = await task_assignment_repository.list_by_task(db, str(task_id))
        recipients = {task_created_by} | {str(a.actor_uuid) for a in assignments}
        mod_label = MODERATION_STATUS_LABELS.get(mod_status, mod_status)
        await NotificationService.dispatch(
            db,
            event_type="ticket_task_moderation_update",
            title=f"工單審核狀態更新：{task_name}",
            body=f"工單任務「{task_name}」審核狀態已變更為【{mod_label}】。",
            priority="high",
            actor_uuid=actor_uid,
            ref_type="ticket_task",
            ref_uuid=task_id,
            explicit_recipients=list(recipients),
        )

    # 2. 任務執行狀態變更通知 (Medium；取消為 High，見 _task_status_notice)
    if "status" in changes and changes["status"] != old_status:
        assignments = await task_assignment_repository.list_by_task(db, str(task_id))
        recipients = {str(a.actor_uuid) for a in assignments}
        title, body, priority = _task_status_notice(task_name, exec_status)
        await NotificationService.dispatch(
            db,
            event_type="ticket_task_status_update",
            title=title,
            body=body,
            priority=priority,
            actor_uuid=actor_uid,
            ref_type="ticket_task",
            ref_uuid=task_id,
            explicit_recipients=list(recipients),
        )

    # 3. 重複工單標記通知 (Medium)
    if ("is_duplicate" in changes and changes["is_duplicate"] and not old_dup) or (
        "dedup_group_id" in changes and changes["dedup_group_id"]
    ):
        dedup_managers = await NotificationRecipientResolver.resolve_permission(db, Perm.AI_DUP_REVIEW.value)
        await NotificationService.dispatch(
            db,
            event_type="dedup_flag_ticket",
            title=f"重複工單待審核：{task_name}",
            body=f"工單任務「{task_name}」已被系統標記為疑似重複項目，請進行審核。",
            priority="medium",
            actor_uuid=actor_uid,
            ref_type="ticket_task",
            ref_uuid=task_id,
            explicit_recipients=dedup_managers,
        )

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
    """Add a structured property to a ticket task (checkpoint 1 only)."""
    await require_scope(actor, Perm.TICKET_ADD, db)
    if not await ticket_task_repository.get_by_uuid_active(db, task_uuid):
        raise ValueError("Ticket task not found")
    return await task_property_repository.create(
        db,
        obj_in={
            "task_uuid": task_uuid,
            "property_name": property_name,
            "property_value": property_value,
            "quantity": quantity,
            "comment": comment,
        },
    )


async def update_task_property(db: AsyncSession, *, actor: User, uuid: str, changes: dict) -> TaskProperty:
    """Update a task property (checkpoint 2 scope-checked against the *parent* task)."""
    prop = await task_property_repository.get_by_uuid_active(db, uuid)
    if not prop:
        raise ValueError("Task property not found")
    task = await ticket_task_repository.get_by_uuid_active(db, prop.task_uuid)
    if not task:
        raise ValueError("Ticket task not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=await _task_scope_target(db, task))
    return await task_property_repository.update(db, db_obj=prop, obj_in=changes)


async def assign_task_actor(
    db: AsyncSession, *, actor: User, task_uuid: str, actor_uuid: str | None, role: str | None
) -> TaskAssignment:
    """Link a person to a task — self-signup when actor_uuid is omitted/equals the caller.

    Self-signup needs only ticket.assign (checkpoint 1); assigning someone else also
    scope-checks the task (checkpoint 2). The same actor can't be linked to a task twice.

    A fulfilled or canceled task takes nobody, nor does a task of a completed or cancelled
    ticket. A volunteer claims a need, not a ticket (PUB-PS-140), and a task with a `quantity`
    takes nobody more once it has that many people — not even from a coordinator assigning
    someone else (spec Q38, reversing d847624): to send more, they open another need. A task
    without one has no cap, as the requester never said how many. The claim that brings a task
    to its `quantity` marks it fulfilled in the same commit (spec Q37): it has everyone it asked
    for, and they still go — fulfilled is not "done". The need's ticket and then the need are
    locked FOR UPDATE from the count to the commit (_lock_ticket_and_task), so two people racing
    for the last place cannot both get it. Authorization runs first, so a caller who will be
    refused never takes the locks. A task whose ticket was deleted is gone with it.

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
            db, task_id=task_id, task_name=task_name, ticket_title=ticket_title,
            requester=requester, actor_uid=actor_uid, assignee_name=assignee_name,
            claimed=claimed + 1, quantity=quantity,
        )
    if fills:
        await _notify_need_full(
            db, task_id=task_id, task_name=task_name, ticket_title=ticket_title,
            newcomer=target_actor, actor_uid=actor_uid,
        )
    await db.refresh(assignment)
    return assignment


async def list_my_claims(
    db: AsyncSession, *, actor: User
) -> list[tuple[TaskAssignment, TicketTask, Tickets]]:
    """Every task `actor` is assigned to, with the task and its ticket — 「我承接的」 (spec Q16).

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
    """Stop recruiting for one need — the requester's 「停止招募」 (spec Q39).

    ticket.edit on the need's ticket, as for any edit to it, checked before the locks. The need
    becomes fulfilled with its quantity cut to the people already on it — a need that never had
    one gets that count too — and recruiting_stopped_at records that it was stopped by hand, so
    it never reopens (spec Q40) and its list is final: nobody on it can give their place back
    (spec Q46, unassign_task_actor). To recruit again, the requester opens another need. A need
    nobody claimed has no one to keep, so it is refused: the requester deletes it instead. Nor
    can a need that is no longer open be stopped.

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


async def _lock_ticket_and_task(
    db: AsyncSession, *, task_uuid: str, live_only: bool = True
) -> tuple[Tickets, TicketTask]:
    """Lock a need's ticket, then the need, FOR UPDATE: the order agreed for writes (spec Q44).

    A ticket's status is worked out from all of its needs (recompute_ticket_status), so whatever
    changes a need holds its ticket as well, and taking the two in one fixed order makes writers
    on the same ticket queue instead of deadlocking. The need's ticket is read unlocked first: a
    need never moves to another ticket.

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
    if task is None or (live_only and (ticket.delete_at is not None or task.delete_at is not None)):
        raise ValueError("Ticket task not found")
    return ticket, task


async def _lock_task_with_room(
    db: AsyncSession, *, task_uuid: str, target_actor: str
) -> tuple[Tickets, TicketTask, int]:
    """Lock the ticket, then the need (_lock_ticket_and_task); check the need can take `target_actor`.

    Returns the ticket, the need and the need's count. The locks are held until the caller
    commits. The quantity cap binds everyone, a coordinator assigning someone else included
    (spec Q38).

    A fulfilled need that has as many people as it asked for says it is full rather than closed —
    filled by claims (spec Q37), or stopped by its requester with the quantity cut to the
    headcount — so the site shows 已滿, not 已結束. A fulfilled need with room left, like a
    canceled one, is no longer open.
    """
    ticket, task = await _lock_ticket_and_task(db, task_uuid=task_uuid)
    if task.status == "canceled" or ticket.status in CLOSED_TICKET_STATUSES:
        raise ValueError("Task is no longer open")
    if await task_assignment_repository.get_by_task_and_actor(db, task_uuid, target_actor):
        raise ValueError("Actor already assigned to this task")
    claimed = await _claim_count(db, task_uuid)
    if task.quantity is not None and claimed >= task.quantity:
        raise ValueError("Task is full")
    if task.status in CLOSED_TASK_STATUSES:
        raise ValueError("Task is no longer open")
    return ticket, task, claimed


async def _claim_count(db: AsyncSession, task_uuid) -> int:
    """How many people are on the need — read under its lock, so it cannot move meanwhile."""
    return await db.scalar(
        select(func.count()).select_from(TaskAssignment).where(TaskAssignment.task_uuid == task_uuid)
    )


def _task_status_notice(task_name: str, status: str) -> tuple[str, str, str]:
    """Title, body and priority telling a task's volunteers its status changed.

    Canceled is the one change a volunteer must not miss, so it says outright that they need
    not go, at high priority; any other state is named in the site's words.
    """
    if status == "canceled":
        return f"你承接的「{task_name}」已經取消", f"「{task_name}」已取消，不用前往了。", "high"
    label = TASK_STATUS_LABELS.get(status, status)
    return f"工單進度更新：{task_name}", f"工單任務「{task_name}」狀態已變更為【{label}】。", "medium"


async def _notify_claim(
    db: AsyncSession, *, task_id, task_name: str, ticket_title: str, requester: str,
    actor_uid, assignee_name: str | None, claimed: int, quantity: int | None,
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
    db: AsyncSession, *, task_id, task_name: str, ticket_title: str, newcomer: str, actor_uid,
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
    """Remove a task assignment. The assignee can remove their own, coordinators can remove any.

    Authorization first; then the need's ticket and the need are locked like a claim locks them
    (_lock_ticket_and_task), and the removal commits once.

    Once the requester stopped recruiting by hand, the need's list is final and no place on it
    can be given back, by anyone (spec Q46): those on it may already have done the work, or were
    enough, and the site cannot tell — a freed place would leave room to refill a need its
    requester closed. Any other place can be, a deleted need's included. A need that filled by
    itself recruits again once a place frees up (spec Q40), with no notice to anyone, as with
    any release (spec Q18).
    """
    assignment = await task_assignment_repository.get_by_uuid(db, uuid)
    if not assignment:
        raise ValueError("Task assignment not found")
    await require_scope(
        actor, Perm.TICKET_ASSIGN, db, resource=await _assignment_scope_target(db, assignment)
    )
    _, task = await _lock_ticket_and_task(db, task_uuid=str(assignment.task_uuid), live_only=False)
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
    # (spec Q38) can still be full after losing one, and stays fulfilled.
    if (
        task.status == "fulfilled"
        and task.quantity is not None
        and await _claim_count(db, task.uuid) < task.quantity
    ):
        task.status = "pending"
        task.completed_at = None
    await db.commit()


async def update_task_assignment(
    db: AsyncSession, *, actor: User, uuid: str, changes: dict
) -> TaskAssignment:
    """Update a task assignment's status/role. Assignee updates own (=own), coordinator any (=all)."""
    assignment = await task_assignment_repository.get_by_uuid(db, uuid)
    if not assignment:
        raise ValueError("Task assignment not found")
    await require_scope(
        actor, Perm.TICKET_ASSIGN, db, resource=await _assignment_scope_target(db, assignment)
    )
    return await task_assignment_repository.update(db, db_obj=assignment, obj_in=changes)
