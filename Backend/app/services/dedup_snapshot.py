"""Backend-side conversion into the dedup contract (Spec 020 §2). No scoring here.

`ticket_draft` / `station_draft` build ADR-304 drafts; the snapshot builders below them are
Phase 1's and go in plan Task 23.

Rows and validated create inputs become snapshots of raw facts; pair facts (distance, phone
equality) go on the Candidate. What stays out of a snapshot — contact details, internal notes,
visibility — is decided by the snapshot types themselves, so a column added to a model never
reaches the engine until someone adds it to the contract (ADR-289).
"""

from datetime import datetime

from geoalchemy2.shape import to_shape

from app.core.normalize import normalize_phone
from app.dedup_engine.contract import (
    Candidate,
    EntityKind,
    GeoPoint,
    StationDraft,
    StationSnapshot,
    TicketDraft,
    TicketSnapshot,
)
from app.models.geo import Station
from app.models.request import Tickets
from app.services.station import StationFields
from app.services.ticket import TicketFields


def ticket_submission(fields: TicketFields, *, now: datetime) -> TicketSnapshot:
    """The ticket being submitted: no uuid or status yet, created `now`."""
    lon, lat = fields.point["coordinates"][:2]
    v = fields.values
    return TicketSnapshot(
        uuid=None,
        location=GeoPoint(lon, lat),
        created_at=now,
        title=v["title"],
        description=v.get("description"),
        task_type=v.get("task_type"),
        priority=v.get("priority"),
        status=None,
        disaster_types=tuple(v.get("disaster_types") or ()),
        person_trapped_reported=v.get("person_trapped_reported"),
        immediate_danger_reported=v.get("immediate_danger_reported"),
    )


def ticket_snapshot(row: Tickets) -> TicketSnapshot:
    """A stored ticket."""
    return TicketSnapshot(
        uuid=str(row.uuid),
        location=_point_of(row.geometry),
        created_at=row.created_at,
        title=row.title,
        description=row.description,
        task_type=row.task_type,
        priority=row.priority,
        status=row.status,
        disaster_types=tuple(row.disaster_types or ()),
        person_trapped_reported=row.person_trapped_reported,
        immediate_danger_reported=row.immediate_danger_reported,
        verification_status=row.verification_status,
    )


def station_submission(fields: StationFields, *, now: datetime) -> StationSnapshot:
    """The station being registered. Create input sets none of is_temporary/expires_at/is_official."""
    lon, lat = fields.point["coordinates"][:2]
    v = fields.values
    return StationSnapshot(
        uuid=None,
        location=GeoPoint(lon, lat),
        created_at=now,
        name=v.get("name"),
        description=v.get("description"),
        type=v.get("type"),
        operational_status=v.get("operational_status"),
        op_hour=v.get("op_hour"),
        level=v.get("level") or 0,
        source=v.get("source"),
    )


def station_snapshot(row: Station) -> StationSnapshot:
    """A stored station."""
    return StationSnapshot(
        uuid=str(row.uuid),
        location=_point_of(row.geometry),
        created_at=row.created_at,
        name=row.name,
        description=row.description,
        type=row.type,
        operational_status=row.operational_status,
        is_temporary=bool(row.is_temporary),
        expires_at=row.expires_at,
        is_official=bool(row.is_official),
        op_hour=row.op_hour,
        level=row.level or 0,
        source=row.source,
    )


def ticket_draft(fields: TicketFields) -> TicketDraft:
    """What the ADR-304 engine is told about a ticket being submitted."""
    lon, lat = fields.point["coordinates"][:2]
    v = fields.values
    return TicketDraft(
        location=GeoPoint(lon, lat),
        title=v["title"],
        description=v.get("description"),
        task_type=v.get("task_type"),
        priority=v.get("priority"),
        disaster_types=tuple(v.get("disaster_types") or ()),
        person_trapped_reported=v.get("person_trapped_reported"),
        immediate_danger_reported=v.get("immediate_danger_reported"),
        contact_phone=e164_or_none(v.get("contact_phone")),
    )


def station_draft(fields: StationFields) -> StationDraft:
    """What the ADR-304 engine is told about a station being registered."""
    lon, lat = fields.point["coordinates"][:2]
    v = fields.values
    return StationDraft(
        location=GeoPoint(lon, lat),
        name=v.get("name"),
        description=v.get("description"),
        type=v.get("type"),
        operational_status=v.get("operational_status"),
        op_hour=v.get("op_hour"),
        level=v.get("level") or 0,
        source=v.get("source"),
        contact_phone=e164_or_none(v.get("contact_phone")),
    )


def e164_or_none(phone: str | None) -> str | None:
    """A phone in E.164, or None when there is none or it does not parse."""
    if not phone:
        return None
    try:
        return normalize_phone(phone)
    except ValueError:
        return None


def same_contact_phone(a: str | None, b: str | None) -> bool | None:
    """Whether two phones are the same number, or None when either has no usable one (ADR-293).

    Stored phones are only stripped, not E.164, so both sides are normalized here.
    """
    if not a or not b:
        return None
    try:
        return normalize_phone(a) == normalize_phone(b)
    except ValueError:
        return None


def to_candidate(
    kind: EntityKind, row: Tickets | Station, *, distance_m: float, submission_phone: str | None
) -> Candidate:
    """A stored entity as a candidate for the submission whose phone is `submission_phone`."""
    snapshot = ticket_snapshot(row) if kind == "ticket" else station_snapshot(row)
    return Candidate(
        snapshot=snapshot,
        distance_m=distance_m,
        same_contact_phone=same_contact_phone(submission_phone, row.contact_phone),
    )


def _point_of(geometry) -> GeoPoint:
    """A stored geometry as a point.

    Stations are always points via the app; anything else that reaches the table (a direct
    import) is measured from its centroid (ADR-298).
    """
    shape = to_shape(geometry)
    if shape.geom_type != "Point":
        shape = shape.centroid
    return GeoPoint(shape.x, shape.y)
