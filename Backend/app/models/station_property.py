from sqlalchemy import String, Float, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import UUIDPKMixin, TimestampMixin, Base
from typing import Optional


class StationProperty(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "station_properties"
    station_uuid: Mapped[str] = mapped_column(ForeignKey("stations.uuid"))
    property_type: Mapped[str] = mapped_column(String(50))  # facility/supply/service
    property_name: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[Optional[int]] = mapped_column(Integer)
    comment: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    weightings: Mapped[float] = mapped_column(Float, default=1.0)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))

    station = relationship("Station", back_populates="properties")


class CrowdSourcing(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "crowd_sourcing"
    station_uuid: Mapped[str] = mapped_column(ForeignKey("stations.uuid"))
    item_uuid: Mapped[Optional[str]] = mapped_column(ForeignKey("station_properties.uuid"))
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    user_credibility_score: Mapped[float] = mapped_column(Float)
    rating: Mapped[str] = mapped_column(String(20))  # up/neutral/down
    n_updates: Mapped[int] = mapped_column(Integer, default=0)
    distance_from_geometry: Mapped[Optional[str]] = mapped_column(String)
