"""GraphQL types for tickets, ticket tasks, and photos."""

import asyncio
import enum
from datetime import datetime
from types import SimpleNamespace
from typing import Annotated
from uuid import UUID

import strawberry
from strawberry.scalars import JSON

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, active_team, in_scope
from app.core.security import resolve_scope
from app.db.h3 import COARSE_MAX_H3_RESOLUTION
from app.graphql.area.types import AssignedTeamType
from app.graphql.masking import mask_email, mask_name, mask_phone
from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import (
    DuplicatesSuspected,
    PageInfo,
    SecondaryLocationInput,
    SecondaryLocationType,
    TriState,
)
from app.services import ticket_audit


def ticket_detail_visible(info: strawberry.types.Info, ticket_uuid: str, resource=None):
    """Whether the caller may see this ticket's detail (ADR-281), decided once per request.

    Detail is everything `ticket.view_detail` guards: the exact point, the address, the free
    text of the ticket and its tasks, the photos, who filed it. One ticket
    is one decision, so the answer is shared by the ticket, its tasks and their properties —
    keyed by ticket uuid in the request context rather than memoized per GraphQL object,
    because a task has no object in common with its ticket.

    Returns the cached asyncio Task (await it). `resource` — anything with `created_by` and
    `geometry` — spares the loader round-trip when the caller already holds the ticket; the
    tasks, which carry neither, pass nothing and the ticket is loaded only if the scope is
    `own` (`zone` goes to ticket_in_team_zones, keyed by uuid alone). Same no-double-scheduling
    argument as TicketType._pii_in_scope: the check-then-store below runs synchronously on the
    event loop.
    """
    decided = info.context["_ticket_detail_visible"]
    key = str(ticket_uuid)
    if key not in decided:
        decided[key] = asyncio.ensure_future(
            _decide_ticket_scope(info, Perm.TICKET_VIEW_DETAIL, key, resource)
        )
    return decided[key]


def ticket_history_visible(info: strawberry.types.Info, ticket_uuid: str, resource=None):
    """Whether the caller holds ticket.view_history on this ticket, decided once per request.

    Gates a task's `assignments`, which name the accounts of the volunteers going: the
    requester's and the coordinators' business. They followed ticket.view_pii until ADR-286
    widened it to everyone signed in; with `createdBy` open and the requester's name in full to
    anyone who claims, an open claimant list would let anyone follow a volunteer from need to
    need. So they follow the timeline instead, which kept view_pii's old tiering — and already
    names who took and who dropped a task (ADR-143). It also gates the contact details beside a
    claim, and the triage answers in the `tickets` list (ADR-286 points 1, 5 and 6). `resource`
    spares the loader as in ticket_detail_visible.
    """
    decided = info.context["_ticket_history_visible"]
    key = str(ticket_uuid)
    if key not in decided:
        decided[key] = asyncio.ensure_future(
            _decide_ticket_scope(info, Perm.TICKET_VIEW_HISTORY, key, resource)
        )
    return decided[key]


def ticket_audit_visible(info: strawberry.types.Info, ticket_uuid: str, resource=None):
    """Whether the caller holds ticket.audit on this ticket, decided once per request.

    Gates the audit note, who gave the verdict and when, and the audit history. On the public
    site everyone acts as their plain account, which holds no ticket.audit, so all of it stays
    on the admin page; the status alone is public. `resource` as in ticket_detail_visible.
    """
    decided = info.context["_ticket_audit_visible"]
    key = str(ticket_uuid)
    if key not in decided:
        decided[key] = asyncio.ensure_future(_decide_ticket_scope(info, Perm.TICKET_AUDIT, key, resource))
    return decided[key]


def ticket_perm_held(info: strawberry.types.Info, perm: Perm, ticket_uuid: str, resource=None):
    """Whether the caller holds `perm` on this ticket, decided once per request and perm.

    For the viewerCan* flags of perms that gate only a mutation. `resource` as in
    ticket_detail_visible.
    """
    decided = info.context.setdefault("_ticket_perm_held", {})
    key = (perm, str(ticket_uuid))
    if key not in decided:
        decided[key] = asyncio.ensure_future(_decide_ticket_scope(info, perm, str(ticket_uuid), resource))
    return decided[key]


async def _decide_ticket_scope(info: strawberry.types.Info, perm: Perm, ticket_uuid: str, resource) -> bool:
    """resolve_scope + in_scope, like _compute_pii_in_scope. Never raises: denial is withholding."""
    user = info.context["user"]
    if user is None:
        return False
    db = info.context["db"]
    scope = await resolve_scope(user, perm, db, cache=info.context["_rbac_cache"])
    if scope == Scope.NONE:
        return False
    if scope == Scope.ALL:
        return True
    if scope == Scope.ZONE:
        return await ticket_in_team_zones(info, ticket_uuid)
    if resource is None:
        resource = await info.context["loaders"]["ticket_by_uuid"].load(ticket_uuid)
        if resource is None:
            return False
    return await in_scope(scope, actor=user, resource=resource, db=db)


async def ticket_in_team_zones(info: strawberry.types.Info, ticket_uuid: str) -> bool:
    """`zone` scope on a ticket: whether it lies in the caller's team zones, once per ticket.

    What `in_scope` decides for `zone`, but through the `ticket_in_team_zones` loader: whether a
    ticket is in my zones does not depend on the perm, so every viewerCan* flag, the detail and
    the contact checks share one answer, and a page shares one statement. Read from the ticket's
    row, as the resource passed in carries the same point. No team, no zone.
    """
    team = active_team(info.context["user"])
    if team is None:
        return False
    return await info.context["loaders"]["ticket_in_team_zones"].load((str(team), str(ticket_uuid)))


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


