from sqlalchemy import String, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.geo import BaseGeometry
from app.models.base import UUIDPKMixin, TimestampMixin, Base
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

    __mapper_args__ = {
        "polymorphic_identity": "request",
    }


class HRRequirement(Tickets):
    __tablename__ = "hr_requirements"
    uuid: Mapped[str] = mapped_column(ForeignKey("tickets.uuid"), primary_key=True)

    __mapper_args__ = {
        "polymorphic_identity": "hr_request",
    }


class SupplyRequirement(Tickets):
    __tablename__ = "supply_requirements"
    uuid: Mapped[str] = mapped_column(ForeignKey("tickets.uuid"), primary_key=True)

    __mapper_args__ = {
        "polymorphic_identity": "supply_request",
    }


class HRTaskSpecialty(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "hr_task_specialties"
    req_uuid: Mapped[str] = mapped_column(ForeignKey("hr_requirements.uuid"))
    specialty_description: Mapped[str] = mapped_column(String)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50))


class SupplyTaskItem(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "supply_task_items"
    req_uuid: Mapped[str] = mapped_column(ForeignKey("supply_requirements.uuid"))
    item_name: Mapped[str] = mapped_column(String(100))
    item_description: Mapped[Optional[str]] = mapped_column(String)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50))
    suggestion: Mapped[Optional[str]] = mapped_column(String)


class RequestPhoto(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "request_photos"
    req_uuid: Mapped[str] = mapped_column(ForeignKey("tickets.uuid"))
    url: Mapped[str] = mapped_column(String(500))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
