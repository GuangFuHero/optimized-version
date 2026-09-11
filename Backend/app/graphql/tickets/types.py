"""GraphQL types for tickets, ticket tasks, and photos."""

import asyncio
import enum
from datetime import datetime
from types import SimpleNamespace
from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope
from app.core.security import resolve_scope
from app.graphql.masking import mask_email, mask_name, mask_phone
from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import PageInfo, SecondaryLocationInput, TriState, Visibility


@strawberry.enum
class TaskAssignmentStatus(enum.Enum):
    """Work-completion state of a task assignment; drives the HR progress bar."""

    accepted = "accepted"
    en_route = "en_route"
    completed = "completed"


@strawberry.enum
class TaskPropertyStatus(enum.Enum):
    """Fulfillment state of a structured task property."""

    pending = "pending"
    fulfilled = "fulfilled"


@strawberry.type
class PhotoType:
    """GraphQL type representing a photo attached to a station or ticket."""

    uuid: UUID
    ref_uuid: str = strawberry.field(description="UUID of the parent entity this photo is attached to")
    ref_type: str = strawberry.field(
        description=(
            "'geometry' (attached to a ticket or station) "
            "or 'pole' (attached to a secondary_location)"
        )
    )
    url: str = strawberry.field(description="Public URL of the uploaded photo")
    created_by: str = strawberry.field(description="UUID of the user who uploaded this photo")
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "PhotoType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            ref_uuid=m.ref_uuid,
            ref_type=m.ref_type,
            url=m.url,
            created_by=m.created_by,
            created_at=m.created_at,
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
    comment: str | None = strawberry.field(default=None, description="Optional notes about this property")
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "TaskPropertyType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            task_uuid=m.task_uuid,
            property_name=m.property_name,
            property_value=m.property_value,
            quantity=m.quantity,
            status=m.status,
            comment=m.comment,
            created_at=m.created_at,
        )


@strawberry.type
class TaskAssignmentType:
    """GraphQL type representing a user or group assigned to a ticket task."""

    uuid: UUID
    task_uuid: str = strawberry.field(description="UUID of the task this assignment belongs to")
    actor_uuid: str = strawberry.field(description="UUID of the assigned user or group")
    role: str | None = strawberry.field(default=None, description="Role in the task, e.g. 'lead', 'support'")
    status: str = strawberry.field(
        default="accepted",
        description="Work-completion state: 'accepted', 'en_route', or 'completed'",
    )
    assigned_at: datetime | None = strawberry.field(
        default=None, description="Timestamp when the assignment was created"
    )
    updated_at: datetime | None = strawberry.field(
        default=None, description="Timestamp when the status was last changed"
    )

    @classmethod
    def from_model(cls, m) -> "TaskAssignmentType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            task_uuid=m.task_uuid,
            actor_uuid=m.actor_uuid,
            role=m.role,
            status=m.status,
            assigned_at=m.assigned_at,
            updated_at=m.updated_at,
        )


@strawberry.type
class TicketTaskType:
    """GraphQL type representing a task under a support ticket (rescue, HR, supply, etc.)."""

    uuid: UUID
    ticket_uuid: str = strawberry.field(description="UUID of the parent ticket this task belongs to")
    task_type: str = strawberry.field(description="Category of task: 'rescue', 'supply', 'medical', or 'hr'")
    task_name: str = strawberry.field(description="Short name summarising the task")
    task_description: str | None = strawberry.field(
        default=None, description="Detailed task instructions or context"
    )
    quantity: int | None = strawberry.field(
        default=None, description="Number of people or units needed — null means unspecified"
    )
    status: str = strawberry.field(
        default="pending",
        description="Lifecycle state: 'pending', 'in_progress', 'fulfilled', or 'canceled'",
    )
    source: str = strawberry.field(default="user", description="Origin of this task: 'user' or 'official'")
    progress_note: str | None = strawberry.field(
        default=None, description="Current progress update written by the assignee"
    )
    visibility: str = strawberry.field(
        default="public", description="Who can see this task: 'public', 'restricted', or 'internal'"
    )
    moderation_status: str = strawberry.field(
        default="pending_review",
        description="Review state: 'pending_review', 'approved', or 'rejected'",
    )
    review_note: str | None = strawberry.field(
        default=None, description="Moderator's notes explaining the review decision"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who created this task"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field
    async def properties(self, info: strawberry.types.Info) -> list[TaskPropertyType]:
        """Resolve structured properties (skills, cargo type, etc.) for this task."""
        return await info.context["loaders"]["task_properties_by_task"].load(str(self.uuid))

    @strawberry.field
    async def assignments(self, info: strawberry.types.Info) -> list[TaskAssignmentType]:
        """Resolve actors (volunteers, responders) assigned to this task."""
        return await info.context["loaders"]["task_assignments_by_task"].load(str(self.uuid))

    @strawberry.field
    async def assigned_count(self, info: strawberry.types.Info) -> int:
        """Number of people currently linked to this task."""
        rows = await info.context["loaders"]["task_assignments_by_task"].load(str(self.uuid))
        return len(rows)

    @strawberry.field
    async def completed_count(self, info: strawberry.types.Info) -> int:
        """Number of assignments that have reached 'completed' status."""
        rows = await info.context["loaders"]["task_assignments_by_task"].load(str(self.uuid))
        return sum(1 for a in rows if a.status == "completed")

    @strawberry.field
    async def progress(self, info: strawberry.types.Info) -> float | None:
        """Work-completion ratio (0.0-1.0): completed assignments / quantity needed.

        Returns null when quantity is unset or zero. Clamped at 1.0 even if the
        task is over-subscribed (more completions than people requested).
        """
        if not self.quantity:
            return None
        rows = await info.context["loaders"]["task_assignments_by_task"].load(str(self.uuid))
        completed = sum(1 for a in rows if a.status == "completed")
        return min(1.0, completed / self.quantity)

    @classmethod
    def from_model(cls, m) -> "TicketTaskType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            ticket_uuid=m.ticket_uuid,
            task_type=m.task_type,
            task_name=m.task_name,
            task_description=m.task_description,
            quantity=m.quantity,
            status=m.status,
            source=m.source,
            progress_note=m.progress_note,
            visibility=m.visibility,
            moderation_status=m.moderation_status,
            review_note=m.review_note,
            created_by=m.created_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )


