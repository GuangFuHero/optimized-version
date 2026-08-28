"""Reference data for address normalization, plus the import job's status row.

These four tables are **not** application data: nothing here has a `created_by`, an owning team,
or a soft-delete column, and no user action writes to them. They are populated exclusively by
`scripts/import_reference_data.py` from published open data, and are wiped and reloaded whole.
That is also why they carry no RBAC scope — see `app/graphql/address/queries.py`.

Every text column is stored **folded** (`app.core.address.fold`): NFKC, whitespace stripped,
臺 → 台. Matching only works because the import applies the same fold the query path does.
"""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, Index, Integer, PrimaryKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RefRoad(Base):
    """Every road name in Taiwan, from 內政部戶政司 全國路名資料 (data.gov.tw dataset 35321).

    Authoritative and complete (~35.8k rows over 361 towns), which is what lets validation say
    "this road does not exist" rather than only "OpenStreetMap has not mapped it".
    """

    __tablename__ = "ref_roads"
    county: Mapped[str] = mapped_column(String(50))
    town: Mapped[str] = mapped_column(String(50))
    road: Mapped[str] = mapped_column(String(100))

    __table_args__ = (
        PrimaryKeyConstraint("county", "town", "road"),
        # Trigram index for the fuzzy fallback that turns a typo into a "corrected" status.
        # Needs pg_trgm — created by the migration and by tests/conftest.py.
        Index(
            "ix_ref_roads_road_trgm",
            "road",
            postgresql_using="gin",
            postgresql_ops={"road": "gin_trgm_ops"},
        ),
    )


class RefVillage(Base):
    """Every 村里 polygon in Taiwan, from 內政部 村里界圖 TWD97經緯度 (data.gov.tw dataset 7438).

    The only source with 100% coverage of where a coordinate *is*, so it is what guarantees a pin
    always resolves to at least 縣市/鄉鎮市區/村里 even where no address point exists.
    """

    __tablename__ = "ref_villages"
    villcode: Mapped[str] = mapped_column(String(16), primary_key=True)
    county: Mapped[str] = mapped_column(String(50))
    town: Mapped[str] = mapped_column(String(50))
    # Nullable: 連江縣南竿鄉 publishes a village polygon with an empty VILLNAME, and dropping
    # it would put a hole in the one dataset whose job is complete positional coverage.
    village: Mapped[str | None] = mapped_column(String(50))
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326))

    __table_args__ = (
        Index("ix_ref_villages_geom", "geom", postgresql_using="gist"),
        Index("ix_ref_villages_town", "county", "town"),
    )


class OsmAddressPoint(Base):
    """Address points carrying `addr:housenumber`, from the Geofabrik Taiwan OSM extract.

    The only free source of 路 + 號 for a coordinate, and denser than expected: a real import
    loads ~9.2M nodes nationwide, against the government's own count of roughly 8M 門牌. Note
    that only about half are distinct addresses (8.86M with a road → 4.46M unique), because OSM
    carries separate nodes for entrances, floors and units — callers that show a list must
    deduplicate.

    Coverage is nevertheless not guaranteed, and a miss means "unverified", never "this address
    does not exist": `ref_villages` is the fallback with complete positional coverage.
    """

    __tablename__ = "osm_address_points"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    geom = mapped_column(Geometry("POINT", srid=4326))
    county: Mapped[str | None] = mapped_column(String(50))
    town: Mapped[str | None] = mapped_column(String(50))
    village: Mapped[str | None] = mapped_column(String(50))
    road: Mapped[str | None] = mapped_column(String(100))
    section: Mapped[str | None] = mapped_column(String(10))
    lane: Mapped[str | None] = mapped_column(String(20))
    alley: Mapped[str | None] = mapped_column(String(20))
    no: Mapped[str | None] = mapped_column(String(20))

    __table_args__ = (
        # KNN (`geom <-> :point`) for the reverse lookup...
        Index("ix_osm_address_points_geom", "geom", postgresql_using="gist"),
        # ...and an exact lookup for "does this typed 號 exist on this road".
        Index("ix_osm_address_points_addr", "county", "town", "road", "no"),
    )


class ReferenceDataset(Base):
    """Import status for one reference dataset — the state behind the `referenceData` query.

    The import is a detached one-off container that outlives the deploy that launched it
    (see DEPLOY.md step 8), so its progress has to live somewhere queryable rather than in the
    deploy log. `source_version` is the upstream's own version marker (an HTTP Last-Modified or
    a dataset resource id) and is what makes a re-run a no-op instead of a redownload.
    """

    __tablename__ = "reference_datasets"
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    source_version: Mapped[str | None] = mapped_column(String(64))
    row_count: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
