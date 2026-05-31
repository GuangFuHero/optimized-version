"""SQLAlchemy model for support tickets (disaster relief requests)."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.geo import BaseGeometry


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

    __mapper_args__ = {
        "polymorphic_identity": "request",
    }
