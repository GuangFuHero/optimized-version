from sqlalchemy import String, ForeignKey, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import UUIDPKMixin, TimestampMixin, Base
from typing import Optional


class BaseGeometry(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "base_geometries"
    # 用於繼承鑑別
    property_name: Mapped[str] = mapped_column(String(50))

    geometry: Mapped[Optional[str]] = mapped_column(String, comment="WKT/geo-binary placeholder")
    created_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.uuid"))

    # 地址資訊
    county: Mapped[Optional[str]] = mapped_column(String(50))
    city: Mapped[Optional[str]] = mapped_column(String(50))
    lane: Mapped[Optional[str]] = mapped_column(String(20))
    alley: Mapped[Optional[str]] = mapped_column(String(20))
    no: Mapped[Optional[str]] = mapped_column(String(20))
    floor: Mapped[Optional[str]] = mapped_column(String(20))
    room: Mapped[Optional[str]] = mapped_column(String(20))

    __mapper_args__ = {
        "polymorphic_on": property_name,
        "polymorphic_identity": "base",
    }


class ClosureArea(BaseGeometry):
    __tablename__ = "closure_areas"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    status: Mapped[str] = mapped_column(String(50))
    information_source: Mapped[Optional[str]] = mapped_column(String)
    comment: Mapped[Optional[str]] = mapped_column(String)

    __mapper_args__ = {
        "polymorphic_identity": "closure_area",
    }


class Station(BaseGeometry):
    __tablename__ = "stations"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    op_hour: Mapped[Optional[str]] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(default=0)
    comment: Mapped[Optional[str]] = mapped_column(String)

    __mapper_args__ = {
        "polymorphic_identity": "station",
    }

    properties: Mapped[list["StationProperty"]] = relationship(back_populates="station")
