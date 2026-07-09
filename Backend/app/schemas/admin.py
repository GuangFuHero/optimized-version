"""Pydantic schemas for the minimal admin API (list users, assign role, manage team members)."""

from uuid import UUID

from pydantic import BaseModel


class AdminUserListItem(BaseModel):
    """One row of the admin user list: identity plus current role/team assignment."""

    uuid: UUID
    name: str
    team_uuid: UUID | None
    platform_role: str | None
    team_role: str | None


class AssignRoleRequest(BaseModel):
    """Body naming the role to grant a user (replaces any existing role of the same kind)."""

    role_name: str


class AssignRoleResponse(BaseModel):
    """Confirms which user now holds which role."""

    user_uuid: UUID
    role_uuid: UUID


class TeamMemberRequest(BaseModel):
    """Body naming the user to add to a team, with an optional team-kind role."""

    user_uuid: UUID
    team_role_name: str | None = None


class TeamMemberResponse(BaseModel):
    """Confirms a user's team membership after an add/remove operation."""

    uuid: UUID
    team_uuid: UUID | None
