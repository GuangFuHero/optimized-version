"""Pydantic schemas for the AI 重複審核 queue in the back office (Spec 025 §2)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

# Mirrors of the CHECK domains in app/models/dedup.py, so the OpenAPI document lists them.
PairStatus = Literal["dup_ignored", "suggested", "confirmed", "rejected"]
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


class TicketForReviewResponse(BaseModel):
    """A whole live ticket as the reviewer compares it (Spec 028 §2, ADR-372).

    Send `version` back unchanged when resolving: it says what the reviewer saw (ADR-373).
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


class TicketsForReviewResponse(BaseModel):
    """The ticket on each side of the card; null where that ticket is cancelled or deleted."""

    low: TicketForReviewResponse | None
    high: TicketForReviewResponse | None


class DuplicatePairDetail(DuplicatePairResponse):
    """One card with every event recorded on it, oldest first, and its two whole tickets.

    `tickets` is null for a station card, which is not resolved (Spec 028, ADR-376).
    """

    events: list[DedupEventResponse]
    tickets: TicketsForReviewResponse | None


class DuplicatePairDecision(BaseModel):
    """A reviewer's verdict. The optional note is checked by the service (at most 1000 characters)."""

    note: str | None = None
