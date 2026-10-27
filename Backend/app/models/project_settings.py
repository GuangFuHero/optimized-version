"""SQLAlchemy model for the deployment's single global project settings row (ADR-090).

One deployment = one (possibly mixed-type) disaster. There is no project / disaster_event
entity: `tickets` / `stations` / `ticket_tasks` carry no event foreign key, so every existing
query (RBAC scope, search, map bbox) is untouched. The single-row invariant is enforced by a
unique index on the constant expression `(true)` — simpler than a fixed primary key value,
and it needs no magic UUID.
"""

from datetime import datetime

from sqlalchemy import ARRAY, CheckConstraint, DateTime, Float, Index, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class ProjectSettings(Base, UUIDPKMixin):
    """The one row describing what disaster this deployment is responding to."""

    __tablename__ = "project_settings"
    __table_args__ = (
        # 單列不變式：一個部署 = 一場（混合型）災害（ADR-090）
        Index("uq_project_settings_singleton", text("(true)"), unique=True),
        # 地圖起始視角三個值一起有、一起沒有：只有中心沒有 zoom，地圖沒辦法開（ADR-395）
        CheckConstraint(
            "(map_center_lat IS NULL) = (map_center_lng IS NULL)"
            " AND (map_center_lat IS NULL) = (map_zoom IS NULL)",
            name="ck_project_settings_map_view_all_or_none",
        ),
    )

    name: Mapped[str] = mapped_column(String(100), comment="災害名稱，例如「花蓮 0816」")
    # 前台頂欄、後台側欄放不下全名時用；沒填就用 name（ADR-392）
    short_name: Mapped[str | None] = mapped_column(
        String(30), nullable=True, comment="災害簡稱，例如「花蓮馬太鞍溪」；沒填用 name"
    )
    # 空陣列 = 尚未設定，動態欄位一律啟用（沿用 station_type='all' 的慣例）
    disaster_types: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        server_default=text("'{}'"),
        default=list,
        nullable=False,
        comment="這場災害的型別集合，例如 {landslide,flood}",
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="災害起始時間"
    )
    # 前台地圖第一次打開的位置；沒設就用前端自己的預設（ADR-395）
    map_center_lat: Mapped[float | None] = mapped_column(
        Float, nullable=True, comment="地圖起始中心的緯度，例如 23.67"
    )
    map_center_lng: Mapped[float | None] = mapped_column(
        Float, nullable=True, comment="地圖起始中心的經度，例如 121.418"
    )
    map_zoom: Mapped[int | None] = mapped_column(
        SmallInteger, nullable=True, comment="地圖起始 zoom，例如 14"
    )
    # TimestampMixin is deliberately not inherited: it also brings `delete_at`, and this row
    # is the deployment's single settings record — it is updated, never soft-deleted (ADR-090,
    # enforced by the single-row unique index above).
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), comment="建立時間"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="最後更新時間",
    )
