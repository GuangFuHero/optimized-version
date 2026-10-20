"""SQLAlchemy models for briefing templates and generated briefings."""

import uuid as _uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, text
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
    state: Mapped[str] = mapped_column(String(50), server_default=text("'briefing'"), default="briefing")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))


class Briefing(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for one version of a briefing, generated from a template (or authored ad-hoc).

    ``template_uuid`` records the source template and is nullable: ad-hoc briefings have no
    template, and soft-deleting a template leaves existing briefings' references intact.
    A row is a draft until ``published_at`` is set, and read-only after; the newest published
    row per ``state`` is the current version.
    """

    __tablename__ = "briefings"
    template_uuid: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("briefing_templates.uuid"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'"), default=list)
    state: Mapped[str] = mapped_column(String(50), server_default=text("'briefing'"), default="briefing")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)
