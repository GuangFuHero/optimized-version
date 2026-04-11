"""GraphQL types for tickets, ticket tasks, and photos."""

from datetime import datetime
from uuid import UUID

import strawberry

from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import PageInfo


@strawberry.type
class PhotoType:
    """GraphQL type representing a photo attached to a station or ticket."""

    uuid: UUID
    ref_uuid: str = strawberry.field(
        description="UUID of the parent entity this photo is attached to"
    )
    ref_type: str = strawberry.field(
        description="Type of the parent entity: 'station' or 'ticket'"
    )
    url: str = strawberry.field(description="Public URL of the uploaded photo")
    created_by: str = strawberry.field(description="UUID of the user who uploaded this photo")
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "PhotoType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, ref_uuid=m.ref_uuid, ref_type=m.ref_type,
            url=m.url, created_by=m.created_by, created_at=m.created_at,
        )


@strawberry.type
class TaskPropertyType:
    """GraphQL type for a structured property attached to a ticket task."""

    uuid: UUID
    task_uuid: str = strawberry.field(description="UUID of the parent ticket task")
    property_name: str = strawberry.field(
        description="Structured attribute key, e.g. 'skill_required', 'cargo_type'"
    )
    property_value: str = strawberry.field(
        description="Value for the attribute, e.g. 'medical_first_aid', 'food'"
    )
    quantity: int | None = strawberry.field(
        default=None, description="Number of units required — null means not applicable"
    )
    status: str | None = strawberry.field(
        default=None, description="Fulfillment state: 'pending' or 'fulfilled'"
    )
    comment: str | None = strawberry.field(
        default=None, description="Optional notes about this property"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who added this property"
    )
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "TaskPropertyType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_uuid=m.task_uuid,
            property_name=m.property_name, property_value=m.property_value,
            quantity=m.quantity, status=m.status, comment=m.comment,
            created_by=m.created_by, created_at=m.created_at,
        )


@strawberry.type
class TaskAssignmentType:
    """GraphQL type representing a user or group assigned to a ticket task."""

    uuid: UUID
    task_uuid: str = strawberry.field(description="UUID of the task this assignment belongs to")
    actor_uuid: str = strawberry.field(description="UUID of the assigned user or group")
    role: str | None = strawberry.field(
        default=None, description="Role in the task, e.g. 'lead', 'support'"
    )
    assigned_at: datetime | None = strawberry.field(
        default=None, description="Timestamp when the assignment was created"
    )

    @classmethod
    def from_model(cls, m) -> "TaskAssignmentType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_uuid=m.task_uuid, actor_uuid=m.actor_uuid,
            role=m.role, assigned_at=m.assigned_at,
        )


