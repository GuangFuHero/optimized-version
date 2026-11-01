"""Pydantic schemas for the 重複審核 queue in the back office (Spec 025 §2)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Mirrors of the CHECK domains in app/models/dedup.py, so the OpenAPI document lists them.
PairStatus = Literal["dup_ignored", "suggested", "confirmed_duplicate", "not_duplicate"]
EntityKind = Literal["ticket", "station", "ticket_task"]
SourceLayer = Literal["fast", "slow", "manual", "system"]
PairSort = Literal["created_at", "-created_at", "similarity", "-similarity"]


class EntitySummaryResponse(BaseModel):
    """One side of a card: the fields a reviewer compares (ADR-340). A deleted side has only its uuid."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    deleted: bool
    title: str | None
    type: str | None
    status: str | None
    ticket_uuid: UUID | None
    ticket_title: str | None
    longitude: float | None
    latitude: float | None
    created_by: UUID | None
    created_at: datetime | None


class DuplicatePairResponse(BaseModel):
    """One card and both of its sides. `evidence` is the engine's, opaque and unchanged."""

    uuid: UUID
    entity_kind: EntityKind
    status: PairStatus
    similarity: float | None
    evidence: dict | None
    method: str
    engine_version: str | None
    source_layer: SourceLayer
    duplicate_group_uuid: UUID | None
    hint_outcome: str | None
    created_at: datetime
    reviewed_by: UUID | None
    reviewed_by_name: str | None = Field(description="The nickname of `reviewed_by` (ADR-441)")
    reviewed_at: datetime | None
    low: EntitySummaryResponse
    high: EntitySummaryResponse


class DuplicatePairPage(BaseModel):
    """One page of cards and how many match in all."""

    items: list[DuplicatePairResponse]
    total: int


class DedupEventResponse(BaseModel):
    """One event recorded on a card."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    event_type: str
    actor_uuid: UUID | None
    actor_name: str | None = Field(default=None, description="The nickname of `actor_uuid` (ADR-441)")
    source_layer: SourceLayer
    decision_reason: str | None
    engine_version: str | None
    before_state: dict | None
    after_state: dict | None
    created_at: datetime


class PropertyForReviewResponse(BaseModel):
    """One live item under a need (Spec 028 §2)."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    property_name: str
    property_value: str
    quantity: int | None
    status: str | None
    comment: str | None
    display_label: str = Field(
        description="How the item reads: the label set for its need type, else property_name (ADR-446)"
    )
    sort_order: int | None = Field(
        default=None,
        description="The item's order among its need type's items, from the same field setting, inactive "
        "ones included; null when there is none (ADR-447)",
    )
    data_type: str | None = Field(
        default=None,
        description="The control the item's field setting asks for (number, text, single_select, ...); "
        "null when there is none (ADR-447)",
    )
    enum_options: list[str] | None = Field(
        default=None, description="The choices of a select field; null otherwise (ADR-447)"
    )
    unit: str | None = Field(
        default=None, description="A number field's unit, e.g. 箱; null otherwise (ADR-447)"
    )
    is_active: bool | None = Field(
        default=None,
        description="Whether the item's field setting is still in use; null when there is none (ADR-447)",
    )


class TaskForReviewResponse(BaseModel):
    """One live need with its headcount and items (Spec 028 §2)."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    task_type: str
    task_name: str
    task_description: str | None
    quantity: int | None
    status: str
    claim_count: int
    recruiting_stopped: bool
    properties: list[PropertyForReviewResponse]
    claimant_keys: list[str] = Field(
        description=(
            "One opaque key per person on the need (ADR-445). A person on needs of both tickets has the "
            "same key on each, so the people after a fold are the distinct keys of the needs folded "
            "together; keys differ on every other card and do not name the person"
        )
    )


class PhotoForReviewResponse(BaseModel):
    """One live photo on a ticket (Spec 028, ADR-384)."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    url: str
    created_at: datetime | None


class LocationForReviewResponse(BaseModel):
    """Where a ticket is: the address down to the room, or the pole (ADR-440). Read-only here."""

    model_config = ConfigDict(from_attributes=True)

    location_type: str = Field(description="'address' or 'pole'")
    full_address: str | None
    building_section: str | None
    floor: str | None
    room: str | None
    pole_id: str | None


