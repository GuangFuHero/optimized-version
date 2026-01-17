import uuid
from datetime import datetime
from sqlalchemy import UUID, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base

class TimestampMixin:
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
    uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4,
        comment="主鍵 UUID"
    )
