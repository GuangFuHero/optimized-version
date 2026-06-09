"""SQLAlchemy models for station properties and crowd-sourcing entries."""

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class StationProperty(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a property (facility, supply, or service) belonging to a station."""

    __tablename__ = "station_properties"
    station_uuid: Mapped[str] = mapped_column(ForeignKey("stations.uuid"))
    property_type: Mapped[str] = mapped_column(String(50))  # facility/supply/service
    property_name: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    weightings: Mapped[float] = mapped_column(Float, default=1.0)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))

    station = relationship("Station", back_populates="properties")


class StationUpdateSuggestion(Base, UUIDPKMixin, TimestampMixin):
    """A user's suggestion to change one field of a station or a station property.

    Polymorphic target (like ``photos.ref_type``/``ref_uuid``): ``target_type`` selects
    the table and ``target_uuid`` the row. ``new_value`` is stored as text and coerced to
    the field's data type when an admin approves. Approval applies the change to the target
    and sets ``status="approved"``; rejection sets ``status="rejected"`` and leaves it untouched.
    """

    __tablename__ = "station_update_suggestions"
    target_type: Mapped[str] = mapped_column(String(20))  # station/station_property
    target_uuid: Mapped[str] = mapped_column(String)  # no FK — polymorphic target
    field_name: Mapped[str] = mapped_column(String(100))
    new_value: Mapped[str] = mapped_column(String)
    comment: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected
    review_note: Mapped[str | None] = mapped_column(String)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))


class CrowdSourcing(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a crowd-sourced rating of a station property by a user."""

    __tablename__ = "crowd_sourcing"
    station_uuid: Mapped[str] = mapped_column(ForeignKey("stations.uuid"))
    item_uuid: Mapped[str | None] = mapped_column(ForeignKey("station_properties.uuid"))
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    user_credibility_score: Mapped[float] = mapped_column(Float)
    rating: Mapped[str] = mapped_column(String(20))  # up/neutral/down
    n_updates: Mapped[int] = mapped_column(Integer, default=0)
    distance_from_geometry: Mapped[float | None] = mapped_column(Float)
