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
    # 棟／區域. Not covered by the Taiwanese postal grammar, which runs 號 → 樓 → 室 with no
    # slot for a building within a compound — but "A棟" is how a reporter actually locates
    # themselves in a housing estate, so it sits between 號 and 樓 here.
    building_section: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="樓棟／區域，例如 A棟、東翼；不知道可留空"
    )
    # Deliberately free text, not an integer: B1 / 1F / RF are what people say, and forcing a
    # number would lose the distinction between a basement and a roof.
    floor: Mapped[str | None] = mapped_column(String(20))
    room: Mapped[str | None] = mapped_column(String(20))
    # Feature 018 (ADR-249). Ticket-only in practice — a station has no trapped occupant —
    # but they live here rather than on `tickets` because they describe a place, and the
    # table already carries type-specific nullable columns (the `pole_*` set) on exactly
    # this precedent.
    space_description: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="空間描述，例如「三房兩廳」"
    )
    victim_space: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="求救者所在空間，例如「主臥衣櫃」"
    )
    # 當下觀察，不是安全鑑定：accessible / restricted / inaccessible / unknown.
    access_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="可否進入（當下觀察，非安全鑑定）"
    )
    # Free text describing the way in ("入口、地標、樓棟、道路側"), for when the coordinates
    # alone are not enough to find the door. PII: this is the 門牌-grade detail a pin does not
    # reveal, so it is masked like the rest of the address, not exposed under plain
    # `ticket.view`. Excluded from search_text for the same reason (ADR-079/146).
    landmark_note: Mapped[str | None] = mapped_column(
        String, nullable=True, comment="地標補充；座標不足時用來找到入口"
    )
    pole_id: Mapped[str | None] = mapped_column(String(50))
    pole_type: Mapped[str | None] = mapped_column(String(50))
    pole_photo_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("photos.uuid", ondelete="SET NULL"), nullable=True
    )
    pole_note: Mapped[str | None] = mapped_column(String)

    # Keyword-search column (ADR-079/081). Every address part is short, so nothing is
    # truncated. `pole_note` is excluded (free-text note), and so is the whole feature-018
    # set — `building_section` / `space_description` / `victim_space` / `access_status` /
    # `landmark_note` (ADR-250). Only stations are searchable through this column at all
    # (ADR-146), and describing which room a trapped person is hiding in is not something to
    # make findable by substring.
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
        deferred=True,
    )

    __table_args__ = (search_text_index("secondary_locations"),)
