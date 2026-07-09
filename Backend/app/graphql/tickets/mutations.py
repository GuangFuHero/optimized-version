"""GraphQL mutations for tickets and ticket tasks.

Thin per ADR-014: parse input, call the ticket service function (which owns authz,
validation, and persistence), map the result back to a GraphQL type. See
app/services/ticket.py.
"""

from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
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
from app.services import ticket as ticket_service


@strawberry.type
class RequestMutation:
    """Mutations for creating and updating disaster relief support tickets."""

    @strawberry.mutation
    async def create_ticket(self, info: strawberry.types.Info, input: CreateTicketInput) -> TicketType:
        """Create a new support ticket with location, contact info, and priority.

        Requires ticket.make permission. Returns the created TicketType.
        """
        ticket = await ticket_service.create_ticket(
            info.context["db"], actor=require_authenticated(info),
            geometry=input.geometry, title=input.title, description=input.description,
            contact_name=input.contact_name, contact_email=input.contact_email,
            contact_phone=input.contact_phone, priority=input.priority,
            task_type=input.task_type, visibility=input.visibility.value,
            disaster_type=input.disaster_type,
        )
        return TicketType.from_model(ticket)

    @strawberry.mutation
    async def update_ticket(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketInput
    ) -> TicketType:
        """Update a ticket's status, priority, title, or review notes.

        Status changes are validated against VALID_TRANSITIONS (e.g. pending→in_progress).
        Requires ticket.edit permission with scope check. Returns the updated TicketType.

        Note: verification_status is NOT set here — that is a review decision, handled by
        review_ticket under ticket.review (ADR-049).
        """
        changes = {}
        if input.priority is not None:
            changes["priority"] = input.priority
        if input.title is not None:
            changes["title"] = input.title
        for field in ("description", "review_note", "disaster_type"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val

        ticket = await ticket_service.update_ticket(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), status=input.status, changes=changes,
        )
        return TicketType.from_model(ticket)

    @strawberry.mutation
    async def review_ticket(
        self,
        info: strawberry.types.Info,
        uuid: UUID,
        verification_status: str,
        review_note: str | None = None,
    ) -> TicketType:
        """Verify/approve a ticket by setting its verification_status.

        A review decision, gated by ticket.review (not ticket.edit) with scope check.
        Returns the updated TicketType.
        """
        ticket = await ticket_service.review_ticket(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), verification_status=verification_status, review_note=review_note,
        )
        return TicketType.from_model(ticket)

    @strawberry.mutation
    async def delete_ticket(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a ticket (sets delete_at).

        Requires ticket.delete permission with scope check. Returns True on success.
        """
        await ticket_service.delete_ticket(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True


@strawberry.type
class TicketTaskMutation:
    """Mutations for ticket tasks and their structured properties."""

    @strawberry.mutation
    async def create_ticket_task(
        self, info: strawberry.types.Info, input: CreateTicketTaskInput
    ) -> TicketTaskType:
        """Create a new task (rescue, HR, supply, etc.) under an existing ticket.

        Verifies the parent ticket exists. Requires ticket.make permission (checkpoint 1
        only — matches prior behavior, which did not scope-check against the parent ticket).
        Returns the created TicketTaskType.
        """
        task = await ticket_service.create_ticket_task(
            info.context["db"], actor=require_authenticated(info),
            ticket_uuid=input.ticket_uuid, task_type=input.task_type, task_name=input.task_name,
            task_description=input.task_description, quantity=input.quantity,
            source=input.source, visibility=input.visibility.value, route_uuid=input.route_uuid,
        )
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def update_ticket_task(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketTaskInput
    ) -> TicketTaskType:
        """Update a ticket task's status, moderation status, visibility, or progress notes.

        UNSET fields are skipped. Requires ticket.edit permission. Returns the updated task.
        """
        changes = {}
        if input.status is not None:
            changes["status"] = input.status
        if input.moderation_status is not None:
            changes["moderation_status"] = input.moderation_status
        if input.visibility is not None:
            changes["visibility"] = input.visibility.value
        for field in ("progress_note", "review_note"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val

        task = await ticket_service.update_ticket_task(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid), changes=changes
        )
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def create_task_property(
        self, info: strawberry.types.Info, input: CreateTaskPropertyInput
    ) -> TaskPropertyType:
        """Add a structured property to a ticket task.

        Verifies the parent task exists. Requires ticket.make permission (checkpoint 1
        only — matches prior behavior). Returns the created TaskPropertyType.
        """
        prop = await ticket_service.create_task_property(
            info.context["db"], actor=require_authenticated(info),
            task_uuid=input.task_uuid, property_name=input.property_name,
            property_value=input.property_value, quantity=input.quantity, comment=input.comment,
        )
        return TaskPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_task_property(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTaskPropertyInput
    ) -> TaskPropertyType:
        """Update a task property's value, quantity, status, or comment.

        UNSET fields are skipped. Requires ticket.edit permission, scope-checked against the
        parent task (TaskProperty itself carries no ownership of its own).
        Returns the updated TaskPropertyType.
        """
        changes = {}
        if input.property_value is not None:
            changes["property_value"] = input.property_value
        if input.status is not None:
            changes["status"] = input.status.value
        for field in ("quantity", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val

        prop = await ticket_service.update_task_property(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid), changes=changes
        )
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
        only ticket.assign (checkpoint 1) is required. Assigning someone else additionally
        requires the task to fall within the caller's ticket.assign scope (checkpoint 2).
        Over-subscription is allowed (no capacity check); the only guard is that
        the same actor cannot be linked to the same task twice. Returns the new assignment.
        """
        assignment = await ticket_service.assign_task_actor(
            info.context["db"], actor=require_authenticated(info),
            task_uuid=str(task_uuid),
            actor_uuid=str(actor_uuid) if actor_uuid else None,
            role=role,
        )
        return TaskAssignmentType.from_model(assignment)

    @strawberry.mutation
    async def update_task_assignment(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTaskAssignmentInput
    ) -> TaskAssignmentType:
        """Update an assignment's work-completion status or role — moves the progress bar.

        Owner-scoped: the assignee can update their own assignment (ticket.assign=own,
        matched against actor_uuid), coordinators can update anyone's (=all). Returns the
        updated assignment.
        """
        changes = {}
        if input.status is not None:
            changes["status"] = input.status.value
        if input.role is not strawberry.UNSET:
            changes["role"] = input.role

        assignment = await ticket_service.update_task_assignment(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid), changes=changes
        )
        return TaskAssignmentType.from_model(assignment)

    @strawberry.mutation
    async def unassign_task_actor(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Remove a person from a ticket task (withdraw or un-assign).

        Owner-scoped ticket.assign — the assignee can remove their own link, coordinators
        can remove any. Hard-deletes the assignment row. Returns True on success.
        """
        await ticket_service.unassign_task_actor(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True
