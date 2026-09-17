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

`property_name` is an IMMUTABLE key (ADR-095): `station_properties` / `task_properties` /
`ticket_disaster_details` point at it by string with no foreign key, so renaming would orphan
existing rows. Display text belongs in `label`. There is deliberately no rename endpoint.

Feature 018 adds the third target, `TicketPropertyConfig`, and reshapes `data_type` across all
three (ADR-245). The old tokens named a storage type (`Enum`, `Array`, `Integer`); the new ones
name the widget the form renders (`single_select`, `multi_select`, `number`), because that is
all these rows have ever been for — ADR-092 means nothing validates a value against them.
`Array` in particular never said its options came from `enum_options`, and `Enum` never said it
was single-valued. See `app/graphql/shared.py::FieldDataType` for the closed set.

`TicketPropertyConfig` differs from its two siblings in shape, not just in name:

- **No first-dimension type column.** Stations key on `station_type` and tasks on `task_type`,
  with `disaster_types` as a separate activation axis (the ADR-091 split). For tickets the
  disaster type IS the only axis, so `property_name` alone is unique and `disaster_types` does
  all the scoping. That keeps ADR-091's guarantee at full strength: `access_blocked` (水災 +
  土石流) and `entrance_blocked` (火災 + 地震) are one row each and cannot drift apart.
- **No `sort_order`.** Ordering is `(property_name, uuid)` — still total, still deterministic
  per ADR-227.
- **A `hint` column**, carrying the safety text a reporter sees under the field (「不可為了量測
  進入危險區」). It is editable data rather than hardcoded frontend copy precisely because it is
  safety-critical: getting it changed must not need a deploy.
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
    unit: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="number 欄位的單位，例如 cm、mm；其他型別為 NULL"
    )
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
    unit: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="number 欄位的單位，例如 cm、mm；其他型別為 NULL"
    )
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


class TicketPropertyConfig(Base, UUIDPKMixin):
    """ORM model defining the disaster-specific field schema for tickets.

    Unlike its two siblings there is no type column: `property_name` is the whole key, and
    `disaster_types` is what decides where a field shows up. See the module docstring.
    """

    __tablename__ = "ticket_property_config"
    __table_args__ = (
        UniqueConstraint("property_name", name="uq_ticket_property_config_key"),
    )
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    unit: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="number 欄位的單位，例如 cm、mm；其他型別為 NULL"
    )
    # 空陣列 = 不分災害型別一律啟用。注意 ticket 側的空陣列語意與 station/task 不同：
    # 這裡的「查詢參數為空」代表「這張單沒有災害型別」，只回傳本欄位為空的通用欄位，
    # 而不是「不過濾」——見 repositories/config_repository.py::TicketPropertyConfigRepository。
    disaster_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default=text("'{}'"), default=list, nullable=False,
        comment="啟用於哪些災害型別；空陣列代表全部",
    )
    label: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="顯示文字；NULL 時前端回退顯示 property_name"
    )
    hint: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="欄位下方的填寫提示與安全警語，例如「不可為了量測進入危險區」"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default=text("true"), default=True, nullable=False, comment="停用開關"
    )
