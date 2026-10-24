"""Shared GraphQL types reused across domains.

`SecondaryLocationInput`, its output type and their mapper live here rather than in
`geo/types.py` because feature 018 gave tickets an address too, and `geo/types.py` already
imports `PhotoType` from `tickets/types.py` — leaving them in either module makes the two
import each other. A station's address stays public; a ticket's is gated on `ticket.view_pii`
at its own resolver (ADR-268).
"""

import enum
from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope


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

    total_count: int = strawberry.field(description="Total number of matching records across all pages")
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


@strawberry.type
class SecondaryLocationType:
    """GraphQL type for secondary address or pole location details."""

    uuid: UUID
    geometry_uuid: str = strawberry.field(
        description="UUID of the parent station or ticket this location belongs to"
    )
    location_type: str = strawberry.field(description="Type of secondary location: 'address' or 'pole'")
    full_address: str | None = strawberry.field(
        default=None,
        description=(
            "The whole address line, without floor or room: official when TGOS confirmed it, "
            "as typed otherwise"
        ),
    )
    county: str | None = strawberry.field(default=None, description="縣市, e.g. '花蓮縣'")
    town: str | None = strawberry.field(default=None, description="鄉鎮市區, e.g. '光復鄉'")
    village: str | None = strawberry.field(default=None, description="村里, e.g. '大進村'")
    neighborhood: str | None = strawberry.field(default=None, description="鄰, e.g. '3鄰'")
    road: str | None = strawberry.field(default=None, description="路／街／大道, e.g. '糖廠街'")
    section: str | None = strawberry.field(default=None, description="段, e.g. '一段'")
    lane: str | None = strawberry.field(default=None, description="巷, e.g. '469巷'")
    alley: str | None = strawberry.field(default=None, description="弄, e.g. '1弄'")
    no: str | None = strawberry.field(default=None, description="號, e.g. '19號' or '19之1號'")
    normalization_status: str | None = strawberry.field(
        default=None,
        description=(
            "'verified' (TGOS confirmed the address near the pin), 'pin_mismatch' (confirmed, but "
            "over 500 m from the pin) or 'unverified'; null when there is no address"
        ),
    )
    building_section: str | None = strawberry.field(
        default=None, description="樓棟／區域, e.g. 'A棟', '東翼'"
    )
    floor: str | None = strawberry.field(
        default=None, description="Floor label as spoken: 'B1', '1F', 'RF' — never coerced to a number"
    )
    room: str | None = strawberry.field(default=None, description="房號／空間, e.g. '302', '樓梯間'")
    space_description: str | None = strawberry.field(default=None, description="空間描述, e.g. '三房兩廳'")
    victim_space: str | None = strawberry.field(default=None, description="求救者所在空間, e.g. '主臥衣櫃'")
    access_status: str | None = strawberry.field(
        default=None,
        description=(
            "Whether the space can be entered: 'accessible', 'restricted', 'inaccessible', "
            "'unknown'. A current observation, not a safety certification"
        ),
    )
    landmark_note: str | None = strawberry.field(
        default=None,
        description="地標補充 — how to find the entrance when coordinates are not enough",
    )
    pole_id: str | None = strawberry.field(
        default=None,
        description="Utility pole identifier (only set when location_type is 'pole')",
    )
    pole_type: str | None = strawberry.field(
        default=None,
        description="Type of utility pole, e.g. '電線桿' (electricity pole), '電話線桿' (telephone pole)",
    )
    pole_note: str | None = strawberry.field(
        default=None, description="Additional notes about the pole location"
    )

    @classmethod
    def from_model(cls, m) -> "SecondaryLocationType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid,
            geometry_uuid=m.geometry_uuid,
            location_type=m.location_type,
            full_address=m.full_address,
            county=m.county,
            town=m.town,
            village=m.village,
            neighborhood=m.neighborhood,
            road=m.road,
            section=m.section,
            lane=m.lane,
            alley=m.alley,
            no=m.no,
            normalization_status=m.normalization_status,
            building_section=m.building_section,
            floor=m.floor,
            room=m.room,
            space_description=m.space_description,
            victim_space=m.victim_space,
            access_status=m.access_status,
            landmark_note=m.landmark_note,
            pole_id=m.pole_id,
            pole_type=m.pole_type,
            pole_note=m.pole_note,
        )


