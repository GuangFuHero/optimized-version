"""GraphQL types, inputs, and enums for briefing templates and briefings."""

from datetime import datetime
from enum import Enum
from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.shared import UserRefType, staff_user_ref


@strawberry.enum
class BriefingState(Enum):
    """Deployment-lifecycle phase a template or briefing targets."""

    BRIEFING = "briefing"  # 行前 — pre-trip
    IN_FIELD = "in_field"  # 現場 — on-site
    DEBRIEF = "debrief"  # 回程後 — post-trip


@strawberry.enum
class BriefingStatus(Enum):
    """Whether a briefing is still a draft."""

    DRAFT = "draft"
    PUBLISHED = "published"  # read-only


@strawberry.enum
class BriefingStatusFilter(Enum):
    """Which briefings to list by publication status."""

    PUBLISHED = "published"  # public
    DRAFT = "draft"  # pre_departure.edit
    ALL = "all"  # pre_departure.edit


@strawberry.type
class BriefingTemplateType:
    """GraphQL type representing a reusable briefing template."""

    uuid: UUID
    content: str
    tags: list[str] = strawberry.field(default_factory=list, description="Free-form categorization tags")
    state: str = strawberry.field(
        default="briefing", description="Lifecycle phase: 'briefing', 'in_field', or 'debrief'"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None
    _created_by: strawberry.Private[str | None] = None

    @strawberry.field(description="Who created it. Null unless the caller holds pre_departure.edit")
    async def creator(self, info: strawberry.types.Info) -> UserRefType | None:
        """The template's author, to editors only."""
        return await staff_user_ref(info, self._created_by, Perm.PREDEP_EDIT)

    @classmethod
    def from_model(cls, m) -> "BriefingTemplateType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            content=m.content,
            tags=list(m.tags or []),
            state=m.state,
            _created_by=m.created_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )


@strawberry.type
class BriefingType:
    """GraphQL type representing one version of a briefing, draft or published."""

    uuid: UUID
    template_uuid: UUID | None = strawberry.field(
        default=None, description="UUID of the source template, or null for ad-hoc briefings"
    )
    content: str = ""
    tags: list[str] = strawberry.field(default_factory=list, description="Free-form categorization tags")
    state: str = strawberry.field(
        default="briefing", description="Lifecycle phase: 'briefing', 'in_field', or 'debrief'"
    )
    status: BriefingStatus = BriefingStatus.PUBLISHED
    published_at: datetime | None = strawberry.field(
        default=None, description="When it was published; null while a draft"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None
    _created_by: strawberry.Private[str | None] = None
    _updated_by: strawberry.Private[str | None] = None
    _published_by: strawberry.Private[str | None] = None

    @strawberry.field(description="Who created it. Null unless the caller holds pre_departure.edit")
    async def creator(self, info: strawberry.types.Info) -> UserRefType | None:
        """The briefing's author, to editors only."""
        return await staff_user_ref(info, self._created_by, Perm.PREDEP_EDIT)

    @strawberry.field(description="Who last changed it. Null unless the caller holds pre_departure.edit")
    async def updater(self, info: strawberry.types.Info) -> UserRefType | None:
        """The last editor, to editors only."""
        return await staff_user_ref(info, self._updated_by, Perm.PREDEP_EDIT)

    @strawberry.field(
        description="Who published it; null while a draft or unless the caller holds pre_departure.edit"
    )
    async def publisher(self, info: strawberry.types.Info) -> UserRefType | None:
        """The publisher, to editors only."""
        return await staff_user_ref(info, self._published_by, Perm.PREDEP_EDIT)

    @classmethod
    def from_model(cls, m) -> "BriefingType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            template_uuid=m.template_uuid,
            content=m.content,
            tags=list(m.tags or []),
            state=m.state,
            _created_by=m.created_by,
            status=BriefingStatus.DRAFT if m.published_at is None else BriefingStatus.PUBLISHED,
            published_at=m.published_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
            _updated_by=m.updated_by,
            _published_by=m.published_by,
        )


@strawberry.input
class CreateBriefingTemplateInput:
    """Input for creating a briefing template."""

    content: str = strawberry.field(description="The template body text")
    tags: list[str] = strawberry.field(default_factory=list, description="Categorization tags")
    state: BriefingState = strawberry.field(
        default=BriefingState.BRIEFING, description="Lifecycle phase this template targets"
    )


@strawberry.input
class UpdateBriefingTemplateInput:
    """Input for editing a briefing template. Omitted fields are left unchanged."""

    content: str | None = strawberry.field(default=None, description="New body text")
    tags: list[str] | None = strawberry.field(default=None, description="Replacement tag list")
    state: BriefingState | None = strawberry.field(default=None, description="New lifecycle phase")


@strawberry.input
class GenerateBriefingInput:
    """Input for generating a draft briefing, optionally seeded from a template."""

    template_uuid: UUID | None = strawberry.field(
        default=None, description="Source template UUID; null for an ad-hoc briefing"
    )
    content: str | None = strawberry.field(
        default=None, description="Override content; defaults to the template's content"
    )
    tags: list[str] | None = strawberry.field(
        default=None, description="Override tags; defaults to the template's tags"
    )
    state: BriefingState | None = strawberry.field(
        default=None, description="Override phase; defaults to the template's state"
    )


@strawberry.input
class UpdateBriefingInput:
    """Input for editing a draft briefing. Omitted fields are left unchanged."""

    content: str | None = strawberry.field(default=None, description="New body text")
    tags: list[str] | None = strawberry.field(default=None, description="Replacement tag list")
    state: BriefingState | None = strawberry.field(default=None, description="New lifecycle phase")
