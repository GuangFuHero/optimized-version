"""SQLAlchemy model for secondary address and pole location details linked to a geometry."""

from sqlalchemy import Computed, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin
from app.models.search import plain, search_text_expression, search_text_index


class SecondaryLocation(Base, UUIDPKMixin):
    """ORM model for a secondary address or pole location linked to a geometry."""

    __tablename__ = "secondary_locations"
    geometry_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), index=True)
    location_type: Mapped[str] = mapped_column(String(50))  # address/pole
    county: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str | None] = mapped_column(String(50))
    # NOTE: these two columns are named after 巷/弄 but hold something else in practice —
    # `lane` carries the road/street name (路/街) and `alley` carries 巷弄. Do not "fix" the
    # data to match the names; downstream address rendering relies on the actual usage.
    lane: Mapped[str | None] = mapped_column(
        String(20), comment="路／街名（road）——欄位名為 lane，但實際存路名，非巷"
    )
    alley: Mapped[str | None] = mapped_column(
        String(20), comment="巷弄——欄位名為 alley，但實際存巷弄"
    )
    no: Mapped[str | None] = mapped_column(String(20))
    floor: Mapped[str | None] = mapped_column(String(20))
    room: Mapped[str | None] = mapped_column(String(20))
    pole_id: Mapped[str | None] = mapped_column(String(50))
    pole_type: Mapped[str | None] = mapped_column(String(50))
    pole_photo_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("photos.uuid", ondelete="SET NULL"), nullable=True
    )
    pole_note: Mapped[str | None] = mapped_column(String)

    # Keyword-search column (ADR-079/081). Every address part is short, so nothing is
    # truncated. `pole_note` is excluded (free-text note).
    #
    # separator="" (ADR-155): a Chinese address is one continuous string — nobody types
    # "光復鄉 中正路". With the default space separator the stored value would be
    # "花蓮縣 光復鄉 中正路 …" and the contiguous ILIKE '%光復鄉中正路%' could never match,
    # which is exactly the cross-field case ADR-081 exists for.
    search_text: Mapped[str] = mapped_column(
        String,
        Computed(
            search_text_expression(
                plain("county"),
                plain("city"),
                plain("lane"),
                plain("alley"),
                plain("no"),
                plain("floor"),
                plain("room"),
                plain("pole_id"),
                separator="",
            ),
            persisted=True,
        ),
    )

    __table_args__ = (search_text_index("secondary_locations"),)
