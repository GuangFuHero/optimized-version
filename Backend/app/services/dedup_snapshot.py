"""Validated create input → the drafts the dedup engine is told about (Spec 020 §2, ADR-304).

No scoring and no candidates here: the engine finds those itself. Drafts carry the whitelisted
facts of what is being submitted; names, emails and internal fields stay behind, and phones go
over in E.164 (or not at all).
"""

from app.core.normalize import normalize_phone
from app.dedup_engine.contract import GeoPoint, StationDraft, TaskDraft, TicketDraft
from app.services.station import StationFields
from app.services.ticket import TaskFields, TicketFields


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


def task_draft(fields: TaskFields) -> TaskDraft:
    """What the ADR-304 engine is told about a task being submitted. Its location is its ticket's."""
    v = fields.values
    return TaskDraft(
        task_type=v["task_type"],
        task_name=v["task_name"],
        task_description=v.get("task_description"),
        quantity=v.get("quantity"),
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