@strawberry.enum
class NeedKind(enum.Enum):
    """What a need filed from the site asks for: `TASK_TYPES` in app/services/ticket.py.

    An enum on the site's input only, so an unknown value is refused before the resolver runs and
    the SDL lists the four. `createTicketTask` keeps a String, as its service stores whatever it
    is sent (see `TASK_TYPES`).
    """

    rescue = "rescue"
    supply = "supply"
    medical = "medical"
    hr = "hr"


@strawberry.enum
class AuditVerdict(enum.Enum):
    """What an auditor decides on a ticket: `VERDICTS` in app/services/ticket_audit.py."""

    audited = "audited"
    audit_issue = "audit_issue"


@strawberry.enum
class AuditStatus(enum.Enum):
    """A ticket's audit status, to filter on: `AUDIT_STATUSES` in app/services/ticket_audit.py."""

    no_audit = "no_audit"
    need_audit = "need_audit"
    audited = "audited"
    audit_issue = "audit_issue"


@strawberry.enum
class TicketListOrder(enum.Enum):
    """How the `tickets` list is ordered: `TICKET_ORDERS` in app/repositories/tickets_repository.py.

    NEEDS_FIRST is the site list's (ADR-419): tickets still taking people first, one with an open
    rescue need ahead of the rest, then newest first within each.
    """

    NEWEST = "newest"
    NEEDS_FIRST = "needs_first"


@strawberry.enum
class TicketStatus(enum.Enum):
    """A ticket's status, to filter on: worked out from its needs in app/services/ticket_status.py."""

    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


@strawberry.enum
class TicketVerificationState(enum.Enum):
    """Why 重複審核 waits on a ticket: app/services/ticket_verification.py (ADR-443)."""

    disputed = "disputed"


@strawberry.type(description="Another ticket a disputed ticket may duplicate")
class TicketDuplicateRefType:
    """An entry of `TicketVerificationType.duplicateOf` and of `TicketType.suspectedDuplicateOf`."""

    uuid: UUID
    title: str


@strawberry.type(description="Where a ticket stands in 重複審核 (ADR-443)")
class TicketVerificationType:
    """`TicketType.verificationStatus`, worked out from the duplicate pair cards on every read."""

    state: TicketVerificationState = strawberry.field(
        description=(
            "'disputed': a card on this ticket or one of its needs waits for a verdict, or was judged a "
            "duplicate and not merged yet, and 重複審核 can still merge it: its far side is another "
            "ticket, neither cancelled nor deleted"
        )
    )
    duplicate_of: list[TicketDuplicateRefType] = strawberry.field(
        description="The tickets on the far side of those cards, each once, oldest card first; never empty"
    )


@strawberry.enum
class TicketAvailability(enum.Enum):
    """Whether `ticket(uuid)` gives a ticket, and if not, what became of it (ADR-444).

    merged: 重複審核 merged it into another ticket, which is still there: `replacedByUuid` names it.
    deleted: its owner deleted it, or the ticket it was merged into is deleted since.
    not_found: there never was, or the caller cannot see it, which `ticket` cannot tell apart either.
    """

    available = "available"
    merged = "merged"
    deleted = "deleted"
    not_found = "not_found"


@strawberry.type(description="What a share link finds at a ticket's uuid: the state, nothing of the ticket")
class TicketAvailabilityType:
    """The answer of `ticketAvailability` (ADR-444)."""

    status: TicketAvailability
    replaced_by_uuid: UUID | None = strawberry.field(
        default=None,
        description=(
            "Set only when status is merged: the ticket the request now lives in, which ticket(uuid) gives"
        ),
    )


@strawberry.type(description="One move of a ticket's audit status")
class TicketAuditEntryType:
    """An entry of `TicketType.auditHistory`, built by `ticket_audit.audit_history`."""

    kind: str = strawberry.field(
        description=(
            "What moved it: 'verdict' (an auditor's), 'scan' (picked out for checking) or "
            "'content_change' (a change that voided the verdict)"
        )
    )
    status: str = strawberry.field(description="The audit status it moved to")
    note: str | None = strawberry.field(description="The auditor's note; set on a verdict only")
    at: datetime
    actor_uuid: str | None = strawberry.field(description="Who moved it; null for the scan")
    actor_name: str | None = None


# What `changesSinceAudit` withholds the values of, as the ticket's own resolvers do: the free
# text and the address behind ticket.view_detail, the triage answers behind ticket.view_pii.
_DETAIL_CHANGES = frozenset({("ticket", "description"), ("task", "task_description")})
_TRIAGE_CHANGES = frozenset({("ticket", "person_trapped_reported"), ("ticket", "immediate_danger_reported")})


@strawberry.type(description="One field that differs from the content the last verdict was given on")
class TicketAuditChangeType:
    """An entry of `TicketType.changesSinceAudit`, built by `ticket_audit.content_changes`."""

    entity: str = strawberry.field(
        description="'ticket', 'secondary_location', 'disaster_detail', 'task' or 'task_property'"
    )
    entity_uuid: str = strawberry.field(
        description="The row it is on; the ticket's own uuid for its address and disaster answers"
    )
    field: str = strawberry.field(description="Column name, or the disaster field's property name")
    audited_value: JSON | None = strawberry.field(description="Its value when audited; null if it is new")
    current_value: JSON | None = None


