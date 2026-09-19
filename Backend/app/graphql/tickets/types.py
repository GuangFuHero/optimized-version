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
from app.db.h3 import COARSE_MAX_H3_RESOLUTION
from app.graphql.masking import mask_email, mask_name, mask_phone
from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import (
    PageInfo,
    SecondaryLocationInput,
    SecondaryLocationType,
    TriState,
    Visibility,
)


def ticket_detail_visible(info: strawberry.types.Info, ticket_uuid: str, resource=None):
    """Whether the caller may see this ticket's detail (ADR-281), decided once per request.

    Detail is everything `ticket.view_detail` guards: the exact point, the address, the free
    text of the ticket and its tasks, the photos, the review notes, who filed it. One ticket
    is one decision, so the answer is shared by the ticket, its tasks and their properties —
    keyed by ticket uuid in the request context rather than memoized per GraphQL object,
    because a task has no object in common with its ticket.

    Returns the cached asyncio Task (await it). `resource` — anything with `created_by` and
    `geometry` — spares the loader round-trip when the caller already holds the ticket; the
    tasks, which carry neither, pass nothing and the ticket is loaded only if the scope is
    `own` or `zone`. Same no-double-scheduling argument as TicketType._pii_visible: the
    check-then-store below runs synchronously on the event loop.
    """
    decided = info.context["_ticket_detail_visible"]
    key = str(ticket_uuid)
    if key not in decided:
        decided[key] = asyncio.ensure_future(_decide_ticket_detail(info, key, resource))
    return decided[key]


