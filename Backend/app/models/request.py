"""SQLAlchemy model for support tickets (disaster relief requests)."""

from sqlalchemy import ARRAY, Computed, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.geo import BaseGeometry
from app.models.search import plain, search_text_expression, search_text_index, truncated


class Tickets(BaseGeometry):
    """ORM model for a disaster relief support ticket with contact and status fields."""

    __tablename__ = "tickets"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String)
    contact_name: Mapped[str] = mapped_column(String(100))
    contact_email: Mapped[str | None] = mapped_column(String(100))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    priority: Mapped[str] = mapped_column(String(20))
    task_type: Mapped[str | None] = mapped_column(String(50))
    visibility: Mapped[str | None] = mapped_column(String(50))
    verification_status: Mapped[str | None] = mapped_column(String(50))
    review_note: Mapped[str | None] = mapped_column(String)
    # Plural since feature 018 (ADR-246): one incident is routinely two disasters at once —
    # a typhoon brings 水災 and 土石流 to the same house — and the dynamic-field query is an
    # array intersection either way, so the singular column bought nothing.
    #
    # Values are keys from the `disaster_types` table, stored sorted and de-duplicated by
    # `app/core/disaster_types.py::normalize_disaster_types`. Sorted is load-bearing, not
    # tidiness: `ticket_analytics._duplicate_pair_condition` compares two tickets with `==`,
    # and PostgreSQL array equality is order-sensitive, so {flood,fire} and {fire,flood}
    # would otherwise read as different disasters.
    disaster_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default=text("'{}'"), default=list, nullable=False,
        comment="災害型別集合，參照 disaster_types.key；已排序去重",
    )
    # Reporter-supplied triage flags (feature 018). Nullable with no default: "nobody has
    # answered" and "the reporter said unknown" are different facts, and defaulting to
    # 'unknown' would erase the first. Neither is a medical or professional assessment —
    # they record what the person asking for help said, which is why they live on the ticket
    # rather than in the disaster-specific config.
    person_trapped_reported: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="災民受困／無法自行離開：yes/no/unknown"
    )
    immediate_danger_reported: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="立即生命危險：yes/no/unknown"
    )

    # Keyword-search column (ADR-079/081). contact_name / contact_email / contact_phone are
    # deliberately absent: they are masked per-field in the API, and letting them feed the
    # search index would make that masking meaningless — anyone could find a ticket by
    # typing its reporter's phone number.
    search_text: Mapped[str] = mapped_column(
        String,
        Computed(search_text_expression(plain("title"), truncated("description")), persisted=True),
        deferred=True,
    )

    __mapper_args__ = {
        "polymorphic_identity": "request",
    }

    __table_args__ = (search_text_index("tickets"),)
