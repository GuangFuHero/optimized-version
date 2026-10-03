"""SQLAlchemy models for station properties and crowd-sourcing entries."""

from datetime import datetime

from sqlalchemy import Computed, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.search import plain, search_text_index


class StationProperty(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a property (facility, supply, or service) belonging to a station."""

    __tablename__ = "station_properties"
    station_uuid: Mapped[str] = mapped_column(ForeignKey("stations.uuid"), index=True)
    property_type: Mapped[str] = mapped_column(String(50))  # facility/supply/service
    property_name: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    weightings: Mapped[float] = mapped_column(Float, default=1.0)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))

    # Keyword-search column (ADR-079/081). Searching "發電機" should find the stations that
    # have one — this is the highest-value search target in the system. `comment` is
    # excluded (free-text notes).
    search_text: Mapped[str] = mapped_column(
        String, Computed(plain("property_name"), persisted=True), deferred=True
    )

    station = relationship("Station", back_populates="properties")

    __table_args__ = (search_text_index("station_properties"),)


class StationUpdateSuggestion(Base, UUIDPKMixin, TimestampMixin):
    """A user's suggestion to change one field of a station or a station property.

    Polymorphic target (like ``photos.ref_type``/``ref_uuid``): ``target_type`` selects
    the table and ``target_uuid`` the row. ``new_value`` is stored as text. A reviewer decides
    every pending row on a field at once through a merge, which sets ``merge_uuid``; a revoked
    merge moves its approved rows to ``revoked``.
    """

    __tablename__ = "station_update_suggestions"
    target_type: Mapped[str] = mapped_column(String(20))  # station/station_property
    target_uuid: Mapped[str] = mapped_column(String)  # no FK — polymorphic target
    field_name: Mapped[str] = mapped_column(String(100))
    new_value: Mapped[str] = mapped_column(String)
    comment: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected/revoked
    review_note: Mapped[str | None] = mapped_column(String)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    merge_uuid: Mapped[str | None] = mapped_column(ForeignKey("station_suggestion_merges.uuid"))

    __table_args__ = (
        # The public pending-field lookup runs on every station list, so it gets its own index.
        Index(
            "ix_station_update_suggestions_pending", "target_uuid",
            postgresql_where=text("status = 'pending'"),
        ),
        # One open suggestion per person per field: resubmitting updates it instead.
        Index(
            "uq_station_update_suggestions_pending_author", "created_by", "target_uuid", "field_name",
            unique=True, postgresql_where=text("status = 'pending'"),
        ),
    )


class StationSuggestionMerge(Base, UUIDPKMixin, TimestampMixin):
    """One reviewer decision that applied suggested values to a station and its properties.

    ``changes`` holds ``{target_type, target_uuid, field_name, before, after}`` for each applied
    field, which is what a revoke writes back. Status is ``applied`` or ``revoked``.
    """

    __tablename__ = "station_suggestion_merges"
    station_uuid: Mapped[str] = mapped_column(ForeignKey("stations.uuid"), index=True)
    changes: Mapped[list] = mapped_column(JSONB, default=list)
    review_note: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="applied")
    reviewed_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    revoked_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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
