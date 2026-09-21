"""SQLAlchemy model for the per-ticket values of disaster-specific dynamic fields (feature 018).

The values half of the mechanism `ticket_property_config` defines. Same EAV shape as
`task_properties` / `station_properties`, with two deliberate differences:

- **One row per selected value**, keyed `UNIQUE(ticket_uuid, property_name, value)`. A
  `multi_select` field such as `utility_hazards` is simply three rows, so nothing has to
  JSON-encode on write or parse on read, and a single-valued field is the degenerate case of
  the same shape (ADR-247).
- **A surrogate `uuid` primary key, not the natural composite.** `audit_trigger_func()` does
  `r_id := NEW.uuid` unconditionally, so a table without a `uuid` column raises
  `record "new" has no field "uuid"` on every write. The uniqueness that would have been the
  key is a constraint instead.

`property_name` joins to `ticket_property_config.property_name` by string with no foreign key,
following ADR-095. Per ADR-092 nothing validates a written value against that config — these
rows are what the reporter said, not what the schema allows.

No `search_text`: the values are enum tokens and measurements, worthless as search terms, and
ADR-146 keeps ticket detail off the public search surface regardless.
"""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class TicketDisasterDetail(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for one disaster-field value recorded against a ticket."""

    __tablename__ = "ticket_disaster_details"
    __table_args__ = (
        UniqueConstraint(
            "ticket_uuid", "property_name", "value", name="uq_ticket_disaster_detail_value"
        ),
    )

    ticket_uuid: Mapped[str] = mapped_column(
        ForeignKey("tickets.uuid"), index=True, comment="所屬通報單"
    )
    property_name: Mapped[str] = mapped_column(
        String(100), comment="對應 ticket_property_config.property_name，以字串參照，無外鍵"
    )
    value: Mapped[str] = mapped_column(
        String, comment="單一值；multi_select 欄位每個選項各一列"
    )