@strawberry.input
class CreateTicketTaskInput:
    """Input for creating a new task under a support ticket."""

    ticket_uuid: str = strawberry.field(description="UUID of the ticket this task belongs to")
    task_type: str = strawberry.field(description="Category: 'rescue', 'supply', 'medical', or 'hr'")
    task_name: str
    task_description: str | None = None
    quantity: int | None = strawberry.field(default=None, description="Number of people or units needed")
    source: str = strawberry.field(default="user", description="Origin: 'user' (default) or 'official'")
    visibility: Visibility = strawberry.field(
        default=Visibility.public,
        description="Visibility: 'public' (default), 'restricted', or 'internal'",
    )
    route_uuid: str | None = strawberry.field(
        default=None, description="Optional UUID of an associated route"
    )


@strawberry.input
class UpdateTicketTaskInput:
    """Input for updating a ticket task's status, visibility, or review notes."""

    status: str | None = strawberry.field(
        default=None,
        description="New lifecycle state: 'pending', 'in_progress', 'fulfilled', or 'canceled'",
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
    visibility: Visibility | None = strawberry.field(
        default=None, description="Updated visibility: 'public', 'restricted', or 'internal'"
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

    property_value: str | None = strawberry.field(default=None, description="Updated attribute value")
    quantity: int | None = strawberry.field(
        default=strawberry.UNSET, description="Updated number of units — pass null to clear"
    )
    status: TaskPropertyStatus | None = strawberry.field(
        default=None, description="Updated fulfillment state"
    )
    comment: str | None = strawberry.field(
        default=strawberry.UNSET, description="Updated notes — pass null to clear"
    )


@strawberry.input
class UpdateTaskAssignmentInput:
    """Input for updating a task assignment's work-completion status or role."""

    status: TaskAssignmentStatus | None = strawberry.field(
        default=None,
        description="New work-completion state",
    )
    role: str | None = strawberry.field(
        default=strawberry.UNSET,
        description="Updated role, e.g. 'lead' or 'support' — pass null to clear",
    )


@strawberry.type
class TicketType:
    """GraphQL type representing a disaster relief support ticket."""

    uuid: UUID
    property_name: str = strawberry.field(description="Internal polymorphic discriminator — always 'request'")
    geometry: GeoJSON | None = strawberry.field(
        default=None, description="GeoJSON Point indicating where help is needed"
    )
    title: str = strawberry.field(default="", description="Short subject line describing the request")
    description: str | None = None
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
        default=None, description="Who can see this ticket: 'public', 'restricted', or 'internal'"
    )
    verification_status: str | None = strawberry.field(
        default=None, description="Review state: 'unverified', 'ai_verified', 'human_verified', or 'disputed'"
    )
    review_note: str | None = strawberry.field(
        default=None, description="Moderator's notes about the verification decision"
    )
    disaster_types: list[str] = strawberry.field(
        default_factory=list,
        description=(
            "Disaster type keys this ticket is filed under, e.g. ['flood', 'landslide']. "
            "Plural because one incident is routinely two disasters at once. Drives which "
            "fields `ticketPropertyConfigs` returns for it"
        ),
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who submitted this ticket"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # Private storage backing the contact_* PII resolvers below (ADR-049) — never exposed
    # directly in the schema, only readable (raw or masked) through the gated resolvers.
    # `_geometry_raw` is the WKBElement (not the GeoJSON) needed for the `zone` ST_Contains check.
    _contact_name_raw: strawberry.Private[str] = ""
    _contact_email_raw: strawberry.Private[str | None] = None
    _contact_phone_raw: strawberry.Private[str | None] = None
    # Gated on the same capability as the contact fields above. Not identifying on their
    # own, but "there is a trapped person at this address" is the most sensitive thing a
    # ticket carries, and the coordinate beside it is public.
    _person_trapped_reported_raw: strawberry.Private[str | None] = None
    _immediate_danger_reported_raw: strawberry.Private[str | None] = None
    _geometry_raw: strawberry.Private[object | None] = None
    _pii_visible_task: strawberry.Private[object | None] = None

    def _pii_visible(self, info: strawberry.types.Info):
        """Memoized PII-visibility check shared by the contact_* and triage-flag resolvers.

        Cached as a single asyncio Task on this instance so that when GraphQL resolves
        contact_name/email/phone concurrently on the SAME TicketType, the underlying zone
        check (in_scope → ST_Contains, see app/core/rbac_scopes.py) runs at most once per
        ticket instead of three times. The check-then-create below is synchronous, so it is
        atomic under the event loop — no double-scheduling. Lifetime = this instance = one
        request; there is no cross-request cache, so the staleness window is identical to
        the per-request _rbac_cache it sits alongside.
        """
        if self._pii_visible_task is None:
            self._pii_visible_task = asyncio.ensure_future(self._compute_pii_visible(info))
        return self._pii_visible_task

    async def _compute_pii_visible(self, info: strawberry.types.Info) -> bool:
        """Compute PII visibility directly via resolve_scope + in_scope (ADR-049).

        Neither raises — a denial renders as a *masked* contact field, not a GraphQL
        field-level error. Per-role scope: guest → not visible (no capability); own → own
        ticket; zone → ticket's location inside my team's WorkZone; all → everything.
        """
        user = info.context["user"]
        if user is None:
            return False
        scope = await resolve_scope(
            user, Perm.TICKET_VIEW_PII, info.context["db"], cache=info.context["_rbac_cache"]
        )
        if scope == Scope.NONE:
            return False
        if scope == Scope.ALL:
            return True
        resource = SimpleNamespace(created_by=self.created_by, geometry=self._geometry_raw)
        return await in_scope(scope, actor=user, resource=resource, db=info.context["db"])

    @strawberry.field(description="Requester full name — masked unless the caller holds ticket.view_pii here")
    async def contact_name(self, info: strawberry.types.Info) -> str | None:
        """Return the contact name raw if in scope, otherwise masked (王◯◯ / John S.)."""
        if await self._pii_visible(info):
            return self._contact_name_raw
        return mask_name(self._contact_name_raw)

    @strawberry.field(description="Follow-up email — masked unless the caller holds ticket.view_pii here")
    async def contact_email(self, info: strawberry.types.Info) -> str | None:
        """Return the contact email raw if in scope, otherwise masked (j***@***.com)."""
        if await self._pii_visible(info):
            return self._contact_email_raw
        return mask_email(self._contact_email_raw)

    @strawberry.field(description="Follow-up phone — masked unless the caller holds ticket.view_pii here")
    async def contact_phone(self, info: strawberry.types.Info) -> str | None:
        """Return the contact phone raw if in scope, otherwise masked (09*****678)."""
        if await self._pii_visible(info):
            return self._contact_phone_raw
        return mask_phone(self._contact_phone_raw)

    @strawberry.field(
        description=(
            "Reporter's answer to 災民受困／無法自行離開: 'yes', 'no', 'unknown'. Null when nobody "
            "was asked — and also null to a caller without ticket.view_pii here. What the "
            "person said, not a professional assessment"
        )
    )
    async def person_trapped_reported(self, info: strawberry.types.Info) -> str | None:
        """Return the reporter's answer, or null when the caller is out of PII scope.

        A tri-state has no shape to mask, so denial is null. An out-of-scope caller therefore
        cannot tell "nobody asked" from "you may not see it" — accepted, since that
        distinction only matters to someone who can act on the answer, who holds the
        capability anyway.
        """
        return self._person_trapped_reported_raw if await self._pii_visible(info) else None

    @strawberry.field(
        description=(
            "Reporter's answer to 立即生命危險: 'yes', 'no', 'unknown'. Null when nobody was "
            "asked — and also null to a caller without ticket.view_pii here. Not a triage "
            "grade and not a risk classification"
        )
    )
    async def immediate_danger_reported(self, info: strawberry.types.Info) -> str | None:
        """Return the reporter's danger answer, or null when the caller is out of PII scope."""
        return self._immediate_danger_reported_raw if await self._pii_visible(info) else None

    @strawberry.field
    async def photos(self, info: strawberry.types.Info) -> list[PhotoType]:
        """Resolve photos attached to this ticket."""
        return await info.context["loaders"]["photos_by_ticket"].load(str(self.uuid))

    @strawberry.field
    async def tasks(self, info: strawberry.types.Info) -> list[TicketTaskType]:
        """Resolve all active tasks under this ticket."""
        return await info.context["loaders"]["tasks_by_ticket"].load(str(self.uuid))

    @strawberry.field
    async def disaster_details(
        self, info: strawberry.types.Info
    ) -> list["TicketDisasterDetailType"]:
        """Resolve this ticket's disaster-specific field values.

        A `multi_select` field arrives as several rows sharing one `propertyName`; the caller
        groups them. Pair with `ticketPropertyConfigs(disasterTypes: <this ticket's>)` to get
        the labels, units and hints these bare keys and values belong to.
        """
        return await info.context["loaders"]["disaster_details_by_ticket"].load(str(self.uuid))

    @classmethod
    def from_model(cls, m) -> "TicketType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry),
            title=m.title,
            description=m.description,
            status=m.status,
            priority=m.priority,
            task_type=m.task_type,
            visibility=m.visibility,
            verification_status=m.verification_status,
            review_note=m.review_note,
            disaster_types=list(m.disaster_types or []),
            created_by=m.created_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
            _contact_name_raw=m.contact_name,
            _contact_email_raw=m.contact_email,
            _contact_phone_raw=m.contact_phone,
            _person_trapped_reported_raw=m.person_trapped_reported,
            _immediate_danger_reported_raw=m.immediate_danger_reported,
            _geometry_raw=m.geometry,
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
    contact_email: str | None = strawberry.field(default=None, description="Optional email for follow-up")
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
    visibility: Visibility = strawberry.field(
        default=Visibility.public,
        description="Visibility: 'public' (default), 'restricted', or 'internal'",
    )
    disaster_types: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Disaster type keys, e.g. ['flood', 'landslide']. Each must be an active key from "
            "`disasterTypes`; an unknown one is rejected rather than stored, because a ticket "
            "filed under a disaster that does not exist would show the reporter an empty form"
        ),
    )
    person_trapped_reported: TriState | None = strawberry.field(
        default=None, description="災民受困／無法自行離開. Omit when nobody was asked"
    )
    immediate_danger_reported: TriState | None = strawberry.field(
        default=None, description="立即生命危險. Omit when nobody was asked"
    )
    secondary_location: SecondaryLocationInput | None = strawberry.field(
        default=None,
        description=(
            "Street address and space detail for where help is needed. New in feature 018 — "
            "before it, only stations could carry one, so the record that most needs a door "
            "number had nothing but a map pin"
        ),
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
        description="Updated review state: 'unverified', 'ai_verified', 'human_verified', or 'disputed'",
    )
    disaster_types: list[str] | None = strawberry.field(
        default=strawberry.UNSET,
        description="Disaster type keys — pass [] or null to clear. Validated against `disasterTypes`",
    )
    person_trapped_reported: TriState | None = strawberry.field(
        default=strawberry.UNSET, description="災民受困／無法自行離開 — pass null to unset"
    )
    immediate_danger_reported: TriState | None = strawberry.field(
        default=strawberry.UNSET, description="立即生命危險 — pass null to unset"
    )


@strawberry.type
class TicketDisasterDetailType:
    """One disaster-specific field value recorded against a ticket.

    Deliberately a bare `(propertyName, value)` pair with no label or type: those live in
    `ticketPropertyConfigs` and would go stale the moment an operator renamed a label if they
    were copied here. A `multi_select` answer is several of these sharing a `propertyName`.
    """

    uuid: UUID
    property_name: str = strawberry.field(
        description="The field key, matching a `ticketPropertyConfigs` entry"
    )
    value: str = strawberry.field(
        description=(
            "One selected value. Numbers arrive as strings — the config's dataType says "
            "how to read it"
        )
    )

    @classmethod
    def from_model(cls, m) -> "TicketDisasterDetailType":
        """Build from a SQLAlchemy model instance."""
        return cls(uuid=m.uuid, property_name=m.property_name, value=m.value)


@strawberry.input
class TicketDisasterDetailInput:
    """One field's answer: its key plus every value selected for it."""

    property_name: str = strawberry.field(description="The field key from `ticketPropertyConfigs`")
    values: list[str] = strawberry.field(
        description=(
            "Selected values. One entry for a single-valued field, several for multi_select, "
            "[] to clear the field"
        )
    )
