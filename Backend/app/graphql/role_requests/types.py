"""GraphQL types for role requests: a citizen applying to become back-office staff (Spec/019)."""

import enum
from datetime import datetime
from uuid import UUID

import strawberry


@strawberry.enum
class RoleRequestRole(enum.Enum):
    """What an applicant may ask to become. Super admin is not on the list (2026-09-11)."""

    government = "government"
    ngo = "ngo"
    data_auditor = "data_auditor"


@strawberry.enum
class RoleRequestStatus(enum.Enum):
    """Where an application stands."""

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    withdrawn = "withdrawn"


@strawberry.type
class RoleRequestType:
    """One application. Only its applicant and holders of role_request.review ever see it."""

    uuid: UUID
    requested_role: RoleRequestRole
    reason: str
    contact: str | None
    status: RoleRequestStatus
    review_note: str | None = strawberry.field(description="The reviewer's reply, if any")
    created_at: datetime
    closed_at: datetime | None = strawberry.field(description="When it was approved, rejected or withdrawn")

    @classmethod
    def from_model(cls, m) -> "RoleRequestType":
        """Build from a RoleRequest row."""
        return cls(
            uuid=m.uuid,
            requested_role=RoleRequestRole(m.requested_role),
            reason=m.reason,
            contact=m.contact,
            status=RoleRequestStatus(m.status),
            review_note=m.review_note,
            created_at=m.created_at,
            closed_at=m.closed_at,
        )


@strawberry.type
class MyRoleRequestsType:
    """What the 申請成為後台人員 entry and its drawer need, in one round trip."""

    has_backoffice_identity: bool = strawberry.field(
        description="Holds a role beyond `user`: the entry offers 前往後台 instead of applying"
    )
    can_apply: bool = strawberry.field(
        description="May send an application now: no back-office identity, none pending, not paused"
    )
    requests: list[RoleRequestType] = strawberry.field(description="Newest first")


@strawberry.input
class SubmitRoleRequestInput:
    """An application as the drawer sends it."""

    requested_role: RoleRequestRole
    reason: str
    contact: str | None = None
