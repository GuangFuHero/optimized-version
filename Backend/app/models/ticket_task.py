"""SQLAlchemy models for ticket tasks, task properties, and task assignments."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class TicketTask(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a task derived from a support ticket."""

    __tablename__ = "ticket_tasks"
    ticket_uuid: Mapped[str] = mapped_column(ForeignKey("tickets.uuid"))
    route_uuid: Mapped[str | None] = mapped_column(ForeignKey("routes.uuid"), nullable=True)
    task_type: Mapped[str] = mapped_column(String(50))
    task_name: Mapped[str] = mapped_column(String(200))
    task_description: Mapped[str | None] = mapped_column(String)
    quantity: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    source: Mapped[str] = mapped_column(String(50), default="user")
    progress_note: Mapped[str | None] = mapped_column(String)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    dedup_group_id: Mapped[str | None] = mapped_column(String)
    moderation_status: Mapped[str] = mapped_column(String(50), default="pending_review")
    visibility: Mapped[str] = mapped_column(String(50), default="public")
    review_note: Mapped[str | None] = mapped_column(String)


class TaskProperty(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a key-value property attached to a ticket task."""

    __tablename__ = "task_properties"
    task_uuid: Mapped[str] = mapped_column(ForeignKey("ticket_tasks.uuid"))
    property_name: Mapped[str] = mapped_column(String(100))
    property_value: Mapped[str] = mapped_column(String)
    quantity: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(50))
    comment: Mapped[str | None] = mapped_column(String)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))


class TaskAssignment(Base, UUIDPKMixin):
    """ORM model for assigning a user to a ticket task with a specific role."""

    __tablename__ = "task_assignments"
    task_uuid: Mapped[str] = mapped_column(ForeignKey("ticket_tasks.uuid"))
    actor_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    role: Mapped[str | None] = mapped_column(String(100))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