@strawberry.type
class PhotoType:
    """GraphQL type representing a photo attached to a station or ticket."""

    uuid: UUID
    ref_uuid: str = strawberry.field(description="UUID of the parent entity this photo is attached to")
    ref_type: str = strawberry.field(
        description=(
            "'geometry' (attached to a ticket or station) or 'pole' (attached to a secondary_location)"
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

    @strawberry.field(
        description=(
            "Display name of the assigned person. Null to a caller without "
            "ticket.view_history on the parent ticket, unless the assignment is their own"
        )
    )
    async def actor_name(self, info: strawberry.types.Info) -> str | None:
        """The assignee's nickname, to themselves and to those who may see who claimed the need (ADR-286)."""
        user = info.context["user"]
        if user is None or str(user.uuid) != str(self.actor_uuid):
            ticket_uuid = await info.context["loaders"]["ticket_uuid_by_task"].load(self.task_uuid)
            if ticket_uuid is None or not await ticket_history_visible(info, ticket_uuid):
                return None
        return await info.context["loaders"]["user_name_by_uuid"].load(self.actor_uuid)

    @strawberry.field(
        description=(
            "Whether unassignTaskActor would remove this person for the caller, so a page offers it "
            "only there: the caller holds ticket.assign over the assignment (`own` is the assignee "
            "themselves, `zone` the need's ticket in the caller's team zones), and recruiting on the "
            "need was not stopped by hand, after which nobody may give a place back"
        )
    )
    async def viewer_can_unassign(self, info: strawberry.types.Info) -> bool:
        """The checks unassign_task_actor makes (scope, then a stop by hand), without raising."""
        if await info.context["loaders"]["recruiting_stopped_by_task"].load(str(self.task_uuid)):
            return False
        ticket_uuid = await info.context["loaders"]["ticket_uuid_by_task"].load(self.task_uuid)
        if ticket_uuid is None:
            return False
        return await _decide_ticket_scope(
            info, Perm.TICKET_ASSIGN, str(ticket_uuid), SimpleNamespace(created_by=str(self.actor_uuid))
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
        default=None,
        description=(
            "Number of people or units needed. Null means unspecified and uncapped: a rescue need "
            "may leave it out, and needs filed before every other kind had to give one"
        ),
    )
    status: str = strawberry.field(
        default="pending",
        description=(
            "Lifecycle state: 'pending' (recruiting), 'fulfilled' (has everyone it asked for, or "
            "its requester stopped recruiting — the people on it still go), or 'canceled'. Moves "
            "only through assignTaskActor, unassignTaskActor, stopRecruiting and deletion"
        ),
    )
    source: str = strawberry.field(
        default="user",
        description=(
            "Origin of this task: 'user' when the site's identity made it, 'official' when a back-office "
            "one did. Tasks made before that rule keep what they had, 'gov' or 'import'"
        ),
    )
    recruiting_stopped_at: datetime | None = strawberry.field(
        default=None,
        description=(
            "When the requester stopped recruiting for this need by hand (stopRecruiting); null if "
            "they never did — a need that filled by itself is fulfilled with no such time. Once "
            "set, nobody on the need can give their place back"
        ),
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # Readable only through the gated resolvers below (ADR-281): the free text and the author
    # of a task are withheld exactly when its ticket's are. The name, type, quantity and
    # progress stay public — they are what a volunteer decides "can I help?" on (AC-03 is
    # about original free text, not structure).
    _task_description_raw: strawberry.Private[str | None] = None
    _progress_note_raw: strawberry.Private[str | None] = None
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
            "UUID of the user who created this task. Null to a caller without "
            "ticket.view_detail on the parent ticket"
        )
    )
    async def created_by(self, info: strawberry.types.Info) -> str | None:
        """Return the author's uuid, or null when the caller is out of detail scope."""
        return self._created_by_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description=(
            "Whether the caller holds ticket.assign over this need as assigning someone else to "
            "it is checked, so a page offers 指派承接 only where it would be allowed: `own` is "
            "the need's creator, `zone` its ticket in the caller's team zones. Room on the need "
            "is not part of it"
        )
    )
    async def viewer_can_assign(self, info: strawberry.types.Info) -> bool:
        """The check assign_task_actor makes for someone else (_task_scope_target), without raising."""
        return await _decide_ticket_scope(
            info, Perm.TICKET_ASSIGN, str(self.ticket_uuid), SimpleNamespace(created_by=self._created_by_raw)
        )

    @strawberry.field
    async def properties(self, info: strawberry.types.Info) -> list[TaskPropertyType]:
        """Resolve structured properties (skills, cargo type, etc.) for this task."""
        return await info.context["loaders"]["task_properties_by_task"].load(str(self.uuid))

    @strawberry.field(
        description=(
            "Everyone who claimed this task. Empty to a caller without ticket.view_history on the "
            "parent ticket — assignedCount stays public, and a caller's own claim is myAssignment"
        )
    )
    async def assignments(self, info: strawberry.types.Info) -> list[TaskAssignmentType]:
        """The accounts going: the requester's and the coordinators' to see, not the public's."""
        if not await ticket_history_visible(info, self.ticket_uuid):
            return []
        return await info.context["loaders"]["task_assignments_by_task"].load(str(self.uuid))

    @strawberry.field(description="The caller's own claim on this task. Null to a guest or a non-claimant")
    async def my_assignment(self, info: strawberry.types.Info) -> TaskAssignmentType | None:
        """What the site shows as 已承接, and the uuid 釋出名額 (unassignTaskActor) releases."""
        user = info.context["user"]
        if user is None:
            return None
        rows = await info.context["loaders"]["task_assignments_by_task"].load(str(self.uuid))
        return next((a for a in rows if str(a.actor_uuid) == str(user.uuid)), None)

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
            recruiting_stopped_at=m.recruiting_stopped_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
            _task_description_raw=m.task_description,
            _progress_note_raw=m.progress_note,
            _created_by_raw=m.created_by,
        )


