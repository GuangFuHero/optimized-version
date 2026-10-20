"""Team invite links: a team admin shares one, anyone signed in asks to join through it (Spec/026).

A link lives exactly 24 hours, has no usage cap, and cannot be revoked or extended (BE-038
step 1, ADR-353). Requesting through it files the same member request the site form does
(ADR-350 point 3), so every rule of `role_request.submit` applies unchanged.
"""

import secrets
from dataclasses import dataclass
from datetime import datetime
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.role_request import RoleRequest
from app.models.team import Team
from app.models.team_invite import TeamInvite
from app.repositories.team_invite_repository import team_invite_repository
from app.services import role_request
from app.services.authz import require_scope

# 24 random bytes, URL-safe: 32 characters, the column's width.
_TOKEN_BYTES = 24

# The identity an invite's request takes, from the team's type (ADR-352 point 1).
_ROLE_FOR_TEAM_TYPE = {team_type: role for role, team_type in role_request.TEAM_TYPE_FOR_ROLE.items()}


class TeamNotFoundError(ValueError):
    """No such team, or one outside the caller's scope. REST answers 404."""


class InviteNotFoundError(ValueError):
    """Unknown, expired, or for a team that cannot be joined. REST answers 404."""


@dataclass
class IssuedInvite:
    """What the team admin's page needs to draw the QR code and say when it stops working."""

    token: str
    team_uuid: object
    created_at: datetime
    expires_at: datetime


@dataclass
class OpenedInvite:
    """What the invite page shows before the visitor asks to join."""

    team: Team
    expires_at: datetime
    my_request: RoleRequest | None


def _issued(invite: TeamInvite) -> IssuedInvite:
    return IssuedInvite(
        token=invite.token,
        team_uuid=invite.team_uuid,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
    )


async def _managed_team(db: AsyncSession, actor: User, team_uuid) -> Team:
    """The team, if the caller manages its members (checkpoint 1 + 2, as add_team_member does)."""
    team = await db.scalar(select(Team).where(Team.uuid == team_uuid, Team.delete_at.is_(None)))
    if team is None:
        raise TeamNotFoundError("Team not found")
    await require_scope(
        actor,
        Perm.TEAM_MEMBER_MANAGE,
        db,
        resource=SimpleNamespace(created_by=None, team_uuid=team.uuid, geometry=None),
    )
    return team


async def create_invite(db: AsyncSession, *, actor: User, team_uuid) -> IssuedInvite:
    """Issue a new 24-hour link for the team."""
    team = await _managed_team(db, actor, team_uuid)
    invite = await team_invite_repository.create(
        db, token=secrets.token_urlsafe(_TOKEN_BYTES), team_uuid=team.uuid, created_by=actor.uuid
    )
    await db.commit()
    await db.refresh(invite)  # the database set both times
    return _issued(invite)


async def list_invites(db: AsyncSession, *, actor: User, team_uuid) -> list[IssuedInvite]:
    """The team's links still valid, newest first, so the page can show the current one again."""
    team = await _managed_team(db, actor, team_uuid)
    return [_issued(invite) for invite in await team_invite_repository.list_valid(db, team_uuid=team.uuid)]


async def _valid(db: AsyncSession, token: str) -> tuple[TeamInvite, Team]:
    found = await team_invite_repository.get_valid(db, token)
    if found is None:
        raise InviteNotFoundError("Invite not found")
    return found


async def open_invite(db: AsyncSession, *, actor: User, token: str) -> OpenedInvite:
    """The team behind a working link, and the visitor's pending request for it if any."""
    invite, team = await _valid(db, token)
    mine = await db.scalar(
        select(RoleRequest).where(
            RoleRequest.created_by == actor.uuid,
            RoleRequest.team_uuid == team.uuid,
            RoleRequest.status == "pending",
        )
    )
    return OpenedInvite(team=team, expires_at=invite.expires_at, my_request=mine)


async def request_to_join(
    db: AsyncSession, *, actor: User, token: str, name: str, reason: str, email: str | None
) -> RoleRequest:
    """File a member request for the link's team. Approval never looks at the link again."""
    invite, team = await _valid(db, token)
    return await role_request.submit(
        db,
        actor=actor,
        requested_role=_ROLE_FOR_TEAM_TYPE[team.type],
        reason=reason,
        name=name,
        email=email,
        team_uuid=team.uuid,
        invite_uuid=invite.uuid,
    )
