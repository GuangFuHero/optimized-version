"""Shared SQLAlchemy mixins: UUID primary key and soft-delete timestamps."""

import uuid as _uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Mapped, mapped_column

Base = declarative_base()

class TimestampMixin:
    """Mixin adding created_at, updated_at, and soft-delete delete_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        comment="建立時間"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        onupdate=func.now(),
        comment="最後更新時間"
    )
    delete_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="軟刪除時間"
    )

class UUIDPKMixin:
    """Mixin adding a UUID primary key column."""

    uuid: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=_uuid.uuid4,
        comment="主鍵 UUID"
    )