@strawberry.input
class CreateTicketTaskInput:
    """Input for creating a new task under a support ticket."""

    ticket_uuid: UUID = strawberry.field(description="UUID of the ticket this task belongs to")
    task_type: str = strawberry.field(description="Category: 'rescue', 'supply', 'medical', or 'hr'")
    task_name: str
    task_description: str | None = None
    quantity: int | None = strawberry.field(
        default=None,
        description=(
            "People or units needed, at least 1; required except for a 'rescue' task, which may omit it"
        ),
    )
    source: str = strawberry.field(
        default="user",
        description="Not read: the identity making the task decides it",
        deprecation_reason="The backend sets `source` from the identity making the task; leave it out",
    )
    route_uuid: UUID | None = strawberry.field(
        default=None, description="Optional UUID of an associated route"
    )


@strawberry.input
class HelpRequestTaskInput:
    """One need on a help request filed from the public site."""

    task_type: NeedKind = strawberry.field(description="What the need asks for")
    task_name: str = strawberry.field(description="What is needed, at most 200 characters")
    task_description: str | None = None
    quantity: int | None = strawberry.field(
        default=None,
        description=(
            "People or units needed, at least 1; required except for a 'rescue' need, which may omit it"
        ),
    )
    acknowledged_duplicate_of: str | None = strawberry.field(
        default=None,
        description=(
            "Confirmed not a duplicate of this task (a relatedUuid from DuplicatesSuspected); "
            "not checked again"
        ),
    )


@strawberry.input
class CreateHelpRequestInput:
    """A citizen's request for help: the ticket and its first needs, filed together."""

    title: str = strawberry.field(description="At most 200 characters")
    description: str | None = None
    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Point for the location where help is needed — [longitude, latitude]"
    )
    contact_name: str = strawberry.field(description="Who to ask for at the place")
    contact_phone: str | None = strawberry.field(
        default=None, description="Phone number or LINE ID, as the person typed it"
    )
    contact_email: str | None = strawberry.field(
        default=None, description="Optional; the account's own email is never filled in for it"
    )
    secondary_location: SecondaryLocationInput | None = strawberry.field(
        default=None,
        description=(
            "The address line goes in `fullAddress` (with its `addressToken` if looked up), "
            "with `floor` and `room`"
        ),
    )
    tasks: list[HelpRequestTaskInput] = strawberry.field(description="At least one need, at most 20")
    photo_urls: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Scene photos as links to images kept elsewhere — the platform stores no image. "
            "At most 10, each an https:// URL of at most 500 characters"
        ),
    )


@strawberry.input
class UpdateTicketTaskInput:
    """Input for updating a ticket task's progress note — not its status."""

    progress_note: str | None = strawberry.field(
        default=strawberry.UNSET, description="Updated progress description — pass null to clear"
    )


