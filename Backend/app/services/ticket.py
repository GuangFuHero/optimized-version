"""Ticket write actions (ticket / task / task-property / assignment).

Same flat-service style as station.py: `db` first, keyword-only args, each function owns
its own authz + validation + persistence (ADR-013/014/015/022).
"""

from types import SimpleNamespace

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom
from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.repositories.auth_repository import user_repository
from app.repositories.tickets_repository import (
    task_assignment_repository,
    task_property_repository,
    ticket_repository,
    ticket_task_repository,
)
from app.services.authz import require_scope
from app.services.geo_validation import validate_point
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

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
    disaster_type: str | None,
) -> Tickets:
    """Create a support ticket (checkpoint 1 only — a new ticket has no prior owner)."""
    await require_scope(actor, Perm.TICKET_ADD, db)
    validate_point(geometry, entity="Ticket")
    return await ticket_repository.create(
        db,
        obj_in={
            "property_name": "request",
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor.uuid),
            "title": title,
            "description": description,
            "contact_name": contact_name,
            "contact_email": contact_email,
            "contact_phone": contact_phone,
            "status": "pending",
            "priority": priority,
            "task_type": task_type,
            "visibility": visibility,
            "disaster_type": disaster_type,
        },
    )


async def update_ticket(
    db: AsyncSession, *, actor: User, uuid: str, status: str | None = None, changes: dict
) -> Tickets:
    """Update a ticket (checkpoint 1 ticket.edit, then checkpoint 2 against the loaded ticket).

    Status changes are validated against VALID_TRANSITIONS; `changes` is the already-diffed
    non-status field dict.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_EDIT, db, resource=ticket)

    obj_in = dict(changes)
    if status is not None:
        allowed = VALID_TRANSITIONS.get(ticket.status, [])
        if status not in allowed:
            raise ValueError(f"Cannot transition from '{ticket.status}' to '{status}'")
        obj_in["status"] = status
    return await ticket_repository.update(db, db_obj=ticket, obj_in=obj_in)


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

    actor_uid = actor.uuid
    updated_task = await ticket_task_repository.update(db, db_obj=task, obj_in=changes)
    mod_status = updated_task.moderation_status
    exec_status = updated_task.status

    # 1. 審核狀態變更通知 (High)
    if "moderation_status" in changes and changes["moderation_status"] != old_mod:
        assignments = await task_assignment_repository.list_by_task(db, str(task_id))
        recipients = {task_created_by} | {str(a.actor_uuid) for a in assignments}
        await NotificationService.dispatch(
            db,
            event_type="ticket_task_moderation_update",
            title=f"工單審核狀態更新：{task_name}",
            body=f"工單任務「{task_name}」審核狀態已變更為【{mod_status}】。",
            priority="high",
            actor_uuid=actor_uid,
            ref_type="ticket_task",
            ref_uuid=task_id,
            explicit_recipients=list(recipients),
        )

    # 2. 任務執行狀態變更通知 (Medium)
    if "status" in changes and changes["status"] != old_status:
        assignments = await task_assignment_repository.list_by_task(db, str(task_id))
        recipients = {str(a.actor_uuid) for a in assignments}
        await NotificationService.dispatch(
            db,
            event_type="ticket_task_status_update",
            title=f"工單進度更新：{task_name}",
            body=f"工單任務「{task_name}」狀態已變更為【{exec_status}】。",
            priority="medium",
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
    """
    task = await ticket_task_repository.get_by_uuid_active(db, task_uuid)
    if not task:
        raise ValueError("Ticket task not found")

    current_uuid = str(actor.uuid)
    target_actor = actor_uuid or current_uuid
    if target_actor == current_uuid:
        await require_scope(actor, Perm.TICKET_ASSIGN, db)
    else:
        await require_scope(actor, Perm.TICKET_ASSIGN, db, resource=await _task_scope_target(db, task))
        if not await user_repository.get_by_uuid_active(db, target_actor):
            raise ValueError("User not found")

    if await task_assignment_repository.get_by_task_and_actor(db, task_uuid, target_actor):
        raise ValueError("Actor already assigned to this task")

    task_name = task.task_name
    task_id = task.uuid
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
        await db.refresh(assignment)
        return assignment
    except IntegrityError as exc:
        # Concurrent duplicate lost the race to uq_assignment_task_actor (PR #24 [10]) —
        # surface the same clean domain error instead of a raw 500.
        await db.rollback()
        raise ValueError("Actor already assigned to this task") from exc


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
