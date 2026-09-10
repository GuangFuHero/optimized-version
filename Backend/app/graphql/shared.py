"""Shared GraphQL types reused across domains.

`SecondaryLocationInput` and its mapper live here rather than in `geo/types.py` because
feature 018 gave tickets an address too, and `geo/types.py` already imports `PhotoType` from
`tickets/types.py` — putting the input in either module makes the two import each other. Only
the *input* moved: `SecondaryLocationType`, the output, is still geo-only, since a ticket's
address is the reporter's home and exposing it needs a PII decision (ADR-146) that this
feature did not take.
"""

import enum

import strawberry


@strawberry.enum
class Visibility(enum.Enum):
    """How widely a record is shown. Shared by stations, tickets, and ticket tasks."""

    public = "public"
    restricted = "restricted"
    internal = "internal"


@strawberry.enum
class FieldDataType(enum.Enum):
    """How a dynamic field renders. Shared by the station, task and ticket config tables.

    Named after the widget rather than the storage type (feature 018, ADR-245). The old
    vocabulary (`String`/`Integer`/`Enum`/`Array`) described how a value might be stored, which
    was never useful here: ADR-092 means the backend does not validate a written value against
    its config at all, so the only consumer is the form deciding what control to draw.

    Two of the old names were actively misleading. `Array` did not say its values came from
    `enum_options`, and `Enum` did not say it was single-valued — so the pair that mattered
    most was the pair you could not tell apart. `single_select` / `multi_select` say it.
    `Decimal` was proposed and dropped: nothing distinguishes it from an integer when nothing
    validates, and `unit` carries the part that actually reaches the reporter (cm, mm).
    """

    text = "text"
    long_text = "long_text"
    number = "number"
    boolean = "boolean"
    single_select = "single_select"
    multi_select = "multi_select"


@strawberry.enum
class TriState(enum.Enum):
    """A reported yes / no / unknown answer.

    `unknown` is a real answer — "I looked and I cannot tell" — and is distinct from the
    column being NULL, which means nobody was asked. Used for the ticket triage flags and for
    most of the disaster-specific fields' `enum_options`.
    """

    yes = "yes"
    no = "no"
    unknown = "unknown"


@strawberry.type
class PageInfo:
    """Pagination metadata for list responses."""

    total_count: int = strawberry.field(
        description="Total number of matching records across all pages"
    )
    has_next_page: bool = strawberry.field(
        description="True if there are more records after the current page"
    )
    has_previous_page: bool = strawberry.field(
        description="True if there are records before the current page"
    )
@strawberry.enum
class AccessStatus(enum.Enum):
    """Whether a space can be entered right now.

    An observation at a moment in time, not a safety certification — `inaccessible` means the
    person looking could not get in, not that an engineer condemned it.
    """

    accessible = "accessible"
    restricted = "restricted"
    inaccessible = "inaccessible"
    unknown = "unknown"


@strawberry.input
class SecondaryLocationInput:
    """Input for attaching a secondary address or pole location to a station."""

    location_type: str = strawberry.field(
        default="address",
        description="Type of secondary location: 'address' (default) or 'pole'",
    )
    county: str | None = None
    city: str | None = None
    lane: str | None = None
    alley: str | None = None
    no: str | None = None
    building_section: str | None = strawberry.field(
        default=None, description="樓棟／區域, e.g. 'A棟'; leave empty if unknown"
    )
    floor: str | None = strawberry.field(
        default=None, description="Floor label: 'B1', '1F', 'RF'. Free text on purpose"
    )
    room: str | None = strawberry.field(default=None, description="房號／空間, e.g. '302', '樓梯間'")
    space_description: str | None = strawberry.field(
        default=None, description="空間描述, e.g. '三房兩廳'"
    )
    victim_space: str | None = strawberry.field(
        default=None, description="求救者所在空間, e.g. '主臥衣櫃'"
    )
    access_status: AccessStatus | None = strawberry.field(
        default=None, description="Whether the space can be entered right now"
    )
    landmark_note: str | None = strawberry.field(
        default=None, description="地標補充 — entrance, landmark, building, which side of the road"
    )
    pole_id: str | None = None
    pole_type: str | None = None
    pole_note: str | None = None

def secondary_location_to_dict(sl: SecondaryLocationInput) -> dict:
    """Flatten a SecondaryLocationInput into the kwargs the repository stores.

    One mapper rather than a dict literal per call site: `createStation`, `createTicket` and
    `updateTicket` all forward this input, and three hand-written literals is three chances
    for a newly added column to be silently dropped on two of them (feature 018). The enum is
    unwrapped here too — `GenericRepository.update` matches by `hasattr`, so an enum member
    would be stored as the member object rather than rejected.
    """
    return {
        "location_type": sl.location_type,
        "county": sl.county, "city": sl.city, "lane": sl.lane, "alley": sl.alley,
        "no": sl.no, "building_section": sl.building_section,
        "floor": sl.floor, "room": sl.room,
        "space_description": sl.space_description, "victim_space": sl.victim_space,
        "access_status": sl.access_status.value if sl.access_status else None,
        "landmark_note": sl.landmark_note,
        "pole_id": sl.pole_id, "pole_type": sl.pole_type, "pole_note": sl.pole_note,
    }