@strawberry.type
class TicketTaskType:
    """GraphQL type representing a task under a support ticket (rescue, HR, supply, etc.)."""

    uuid: UUID
    ticket_uuid: str = strawberry.field(
        description="UUID of the parent ticket this task belongs to"
    )
    task_type: str = strawberry.field(
        description="Category of task: 'rescue', 'supply', 'medical', or 'hr'"
    )
    task_name: str = strawberry.field(description="Short name summarising the task")
    task_description: str | None = strawberry.field(
        default=None, description="Detailed task instructions or context"
    )
    quantity: int | None = strawberry.field(
        default=None, description="Number of people or units needed — null means unspecified"
    )
    status: str = strawberry.field(
        default="pending",
        description="Lifecycle state: 'pending', 'in_progress', 'completed', or 'cancelled'",
    )
    source: str = strawberry.field(
        default="user", description="Origin of this task: 'user' or 'official'"
    )
    progress_note: str | None = strawberry.field(
        default=None, description="Current progress update written by the assignee"
    )
    visibility: str = strawberry.field(
        default="public", description="Who can see this task: 'public' or 'private'"
    )
    moderation_status: str = strawberry.field(
        default="pending_review",
        description="Review state: 'pending_review', 'approved', or 'rejected'",
    )
    review_note: str | None = strawberry.field(
        default=None, description="Moderator's notes explaining the review decision"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field
    async def properties(self, info: strawberry.types.Info) -> list[TaskPropertyType]:
        """Resolve structured properties (skills, cargo type, etc.) for this task."""
        from sqlalchemy import select

        from app.models.ticket_task import TaskProperty
        db = info.context["db"]
        result = await db.execute(
            select(TaskProperty).where(
                TaskProperty.task_uuid == str(self.uuid),
                TaskProperty.delete_at.is_(None),
            )
        )
        return [TaskPropertyType.from_model(p) for p in result.scalars()]

    @strawberry.field
    async def assignments(self, info: strawberry.types.Info) -> list[TaskAssignmentType]:
        """Resolve actors (volunteers, responders) assigned to this task."""
        from sqlalchemy import select

        from app.models.ticket_task import TaskAssignment
        db = info.context["db"]
        result = await db.execute(
            select(TaskAssignment).where(TaskAssignment.task_uuid == str(self.uuid))
        )
        return [TaskAssignmentType.from_model(a) for a in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "TicketTaskType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, ticket_uuid=m.ticket_uuid,
            task_type=m.task_type, task_name=m.task_name,
            task_description=m.task_description, quantity=m.quantity,
            status=m.status, source=m.source, progress_note=m.progress_note,
            visibility=m.visibility, moderation_status=m.moderation_status,
            review_note=m.review_note,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.input
class CreateTicketTaskInput:
    """Input for creating a new task under a support ticket."""

    ticket_uuid: str = strawberry.field(description="UUID of the ticket this task belongs to")
    task_type: str = strawberry.field(
        description="Category: 'rescue', 'supply', 'medical', or 'hr'"
    )
    task_name: str
    task_description: str | None = None
    quantity: int | None = strawberry.field(
        default=None, description="Number of people or units needed"
    )
    source: str = strawberry.field(
        default="user", description="Origin: 'user' (default) or 'official'"
    )
    visibility: str = strawberry.field(
        default="public", description="Visibility: 'public' (default) or 'private'"
    )
    route_uuid: str | None = strawberry.field(
        default=None, description="Optional UUID of an associated route"
    )


@strawberry.input
class UpdateTicketTaskInput:
    """Input for updating a ticket task's status, visibility, or review notes."""

    status: str | None = strawberry.field(
        default=None,
        description="New lifecycle state: 'pending', 'in_progress', 'completed', or 'cancelled'",
    )
    progress_note: str | None = strawberry.field(
        default=strawberry.UNSET, description="Updated progress description — pass null to clear"
    )
    review_note: str | None = strawberry.field(
        default=strawberry.UNSET, description="Moderator's review notes — pass null to clear"
    )
    moderation_status: str | None = strawberry.field(
        default=None,
        description="New review state: 'pending_review', 'approved', or 'rejected'",
    )
    visibility: str | None = strawberry.field(
        default=None, description="Updated visibility: 'public' or 'private'"
    )


@strawberry.input
class CreateTaskPropertyInput:
    """Input for adding a structured property to a ticket task."""

    task_uuid: str = strawberry.field(description="UUID of the task to attach this property to")
    property_name: str = strawberry.field(
        description="Attribute key matching the task property config schema"
    )
    property_value: str = strawberry.field(description="Value for the attribute")
    quantity: int | None = strawberry.field(
        default=None, description="Number of units — null if not applicable"
    )
    comment: str | None = None


@strawberry.input
class UpdateTaskPropertyInput:
    """Input for updating a task property's value, quantity, status, or comment."""

    property_value: str | None = strawberry.field(
        default=None, description="Updated attribute value"
    )
    quantity: int | None = strawberry.field(
        default=strawberry.UNSET, description="Updated number of units — pass null to clear"
    )
    status: str | None = strawberry.field(
        default=None, description="Updated fulfillment state: 'pending' or 'fulfilled'"
    )
    comment: str | None = strawberry.field(
        default=strawberry.UNSET, description="Updated notes — pass null to clear"
    )


@strawberry.type
class TicketType:
    """GraphQL type representing a disaster relief support ticket."""

    uuid: UUID
    property_name: str = strawberry.field(
        description="Internal polymorphic discriminator — always 'request'"
    )
    geometry: GeoJSON | None = strawberry.field(
        default=None, description="GeoJSON Point indicating where help is needed"
    )
    title: str = strawberry.field(
        default="", description="Short subject line describing the request"
    )
    description: str | None = None
    contact_name: str = strawberry.field(
        default="", description="Full name of the person who submitted this request"
    )
    contact_email: str | None = strawberry.field(
        default=None, description="Email address for follow-up communication"
    )
    contact_phone: str | None = strawberry.field(
        default=None, description="Phone number for follow-up communication"
    )
    status: str = strawberry.field(
        default="",
        description="Lifecycle state: 'pending', 'in_progress', 'completed', or 'cancelled'",
    )
    priority: str = strawberry.field(
        default="", description="Urgency level: 'low', 'medium', 'high', or 'critical'"
    )
    task_type: str | None = strawberry.field(
        default=None,
        description="Type of help needed: 'rescue', 'supply', 'medical', or 'hr'",
    )
    visibility: str | None = strawberry.field(
        default=None, description="Who can see this ticket: 'public' or 'private'"
    )
    verification_status: str | None = strawberry.field(
        default=None, description="Review state: 'pending_review', 'verified', or 'rejected'"
    )
    review_note: str | None = strawberry.field(
        default=None, description="Moderator's notes about the verification decision"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who submitted this ticket"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field
    async def photos(self, info: strawberry.types.Info) -> list[PhotoType]:
        """Resolve photos attached to this ticket."""
        from sqlalchemy import select

        from app.models.photo import Photo
        db = info.context["db"]
        result = await db.execute(
            select(Photo).where(
                Photo.ref_uuid == str(self.uuid),
                Photo.ref_type == "ticket",
                Photo.delete_at.is_(None),
            )
        )
        return [PhotoType.from_model(p) for p in result.scalars()]

    @strawberry.field
    async def tasks(self, info: strawberry.types.Info) -> list[TicketTaskType]:
        """Resolve all active tasks under this ticket."""
        from sqlalchemy import select

        from app.models.ticket_task import TicketTask
        db = info.context["db"]
        result = await db.execute(
            select(TicketTask).where(
                TicketTask.ticket_uuid == str(self.uuid),
                TicketTask.delete_at.is_(None),
            )
        )
        return [TicketTaskType.from_model(t) for t in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "TicketType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry),
            title=m.title, description=m.description,
            contact_name=m.contact_name, contact_email=m.contact_email,
            contact_phone=m.contact_phone, status=m.status, priority=m.priority,
            task_type=m.task_type, visibility=m.visibility,
            verification_status=m.verification_status, review_note=m.review_note,
            created_by=m.created_by, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class TicketConnection:
    """Paginated list of tickets with page metadata."""

    items: list[TicketType]
    page_info: PageInfo


@strawberry.input
class CreateTicketInput:
    """Input for creating a new support ticket."""

    title: str
    description: str | None = None
    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Point for the location where help is needed — [longitude, latitude]"
    )
    contact_name: str = strawberry.field(description="Full name of the requester")
    contact_email: str | None = strawberry.field(
        default=None, description="Optional email for follow-up"
    )
    contact_phone: str | None = strawberry.field(
        default=None, description="Optional phone number for follow-up"
    )
    priority: str = strawberry.field(
        default="low",
        description="Urgency: 'low' (default), 'medium', 'high', or 'critical'",
    )
    task_type: str | None = strawberry.field(
        default=None, description="Type of help: 'rescue', 'supply', 'medical', or 'hr'"
    )
    visibility: str = strawberry.field(
        default="public", description="Visibility: 'public' (default) or 'private'"
    )


@strawberry.input
class UpdateTicketInput:
    """Input for updating a ticket's status, priority, or review notes."""

    status: str | None = strawberry.field(
        default=None,
        description="New lifecycle state — must follow valid transitions (e.g. pending → in_progress)",
    )
    priority: str | None = strawberry.field(
        default=None, description="Updated urgency: 'low', 'medium', 'high', or 'critical'"
    )
    title: str | None = None
    description: str | None = strawberry.UNSET
    review_note: str | None = strawberry.field(
        default=strawberry.UNSET, description="Moderator's review notes — pass null to clear"
    )
    verification_status: str | None = strawberry.field(
        default=None,
        description="Updated review state: 'pending_review', 'verified', or 'rejected'",
    )
