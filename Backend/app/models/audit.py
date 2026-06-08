"""SQLAlchemy model for action/audit logging."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, UUID, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class AuditLog(Base, UUIDPKMixin):
    """ORM model representing an audit log entry for database mutations."""

    __tablename__ = "audit_logs"

    table_name: Mapped[str] = mapped_column(String(100), comment="異動資料表名稱")
    action: Mapped[str] = mapped_column(String(20), comment="異動類型 (INSERT, UPDATE, DELETE)")
    row_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), comment="受異動資料的主鍵 UUID")
    old_values: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="異動前資料內容")
    new_values: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="異動後資料內容")
    user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, comment="操作者使用者 UUID"
    )
    client_ip: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="操作者 IP 位址")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        comment="建立時間"
    )