async def _decide_ticket_detail(info: strawberry.types.Info, ticket_uuid: str, resource) -> bool:
    """resolve_scope + in_scope, like _compute_pii_visible. Never raises: denial is withholding."""
    user = info.context["user"]
    if user is None:
        return False
    db = info.context["db"]
    scope = await resolve_scope(
        user, Perm.TICKET_VIEW_DETAIL, db, cache=info.context["_rbac_cache"]
    )
    if scope == Scope.NONE:
        return False
    if scope == Scope.ALL:
        return True
    if resource is None:
        resource = await info.context["loaders"]["ticket_by_uuid"].load(ticket_uuid)
        if resource is None:
            return False
    return await in_scope(scope, actor=user, resource=resource, db=db)


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
    created_at: datetime | None = None

    _comment_raw: strawberry.Private[str | None] = None

    @strawberry.field(
        description=(
            "Optional notes about this property. Null to a caller without ticket.view_detail "
            "on the parent ticket"
        )
    )
    async def comment(self, info: strawberry.types.Info) -> str | None:
        """Return the note, or null when the caller may not see the ticket's detail.

        Free text like the task description beside it (AC-03, ADR-281), and the value is
        structured while the note is not. Judged by the ticket the task belongs to — a
        property carries neither a point nor an author of its own to judge it by.
        """
        ticket_uuid = await info.context["loaders"]["ticket_uuid_by_task"].load(self.task_uuid)
        if ticket_uuid is None or not await ticket_detail_visible(info, ticket_uuid):
            return None
        return self._comment_raw

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
            created_at=m.created_at,
            _comment_raw=m.comment,
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
    quantity: int | None = strawberry.field(
        default=None, description="Number of people or units needed — null means unspecified"
    )
    status: str = strawberry.field(
        default="pending",
        description="Lifecycle state: 'pending', 'in_progress', 'fulfilled', or 'canceled'",
    )
    source: str = strawberry.field(default="user", description="Origin of this task: 'user' or 'official'")
    visibility: str = strawberry.field(
        default="public", description="Who can see this task: 'public', 'restricted', or 'internal'"
    )
    moderation_status: str = strawberry.field(
        default="pending_review",
        description="Review state: 'pending_review', 'approved', or 'rejected'",
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # Readable only through the gated resolvers below (ADR-281): the free text and the author
    # of a task are withheld exactly when its ticket's are. The name, type, quantity and
    # progress stay public — they are what a volunteer decides "can I help?" on (AC-03 is
    # about original free text, not structure).
    _task_description_raw: strawberry.Private[str | None] = None
    _progress_note_raw: strawberry.Private[str | None] = None
    _review_note_raw: strawberry.Private[str | None] = None
    _created_by_raw: strawberry.Private[str | None] = None

    def _detail_visible(self, info: strawberry.types.Info):
        return ticket_detail_visible(info, self.ticket_uuid)

    @strawberry.field(
        description=(
            "Detailed task instructions or context. Null to a caller without "
            "ticket.view_detail on the parent ticket"
        )
    )
    async def task_description(self, info: strawberry.types.Info) -> str | None:
        """The reporter's own words about the task — may say which door, which floor."""
        return self._task_description_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description=(
            "Current progress update written by the assignee. Null to a caller without "
            "ticket.view_detail on the parent ticket"
        )
    )
    async def progress_note(self, info: strawberry.types.Info) -> str | None:
        """Operational notes accumulate who is where — kept out of search for the same reason."""
        return self._progress_note_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description=(
            "Moderator's notes explaining the review decision. Null to a caller without "
            "ticket.view_detail on the parent ticket"
        )
    )
    async def review_note(self, info: strawberry.types.Info) -> str | None:
        """Return the moderator's note, or null when the caller is out of detail scope."""
        return self._review_note_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description=(
            "UUID of the user who created this task. Null to a caller without "
            "ticket.view_detail on the parent ticket"
        )
    )
    async def created_by(self, info: strawberry.types.Info) -> str | None:
        """Return the author's uuid, or null when the caller is out of detail scope."""
        return self._created_by_raw if await self._detail_visible(info) else None

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
            quantity=m.quantity,
            status=m.status,
            source=m.source,
            visibility=m.visibility,
            moderation_status=m.moderation_status,
            created_at=m.created_at,
            updated_at=m.updated_at,
            _task_description_raw=m.task_description,
            _progress_note_raw=m.progress_note,
            _review_note_raw=m.review_note,
            _created_by_raw=m.created_by,
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
    title: str = strawberry.field(default="", description="Short subject line describing the request")
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
    disaster_types: list[str] = strawberry.field(
        default_factory=list,
        description=(
            "Disaster type keys this ticket is filed under, e.g. ['flood', 'landslide']. "
            "Plural because one incident is routinely two disasters at once. Drives which "
            "fields `ticketPropertyConfigs` returns for it"
        ),
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
    # ticket carries.
    _person_trapped_reported_raw: strawberry.Private[str | None] = None
    _immediate_danger_reported_raw: strawberry.Private[str | None] = None
    _geometry_raw: strawberry.Private[object | None] = None
    _pii_visible_task: strawberry.Private[object | None] = None
    # Backing the ticket.view_detail resolvers (ADR-281). `_created_by_raw` also feeds both
    # scope checks — `own` is decided on it whether or not the caller may read it.
    _geometry_geojson: strawberry.Private[dict | None] = None
    _description_raw: strawberry.Private[str | None] = None
    _review_note_raw: strawberry.Private[str | None] = None
    _created_by_raw: strawberry.Private[str | None] = None
    # How coarse the point is for a caller without detail: the query's `zoom`, capped.
    _coarse_resolution: strawberry.Private[int] = COARSE_MAX_H3_RESOLUTION

    def _detail_visible(self, info: strawberry.types.Info):
        """This ticket's ticket.view_detail decision, shared with its tasks (see the helper)."""
        resource = SimpleNamespace(created_by=self._created_by_raw, geometry=self._geometry_raw)
        return ticket_detail_visible(info, str(self.uuid), resource)

    @strawberry.field(
        description=(
            "GeoJSON Point indicating where help is needed. To a caller without "
            "ticket.view_detail here, the centre of the H3 cell the point falls in — at most "
            "resolution 8 (about 1 km across), coarser when `zoom` asks for it"
        )
    )
    async def geometry(self, info: strawberry.types.Info) -> GeoJSON | None:
        """Return the exact point, or the centre of its H3 cell when out of detail scope.

        A cell, not null (ADR-281, reversing #51's draft): the public map needs the ticket
        somewhere, and the team's rule is "a region before signing in". A cell centre, not a
        random offset: the same answer every time, so repeated queries average to nothing.
        The centre is computed in Postgres (the `coarse_point` loader) so the exact point
        never reaches this process for that caller; null only if that lookup finds no row.
        """
        if await self._detail_visible(info):
            return self._geometry_geojson
        return await info.context["loaders"]["coarse_point"].load(
            (str(self.uuid), self._coarse_resolution)
        )

    @strawberry.field(
        description=(
            "The reporter's own account. Null to a caller without ticket.view_detail here — "
            "free text can name a door number the address field withholds"
        )
    )
    async def description(self, info: strawberry.types.Info) -> str | None:
        """Return the description, or null when the caller is out of detail scope (AC-03)."""
        return self._description_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description=(
            "Moderator's notes about the verification decision. Null to a caller without "
            "ticket.view_detail here"
        )
    )
    async def review_note(self, info: strawberry.types.Info) -> str | None:
        """Return the moderator's note, or null when the caller is out of detail scope."""
        return self._review_note_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description=(
            "UUID of the user who submitted this ticket. Null to a caller without "
            "ticket.view_detail here"
        )
    )
    async def created_by(self, info: strawberry.types.Info) -> str | None:
        """Return the reporter's uuid, or null when the caller is out of detail scope."""
        return self._created_by_raw if await self._detail_visible(info) else None

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
        resource = SimpleNamespace(created_by=self._created_by_raw, geometry=self._geometry_raw)
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

    @strawberry.field(
        description=(
            "Photos attached to this ticket. Empty to a caller without ticket.view_detail here"
        )
    )
    async def photos(self, info: strawberry.types.Info) -> list[PhotoType]:
        """Resolve photos attached to this ticket, or none when out of detail scope.

        A photo taken at the scene can show the house number the address field withholds
        (AC-03). Empty rather than null, so the list's shape does not change with the caller.
        """
        if not await self._detail_visible(info):
            return []
        return await info.context["loaders"]["photos_by_ticket"].load(str(self.uuid))

    @strawberry.field
    async def tasks(self, info: strawberry.types.Info) -> list[TicketTaskType]:
        """Resolve all active tasks under this ticket."""
        return await info.context["loaders"]["tasks_by_ticket"].load(str(self.uuid))

    @strawberry.field(
        description=(
            "Street address and space detail for where help is needed. Null to a caller "
            "without ticket.view_detail here, and null when the ticket carries no address"
        )
    )
    async def secondary_location(
        self, info: strawberry.types.Info
    ) -> SecondaryLocationType | None:
        """Resolve the ticket's address, or null when the caller is out of detail scope.

        Gated where the station's identical field is not (ADR-268): a shelter's address is
        already on the public map, while a ticket's is the reporter's own home. Gated on
        ticket.view_detail, beside the exact point, rather than ADR-268's ticket.view_pii
        (ADR-281): the address and the point name the same house, and the team's rule is
        that signing in shows it — `view_pii` is `own` for a plain account, which left a
        signed-in volunteer the pin but not the door.
        """
        if not await self._detail_visible(info):
            return None
        return await info.context["loaders"]["secondary_location_by_geometry"].load(
            str(self.uuid)
        )

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
    def from_model(
        cls, m, *, coarse_resolution: int = COARSE_MAX_H3_RESOLUTION
    ) -> "TicketType":
        """Build from a SQLAlchemy model instance.

        `coarse_resolution` is how coarse `geometry` is for a caller without detail — the
        read queries pass their `zoom`-derived value; everything else gets the cap.
        """
        return cls(
            uuid=m.uuid,
            property_name=m.property_name,
            title=m.title,
            status=m.status,
            priority=m.priority,
            task_type=m.task_type,
            visibility=m.visibility,
            verification_status=m.verification_status,
            disaster_types=list(m.disaster_types or []),
            created_at=m.created_at,
            updated_at=m.updated_at,
            _contact_name_raw=m.contact_name,
            _contact_email_raw=m.contact_email,
            _contact_phone_raw=m.contact_phone,
            _person_trapped_reported_raw=m.person_trapped_reported,
            _immediate_danger_reported_raw=m.immediate_danger_reported,
            _geometry_raw=m.geometry,
            _geometry_geojson=geom_to_geojson(m.geometry),
            _description_raw=m.description,
            _review_note_raw=m.review_note,
            _created_by_raw=m.created_by,
            _coarse_resolution=coarse_resolution,
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
    secondary_location: SecondaryLocationInput | None = strawberry.field(
        default=None,
        description=(
            "Replace the ticket's street address and space detail, creating it if the ticket "
            "was filed without one. A whole-input replacement, not a patch — omitted members "
            "are written as null"
        ),
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
