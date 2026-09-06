"""SQLAlchemy models for station and task property configuration schemas.

These rows are *definitions* only — they tell the frontend which fields to render. The
backend never validates written property values against them (ADR-092). Per ADR-091 the
definition (`data_type` / `enum_options`, unique per `(target_type, property_name)`) is split
from the activation (`disaster_types`: which disaster types show this field), so a field can
never carry two definitions *across disaster types* — the mixed-disaster conflict ADR-091
set out to remove.

KNOWN LIMITATION (station side only): the uniqueness key includes `station_type`, but
`list_by_type` unions a station type's own rows with the shared `'all'` bucket, so
`('all', X)` and `('shelter', X)` can coexist and both reach the same form with conflicting
`data_type`. Seed row `('all', 'crowd_level')` from migration a2a8e4d8c51d sits on that edge.
Accepted for now (the `'all'` bucket holds exactly one field) — see the ADR-091 note in
Spec/013-project-settings-activity/decisions.md. Task configs are unaffected: their query
has no `'all'` bucket.

`property_name` is an IMMUTABLE key (ADR-095): `station_properties` / `task_properties` point
at it by string with no foreign key, so renaming would orphan existing rows. Display text
belongs in `label`. There is deliberately no rename endpoint.
"""

from sqlalchemy import ARRAY, JSON, Boolean, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class StationPropertyConfig(Base, UUIDPKMixin):
    """ORM model defining the property schema for a given station type."""

    __tablename__ = "station_property_config"
    __table_args__ = (
        UniqueConstraint(
            "station_type", "property_name", name="uq_station_property_config_key"
        ),
    )
    station_type: Mapped[str] = mapped_column(String(50))
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 空陣列 = 不分災害型別一律啟用（沿用 station_type='all' 的慣例）
    disaster_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default=text("'{}'"), default=list, nullable=False,
        comment="啟用於哪些災害型別；空陣列代表全部",
    )
    label: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="顯示文字；NULL 時前端回退顯示 property_name"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), default=0, nullable=False, comment="表單欄位順序"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default=text("true"), default=True, nullable=False, comment="停用開關"
    )


class TaskPropertyConfig(Base, UUIDPKMixin):
    """ORM model defining the property schema for a given task type."""

    __tablename__ = "task_property_config"
    __table_args__ = (
        UniqueConstraint("task_type", "property_name", name="uq_task_property_config_key"),
    )
    task_type: Mapped[str] = mapped_column(String(50))
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    disaster_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default=text("'{}'"), default=list, nullable=False,
        comment="啟用於哪些災害型別；空陣列代表全部",
    )
    label: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="顯示文字；NULL 時前端回退顯示 property_name"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), default=0, nullable=False, comment="表單欄位順序"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default=text("true"), default=True, nullable=False, comment="停用開關"
    )
