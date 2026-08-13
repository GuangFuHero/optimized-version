"""SQLAlchemy ORM model for user notifications."""

import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Notification(Base, UUIDPKMixin, TimestampMixin):
    """ORM model representing an in-app notification for a user."""

    __tablename__ = "notifications"

    recipient_uuid: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.uuid", ondelete="CASCADE"),
        index=True,
        nullable=False,
        comment="接收通知的使用者 UUID",
    )
    actor_uuid: Mapped[_uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
        comment="觸發此事件的使用者 UUID (系統觸發為 NULL)",
    )

    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="通知類型 enum: zone_assigned, ticket_task_status_update...",
    )
    priority: Mapped[str] = mapped_column(
        String(20),
        default="medium",
        server_default="medium",
        nullable=False,
        comment="優先級: urgent / high / medium / info",
    )

    # 多型引用 (Polymorphic Reference)，避免寫死前端 URL
    ref_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="關聯實體類型: work_zone / ticket_task / station / announcement",
    )
    ref_uuid: Mapped[_uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        comment="關聯實體之 UUID",
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="通知標題",
    )
    body: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="通知內文",
    )

    read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
        comment="是否已讀",
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="已讀時間",
    )

    def __init__(self, **kwargs):
        """Initialize notification model with default uuid, priority, read status and created_at."""
        kwargs.setdefault("uuid", _uuid.uuid4())
        kwargs.setdefault("priority", "medium")
        kwargs.setdefault("read", False)
        kwargs.setdefault("created_at", datetime.now(UTC))
        super().__init__(**kwargs)

    # 複合索引：優化高頻未讀數統計與分頁排序
    __table_args__ = (
        Index(
            "ix_notifications_recipient_unread",
            "recipient_uuid",
            "read",
            "delete_at",
        ),
        Index(
            "ix_notifications_recipient_created",
            "recipient_uuid",
            "created_at",
        ),
    )
