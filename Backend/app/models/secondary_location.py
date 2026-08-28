"""SQLAlchemy model for secondary address and pole location details linked to a geometry."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class SecondaryLocation(Base, UUIDPKMixin):
    """ORM model for a secondary address or pole location linked to a geometry."""

    __tablename__ = "secondary_locations"
    geometry_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
    location_type: Mapped[str] = mapped_column(String(50))  # address/pole
    # Address components, all folded (app.core.address.fold) so they match the reference tables.
    # `town` replaced the old ambiguous `city` column, which never said whether it held 縣市 or
    # 鄉鎮市區; county/town/village/road/section is the actual shape of a Taiwanese address.
    county: Mapped[str | None] = mapped_column(String(50))
    town: Mapped[str | None] = mapped_column(String(50))
    village: Mapped[str | None] = mapped_column(String(50))
    road: Mapped[str | None] = mapped_column(String(100))
    section: Mapped[str | None] = mapped_column(String(10))
    lane: Mapped[str | None] = mapped_column(String(20))
    alley: Mapped[str | None] = mapped_column(String(20))
    no: Mapped[str | None] = mapped_column(String(20))
    floor: Mapped[str | None] = mapped_column(String(20))
    room: Mapped[str | None] = mapped_column(String(20))
    # Canonical single-line rendering of the components above, as normalized at submission time.
    # Stored rather than derived so exports and future dedupe have one indexable string, and so
    # the record shows what was actually confirmed rather than what today's formatter would emit.
    formatted: Mapped[str | None] = mapped_column(String(255))
    # verified | corrected | unverified | pin_mismatch — how far up the ladder this address got.
    # Never a rejection: only an unparseable address is refused, and that never reaches the DB.
    normalization_status: Mapped[str | None] = mapped_column(String(20))
    pole_id: Mapped[str | None] = mapped_column(String(50))
    pole_type: Mapped[str | None] = mapped_column(String(50))
    pole_photo_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("photos.uuid", ondelete="SET NULL"), nullable=True
    )
    pole_note: Mapped[str | None] = mapped_column(String)
