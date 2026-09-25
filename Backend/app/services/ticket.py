"""Ticket write actions (ticket / task / task-property / assignment).

Same flat-service style as station.py: `db` first, keyword-only args, each function owns
its own authz + validation + persistence (ADR-013/014/015/022).
"""

from datetime import UTC, datetime
from types import SimpleNamespace

from sqlalchemy import func, select
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
OPEN_TASK_STATUSES = frozenset({"pending", "in_progress"})

# What a notice calls each state — the site's own words (Frontend ticket/status.ts and the
# task detail panel), never the enum. An unknown value falls through as itself, so a new
# state shows up rather than vanishing.
TASK_STATUS_LABELS = {
    "pending": "待處理", "in_progress": "處理中", "fulfilled": "已完成", "canceled": "已取消",
}
MODERATION_STATUS_LABELS = {"pending_review": "待審核", "approved": "已通過", "rejected": "已退回"}

# Business rule (ADR-020): status transitions live here, not in the RBAC layer.
VALID_TRANSITIONS = {
    "pending": ["in_progress", "cancelled"],
    "in_progress": ["completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


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


async def update_ticket(
    db: AsyncSession, *, actor: User, uuid: str, status: str | None = None, changes: dict,
    secondary_location: dict | None = None,
) -> Tickets:
    """Update a ticket (checkpoint 1 ticket.edit, then checkpoint 2 against the loaded ticket).

    Status changes are validated against VALID_TRANSITIONS; `changes` is the already-diffed
    non-status field dict.

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
    if status is not None:
        allowed = VALID_TRANSITIONS.get(ticket.status, [])
        if status not in allowed:
            raise ValueError(f"Cannot transition from '{ticket.status}' to '{status}'")
        obj_in["status"] = status
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

    A fulfilled or canceled task takes nobody. A volunteer claims a need, not a ticket
    (PUB-PS-140), and signing themselves up is refused once a task with a `quantity` has that
    many people; a task without one has no cap, as the requester never said how many. A
    coordinator assigning someone else may still over-subscribe (d847624): they can see the
    ground and may knowingly send more. The task row is locked FOR UPDATE from the count to
    the insert's commit, so two volunteers racing for the last place cannot both get it.
    Authorization runs first, so a caller who will be refused never takes the lock. A task
    whose ticket was deleted is gone with it.

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

    task, claimed = await _lock_task_with_room(
        db, task_uuid=task_uuid, target_actor=target_actor, capped=self_signup
    )

    # Plain values before the insert commits (expire_on_commit in tests), and the count taken
    # under the lock: `fills` must be decided here, not recounted after the lock is released.
    task_name = task.task_name
    task_id = task.uuid
    quantity = task.quantity
    fills = quantity is not None and claimed + 1 == quantity
    ticket = await db.scalar(select(Tickets).where(Tickets.uuid == task.ticket_uuid))
    ticket_title = ticket.title
    requester = str(ticket.created_by) if ticket.created_by else None
    actor_uid = actor.uuid
    try:
        assignment = await task_assignment_repository.create(
            db,
            obj_in={
                "task_uuid": task_uuid,
                "actor_uuid": target_actor,
                "role": role,
                "status": "accepted",
            },
        )
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
    except IntegrityError as exc:
        # Concurrent duplicate lost the race to uq_assignment_task_actor (PR #24 [10]) —
        # surface the same clean domain error instead of a raw 500.
        await db.rollback()
        raise ValueError("Actor already assigned to this task") from exc


async def list_my_claims(
    db: AsyncSession, *, actor: User
) -> list[tuple[TaskAssignment, TicketTask, Tickets]]:
    """Every task `actor` is assigned to, with the task and its ticket — 「我承接的」 (spec Q16).

    Newest claim first, unpaged: one volunteer's claims stay few. A canceled or fulfilled task
    stays listed, since seeing that is how the volunteer learns not to go; a deleted task or
    ticket drops off. No capability check: these are the caller's own rows, and each ticket
    is still masked per field by TicketType like anywhere else.
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


async def stop_recruiting(db: AsyncSession, *, actor: User, ticket_uuid: str) -> list[TicketTask]:
    """Close every open need on a ticket at once — the requester's 「停止招募」 (spec Q17/Q21).

    ticket.edit on the ticket, as for any edit to it. Pending and in-progress tasks become
    canceled in one transaction, so a failure never leaves half the ticket open; a task
    already fulfilled keeps that outcome. The ticket itself stays listed.

    Everyone who had claimed one of those tasks hears once that they need not go, naming each
    of their needs — rather than once per task, as update_ticket_task would. Returns the tasks
    it canceled: none when nothing was open, which makes a second call a quiet no-op.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, ticket_uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)
    ticket_title = ticket.title
    actor_uid = actor.uuid

    tasks = list(
        (
            await db.scalars(
                select(TicketTask)
                .where(
                    TicketTask.ticket_uuid == ticket_uuid,
                    TicketTask.delete_at.is_(None),
                    TicketTask.status.in_(OPEN_TASK_STATUSES),
                )
                # Several rows are locked here; a fixed order means two stops on the same ticket
                # queue behind each other instead of each holding a row the other waits for.
                .order_by(TicketTask.uuid)
                .with_for_update()
            )
        ).all()
    )
    if not tasks:
        return []
    now = datetime.now(UTC)
    for task in tasks:
        task.status = "canceled"
        task.canceled_at = now
    claims = await db.execute(
        select(TaskAssignment.actor_uuid, TicketTask.task_name)
        .join(TicketTask, TicketTask.uuid == TaskAssignment.task_uuid)
        .where(TaskAssignment.task_uuid.in_([task.uuid for task in tasks]))
        .order_by(TicketTask.created_at, TicketTask.task_name)
    )
    needs_by_person: dict[str, list[str]] = {}
    for person, task_name in claims.all():
        needs_by_person.setdefault(str(person), []).append(task_name)
    await db.commit()

    for person, task_names in needs_by_person.items():
        await NotificationService.dispatch(
            db,
            event_type="ticket_recruiting_stopped",
            title=f"你承接的{'、'.join(f'「{name}」' for name in task_names)}已經取消",
            body=f"{ticket_title}　建立者停止招募了，不用前往了。",
            priority="high",
            actor_uuid=actor_uid,
            ref_type="ticket",
            ref_uuid=ticket_uuid,
            explicit_recipients=[person],
        )
    for task in tasks:
        await db.refresh(task)
    return tasks


async def _lock_task_with_room(
    db: AsyncSession, *, task_uuid: str, target_actor: str, capped: bool
) -> tuple[TicketTask, int]:
    """Lock the task FOR UPDATE and check it can take `target_actor`; return it with its count.

    The lock is held until the caller's insert commits. `capped` applies the quantity cap,
    which binds a volunteer signing themselves up but not a coordinator (see assign_task_actor).
    """
    task = await db.scalar(
        select(TicketTask)
        .join(Tickets, Tickets.uuid == TicketTask.ticket_uuid)
        .where(TicketTask.uuid == task_uuid, TicketTask.delete_at.is_(None), Tickets.delete_at.is_(None))
        .with_for_update(of=TicketTask)
        .execution_options(populate_existing=True)
    )
    if not task:
        raise ValueError("Ticket task not found")
    if task.status in CLOSED_TASK_STATUSES:
        raise ValueError("Task is no longer open")
    if await task_assignment_repository.get_by_task_and_actor(db, task_uuid, target_actor):
        raise ValueError("Actor already assigned to this task")
    claimed = await db.scalar(
        select(func.count()).select_from(TaskAssignment).where(TaskAssignment.task_uuid == task_uuid)
    )
    if capped and task.quantity is not None and claimed >= task.quantity:
        raise ValueError("Task is full")
    return task, claimed


def _task_status_notice(task_name: str, status: str) -> tuple[str, str, str]:
    """Title, body and priority telling a task's volunteers its status changed.

    Canceled is the one change a volunteer must not miss, so it is worded and weighted like
    stop_recruiting's notice; any other state is named in the site's words.
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
    """Remove a task assignment. The assignee can remove their own, coordinators can remove any."""
    assignment = await task_assignment_repository.get_by_uuid(db, uuid)
    if not assignment:
        raise ValueError("Task assignment not found")
    await require_scope(
        actor, Perm.TICKET_ASSIGN, db, resource=await _assignment_scope_target(db, assignment)
    )
    await task_assignment_repository.remove(db, uuid=uuid)


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
