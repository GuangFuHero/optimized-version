"""SQLAlchemy model for the deployment's single global project settings row (ADR-090).

One deployment = one (possibly mixed-type) disaster. There is no project / disaster_event
entity: `tickets` / `stations` / `ticket_tasks` carry no event foreign key, so every existing
query (RBAC scope, search, map bbox) is untouched. The single-row invariant is enforced by a
unique index on the constant expression `(true)` — simpler than a fixed primary key value,
and it needs no magic UUID.
"""

from datetime import datetime

from sqlalchemy import ARRAY, DateTime, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class ProjectSettings(Base, UUIDPKMixin):
    """The one row describing what disaster this deployment is responding to."""

    __tablename__ = "project_settings"
    __table_args__ = (
        # 單列不變式：一個部署 = 一場（混合型）災害（ADR-090）
        Index("uq_project_settings_singleton", text("(true)"), unique=True),
    )

    name: Mapped[str] = mapped_column(String(100), comment="災害名稱，例如「花蓮 0816」")
    # 空陣列 = 尚未設定，動態欄位一律啟用（沿用 station_type='all' 的慣例）
    disaster_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default=text("'{}'"), default=list, nullable=False,
        comment="這場災害的型別集合，例如 {landslide,flood}",
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="災害起始時間"
    )
    # TimestampMixin is deliberately not inherited: it also brings `delete_at`, and this row
    # is the deployment's single settings record — it is updated, never soft-deleted (ADR-090,
    # enforced by the single-row unique index above).
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), comment="建立時間"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
        comment="最後更新時間",
    )
