"""GraphQL types, inputs, and enums for briefing templates and briefings."""

from datetime import datetime
from enum import Enum
from uuid import UUID

import strawberry


@strawberry.enum
class BriefingState(Enum):
    """Deployment-lifecycle phase a template or briefing targets."""

    BRIEFING = "briefing"   # 行前 — pre-trip
    IN_FIELD = "in_field"   # 現場 — on-site
    DEBRIEF = "debrief"     # 回程後 — post-trip


@strawberry.type
class BriefingTemplateType:
    """GraphQL type representing a reusable briefing template."""

    uuid: UUID
    content: str
    tags: list[str] = strawberry.field(
        default_factory=list, description="Free-form categorization tags"
    )
    state: str = strawberry.field(
        default="briefing", description="Lifecycle phase: 'briefing', 'in_field', or 'debrief'"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who created this template"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "BriefingTemplateType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, content=m.content, tags=list(m.tags or []), state=m.state,
            created_by=m.created_by, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class BriefingType:
    """GraphQL type representing a generated briefing."""

    uuid: UUID
    template_uuid: UUID | None = strawberry.field(
        default=None, description="UUID of the source template, or null for ad-hoc briefings"
    )
    content: str = ""
    tags: list[str] = strawberry.field(
        default_factory=list, description="Free-form categorization tags"
    )
    state: str = strawberry.field(
        default="briefing", description="Lifecycle phase: 'briefing', 'in_field', or 'debrief'"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who created this briefing"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "BriefingType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, template_uuid=m.template_uuid, content=m.content,
            tags=list(m.tags or []), state=m.state, created_by=m.created_by,
            created_at=m.created_at, updated_at=m.updated_at,
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
    tags: list[str] | None = strawberry.field(
        default=None, description="Replacement tag list"
    )
    state: BriefingState | None = strawberry.field(
        default=None, description="New lifecycle phase"
    )


@strawberry.input
class GenerateBriefingInput:
    """Input for generating a briefing, optionally seeded from a template."""

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
    """Input for editing a briefing. Omitted fields are left unchanged."""

    content: str | None = strawberry.field(default=None, description="New body text")
    tags: list[str] | None = strawberry.field(
        default=None, description="Replacement tag list"
    )
    state: BriefingState | None = strawberry.field(
        default=None, description="New lifecycle phase"
    )
