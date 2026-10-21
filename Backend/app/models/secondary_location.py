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
    # The address split into its parts, each numbered one keeping its unit (3鄰, 一段, 469巷).
    # `full_address` is the whole line: official when TGOS confirmed it, as typed otherwise.
    full_address: Mapped[str | None] = mapped_column(String(255), comment="完整地址（不含樓、室）")
    county: Mapped[str | None] = mapped_column(String(50), comment="縣市")
    town: Mapped[str | None] = mapped_column(String(50), comment="鄉鎮市區")
    village: Mapped[str | None] = mapped_column(String(50), comment="村里")
    neighborhood: Mapped[str | None] = mapped_column(String(10), comment="鄰，例如 3鄰")
    road: Mapped[str | None] = mapped_column(String(100), comment="路／街／大道")
    section: Mapped[str | None] = mapped_column(String(10), comment="段，例如 一段")
    lane: Mapped[str | None] = mapped_column(String(20), comment="巷，例如 469巷")
    alley: Mapped[str | None] = mapped_column(String(20), comment="弄，例如 1弄")
    no: Mapped[str | None] = mapped_column(String(20), comment="號，例如 19號、19之1號")
    # verified / pin_mismatch / unverified, set from the address token on every write.
    normalization_status: Mapped[str | None] = mapped_column(
        String(20), comment="地址是否經 TGOS 確認：verified / pin_mismatch / unverified"
    )
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
    # but they describe a place, so they live here rather than on `tickets`, on the same
    # precedent as the type-specific `pole_*` set.
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
    # alone are not enough to find the door. On a ticket the whole row is PII and its resolver
    # withholds it without `ticket.view_pii` (ADR-268); on a station the address is public, as
    # it already is on the map. Excluded from search_text either way (ADR-079/146/250).
    landmark_note: Mapped[str | None] = mapped_column(
        String, nullable=True, comment="地標補充；座標不足時用來找到入口"
    )
    pole_id: Mapped[str | None] = mapped_column(String(50))
    pole_type: Mapped[str | None] = mapped_column(String(50))
    pole_photo_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("photos.uuid", ondelete="SET NULL"), nullable=True
    )
    pole_note: Mapped[str | None] = mapped_column(String)

    # Keyword search over the address from 縣市 to 室 plus the pole id, joined with no separator because
    # an address is typed as one string (光復鄉糖廠街); 村里, 鄰 and the free-text fields are left out.
    search_text: Mapped[str] = mapped_column(
        String,
        Computed(
            search_text_expression(
                plain("county"),
                plain("town"),
                plain("road"),
                plain("section"),
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
