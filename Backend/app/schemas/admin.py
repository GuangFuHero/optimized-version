"""Pydantic schemas for the minimal admin API (list users, assign role, manage team members)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class IdentitySummary(BaseModel):
    """One identity a user may act as: a role, and the team it applies to if team-kind."""

    role_uuid: UUID
    role: str
    team_uuid: UUID | None = None
    team: str | None = None


class AdminUserListItem(BaseModel):
    """One row of the admin user list.

    `identities` replaces the old single-valued `team_uuid` / `team_role`: a user can now
    hold a role in several teams at once, so one column cannot describe them (ADR-073).
    """

    uuid: UUID
    name: str
    # The name a reviewer confirmed on approval (Spec/026, ADR-355). Filled only for holders of
    # role_request.review: data auditors also read this list, and are kept from applicants'
    # details (ADR-287 point 7).
    real_name: str | None = None
    platform_role: str | None
    identities: list[IdentitySummary] = Field(default_factory=list)
    last_login_at: datetime | None = None
    # Refreshed on refresh-token rotation, so up to one access-token TTL (15 min) stale (ADR-093).
    last_activity_at: datetime | None = None
    # Live count of Redis sessions. `None` means "could not be read" (Redis unavailable) —
    # never 0, which would read as "signed out everywhere" (ADR-094).
    active_session_count: int | None = None


class MapView(BaseModel):
    """Where the site's map opens (ADR-395): all three or none, so it is one value rather than three."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    # The site's map allows 7 to 18 (rescue-map-canvas `minZoom` / `maxZoom`).
    zoom: int = Field(ge=7, le=18)


class ProjectSettingsResponse(BaseModel):
    """The deployment's single project settings row, or its unset shape before first write."""

    uuid: UUID | None = None
    name: str | None = None
    # For the site's top bar and other tight spots; null means use `name` (ADR-392).
    short_name: str | None = None
    disaster_types: list[str] = Field(default_factory=list)
    started_at: datetime | None = None
    # Null until set: the site then opens its map on its own default (ADR-395).
    map_view: MapView | None = None
    # Advisory only, and only on write: a saved disaster type that no configured dynamic
    # field is scoped to (ADR-169). The write succeeded either way — this is what tells an
    # operator a typo emptied the forms instead of leaving them to find out from a rescue
    # form that came back missing its fields.
    warnings: list[str] = Field(default_factory=list)


class ProjectSettingsUpdate(BaseModel):
    """PATCH body: every field optional; omitted fields keep their stored value."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    # Optional, unlike `name`: null or blank clears it, and the full name is shown instead.
    short_name: str | None = Field(default=None, max_length=30)
    disaster_types: list[str] | None = None
    started_at: datetime | None = None
    # Sent whole; null clears it.
    map_view: MapView | None = None

    @field_validator("short_name", mode="before")
    @classmethod
    def _blank_short_name_is_none(cls, value):
        """Trim it before the length check, so stray spaces neither count nor get stored."""
        if isinstance(value, str):
            return value.strip() or None
        return value


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

    8 ASCII digits; multiply each by its logic weight, sum the tens + units digit of every
    product; valid when the total is divisible by 5 (the post-2023 rule that replaced the
    older divisible-by-10 check). Official exception: when the 7th digit is "7", a total
    whose value + 1 is divisible by 5 is also accepted (e.g. 10000073). `isascii()` guards
    against full-width digits that `isdigit()` alone would accept.
    """
    if len(value) != 8 or not (value.isascii() and value.isdigit()):
        return False
    total = 0
    for weight, digit in zip(_UBN_WEIGHTS, (int(c) for c in value), strict=True):
        product = weight * digit
        total += product // 10 + product % 10
    if total % 5 == 0:
        return True
    return value[6] == "7" and (total + 1) % 5 == 0


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


class UpdateTeamRequest(BaseModel):
    """Body for editing a team (Spec/026, ADR-357). Fields left out are not changed.

    The type is not editable: applications and gov-only capabilities rely on it.
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    tax_id: str | None = None
    contact_name: str | None = Field(default=None, max_length=100)
    contact_phone: str | None = Field(default=None, max_length=20)

    @field_validator("tax_id")
    @classmethod
    def _validate_tax_id(cls, v: str | None) -> str | None:
        """Same rule as on creation; null clears it."""
        if v is not None and not is_valid_ubn(v):
            raise ValueError("統一編號須為 8 位數字且通過檢查碼（能被 5 整除）")
        return v


class TeamMemberItem(BaseModel):
    """One row of a team's member list (Spec/026): their role in this team, nothing else.

    `real_name` is filled for whoever manages the team's members and for reviewers (ADR-355).
    """

    uuid: UUID
    name: str
    real_name: str | None = None
    role_uuid: UUID
    role: str


class TeamStatusRequest(BaseModel):
    """Body for suspending or restoring a team (Spec/026, ADR-357)."""

    status: Literal["active", "suspended"]


class TeamResponse(BaseModel):
    """A team's identity, status and contact (contact since Spec/026)."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    name: str
    type: str
    status: str
    tax_id: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