class TicketForReviewResponse(BaseModel):
    """A whole live ticket as the reviewer compares it (Spec 028 §2, ADR-373).

    Send `version` back unchanged when resolving: it says what the reviewer saw (ADR-374).
    """

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    version: str
    title: str
    description: str | None
    priority: str
    task_type: str | None
    disaster_types: list[str]
    person_trapped_reported: str | None
    immediate_danger_reported: str | None
    contact_name: str
    contact_phone: str | None
    contact_email: str | None
    longitude: float | None
    latitude: float | None
    status: str
    audit_status: str
    created_by: UUID | None
    created_at: datetime | None
    tasks: list[TaskForReviewResponse]
    photos: list[PhotoForReviewResponse]
    disaster_details: dict[str, list[str]]
    location: LocationForReviewResponse | None = Field(
        description="Where the ticket is; null when it has no address or pole. A resolve cannot change it"
    )


class TicketsForReviewResponse(BaseModel):
    """The ticket on each side of the card; null where that ticket is cancelled or deleted."""

    low: TicketForReviewResponse | None
    high: TicketForReviewResponse | None


class DuplicatePairDetail(DuplicatePairResponse):
    """One card with every event recorded on it, oldest first, and its two whole tickets.

    `tickets` is null for a station card, which is not resolved (Spec 028, ADR-377).
    """

    events: list[DedupEventResponse]
    tickets: TicketsForReviewResponse | None


class DuplicatePairDecision(BaseModel):
    """A reviewer's verdict. The optional note is checked by the service (at most 1000 characters)."""

    note: str | None = None


# --- resolve (Spec 028 §3) ----------------------------------------------------------------
# Only the fields a request sets are changes: a field left out stays as it is, and a field sent
# as null clears it where the column allows. The service reads `model_fields_set` for that.

TriageAnswer = Literal["yes", "no", "unknown"]


class _Strict(BaseModel):
    """Unknown fields are refused, so a typo is a 422 rather than a change silently not made."""

    model_config = ConfigDict(extra="forbid")


class ResolveTicketValues(_Strict):
    """The primary ticket's fields to set (Spec 028 §3.2)."""

    title: str | None = None
    description: str | None = None
    priority: str | None = None
    task_type: str | None = None
    disaster_types: list[str] | None = None
    person_trapped_reported: TriageAnswer | None = None
    immediate_danger_reported: TriageAnswer | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None


class ResolveTaskValues(_Strict):
    """A kept or moved need's fields to set."""

    task_name: str | None = None
    task_description: str | None = None
    quantity: int | None = None


class ResolvePropertyValues(_Strict):
    """A kept item's fields to set."""

    property_value: str | None = None
    quantity: int | None = None
    comment: str | None = None


class ResolveProperty(_Strict):
    """One item of a kept or moved need, or of a need it absorbs (ADR-380)."""

    property: UUID
    action: Literal["keep", "cancel"]
    values: ResolvePropertyValues | None = None


class ResolvePrimaryTask(_Strict):
    """One need of the primary ticket: kept (absorbing needs of the other ticket) or cancelled."""

    task: UUID
    action: Literal["keep", "cancel"]
    absorb: list[UUID] = Field(default_factory=list)
    values: ResolveTaskValues | None = None
    properties: list[ResolveProperty] | None = None


class ResolveSecondaryTask(_Strict):
    """One need of the other ticket not absorbed: moved to the primary ticket or cancelled."""

    task: UUID
    action: Literal["move", "cancel"]
    values: ResolveTaskValues | None = None
    properties: list[ResolveProperty] | None = None


class ResolvePhoto(_Strict):
    """One photo of either ticket: kept on the primary, or cancelled (ADR-384).

    A kept photo of the other ticket moves over to the primary.
    """

    photo: UUID
    action: Literal["keep", "cancel"]


class ResolveVersions(_Strict):
    """The `version` of each side's ticket as the reviewer read it (ADR-374)."""

    low: str
    high: str


class ResolveRequest(_Strict):
    """Resolve a card: keep `primary`, cancel the other ticket, say what happens to every need."""

    primary: Literal["low", "high"]
    expected_versions: ResolveVersions
    ticket: ResolveTicketValues | None = None
    primary_tasks: list[ResolvePrimaryTask]
    secondary_tasks: list[ResolveSecondaryTask] = Field(default_factory=list)
    photos: list[ResolvePhoto] | None = None
    disaster_details: dict[str, list[str]] | None = None
    note: str | None = None
