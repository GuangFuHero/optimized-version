"""Validated create input → dedup drafts (Spec 020 §2, ADR-304).

The drafts are all the engine learns about what is being submitted, so these pin that the facts
come through, phones arrive in E.164 or not at all, and nothing outside the whitelist leaks.
"""

import dataclasses
import os

os.environ["ENV"] = "testing"

import pytest

from app.dedup_engine.contract import GeoPoint, StationDraft, TaskDraft, TicketDraft
from app.services.station import StationFields
from app.services.ticket import TicketFields

LON, LAT = 121.5601, 23.6701
POINT = {"type": "Point", "coordinates": [LON, LAT]}

TICKET_VALUES = {
    "title": "民生街三段淹水需要抽水機",
    "description": "一樓積水",
    "contact_name": "王小明",
    "contact_email": "a@example.com",
    "contact_phone": "0912345678",
    "priority": "high",
    "task_type": "rescue",
    "visibility": "public",
    "disaster_types": ["flood", "landslide"],
    "person_trapped_reported": "yes",
    "immediate_danger_reported": "no",
}
STATION_VALUES = {
    "type": "shelter",
    "name": "光復國小臨時收容所",
    "description": "可收容 200 人",
    "op_hour": "24h",
    "level": 2,
    "comment": "內部備註",
    "source": "manual",
    "visibility": "public",
    "contact_name": "李主任",
    "contact_email": None,
    "contact_phone": "0912345678",
    "operational_status": "active",
}


def test_ticket_draft_from_validated_fields():
    """What the engine is told about a ticket being submitted: facts, phone in E.164, no names."""
    from app.services.dedup_snapshot import ticket_draft

    draft = ticket_draft(
        TicketFields(
            point=POINT, values=TICKET_VALUES | {"contact_phone": "0912-345-678"}, secondary_location=None
        )
    )
    assert draft == TicketDraft(
        location=GeoPoint(LON, LAT),
        title="民生街三段淹水需要抽水機",
        description="一樓積水",
        task_type="rescue",
        priority="high",
        disaster_types=("flood", "landslide"),
        person_trapped_reported="yes",
        immediate_danger_reported="no",
        contact_phone="+886912345678",
    )


@pytest.mark.parametrize("phone", [None, "", "not a phone"])
def test_an_unusable_phone_reaches_the_engine_as_none(phone):
    """Missing or unparsable is unavailable, never a raw string."""
    from app.services.dedup_snapshot import station_draft, ticket_draft

    fields = TicketFields(
        point=POINT, values=TICKET_VALUES | {"contact_phone": phone}, secondary_location=None
    )
    assert ticket_draft(fields).contact_phone is None
    station = StationFields(
        point=POINT, values=STATION_VALUES | {"contact_phone": phone}, secondary_location=None
    )
    assert station_draft(station).contact_phone is None


def test_station_draft_from_validated_fields():
    """Stations: the same idea."""
    from app.services.dedup_snapshot import station_draft

    draft = station_draft(StationFields(point=POINT, values=STATION_VALUES, secondary_location=None))
    assert draft == StationDraft(
        location=GeoPoint(LON, LAT),
        name="光復國小臨時收容所",
        description="可收容 200 人",
        type="shelter",
        operational_status="active",
        op_hour="24h",
        level=2,
        source="manual",
        contact_phone="+886912345678",
    )


def test_task_draft_from_validated_fields():
    """A task draft carries the task's own facts; its location is the ticket's, known elsewhere."""
    from app.services.dedup_snapshot import task_draft
    from app.services.ticket import TaskFields

    values = {"task_type": "rescue", "task_name": "抽水", "task_description": "一樓", "quantity": 3,
              "source": "user", "visibility": "public", "route_uuid": None}  # fmt: skip
    assert task_draft(TaskFields(values=values)) == TaskDraft(
        task_type="rescue", task_name="抽水", task_description="一樓", quantity=3
    )


@pytest.mark.parametrize("draft_type", [TicketDraft, TaskDraft, StationDraft])
def test_drafts_hold_only_whitelisted_fields(draft_type):
    """Names, emails and internal columns never reach the engine."""
    names = {f.name for f in dataclasses.fields(draft_type)}
    for leaked in ("contact_name", "contact_email", "comment", "review_note", "visibility", "created_by"):
        assert leaked not in names
