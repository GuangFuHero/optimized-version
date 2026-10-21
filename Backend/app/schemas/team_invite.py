"""Pydantic schemas for team invite links (Spec/026, ADR-353)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class InviteResponse(BaseModel):
    """An issued link. The token is what the link and the QR code carry."""

    token: str
    team_uuid: UUID
    created_at: datetime
    expires_at: datetime


class InviteTeam(BaseModel):
    """The team a link joins, as the invite page names it."""

    uuid: UUID
    name: str
    type: Literal["gov", "ngo"]


class InviteRequestRef(BaseModel):
    """The visitor's pending request for the team, if they already sent one."""

    uuid: UUID
    created_at: datetime


class PendingElsewhere(BaseModel):
    """The visitor's pending request for something else, to withdraw before asking here."""

    uuid: UUID
    requested_role: Literal["government", "ngo", "data_auditor"]
    team_name: str | None
    new_team_name: str | None
    created_at: datetime


class OpenedInviteResponse(BaseModel):
    """What the invite page shows before the visitor asks to join."""

    team: InviteTeam
    expires_at: datetime
    my_request: InviteRequestRef | None
    pending_elsewhere: PendingElsewhere | None = None


class InviteJoinRequest(BaseModel):
    """The visitor's details. The phone is the account's verified one (ADR-355)."""

    name: str
    reason: str
    email: str | None = None


class InviteJoinResponse(BaseModel):
    """The member request just filed."""

    uuid: UUID
    requested_role: Literal["government", "ngo"]
    team_uuid: UUID
    status: Literal["pending"]
    created_at: datetime
