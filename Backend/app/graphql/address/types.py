"""GraphQL types for address normalization and reference-data import status."""

from datetime import datetime

import strawberry

from app.services.address import NormalizedAddress, Suggestion


@strawberry.input
class NormalizeAddressInput:
    """Input for `normalizeAddress` — text, a coordinate, or both.

    Supplying both is the strongest mode: it is the only one that can report `pin_mismatch`,
    because it is the only one with two independent statements of where the place is.
    """

    raw: str | None = strawberry.field(
        default=None,
        description="Full address as typed, e.g. '花蓮縣光復鄉中興路10號'",
    )
    lat: float | None = strawberry.field(default=None, description="Latitude (WGS84)")
    lng: float | None = strawberry.field(default=None, description="Longitude (WGS84)")
    limit: int = strawberry.field(
        default=5, description="Max suggestions when resolving from a coordinate (clamped to 1–50)"
    )


@strawberry.type
class AddressSuggestionType:
    """One candidate address near the supplied coordinate, nearest first."""

    formatted: str
    county: str | None = None
    town: str | None = None
    village: str | None = None
    road: str | None = None
    section: str | None = None
    lane: str | None = None
    alley: str | None = None
    no: str | None = None
    distance_m: float | None = strawberry.field(
        default=None, description="Metres from the supplied coordinate"
    )

    @classmethod
    def from_service(cls, s: Suggestion) -> "AddressSuggestionType":
        """Build from a service-layer Suggestion."""
        p = s.parts
        return cls(
            formatted=s.formatted,
            county=p.county,
            town=p.town,
            village=p.village,
            road=p.road,
            section=p.section,
            lane=p.lane,
            alley=p.alley,
            no=p.no,
            distance_m=s.distance_m,
        )


@strawberry.type
class NormalizedAddressType:
    """A normalized address plus how far up the validation ladder it got."""

    normalizable: bool = strawberry.field(
        description="False when the input could not be resolved at all — NOT an error; read `issues`"
    )
    status: str = strawberry.field(description="'verified' | 'corrected' | 'unverified' | 'pin_mismatch'")
    formatted: str | None = strawberry.field(
        default=None, description="Canonical single-line address, e.g. '花蓮縣光復鄉大全村中興路10號'"
    )
    county: str | None = None
    town: str | None = strawberry.field(default=None, description="鄉鎮市區")
    village: str | None = strawberry.field(default=None, description="村里")
    road: str | None = None
    section: str | None = strawberry.field(default=None, description="段")
    lane: str | None = strawberry.field(default=None, description="巷")
    alley: str | None = strawberry.field(default=None, description="弄")
    no: str | None = strawberry.field(default=None, description="號")
    floor: str | None = strawberry.field(default=None, description="樓")
    room: str | None = strawberry.field(default=None, description="室")
    lat: float | None = None
    lng: float | None = None
    distance_m: float | None = strawberry.field(
        default=None, description="Metres between the supplied pin and the matched address point"
    )
    issues: list[str] = strawberry.field(
        default_factory=list,
        description="Human-readable reasons the status is not 'verified'; empty when it is",
    )
    suggestions: list[AddressSuggestionType] = strawberry.field(default_factory=list)

    @classmethod
    def from_service(cls, r: NormalizedAddress) -> "NormalizedAddressType":
        """Build from a service-layer NormalizedAddress."""
        p = r.parts
        return cls(
            normalizable=r.normalizable,
            status=r.status,
            formatted=r.formatted,
            county=p.county,
            town=p.town,
            village=p.village,
            road=p.road,
            section=p.section,
            lane=p.lane,
            alley=p.alley,
            no=p.no,
            floor=p.floor,
            room=p.room,
            lat=r.lat,
            lng=r.lng,
            distance_m=r.distance_m,
            issues=r.issues,
            suggestions=[AddressSuggestionType.from_service(s) for s in r.suggestions],
        )


@strawberry.type
class ReferenceDatasetType:
    """Import state of one reference dataset.

    The import runs detached from the deploy, so a client should read this before offering
    address suggestions — `status != 'ready'` means normalization will degrade, not fail.
    """

    name: str = strawberry.field(description="'ref_roads' | 'ref_villages' | 'osm_address_points'")
    status: str = strawberry.field(description="'pending' | 'downloading' | 'importing' | 'ready' | 'failed'")
    source_version: str | None = None
    row_count: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None

    @classmethod
    def from_model(cls, m) -> "ReferenceDatasetType":
        """Build from a SQLAlchemy ReferenceDataset row."""
        return cls(
            name=m.name,
            status=m.status,
            source_version=m.source_version,
            row_count=m.row_count,
            started_at=m.started_at,
            finished_at=m.finished_at,
            error=m.error,
        )
