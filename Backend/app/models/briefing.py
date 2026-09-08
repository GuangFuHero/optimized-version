"""SQLAlchemy models for briefing templates and generated briefings."""

import uuid as _uuid

from sqlalchemy import ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class BriefingTemplate(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a reusable briefing template authored by an admin.

    ``state`` marks which lifecycle phase the template targets
    (briefing / in_field / debrief). ``tags`` is a free-form JSONB string array used for
    categorization (e.g. psychological, supply, disaster-type), kept flexible so new
    briefing materials can be classified without schema changes.
    """

    __tablename__ = "briefing_templates"
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'"), default=list)
    state: Mapped[str] = mapped_column(
        String(50), server_default=text("'briefing'"), default="briefing"
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))


class Briefing(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a briefing generated from a template (or authored ad-hoc).

    ``template_uuid`` records the source template and is nullable: ad-hoc briefings have no
    template, and soft-deleting a template leaves existing briefings' references intact.
    """

    __tablename__ = "briefings"
    template_uuid: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("briefing_templates.uuid"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'"), default=list)
    state: Mapped[str] = mapped_column(
        String(50), server_default=text("'briefing'"), default="briefing"
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
