from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.geo import BaseGeometry
from typing import Optional


class Tickets(BaseGeometry):
    __tablename__ = "tickets"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(String)
    contact_name: Mapped[str] = mapped_column(String(100))
    contact_email: Mapped[Optional[str]] = mapped_column(String(100))
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    priority: Mapped[str] = mapped_column(String(20))
    task_type: Mapped[Optional[str]] = mapped_column(String(50))
    visibility: Mapped[Optional[str]] = mapped_column(String(50))
    verification_status: Mapped[Optional[str]] = mapped_column(String(50))
    review_note: Mapped[Optional[str]] = mapped_column(String)

    __mapper_args__ = {
        "polymorphic_identity": "request",
    }
