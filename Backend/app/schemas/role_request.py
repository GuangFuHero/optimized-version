"""Pydantic schemas for reviewing role requests in the back office (Spec/019)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

RoleRequestStatus = Literal["pending", "approved", "rejected", "withdrawn"]


class RoleRequestResponse(BaseModel):
    """One application, as its reviewer sees it."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    requested_role: Literal["government", "ngo", "data_auditor"]
    reason: str
    contact: str | None
    status: RoleRequestStatus
    review_note: str | None
    reviewed_by: UUID | None
    created_at: datetime
    closed_at: datetime | None


class RoleRequestReviewItem(RoleRequestResponse):
    """One row of the review list: the application and who sent it."""

    applicant_uuid: UUID
    applicant_name: str


class RoleRequestDecision(BaseModel):
    """A reviewer's decision. The note is checked by the service (at most 500 characters)."""

    note: str | None = None
