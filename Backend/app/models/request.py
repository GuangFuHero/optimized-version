"""SQLAlchemy model for support tickets (disaster relief requests)."""

from sqlalchemy import Computed, ForeignKey, String
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
    disaster_type: Mapped[str | None] = mapped_column(String(50))

    # Keyword-search column (ADR-079/081). contact_name / contact_email / contact_phone are
    # deliberately absent: they are masked per-field in the API, and letting them feed the
    # search index would make that masking meaningless — anyone could find a ticket by
    # typing its reporter's phone number.
    search_text: Mapped[str] = mapped_column(
        String,
        Computed(search_text_expression(plain("title"), truncated("description")), persisted=True),
    )

    __mapper_args__ = {
        "polymorphic_identity": "request",
    }

    __table_args__ = (search_text_index("tickets"),)
