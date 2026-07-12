"""Pydantic schemas for the minimal admin API (list users, assign role, manage team members)."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


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


_UBN_WEIGHTS = (1, 2, 1, 2, 1, 2, 4, 1)


def is_valid_ubn(value: str) -> bool:
    """Validate a Taiwan Uniform Business Number (統一編號).

    8 digits; multiply each by its logic weight, sum the tens + units digit of every
    product, and require the total to be divisible by 5 (the post-2023 rule that replaced
    the older divisible-by-10 check). The 7th-digit-"7" +1 exception is intentionally not
    applied — a plain /5 check is the agreed rule.
    """
    if len(value) != 8 or not value.isdigit():
        return False
    total = 0
    for weight, digit in zip(_UBN_WEIGHTS, (int(c) for c in value), strict=True):
        product = weight * digit
        total += product // 10 + product % 10
    return total % 5 == 0


class CreateTeamRequest(BaseModel):
    """Body for creating a gov/ngo team."""

    name: str = Field(min_length=1, max_length=100)
    type: Literal["gov", "ngo"]
    tax_id: str | None = None  # 統一編號 (UBN), 8 碼;可空,有填則須通過檢查碼

    @field_validator("tax_id")
    @classmethod
    def _validate_tax_id(cls, v: str | None) -> str | None:
        """Skip when omitted (可空); otherwise require a valid 8-digit UBN."""
        if v is not None and not is_valid_ubn(v):
            raise ValueError("統一編號須為 8 位數字且通過檢查碼（能被 5 整除）")
        return v


class TeamResponse(BaseModel):
    """A team's identity and status."""

    uuid: UUID
    name: str
    type: str
    status: str
    tax_id: str | None = None
