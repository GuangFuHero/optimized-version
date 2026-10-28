"""GraphQL mutations for tickets and ticket tasks.

Thin per ADR-014: parse input, call the ticket service function (which owns authz,
validation, and persistence), map the result back to a GraphQL type. See
app/services/ticket.py.
"""

from typing import Annotated
from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.shared import DuplicatesSuspected, secondary_location_to_dict
from app.graphql.tickets.types import (
    AuditVerdict,
    CreateHelpRequestInput,
    CreateTaskPropertyInput,
    CreateTicketInput,
    CreateTicketResult,
    CreateTicketTaskInput,
    CreateTicketTaskResult,
    TaskAssignmentType,
    TaskPropertyType,
    TicketCreated,
    TicketDisasterDetailInput,
    TicketDisasterDetailType,
    TicketTaskCreated,
    TicketTaskType,
    TicketType,
    UpdateTaskAssignmentInput,
    UpdateTaskPropertyInput,
    UpdateTicketInput,
    UpdateTicketTaskInput,
)
from app.services import ticket as ticket_service
from app.services import ticket_audit
from app.services.dedup_submission import (
    SubmissionHeld,
    TaskSubmission,
    submit_help_request,
    submit_new_task,
    submit_new_ticket,
)


@strawberry.type
class RequestMutation:
    """Mutations for creating and updating disaster relief support tickets."""

    @strawberry.mutation
    async def create_ticket(
        self, info: strawberry.types.Info, input: CreateTicketInput
    ) -> CreateTicketResult:
        """Create a support ticket with its tasks — unless any task looks like an open one nearby.

        Two-phase. If any task looks like an open task nearby, nothing is created and
        `DuplicatesSuspected` lists each suspect: which part of the input (`draftRef`) and what it
        looks like. Send the same input again after editing, or with `acknowledgedDuplicateOf` set
        on each task confirmed not to be a duplicate; a task whose acknowledged entity exists is
        not checked again and the pair is recorded for review. Otherwise the ticket and all its
        tasks are created together (`TicketCreated`). A failing duplicate check never blocks.
        Requires ticket.add.
        """
        result = await submit_new_ticket(
            info.context["db"],
            actor=require_authenticated(info),
            tasks=[_task_submission(task) for task in input.tasks],
            geometry=input.geometry,
            title=input.title,
            description=input.description,
            contact_name=input.contact_name,
            contact_email=input.contact_email,
            contact_phone=input.contact_phone,
            priority=input.priority,
            task_type=input.task_type,
            disaster_types=input.disaster_types,
            person_trapped_reported=(
                input.person_trapped_reported.value if input.person_trapped_reported else None
            ),
            immediate_danger_reported=(
                input.immediate_danger_reported.value if input.immediate_danger_reported else None
            ),
            secondary_location=(
                secondary_location_to_dict(input.secondary_location)
                if input.secondary_location is not None
                else None
            ),
            building_map_uuid=str(input.building_map_uuid) if input.building_map_uuid else None,
        )
        if isinstance(result, SubmissionHeld):
            return DuplicatesSuspected.of(result.suspects)
        return TicketCreated(
            ticket=TicketType.from_model(result.entity),
            tasks=[TicketTaskType.from_model(task) for task in result.tasks],
        )

    @strawberry.mutation
    async def create_help_request(
        self, info: strawberry.types.Info, input: CreateHelpRequestInput
    ) -> CreateTicketResult:
        """File a citizen's request for help, its needs and photo links in one transaction (請求協助).

        Requires ticket.add. Nothing is written unless every need and photo link is valid; see
        app/services/ticket.py::validate_help_request for the rules.

        Two-phase, as `createTicket`: if any need looks like an open task nearby, nothing is filed
        and `DuplicatesSuspected` lists each suspect (`draftRef` "task:i" is the i-th need). Send
        the request again with `acknowledgedDuplicateOf` on each need confirmed not to be a
        duplicate. A failing duplicate check never blocks.
        """
        result = await submit_help_request(
            info.context["db"],
            actor=require_authenticated(info),
            geometry=input.geometry,
            title=input.title,
            description=input.description,
            contact_name=input.contact_name,
            contact_phone=input.contact_phone,
            contact_email=input.contact_email,
            secondary_location=(
                secondary_location_to_dict(input.secondary_location)
                if input.secondary_location is not None
                else None
            ),
            tasks=[
                {
                    "task_type": task.task_type.value,
                    "task_name": task.task_name,
                    "task_description": task.task_description,
                    "quantity": task.quantity,
                    "acknowledged_duplicate_of": task.acknowledged_duplicate_of,
                }
                for task in input.tasks
            ],
            photo_urls=input.photo_urls,
        )
        if isinstance(result, SubmissionHeld):
            return DuplicatesSuspected.of(result.suspects)
        return TicketCreated(
            ticket=TicketType.from_model(result.entity),
            tasks=[TicketTaskType.from_model(task) for task in result.tasks],
        )

    @strawberry.mutation
    async def update_ticket(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketInput
    ) -> TicketType:
        """Update a ticket's priority, title, content, or address.

        Not its status, which is worked out from its needs, nor its audit, which auditTicket
        gives. A change to the content voids a verdict given on the old one. `secondaryLocation`
        replaces the address wholesale and creates it when the ticket was filed without one
        (ADR-268). Requires ticket.edit with scope check.
        """
        changes = {}
        if input.priority is not None:
            changes["priority"] = input.priority
        if input.title is not None:
            changes["title"] = input.title
        for field in ("description", "disaster_types"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val
        # Enums have to be unwrapped to their string value before reaching the service.
        # `update_ticket` matches keys by `hasattr`, so an unwrapped enum would be stored as the
        # member object rather than rejected — silently, which is why this is explicit rather
        # than folded into the loop.
        for field in ("person_trapped_reported", "immediate_danger_reported"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                changes[field] = val.value if val is not None else None

        ticket = await ticket_service.update_ticket(
            info.context["db"],
            actor=require_authenticated(info),
            uuid=str(uuid),
            changes=changes,
            secondary_location=(
                secondary_location_to_dict(input.secondary_location)
                if input.secondary_location is not None
                else None
            ),
        )
        return TicketType.from_model(ticket)

    @strawberry.mutation
    async def set_ticket_disaster_details(
        self,
        info: strawberry.types.Info,
        uuid: UUID,
        details: list[TicketDisasterDetailInput],
    ) -> list[TicketDisasterDetailType]:
        """Replace a ticket's disaster-specific field answers.

        A full replacement, not a patch: whatever is sent becomes the complete answer set, and
        a field left out of `details` is cleared. That mirrors the form, which shows every
        field at once — a merge would leave no way to un-answer a question.

        Two entries naming the same `propertyName` are unioned, not overwritten — a client
        that emits one entry per ticked checkbox would otherwise keep only the last box. A
        value repeated across both entries collapses to one row, so the union cannot violate
        the unique constraint.

        Requires ticket.edit with scope check. Returns the stored values.
        """
        merged: dict[str, list[str]] = {}
        for detail in details:
            merged.setdefault(detail.property_name, []).extend(detail.values)
        rows = await ticket_service.set_ticket_disaster_details(
            info.context["db"],
            actor=require_authenticated(info),
            ticket_uuid=str(uuid),
            details=merged,
        )
        return [TicketDisasterDetailType.from_model(r) for r in rows]

    @strawberry.mutation
    async def audit_ticket(
        self,
        info: strawberry.types.Info,
        uuid: UUID,
        status: AuditVerdict,
        content_hash: Annotated[
            str,
            strawberry.argument(description="`auditContentHash` as read when the auditor opened the ticket"),
        ],
        note: str | None = None,
    ) -> TicketType:
        """Give the verdict on the version of a ticket the auditor saw: 'audited', or 'audit_issue'.

        Requires ticket.audit with scope check. Refused if the ticket changed since
        `auditContentHash` was read. The note is required for an issue, and the requester and the
        volunteers on its needs are told the ticket may be wrong, without the note. A later change
        to the content sends the ticket back to 'no_audit'.
        """
        ticket = await ticket_audit.audit_ticket(
            info.context["db"],
            actor=require_authenticated(info),
            uuid=str(uuid),
            status=status.value,
            note=note,
            seen_hash=content_hash,
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
        self,
        info: strawberry.types.Info,
        input: CreateTicketTaskInput,
        acknowledged_duplicate_of: str | None = None,
    ) -> CreateTicketTaskResult:
        """Add a need (rescue, HR, supply, etc.) to an existing ticket — the site's 再加一件.

        Two-phase: `DuplicatesSuspected` (nothing added) when it looks like an open task of
        another ticket; send again with `acknowledgedDuplicateOf` to add it anyway. The ticket's
        own tasks are never suspects. Requires ticket.edit on the ticket: a signed-in citizen adds
        to their own ticket only. A completed ticket is open again once it has the new need; a
        deleted or cancelled one takes none.
        """
        result = await submit_new_task(
            info.context["db"],
            actor=require_authenticated(info),
            ticket_uuid=str(input.ticket_uuid),
            task=TaskSubmission(
                task_type=input.task_type,
                task_name=input.task_name,
                task_description=input.task_description,
                quantity=input.quantity,
                source=input.source,
                route_uuid=str(input.route_uuid) if input.route_uuid else None,
                acknowledged_duplicate_of=acknowledged_duplicate_of,
            ),
        )
        if isinstance(result, SubmissionHeld):
            return DuplicatesSuspected.of(result.suspects)
        return TicketTaskCreated(task=TicketTaskType.from_model(result.entity))

    @strawberry.mutation
    async def update_ticket_task(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketTaskInput
    ) -> TicketTaskType:
        """Update a ticket task's progress note.

        UNSET fields are skipped. Requires ticket.edit permission. Returns the updated task.
        Its status is not editable: it moves only through assignTaskActor, unassignTaskActor,
        stopRecruiting and deletion.
        """
        changes = {}
        if input.progress_note is not strawberry.UNSET:
            changes["progress_note"] = input.progress_note

        task = await ticket_service.update_ticket_task(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid), changes=changes
        )
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def delete_ticket_task(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Delete one need — the requester's 刪除這筆需求.

        Requires ticket.delete on the need's ticket. Any need not already deleted can go, one
        with everyone it asked for included. It is canceled and soft-deleted, the ticket's status
        is worked out again, and everyone on it hears they need not go. Returns True.
        """
        await ticket_service.delete_ticket_task(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True

    @strawberry.mutation
    async def create_task_property(
        self, info: strawberry.types.Info, input: CreateTaskPropertyInput
    ) -> TaskPropertyType:
        """Add a structured property to a ticket task.

        Requires ticket.edit, scope-checked against the parent task as updateTaskProperty is: a
        signed-in citizen adds properties to their own needs only. Returns the created
        TaskPropertyType.
        """
        prop = await ticket_service.create_task_property(
            info.context["db"],
            actor=require_authenticated(info),
            task_uuid=str(input.task_uuid),
            property_name=input.property_name,
            property_value=input.property_value,
            quantity=input.quantity,
            comment=input.comment,
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
        A fulfilled or canceled task is refused, as is any task of a completed or cancelled
        ticket. Once the task has `quantity` people it takes nobody more, a coordinator
        assigning someone else included. The same actor cannot be linked to the same task
        twice. Returns the new assignment.
        """
        assignment = await ticket_service.assign_task_actor(
            info.context["db"],
            actor=require_authenticated(info),
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
        can remove any. Hard-deletes the assignment row. Refused, for everyone, once the
        requester stopped recruiting for the task (recruitingStoppedAt); a task that filled by
        itself takes people again. Returns True on success.
        """
        await ticket_service.unassign_task_actor(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid)
        )
        return True

    @strawberry.mutation
    async def stop_recruiting(self, info: strawberry.types.Info, task_uuid: UUID) -> TicketTaskType:
        """Stop recruiting for one need — the requester's 停止招募.

        Requires ticket.edit on the need's ticket. The need becomes fulfilled with its quantity
        cut to the people already on it, never reopens, and nobody on it can give their place
        back; to recruit again, open another need. Refused for a need nobody claimed (delete it
        instead) and for one no longer open. Everyone on it hears they still go. Returns the
        need.
        """
        task = await ticket_service.stop_recruiting(
            info.context["db"], actor=require_authenticated(info), task_uuid=str(task_uuid)
        )
        return TicketTaskType.from_model(task)


def _task_submission(draft) -> TaskSubmission:
    """Convert a `CreateTicketTaskDraft` into the service's `TaskSubmission`."""
    return TaskSubmission(
        task_type=draft.task_type,
        task_name=draft.task_name,
        task_description=draft.task_description,
        quantity=draft.quantity,
        source=draft.source,
        route_uuid=str(draft.route_uuid) if draft.route_uuid else None,
        acknowledged_duplicate_of=draft.acknowledged_duplicate_of,
    )
