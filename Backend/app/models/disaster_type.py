"""SQLAlchemy model for the deployment's disaster-type vocabulary (feature 018).

Feature 013 deliberately left this vocabulary open (ADR-091): the real set of disaster types
came from PM's spec, not from this repository, so inventing an enum here would have guessed at
names that document already owned. ADR-244 closes it — but as a *table*, not the `DisasterType`
enum `app/core/disaster_types.py` originally reserved, because operators have to be able to add
a type through GraphQL when a new kind of disaster shows up mid-response. An enum would need a
deploy; a row does not.

`key` is the immutable join key — `tickets.disaster_types`, `project_settings.disaster_types`
and every `*_property_config.disaster_types` point at it by string with no foreign key (an
`ARRAY(String)` cannot carry one). Renaming a key would orphan all three, so there is no rename
endpoint, the same rule `property_config.property_name` follows under ADR-095. Display text
belongs in `label`.
"""

from sqlalchemy import Boolean, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class DisasterType(Base, UUIDPKMixin):
    """ORM model for one disaster type in the deployment's vocabulary."""

    __tablename__ = "disaster_types"

    key: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        comment="不可變更的英文小寫代碼，例如 flood；其他資料表以字串參照，無外鍵",
    )
    label: Mapped[str] = mapped_column(String(50), comment="顯示名稱，例如「水災」")
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default=text("true"), default=True, nullable=False, comment="停用開關"
    )