@strawberry.input
class CreateTaskPropertyInput:
    """Input for adding a structured property to a ticket task."""

    task_uuid: UUID = strawberry.field(description="UUID of the task to attach this property to")
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
    audit_status: str = strawberry.field(
        default="no_audit",
        description=(
            "The data check: 'no_audit' (not checked as it now stands), 'need_audit' (picked out "
            "for checking), 'audited' (found right) or 'audit_issue' (found wrong). Public, so a "
            "list can leave out tickets with issues"
        ),
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
    updated_at: datetime | None = strawberry.field(
        default=None,
        description="When anything visible about this ticket last changed: a field, its address, disaster "
        "details, photos, a need or its items, its status, or a duplicate merge. A sign-up moves it only "
        "when it changes the status; a review verdict never does",
    )

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
    _pii_scope_task: strawberry.Private[object | None] = None
    _contact_visible_task: strawberry.Private[object | None] = None
    # Built by the `tickets` list: the triage answers then also need ticket.view_history (ADR-286
    # point 6). The contact fields need it, or a claim, wherever the ticket is read.
    _listed: strawberry.Private[bool] = False
    # Backing the ticket.view_detail resolvers (ADR-281). `_created_by_raw` also feeds both
    # scope checks — `own` is decided on it whether or not the caller may read it.
    _geometry_geojson: strawberry.Private[dict | None] = None
    _description_raw: strawberry.Private[str | None] = None
    _created_by_raw: strawberry.Private[str | None] = None
    # Backing the ticket.audit resolvers: the verdict's note, when and by whom.
    _audit_note_raw: strawberry.Private[str | None] = None
    _audited_at_raw: strawberry.Private[datetime | None] = None
    _audited_by_raw: strawberry.Private[str | None] = None
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
        coarse = await self._coarse(info)
        return coarse["point"] if coarse else None

    @strawberry.field(
        description=(
            "The H3 cell `geometry` stands in for, as its hex index (e.g. '884ba0a511fffff'), "
            "when the caller is shown the coarse location; null when `geometry` is the exact "
            "point. Tickets sharing a value share a location on the map — group by it, and "
            "draw the cell from it (h3-js `cellToBoundary`); its resolution is in the index"
        )
    )
    async def location_cell(self, info: strawberry.types.Info) -> str | None:
        """Tell the client which points are cell centres, and which cell (ADR-281/283).

        Without it a client cannot tell a centre from an exact point — both are a GeoJSON
        Point — and would have to guess from whether it is signed in, which breaks the day an
        admin narrows view_detail to `own` and one list carries both kinds.
        """
        if await self._detail_visible(info):
            return None
        coarse = await self._coarse(info)
        return coarse["cell"] if coarse else None

    def _coarse(self, info: strawberry.types.Info):
        """The `coarse_point` loader's `{point, cell}` for this ticket at its resolution."""
        return info.context["loaders"]["coarse_point"].load((str(self.uuid), self._coarse_resolution))

    @strawberry.field(
        description=(
            "The reporter's own account. Null to a caller without ticket.view_detail here — "
            "free text can name a door number the address field withholds"
        )
    )
    async def description(self, info: strawberry.types.Info) -> str | None:
        """Return the description, or null when the caller is out of detail scope (AC-03)."""
        return self._description_raw if await self._detail_visible(info) else None

    def _audit_visible(self, info: strawberry.types.Info):
        """This ticket's ticket.audit decision (see ticket_audit_visible)."""
        return ticket_audit_visible(info, str(self.uuid), self._scope_resource())

    @strawberry.field(
        description=(
            "The note given with the last verdict, kept after a change voids it, so the next "
            "auditor sees what was found; always set while 'audit_issue'. Null to a caller without "
            "ticket.audit here"
        )
    )
    async def audit_note(self, info: strawberry.types.Info) -> str | None:
        """Return the note, or null when the caller cannot audit this ticket."""
        return self._audit_note_raw if await self._audit_visible(info) else None

    @strawberry.field(
        description=(
            "When the last verdict was given, kept after a change voids it. Null if never audited, "
            "or to a caller without ticket.audit here"
        )
    )
    async def audited_at(self, info: strawberry.types.Info) -> datetime | None:
        """Return the time of the last verdict, or null when the caller cannot audit this ticket."""
        return self._audited_at_raw if await self._audit_visible(info) else None

    @strawberry.field(
        description="UUID of who gave the last verdict. Null if never audited, or without ticket.audit here"
    )
    async def audited_by(self, info: strawberry.types.Info) -> str | None:
        """Return the auditor's uuid, or null when the caller cannot audit this ticket."""
        return self._audited_by_raw if await self._audit_visible(info) else None

    @strawberry.field(
        description=(
            "Every move of the audit status, newest first: verdicts, the scan's flags, and changes "
            "that voided a verdict. Null to a caller without ticket.audit here. Read it on one "
            "ticket at a time: it queries the change log per ticket"
        )
    )
    async def audit_history(self, info: strawberry.types.Info) -> list[TicketAuditEntryType] | None:
        """Return the audit history, or null when the caller cannot audit this ticket."""
        if not await self._audit_visible(info):
            return None
        entries = await ticket_audit.audit_history(info.context["db"], str(self.uuid))
        return [TicketAuditEntryType(**entry) for entry in entries]

    @strawberry.field(
        description=(
            "What differs from the content the last verdict was given on, field by field. Null if "
            "never audited, or to a caller without ticket.audit here. A need taken off since does "
            "not appear: it does not void a verdict. A value the caller could not read on the ticket "
            "itself (address, free text, triage answers) comes back null, the change still listed. "
            "Read it on one ticket at a time"
        )
    )
    async def changes_since_audit(self, info: strawberry.types.Info) -> list[TicketAuditChangeType] | None:
        """Return the changes since the last verdict, or null when not audited or not visible."""
        if not await self._audit_visible(info):
            return None
        ticket = await info.context["loaders"]["ticket_by_uuid"].load(str(self.uuid))
        if ticket is None:
            return None
        changes = await ticket_audit.changes_since_audit(info.context["db"], ticket)
        if changes is None:
            return None
        detail = await self._detail_visible(info)
        triage = await self._triage_visible(info)

        def withheld(change: dict) -> bool:
            """Whether this ticket's own field would be null to the caller."""
            key = (change["entity"], change["field"])
            if change["entity"] == "secondary_location" or key in _DETAIL_CHANGES:
                return not detail
            return key in _TRIAGE_CHANGES and not triage

        return [
            TicketAuditChangeType(
                **({**change, "audited_value": None, "current_value": None} if withheld(change) else change)
            )
            for change in changes
        ]

    @strawberry.field(
        description=(
            "A fingerprint of the ticket's content as it now stands, to pass back to auditTicket so "
            "the verdict is refused if the ticket changes in between. Null to a caller without "
            "ticket.audit here. Read it on one ticket at a time"
        )
    )
    async def audit_content_hash(self, info: strawberry.types.Info) -> str | None:
        """Return the content fingerprint, or null when the caller cannot audit this ticket."""
        if not await self._audit_visible(info):
            return None
        ticket = await info.context["loaders"]["ticket_by_uuid"].load(str(self.uuid))
        if ticket is None:
            return None
        return ticket_audit.content_hash(await ticket_audit.content_of(info.context["db"], ticket))

    @strawberry.field(
        description=(
            "Whether 重複審核 still waits on this ticket, and on which other tickets (ADR-443). Null when "
            "it does not, and to a caller without ai_duplicate.view here. Not the data check: that is "
            "`auditStatus`"
        )
    )
    async def verification_status(self, info: strawberry.types.Info) -> TicketVerificationType | None:
        """Read the ticket's duplicate pair cards, or nothing when the caller cannot see them.

        The 重複審核 page's own capability: its reviewers already read both tickets in full there, so
        the far tickets' titles tell them nothing new. Decided before the lookup, so a page anyone
        else reads costs no query here.
        """
        if not await ticket_perm_held(info, Perm.AI_DUP_VIEW, str(self.uuid), self._scope_resource()):
            return None
        refs = await info.context["loaders"]["disputes_by_ticket"].load(str(self.uuid))
        if refs is None:
            return None
        return TicketVerificationType(
            state=TicketVerificationState.disputed,
            duplicate_of=[TicketDuplicateRefType(uuid=UUID(ref.uuid), title=ref.title) for ref in refs],
        )

    @strawberry.field(
        description=(
            "Other tickets this one may repeat, to anyone (ADR-447): the tickets verificationStatus "
            "names, each once, oldest card first; empty when there are none. Not whether a verdict "
            "was given on them"
        )
    )
    async def suspected_duplicate_of(self, info: strawberry.types.Info) -> list[TicketDuplicateRefType]:
        """Read the same cards as `verification_status`, and give only the tickets on their far side.

        Every one is neither cancelled nor deleted, so whoever reads this ticket can open it too.
        """
        refs = await info.context["loaders"]["disputes_by_ticket"].load(str(self.uuid))
        return [TicketDuplicateRefType(uuid=UUID(ref.uuid), title=ref.title) for ref in refs or []]

    @strawberry.field(
        description=(
            "UUID of the user who submitted this ticket. Null to a caller without ticket.view_detail here"
        )
    )
    async def created_by(self, info: strawberry.types.Info) -> str | None:
        """Return the reporter's uuid, or null when the caller is out of detail scope."""
        return self._created_by_raw if await self._detail_visible(info) else None

    @strawberry.field(
        description="Whether the caller holds ticket.edit over this ticket, so a page offers "
        "edit controls only where the edit would be allowed"
    )
    async def viewer_can_edit(self, info: strawberry.types.Info) -> bool:
        """Resolve ticket.edit against this ticket's scope, as the edit itself would."""
        return await ticket_perm_held(info, Perm.TICKET_EDIT, str(self.uuid), self._scope_resource())

    @strawberry.field(
        description="Whether the caller holds ticket.delete over this ticket, so a page offers "
        "a delete control only where the delete would be allowed"
    )
    async def viewer_can_delete(self, info: strawberry.types.Info) -> bool:
        """Resolve ticket.delete against this ticket's scope, as the delete itself would."""
        return await ticket_perm_held(info, Perm.TICKET_DELETE, str(self.uuid), self._scope_resource())

    @strawberry.field(
        description="Whether the caller holds ticket.view_history over this ticket, so a page "
        "offers the timeline only where reading it would be allowed"
    )
    async def viewer_can_view_history(self, info: strawberry.types.Info) -> bool:
        """The same memoized check the timeline and the claimant list are withheld by."""
        return await ticket_history_visible(info, str(self.uuid), self._scope_resource())

    def _scope_resource(self) -> SimpleNamespace:
        """What `own` and `zone` are decided on: who filed the ticket, and where it is."""
        return SimpleNamespace(created_by=self._created_by_raw, geometry=self._geometry_raw)

    def _pii_in_scope(self, info: strawberry.types.Info):
        """Memoized ticket.view_pii check shared by the contact_* and triage-flag resolvers.

        Cached as a single asyncio Task on this instance so that when GraphQL resolves
        contact_name/email/phone concurrently on the SAME TicketType, resolve_scope and the
        check behind it (for `zone`, ticket_in_team_zones) run once per ticket instead of
        three times. The check-then-create below is synchronous, so it is atomic under the
        event loop — no double-scheduling. Lifetime = this instance = one
        request; there is no cross-request cache, so the staleness window is identical to
        the per-request _rbac_cache it sits alongside.
        """
        if self._pii_scope_task is None:
            self._pii_scope_task = asyncio.ensure_future(self._compute_pii_in_scope(info))
        return self._pii_scope_task

    async def _compute_pii_in_scope(self, info: strawberry.types.Info) -> bool:
        """Compute ticket.view_pii directly via resolve_scope + in_scope (ADR-049).

        Neither raises — a denial renders as a *masked* contact field, not a GraphQL
        field-level error. Per-role scope: guest → not visible (no capability); own → own
        ticket; zone → ticket's location inside my team's TeamZone; all → everything.
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
        if scope == Scope.ZONE:
            return await ticket_in_team_zones(info, str(self.uuid))
        return await in_scope(scope, actor=user, resource=self._scope_resource(), db=info.context["db"])

    async def _triage_visible(self, info: strawberry.types.Info) -> bool:
        """ticket.view_pii, and in the `tickets` list ticket.view_history too (ADR-286 point 6).

        Not held back until a claim, as the contact is: a volunteer decides whether to go on them.
        """
        if not await self._pii_in_scope(info):
            return False
        if self._listed:
            return await ticket_history_visible(info, str(self.uuid), self._scope_resource())
        return True

    def _contact_visible(self, info: strawberry.types.Info):
        """Memoized: may the caller read whom to call in full? See _compute_contact_visible."""
        if self._contact_visible_task is None:
            self._contact_visible_task = asyncio.ensure_future(self._compute_contact_visible(info))
        return self._contact_visible_task

    async def _compute_contact_visible(self, info: strawberry.types.Info) -> bool:
        """ticket.view_pii, then ticket.view_history on the ticket or a claim on one of its needs.

        ticket.view_history is the requester and the coordinators; a claim is the volunteer on the
        way (ADR-286 point 1). The same on the ticket a volunteer opens as in the `tickets` list,
        so neither a page of `ticket` aliases nor a request per uuid off the list reads past it.
        """
        if not await self._pii_in_scope(info):
            return False
        if await ticket_history_visible(info, str(self.uuid), self._scope_resource()):
            return True
        key = (str(info.context["user"].uuid), str(self.uuid))
        return await info.context["loaders"]["ticket_claimed_by"].load(key)

    @strawberry.field(
        description=(
            "Requester full name — masked unless the caller holds ticket.view_pii here and either "
            "ticket.view_history on the ticket or a claim on one of its needs"
        )
    )
    async def contact_name(self, info: strawberry.types.Info) -> str | None:
        """Return the contact name raw if visible, otherwise masked (王◯◯ / John S.)."""
        if await self._contact_visible(info):
            return self._contact_name_raw
        return mask_name(self._contact_name_raw)

    @strawberry.field(
        description=(
            "Follow-up email — masked unless the caller holds ticket.view_pii here and either "
            "ticket.view_history on the ticket or a claim on one of its needs"
        )
    )
    async def contact_email(self, info: strawberry.types.Info) -> str | None:
        """Return the contact email raw if visible, otherwise masked (j***@***.com)."""
        if await self._contact_visible(info):
            return self._contact_email_raw
        return mask_email(self._contact_email_raw)

    @strawberry.field(
        description=(
            "Follow-up phone — masked unless the caller holds ticket.view_pii here and either "
            "ticket.view_history on the ticket or a claim on one of its needs"
        )
    )
    async def contact_phone(self, info: strawberry.types.Info) -> str | None:
        """Return the contact phone raw if visible, otherwise masked (09*****678)."""
        if await self._contact_visible(info):
            return self._contact_phone_raw
        return mask_phone(self._contact_phone_raw)

    @strawberry.field(
        description=(
            "Reporter's answer to 災民受困／無法自行離開: 'yes', 'no', 'unknown'. Null when nobody "
            "was asked — and also null to a caller without ticket.view_pii here (in the `tickets` "
            "list, ticket.view_history too). What the person said, not a professional assessment"
        )
    )
    async def person_trapped_reported(self, info: strawberry.types.Info) -> str | None:
        """Return the reporter's answer, or null when the caller is out of PII scope.

        A tri-state has no shape to mask, so denial is null. An out-of-scope caller therefore
        cannot tell "nobody asked" from "you may not see it" — accepted, since that
        distinction only matters to someone who can act on the answer, who holds the
        capability anyway.
        """
        return self._person_trapped_reported_raw if await self._triage_visible(info) else None

    @strawberry.field(
        description=(
            "Reporter's answer to 立即生命危險: 'yes', 'no', 'unknown'. Null when nobody was "
            "asked — and also null to a caller without ticket.view_pii here (in the `tickets` "
            "list, ticket.view_history too). Not a triage grade and not a risk classification"
        )
    )
    async def immediate_danger_reported(self, info: strawberry.types.Info) -> str | None:
        """Return the reporter's danger answer, or null when the caller is out of PII scope."""
        return self._immediate_danger_reported_raw if await self._triage_visible(info) else None

    @strawberry.field(
        description=("Photos attached to this ticket. Empty to a caller without ticket.view_detail here")
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
    async def secondary_location(self, info: strawberry.types.Info) -> SecondaryLocationType | None:
        """Resolve the ticket's address, or null when the caller is out of detail scope.

        Gated where the station's identical field is not (ADR-268): a shelter's address is
        already on the public map, while a ticket's is the reporter's own home. Gated on
        ticket.view_detail, beside the exact point, rather than ADR-268's ticket.view_pii
        (ADR-281): the address and the point name the same house, and the team's rule is
        that signing in shows it — `view_pii` was `own` for a plain account then (ADR-286
        opened it later), which left a signed-in volunteer the pin but not the door.
        """
        if not await self._detail_visible(info):
            return None
        return await info.context["loaders"]["secondary_location_by_geometry"].load(str(self.uuid))

    @strawberry.field(
        description=(
            "The building map this ticket was filed under (createTicket's buildingMapUuid). Null when "
            "it was not filed under one, when that building map is deleted, and to a caller without "
            "ticket.view_detail here"
        )
    )
    async def building_map_uuid(self, info: strawberry.types.Info) -> UUID | None:
        """Return the ticket's building, or null when out of detail scope: naming it names the place.

        The ticket was given the building's point (place_ticket), so knowing the building is
        knowing the exact point `geometry` withholds. Decided before the lookup, as the address
        is, so a page of tickets a guest reads costs no query here.
        """
        if not await self._detail_visible(info):
            return None
        return await info.context["loaders"]["building_map_by_ticket"].load(str(self.uuid))

    @strawberry.field(
        description=(
            "The teams of the 責任區 this ticket lies in, by name, each once (ADR-422). Empty when it "
            "lies in none, and to a caller without ticket.view_detail here"
        )
    )
    async def responsible_teams(self, info: strawberry.types.Info) -> list[AssignedTeamType]:
        """Return who answers for the place this ticket is at, or none when out of detail scope.

        Worked out from the exact point, so where a zone's edge crosses the cell a guest is shown,
        it tells which side the ticket is on: more than the cell (ADR-281). Decided before the
        lookup, as the address is, so a page of tickets a guest reads costs no query here.
        """
        if not await self._detail_visible(info):
            return []
        return await info.context["loaders"]["responsible_teams_by_ticket"].load(str(self.uuid))

    @strawberry.field
    async def disaster_details(self, info: strawberry.types.Info) -> list["TicketDisasterDetailType"]:
        """Resolve this ticket's disaster-specific field values.

        A `multi_select` field arrives as several rows sharing one `propertyName`; the caller
        groups them. Pair with `ticketPropertyConfigs(disasterTypes: <this ticket's>)` to get
        the labels, units and hints these bare keys and values belong to.
        """
        return await info.context["loaders"]["disaster_details_by_ticket"].load(str(self.uuid))

    @classmethod
    def from_model(
        cls, m, *, coarse_resolution: int = COARSE_MAX_H3_RESOLUTION, listed: bool = False
    ) -> "TicketType":
        """Build from a SQLAlchemy model instance.

        `coarse_resolution` is how coarse `geometry` is for a caller without detail — the
        read queries pass their `zoom`-derived value; everything else gets the cap. `listed`
        marks a row of the `tickets` list, whose triage answers take ticket.view_history too.
        """
        return cls(
            uuid=m.uuid,
            property_name=m.property_name,
            title=m.title,
            status=m.status,
            priority=m.priority,
            task_type=m.task_type,
            audit_status=m.audit_status,
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
            _created_by_raw=m.created_by,
            _audit_note_raw=m.audit_note,
            _audited_at_raw=m.audited_at,
            _audited_by_raw=str(m.audited_by) if m.audited_by else None,
            _coarse_resolution=coarse_resolution,
            _listed=listed,
        )


@strawberry.type(description="One of the caller's claims, with the need and the ticket it is for")
class MyTaskAssignmentType:
    """A row of 「我的任務 › 我承接的」: what I claimed, which need, and where to go."""

    assignment: TaskAssignmentType
    task: TicketTaskType
    ticket: TicketType


@strawberry.type
class TicketCreated:
    """`createTicket` or `createHelpRequest` created the ticket and all its tasks, in the order sent."""

    ticket: TicketType
    tasks: list[TicketTaskType]


@strawberry.type
class TicketTaskCreated:
    """`createTicketTask` added the task."""

    task: TicketTaskType


CreateTicketResult = Annotated[TicketCreated | DuplicatesSuspected, strawberry.union("CreateTicketResult")]
CreateTicketTaskResult = Annotated[
    TicketTaskCreated | DuplicatesSuspected, strawberry.union("CreateTicketTaskResult")
]


@strawberry.type
class TicketStatsType:
    """Counts over the tickets the caller may list, for the board's stats strip."""

    total: int
    pending: int
    in_progress: int
    completed: int
    cancelled: int
    gap_people: int = strawberry.field(
        description="People still short across open needs with a quantity: quantity less the "
        "people linked, never below 0. Needs on completed or cancelled tickets add nothing"
    )
    gap_needs: int = strawberry.field(description="How many open needs are short of people (gapPeople > 0)")


@strawberry.type(description="How many tickets match a `tickets` filter, and the box their map points span")
class TicketsExtentType:
    """`ticketsExtent`: what a map needs to frame every matching ticket without loading them."""

    count: int = strawberry.field(description="The `tickets` totalCount for the same filters")
    min_lat: float | None = strawberry.field(
        description="Southern edge of the box around the points shown; null when none match"
    )
    max_lat: float | None = strawberry.field(description="Northern edge; null when none match")
    min_lng: float | None = strawberry.field(description="Western edge; null when none match")
    max_lng: float | None = strawberry.field(description="Eastern edge; null when none match")


@strawberry.type
class TicketConnection:
    """Paginated list of tickets with page metadata."""

    items: list[TicketType]
    page_info: PageInfo


@strawberry.type(description="How many tickets one H3 cell holds, of those its caller is shown as the cell")
class TicketCellType:
    """A row of `ticketCells`: one cell on the guest map and the number to write in it (ADR-387)."""

    cell: str = strawberry.field(
        description="H3 index (hex), the same value TicketType.locationCell carries for these tickets"
    )
    ticket_count: int
    urgent_count: int = strawberry.field(
        description=(
            "Of those, how many are urgent: a priority other than 'low' or 'medium' (trimmed, any case), "
            "and not 'in_progress' — the rule the site colours a ticket urgent by"
        )
    )


@strawberry.input
class CreateTicketTaskDraft:
    """A task sent with a new ticket."""

    task_type: str = strawberry.field(description="Category: 'rescue', 'supply', 'medical', or 'hr'")
    task_name: str
    task_description: str | None = None
    quantity: int | None = strawberry.field(default=None, description="Number of people or units needed")
    source: str = strawberry.field(
        default="user",
        description="Not read: the identity making the task decides it",
        deprecation_reason="The backend sets `source` from the identity making the task; leave it out",
    )
    route_uuid: UUID | None = None
    acknowledged_duplicate_of: str | None = strawberry.field(
        default=None,
        description=(
            "Confirmed not a duplicate of this task (a relatedUuid from DuplicatesSuspected); "
            "not checked again"
        ),
    )


@strawberry.input
class CreateTicketInput:
    """Input for creating a new support ticket."""

    title: str
    description: str | None = None
    geometry: GeoJSON | None = strawberry.field(
        default=None,
        description=(
            "GeoJSON Point for the location where help is needed — [longitude, latitude]. "
            "Required unless buildingMapUuid is given, in which case it must be omitted"
        ),
    )
    building_map_uuid: UUID | None = strawberry.field(
        default=None,
        description=(
            "File the ticket inside this building map. Its point and address are copied onto "
            "the ticket, and secondaryLocation.floor (and room, on a floor with areas) must "
            "match the building's floors. Omit floor when the reporter doesn't know it"
        ),
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
    photo_urls: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Scene photos as https links to images kept elsewhere, at most 10, stored in the "
            "order given. Any bad link refuses the whole ticket"
        ),
    )
    tasks: list[CreateTicketTaskDraft] = strawberry.field(
        default_factory=list,
        description=(
            "The ticket's tasks, created with it in one go (Spec 022 §5.1). Each is checked for duplicates"
        ),
    )


@strawberry.input
class UpdateTicketInput:
    """Input for updating a ticket's priority, content, or address.

    There is no `status`: a ticket's status is worked out from its needs. Nor the audit fields:
    only `auditTicket` gives a verdict.
    """

    priority: str | None = strawberry.field(
        default=None, description="Updated urgency: 'low', 'medium', 'high', or 'critical'"
    )
    title: str | None = None
    description: str | None = strawberry.UNSET
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
            "One selected value. Numbers arrive as strings — the config's dataType says how to read it"
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
