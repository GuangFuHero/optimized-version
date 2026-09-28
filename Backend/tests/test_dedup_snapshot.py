"""Backend → dedup contract conversion (Spec 020 §3, ADR-289/293/298).

The builder is the only place ORM rows and create inputs become snapshots, so these pin that a
ticket looks the same to the engine whether it is being submitted or already stored, and that
nothing outside the snapshot whitelist leaks through.
"""

import dataclasses
import os

os.environ["ENV"] = "testing"

from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon

from app.dedup_engine.contract import Candidate, GeoPoint, StationSnapshot, TicketSnapshot
from app.models.geo import Station
from app.models.request import Tickets
from app.services.dedup_snapshot import (
    same_contact_phone,
    station_snapshot,
    station_submission,
    ticket_snapshot,
    ticket_submission,
    to_candidate,
)
from app.services.station import StationFields
from app.services.ticket import TicketFields

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
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


def _ticket_row(**overrides) -> Tickets:
    values = TICKET_VALUES | overrides
    return Tickets(
        uuid="11111111-1111-1111-1111-111111111111",
        geometry=from_shape(Point(LON, LAT), srid=4326),
        created_at=NOW,
        status="pending",
        verification_status="unverified",
        **values,
    )


def _station_row(geometry=None, **overrides) -> Station:
    return Station(
        uuid="22222222-2222-2222-2222-222222222222",
        geometry=geometry if geometry is not None else from_shape(Point(LON, LAT), srid=4326),
        created_at=NOW,
        is_temporary=False,
        is_official=False,
        **(STATION_VALUES | overrides),
    )


# --- submission and stored ticket look alike --------------------------------------------


def test_ticket_submission_and_stored_ticket_agree():
    """Apart from uuid/status/verification/created_at, the engine sees the same ticket both ways."""
    submitted = ticket_submission(
        TicketFields(point=POINT, values=TICKET_VALUES, secondary_location=None), now=NOW
    )
    stored = ticket_snapshot(_ticket_row())
    assert submitted.uuid is None and submitted.status is None
    assert (stored.uuid, stored.status, stored.verification_status) == (
        "11111111-1111-1111-1111-111111111111",
        "pending",
        "unverified",
    )
    same = {"uuid": None, "status": None, "verification_status": None}
    assert dataclasses.replace(stored, **same) == submitted
    assert submitted.location == GeoPoint(LON, LAT)
    assert submitted.disaster_types == ("flood", "landslide")


def test_station_submission_and_stored_station_agree():
    """Same for stations; operational_status is known up front."""
    submitted = station_submission(
        StationFields(point=POINT, values=STATION_VALUES, secondary_location=None), now=NOW
    )
    stored = station_snapshot(_station_row())
    assert submitted.uuid is None
    assert dataclasses.replace(stored, uuid=None) == submitted
    assert (submitted.operational_status, submitted.is_official, submitted.level) == ("active", False, 2)


def test_a_new_station_is_not_official_or_temporary_until_stored_so():
    """Create input has no is_official/is_temporary/expires_at; the submission uses the column defaults."""
    submitted = station_submission(
        StationFields(point=POINT, values=STATION_VALUES, secondary_location=None), now=NOW
    )
    assert (submitted.is_temporary, submitted.expires_at, submitted.is_official) == (False, None, False)


def test_a_stored_station_that_is_not_a_point_uses_its_centroid():
    """The app only writes points (ADR-298); anything else reaching the table is measured from its centre."""
    square = from_shape(Polygon([(121.0, 23.0), (121.2, 23.0), (121.2, 23.2), (121.0, 23.2)]), srid=4326)
    location = station_snapshot(_station_row(geometry=square)).location
    assert (location.lon, location.lat) == pytest.approx((121.1, 23.1))


# --- the whitelist -----------------------------------------------------------------------


@pytest.mark.parametrize("snapshot_type", [TicketSnapshot, StationSnapshot])
def test_snapshots_hold_only_whitelisted_fields(snapshot_type):
    """Contact details and internal columns never reach the engine, whatever the row carries."""
    names = {f.name for f in dataclasses.fields(snapshot_type)}
    for leaked in ("contact_name", "contact_email", "contact_phone", "comment", "review_note", "visibility"):
        assert leaked not in names


# --- phone equality ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("0912-345-678", "+886912345678", True),  # formats differ, same number
        (" 0912345678 ", "0912 345 678", True),
        ("0912345678", "0987654321", False),
        ("0912345678", None, None),  # no number on one side: unavailable, not "different"
        (None, None, None),
        ("", "0912345678", None),
        ("not a phone", "0912345678", None),  # unparsable counts as unavailable
    ],
)
def test_same_contact_phone(a, b, expected):
    """Equality after E.164 normalization; None when either side has no usable number (ADR-293)."""
    assert same_contact_phone(a, b) is expected


def test_to_candidate_carries_the_pair_facts_but_not_the_phone():
    """The candidate knows distance and whether the phones match; the snapshot has no phone."""
    candidate = to_candidate(
        "ticket", _ticket_row(contact_phone="0912-345-678"), distance_m=12.5, submission_phone="+886912345678"
    )
    assert isinstance(candidate, Candidate)
    assert (candidate.distance_m, candidate.same_contact_phone) == (12.5, True)
    assert not hasattr(candidate.snapshot, "contact_phone")


def test_to_candidate_builds_station_snapshots():
    """`kind` picks the snapshot type."""
    candidate = to_candidate("station", _station_row(), distance_m=3.0, submission_phone=None)
    assert isinstance(candidate.snapshot, StationSnapshot)
    assert candidate.same_contact_phone is None
