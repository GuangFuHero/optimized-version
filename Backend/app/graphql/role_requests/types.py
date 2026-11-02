"""GraphQL types for role requests: a citizen applying to become back-office staff (Spec/019)."""

import enum
from datetime import datetime
from uuid import UUID

import strawberry
from sqlalchemy import select

from app.graphql.masking import mask_phone
from app.models.team import Team


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


@strawberry.enum
class RoleRequestTeamType(enum.Enum):
    """A team's type as the form names it: 政府單位人員 picks GOV, 社福團體人員 picks NGO."""

    GOV = "gov"
    NGO = "ngo"


@strawberry.type
class RoleRequestTeam:
    """One entry of the team picker. Nothing else about a team is shown here (ADR-357 point 5)."""

    uuid: UUID
    name: str
    type: RoleRequestTeamType


async def _team_by_uuid(info: strawberry.types.Info, team_uuid: UUID | None) -> RoleRequestTeam | None:
    """The team-picker entry for `team_uuid`, whatever the team's status now; None for None."""
    if team_uuid is None:
        return None
    team = (await info.context["db"].execute(select(Team).where(Team.uuid == team_uuid))).scalar_one()
    return RoleRequestTeam(uuid=team.uuid, name=team.name, type=RoleRequestTeamType(team.type))


@strawberry.type
class RoleRequestType:
    """One application. Only its applicant and those who may decide it ever see it."""

    uuid: UUID
    requested_role: RoleRequestRole
    reason: str
    contact: str | None = strawberry.field(description="Spec 019 only; no longer sent (ADR-355)")
    status: RoleRequestStatus
    review_note: str | None = strawberry.field(description="The reviewer's reply, if any")
    created_at: datetime
    closed_at: datetime | None = strawberry.field(description="When it was approved, rejected or withdrawn")
    new_team_name: str | None = strawberry.field(description="The team a new-team application founds")
    via_invite: bool = strawberry.field(description="Sent through a team's invite link")
    applicant_name: str | None
    applicant_phone: str | None = strawberry.field(description="Masked")
    applicant_email: str | None
    team_uuid: strawberry.Private[UUID | None]
    granted_team_uuid: strawberry.Private[UUID | None]

    @strawberry.field(description="The existing team a member request asks to join")
    async def team(self, info: strawberry.types.Info) -> RoleRequestTeam | None:
        """Read by uuid whatever the team's status now, so a closed request still names it."""
        return await _team_by_uuid(info, self.team_uuid)

    @strawberry.field(
        description="The team approval handed out: the one joined, or the one a new-team application founded"
    )
    async def granted_team(self, info: strawberry.types.Info) -> RoleRequestTeam | None:
        """None until approved, and for a data auditor (ADR-418, as `granted_team_uuid` in ADR-411)."""
        return await _team_by_uuid(info, self.granted_team_uuid)

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
            new_team_name=m.new_team_name,
            via_invite=m.invite_uuid is not None,
            applicant_name=m.applicant_name,
            applicant_phone=mask_phone(m.applicant_phone),
            applicant_email=m.applicant_email,
            team_uuid=m.team_uuid,
            granted_team_uuid=m.granted_team_uuid,
        )


@strawberry.type
class MyRoleRequestsType:
    """What the 申請成為後台人員 entry and its drawer need, in one round trip."""

    has_backoffice_identity: bool = strawberry.field(
        description="Holds a role beyond `user`: the entry offers 前往後台 instead of applying"
    )
    can_apply: bool = strawberry.field(
        description="May send an application now: none pending and not paused. A back-office identity "
        "rules out only the data auditor choice (ADR-351)"
    )
    requests: list[RoleRequestType] = strawberry.field(description="Newest first")


@strawberry.input
class SubmitRoleRequestInput:
    """An application as the form sends it (Spec 026).

    政府單位人員 / 社福團體人員 name `team_uuid` or `new_team_name`; 資料檢核員 names neither. The phone
    is not sent: it is the account's verified phone (ADR-355).
    """

    requested_role: RoleRequestRole
    reason: str
    name: str
    email: str | None = None
    team_uuid: UUID | None = None
    new_team_name: str | None = None