@strawberry.input
class SecondaryLocationInput:
    """Input for attaching a secondary address or pole location to a station."""

    location_type: str = strawberry.field(
        default="address",
        description="Type of secondary location: 'address' (default) or 'pole'",
    )
    full_address: str | None = strawberry.field(
        default=None,
        description=(
            "The address line, ideally exactly as normalizeAddress or reverseGeocode returned it. "
            "The backend splits it into county … no; a 樓/室 at its end fills floor and room when "
            "those are empty"
        ),
    )
    address_token: str | None = strawberry.field(
        default=None,
        description=(
            "The addressToken from the same lookup. With it, and fullAddress unchanged, the address "
            "is stored as verified; without it, as unverified"
        ),
    )
    building_section: str | None = strawberry.field(
        default=None, description="樓棟／區域, e.g. 'A棟'; leave empty if unknown"
    )
    floor: str | None = strawberry.field(
        default=None, description="Floor label: 'B1', '1F', 'RF'. Free text on purpose"
    )
    room: str | None = strawberry.field(default=None, description="房號／空間, e.g. '302', '樓梯間'")
    space_description: str | None = strawberry.field(default=None, description="空間描述, e.g. '三房兩廳'")
    victim_space: str | None = strawberry.field(default=None, description="求救者所在空間, e.g. '主臥衣櫃'")
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
        "full_address": sl.full_address,
        "address_token": sl.address_token,
        "building_section": sl.building_section,
        "floor": sl.floor,
        "room": sl.room,
        "space_description": sl.space_description,
        "victim_space": sl.victim_space,
        "access_status": sl.access_status.value if sl.access_status else None,
        "landmark_note": sl.landmark_note,
        "pole_id": sl.pole_id,
        "pole_type": sl.pole_type,
        "pole_note": sl.pole_note,
    }


@strawberry.type
class DuplicateSuspect:
    """One part of a submission that looks like something already there."""

    draft_ref: str = strawberry.field(
        description='Which part of what was sent: "task:0", "task:1"…, or "station"'
    )
    related_kind: str = strawberry.field(description='What it looks like: "ticket_task" or "station"')
    related_uuid: str = strawberry.field(description="The existing entity it looks like")
    related_ticket_uuid: str | None = strawberry.field(
        default=None, description="When it looks like a task, that task's ticket"
    )


@strawberry.type
class DuplicatesSuspected:
    """Nothing was created: these parts look like existing ones.

    Show them to the submitter. To create anyway, send the same input again with
    `acknowledgedDuplicateOf` set on each part the submitter confirmed is not a duplicate.
    """

    suspects: list[DuplicateSuspect]

    @classmethod
    def of(cls, suspects) -> "DuplicatesSuspected":
        """Build from the service's suspects."""
        return cls(
            suspects=[
                DuplicateSuspect(
                    draft_ref=s.draft_ref,
                    related_kind=s.related_kind,
                    related_uuid=s.related_uuid,
                    related_ticket_uuid=s.related_ticket_uuid,
                )
                for s in suspects
            ]
        )


@strawberry.type
class UserRefType:
    """A user shown beside content they wrote: their nickname, never their contacts."""

    uuid: str
    name: str | None = None


async def staff_user_ref(info: strawberry.types.Info, user_uuid, perm: Perm) -> UserRefType | None:
    """The user behind `user_uuid`, or None unless the caller holds `perm`; never raises."""
    viewer = info.context["user"]
    if user_uuid is None or viewer is None:
        return None
    scope = await resolve_scope(viewer, perm, info.context["db"], cache=info.context["_rbac_cache"])
    if scope == Scope.NONE:
        return None
    name = await info.context["loaders"]["user_name_by_uuid"].load(str(user_uuid))
    return UserRefType(uuid=str(user_uuid), name=name)
