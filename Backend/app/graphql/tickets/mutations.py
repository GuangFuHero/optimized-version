"""GraphQL mutations for tickets and ticket tasks."""

from uuid import UUID

import strawberry

from app.graphql.context import check_permission
from app.graphql.scalars import geojson_to_geom
from app.graphql.tickets.types import (
    CreateTaskPropertyInput,
    CreateTicketInput,
    CreateTicketTaskInput,
    TaskPropertyType,
    TicketTaskType,
    TicketType,
    UpdateTaskPropertyInput,
    UpdateTicketInput,
    UpdateTicketTaskInput,
)
from app.repositories.tickets_repository import (
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
        ticket = await ticket_repository.create(info.context["db"], obj_in={
            "property_name": "request",
            "geometry": geojson_to_geom(input.geometry),
            "created_by": str(info.context["user"].uuid),
            "title": input.title, "description": input.description,
            "contact_name": input.contact_name,
            "contact_email": input.contact_email,
            "contact_phone": input.contact_phone,
            "status": "pending", "priority": input.priority,
            "task_type": input.task_type,
            "visibility": input.visibility,
        })
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
        for field in ("description", "review_note"):
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
        task = await ticket_task_repository.create(db, obj_in={
            "ticket_uuid": input.ticket_uuid,
            "task_type": input.task_type,
            "task_name": input.task_name,
            "task_description": input.task_description,
            "quantity": input.quantity,
            "source": input.source,
            "visibility": input.visibility,
            "route_uuid": input.route_uuid,
        })
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
        await check_permission(info, "request", "edit")

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
        prop = await task_property_repository.create(db, obj_in={
            "task_uuid": input.task_uuid,
            "property_name": input.property_name,
            "property_value": input.property_value,
            "quantity": input.quantity,
            "comment": input.comment,
            "created_by": str(info.context["user"].uuid),
        })
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
        await check_permission(info, "request", "edit", owner_uuid=prop.created_by)

        obj_in = {}
        if input.property_value is not None:
            obj_in["property_value"] = input.property_value
        if input.status is not None:
            obj_in["status"] = input.status
        for field in ("quantity", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                obj_in[field] = val

        prop = await task_property_repository.update(db, db_obj=prop, obj_in=obj_in)
        return TaskPropertyType.from_model(prop)
