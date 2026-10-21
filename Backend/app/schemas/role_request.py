"""Pydantic schemas for reviewing role requests in the back office (Spec/019)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

RoleRequestStatus = Literal["pending", "approved", "rejected", "withdrawn"]
RoleRequestKind = Literal["member", "new_team", "data_auditor"]


class ApplicantDetails(BaseModel):
    """What the applicant sent (Spec 026, ADR-355), for the reviewer to call and confirm.

    Separate from `applicant_name`, which is the account's nickname.
    """

    name: str
    phone: str | None
    email: str | None


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
    team_uuid: UUID | None = None
    new_team_name: str | None = None
    via_invite: bool = False
    applicant_details: ApplicantDetails | None = None

    @classmethod
    def from_request(cls, request) -> "RoleRequestResponse":
        """Build from a RoleRequest row; rows from before Spec 026 have no details."""
        details = None
        if request.applicant_name is not None:
            details = ApplicantDetails(
                name=request.applicant_name, phone=request.applicant_phone, email=request.applicant_email
            )
        return cls.model_validate(request).model_copy(
            update={"via_invite": request.invite_uuid is not None, "applicant_details": details}
        )


class RoleRequestReviewItem(RoleRequestResponse):
    """One row of the review list: the application and who sent it."""

    applicant_uuid: UUID
    applicant_name: str
    team_name: str | None = None


class RoleRequestDecision(BaseModel):
    """A reviewer's decision. The note is checked by the service (at most 500 characters).

    Rejecting requires one (Spec 026): it is the reason the applicant reads.
    """

    note: str | None = None
