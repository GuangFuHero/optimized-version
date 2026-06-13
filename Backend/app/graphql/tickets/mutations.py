"""GraphQL mutations for tickets and ticket tasks."""

from uuid import UUID

import strawberry
from app.graphql.context import check_permission
from app.graphql.scalars import geojson_to_geom
from app.graphql.tickets.types import (
    CreateTaskPropertyInput,
    CreateTicketInput,
    CreateTicketTaskInput,
    TaskAssignmentType,
    TaskPropertyType,
    TicketTaskType,
    TicketType,
    UpdateTaskAssignmentInput,
    UpdateTaskPropertyInput,
    UpdateTicketInput,
    UpdateTicketTaskInput,
)
from app.repositories.auth_repository import user_repository
from app.repositories.tickets_repository import (
    task_assignment_repository,
    task_property_repository,
    ticket_repository,
    ticket_task_repository,
)

VALID_TRANSITIONS = {
    "pending": ["in_progress", "cancelled"],
    "in_progress": ["completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


@strawberry.type
class RequestMutation:
    """Mutations for creating and updating disaster relief support tickets."""

    @strawberry.mutation
    async def create_ticket(self, info: strawberry.types.Info, input: CreateTicketInput) -> TicketType:
        """Create a new support ticket with location, contact info, and priority.

        Requires request:create permission. Returns the created TicketType.
        """
        await check_permission(info, "request", "create")
        ticket = await ticket_repository.create(
            info.context["db"],
            obj_in={
                "property_name": "request",
                "geometry": geojson_to_geom(input.geometry),
                "created_by": str(info.context["user"].uuid),
                "title": input.title,
                "description": input.description,
                "contact_name": input.contact_name,
                "contact_email": input.contact_email,
                "contact_phone": input.contact_phone,
                "status": "pending",
                "priority": input.priority,
                "task_type": input.task_type,
                "visibility": input.visibility,
                "disaster_type": input.disaster_type,
            },
        )
        return TicketType.from_model(ticket)

    @strawberry.mutation
    async def update_ticket(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketInput
    ) -> TicketType:
        """Update a ticket's status, priority, title, or review notes.

        Status changes are validated against VALID_TRANSITIONS (e.g. pending→in_progress).
        Requires request:edit with ownership check. Returns the updated TicketType.
        """
        db = info.context["db"]
        ticket = await ticket_repository.get_by_uuid_active(db, str(uuid))
        if not ticket:
            raise ValueError("Ticket not found")
        await check_permission(info, "request", "edit", owner_uuid=ticket.created_by)

        obj_in = {}
        if input.status is not None:
            allowed = VALID_TRANSITIONS.get(ticket.status, [])
            if input.status not in allowed:
                raise ValueError(f"Cannot transition from '{ticket.status}' to '{input.status}'")
            obj_in["status"] = input.status
        if input.priority is not None:
            obj_in["priority"] = input.priority
        if input.title is not None:
            obj_in["title"] = input.title
        if input.verification_status is not None:
            obj_in["verification_status"] = input.verification_status
        for field in ("description", "review_note", "disaster_type"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                obj_in[field] = val

        ticket = await ticket_repository.update(db, db_obj=ticket, obj_in=obj_in)
        return TicketType.from_model(ticket)


@strawberry.type
class TicketTaskMutation:
    """Mutations for ticket tasks and their structured properties."""

    @strawberry.mutation
    async def create_ticket_task(
        self, info: strawberry.types.Info, input: CreateTicketTaskInput
    ) -> TicketTaskType:
        """Create a new task (rescue, HR, supply, etc.) under an existing ticket.

        Verifies the parent ticket exists. Requires request:create permission.
        Returns the created TicketTaskType.
        """
        await check_permission(info, "request", "create")
        db = info.context["db"]
        if not await ticket_repository.get_by_uuid_active(db, input.ticket_uuid):
            raise ValueError("Ticket not found")
        task = await ticket_task_repository.create(
            db,
            obj_in={
                "ticket_uuid": input.ticket_uuid,
                "task_type": input.task_type,
                "task_name": input.task_name,
                "task_description": input.task_description,
                "quantity": input.quantity,
                "source": input.source,
                "visibility": input.visibility,
                "route_uuid": input.route_uuid,
                "created_by": str(info.context["user"].uuid),
            },
        )
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def update_ticket_task(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketTaskInput
    ) -> TicketTaskType:
        """Update a ticket task's status, moderation status, visibility, or progress notes.

        UNSET fields are skipped. Requires request:edit permission. Returns the updated task.
        """
        db = info.context["db"]
        task = await ticket_task_repository.get_by_uuid_active(db, str(uuid))
        if not task:
            raise ValueError("Ticket task not found")
        await check_permission(info, "request", "edit", owner_uuid=task.created_by)

        obj_in = {}
        if input.status is not None:
            obj_in["status"] = input.status
        if input.moderation_status is not None:
            obj_in["moderation_status"] = input.moderation_status
        if input.visibility is not None:
            obj_in["visibility"] = input.visibility
        for field in ("progress_note", "review_note"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                obj_in[field] = val

        task = await ticket_task_repository.update(db, db_obj=task, obj_in=obj_in)
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def create_task_property(
        self, info: strawberry.types.Info, input: CreateTaskPropertyInput
    ) -> TaskPropertyType:
        """Add a structured property to a ticket task.

        Verifies the parent task exists. Requires request:create permission.
        Returns the created TaskPropertyType.
        """
        await check_permission(info, "request", "create")
        db = info.context["db"]
        if not await ticket_task_repository.get_by_uuid_active(db, input.task_uuid):
            raise ValueError("Ticket task not found")
        prop = await task_property_repository.create(
            db,
            obj_in={
                "task_uuid": input.task_uuid,
                "property_name": input.property_name,
                "property_value": input.property_value,
                "quantity": input.quantity,
                "comment": input.comment,
            },
        )
        return TaskPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_task_property(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTaskPropertyInput
    ) -> TaskPropertyType:
        """Update a task property's value, quantity, status, or comment.

        UNSET fields are skipped. Requires request:edit with ownership check.
        Returns the updated TaskPropertyType.
        """
        db = info.context["db"]
        prop = await task_property_repository.get_by_uuid_active(db, str(uuid))
        if not prop:
            raise ValueError("Task property not found")
        task = await ticket_task_repository.get_by_uuid_active(db, prop.task_uuid)
        await check_permission(info, "request", "edit", owner_uuid=task.created_by)

        obj_in = {}
        if input.property_value is not None:
            obj_in["property_value"] = input.property_value
        if input.status is not None:
            obj_in["status"] = input.status.value
        for field in ("quantity", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                obj_in[field] = val

        prop = await task_property_repository.update(db, db_obj=prop, obj_in=obj_in)
        return TaskPropertyType.from_model(prop)

    @strawberry.mutation
    async def assign_task_actor(
        self,
        info: strawberry.types.Info,
        task_uuid: UUID,
        actor_uuid: UUID | None = None,
        role: str | None = None,
    ) -> TaskAssignmentType:
        """Link a person to a ticket task (volunteer self-sign-up or coordinator assignment).

        When actor_uuid is omitted (or equals the caller), this is a self-sign-up and
        only request:create is required. Assigning someone else requires request:edit on
        the task. Over-subscription is allowed (no capacity check); the only guard is that
        the same actor cannot be linked to the same task twice. Returns the new assignment.
        """
        db = info.context["db"]
        task = await ticket_task_repository.get_by_uuid_active(db, str(task_uuid))
        if not task:
            raise ValueError("Ticket task not found")

        current_uuid = str(info.context["user"].uuid) if info.context["user"] else None
        actor = str(actor_uuid) if actor_uuid else current_uuid
        if actor == current_uuid:
            await check_permission(info, "request", "create")
        else:
            await check_permission(info, "request", "edit", owner_uuid=task.created_by)
            # Self-signup's actor is the authenticated user; only a coordinator-supplied
            # actor_uuid can be bad/stale, so validate it to avoid a raw FK 500.
            if not await user_repository.get_by_uuid_active(db, actor):
                raise ValueError("User not found")

        if await task_assignment_repository.get_by_task_and_actor(db, str(task_uuid), actor):
            raise ValueError("Actor already assigned to this task")

        assignment = await task_assignment_repository.create(
            db,
            obj_in={
                "task_uuid": str(task_uuid),
                "actor_uuid": actor,
                "role": role,
                "status": "accepted",
            },
        )
        return TaskAssignmentType.from_model(assignment)

    @strawberry.mutation
    async def update_task_assignment(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTaskAssignmentInput
    ) -> TaskAssignmentType:
        """Update an assignment's work-completion status or role — moves the progress bar.

        Owner-scoped: the assignee can update their own assignment (request:edit=own),
        coordinators can update anyone's (request:edit=all). Returns the updated assignment.
        """
        db = info.context["db"]
        assignment = await task_assignment_repository.get_by_uuid(db, str(uuid))
        if not assignment:
            raise ValueError("Task assignment not found")
        await check_permission(info, "request", "edit", owner_uuid=str(assignment.actor_uuid))

        obj_in = {}
        if input.status is not None:
            obj_in["status"] = input.status.value
        if input.role is not strawberry.UNSET:
            obj_in["role"] = input.role

        assignment = await task_assignment_repository.update(db, db_obj=assignment, obj_in=obj_in)
        return TaskAssignmentType.from_model(assignment)

    @strawberry.mutation
    async def unassign_task_actor(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Remove a person from a ticket task (withdraw or un-assign).

        Owner-scoped request:edit — the assignee can remove their own link, coordinators
        can remove any. Hard-deletes the assignment row. Returns True on success.
        """
        db = info.context["db"]
        assignment = await task_assignment_repository.get_by_uuid(db, str(uuid))
        if not assignment:
            raise ValueError("Task assignment not found")
        await check_permission(info, "request", "edit", owner_uuid=str(assignment.actor_uuid))
        await task_assignment_repository.remove(db, uuid=str(uuid))
        return True
