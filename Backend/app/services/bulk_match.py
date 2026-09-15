"""Match an imported row against existing data (feature 015, ADR-107/113).

Matching is on natural columns, not uuid: an external roster never carries one. The cost is
that none of those columns is unique in the database, so "matched two rows" is a real and
expected outcome — it fails that row rather than picking one (ADR-113).

The whole file is matched against one in-memory index built by a single query, instead of a
query per row. Normalization (full-width folding, case, phone shape) then has exactly one
implementation, in Python, rather than one here and a different one in SQL.
"""

import re
import unicodedata
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.normalize import normalize_phone
from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TicketTask

MATCHED = "matched"
NO_MATCH = "no_match"
AMBIGUOUS = "ambiguous"

_WHITESPACE = re.compile(r"\s+")
_NON_DIGIT = re.compile(r"\D")


@dataclass(frozen=True)
class Match:
    """The outcome of matching one row: update it, create it, or refuse to guess."""

    kind: str
    uuid: str | None = None
    candidates: tuple[str, ...] = ()


NO_MATCH_RESULT = Match(kind=NO_MATCH)


def normalize_text(value: str | None) -> str:
    """Fold a name or title to its comparison form.

    NFKC first, so a full-width "光復國小" typed on one keyboard matches the half-width one
    typed on another; then whitespace collapsed and case folded.
    """
    if not value:
        return ""
    folded = unicodedata.normalize("NFKC", str(value)).strip()
    return _WHITESPACE.sub(" ", folded).casefold()


def normalize_phone_key(value: str | None) -> str:
    """Fold a phone to its comparison form, tolerating what is already in the database.

    `contact_phone` is stored exactly as it was typed — `create_ticket` never normalizes it —
    so the same number can sit in the table as `0912345678` and arrive in a file as
    `+886 912 345 678`. E.164 is tried first; anything the parser rejects falls back to its
    digits, which still makes the two forms above agree.
    """
    if not value:
        return ""
    try:
        return normalize_phone(str(value))
    except ValueError:
        digits = _NON_DIGIT.sub("", str(value))
        return digits or normalize_text(value)


@dataclass(frozen=True)
class MatchIndex:
    """Existing rows grouped by their match key, built once per import."""

    by_key: dict[tuple, list[str]] = field(default_factory=dict)

    def register(self, key: tuple, uuid: str) -> None:
        """Record a row this import just created, so later rows in the same file find it.

        One ticket legitimately appears on several lines — one per task (ADR-120) — and the
        index was built before any of them ran. Without this the second line would create a
        second ticket carrying the same match key.
        """
        self.by_key.setdefault(key, []).append(uuid)

    def look_up(self, key: tuple) -> Match:
        """Return the single match for `key`, or a no-match/ambiguous verdict."""
        candidates = self.by_key.get(key, [])
        if not candidates:
            return NO_MATCH_RESULT
        if len(candidates) > 1:
            return Match(kind=AMBIGUOUS, candidates=tuple(candidates))
        return Match(kind=MATCHED, uuid=candidates[0])


def station_key(name: str | None, county: str | None, city: str | None) -> tuple:
    """The station match key: name plus the county/city of its address (ADR-107)."""
    return (normalize_text(name), normalize_text(county), normalize_text(city))


def ticket_key(title: str | None, phone: str | None) -> tuple:
    """The ticket match key: title plus contact phone (ADR-107)."""
    return (normalize_text(title), normalize_phone_key(phone))


def task_key(task_type: str | None, task_name: str | None) -> tuple:
    """The task match key, scoped to the ticket it was found under (ADR-107/120)."""
    return (normalize_text(task_type), normalize_text(task_name))


async def build_station_index(db: AsyncSession) -> MatchIndex:
    """Index every live station by (name, county, city).

    The address is LEFT JOINed: a station with no `secondary_locations` row indexes with
    blank county/city, which is exactly what a file that leaves those columns empty produces.
    Legacy rows with no address are therefore still reachable — see the known risk in the
    spec, they are only unreachable when the file *does* carry an address.
    """
    rows = (
        await db.execute(
            select(Station.uuid, Station.name, SecondaryLocation.county, SecondaryLocation.city)
            .outerjoin(
                SecondaryLocation,
                (SecondaryLocation.geometry_uuid == Station.uuid)
                & (SecondaryLocation.location_type == "address"),
            )
            .where(Station.delete_at.is_(None))
        )
    ).all()

    index: dict[tuple, list[str]] = {}
    for uuid, name, county, city in rows:
        index.setdefault(station_key(name, county, city), []).append(str(uuid))
    return MatchIndex(by_key=index)


async def build_ticket_index(db: AsyncSession) -> MatchIndex:
    """Index every live ticket by (title, contact_phone).

    Not narrowed by task type: the key says nothing about tasks, and narrowing would let the
    same ticket be created twice by two type-specific imports.
    """
    rows = (
        await db.execute(
            select(Tickets.uuid, Tickets.title, Tickets.contact_phone).where(
                Tickets.delete_at.is_(None)
            )
        )
    ).all()

    index: dict[tuple, list[str]] = {}
    for uuid, title, phone in rows:
        index.setdefault(ticket_key(title, phone), []).append(str(uuid))
    return MatchIndex(by_key=index)


async def match_task(db: AsyncSession, *, ticket_uuid: str, task_type: str, task_name: str) -> Match:
    """Match one task under an already-matched ticket (ADR-120)."""
    rows = (
        await db.execute(
            select(TicketTask.uuid, TicketTask.task_type, TicketTask.task_name).where(
                TicketTask.ticket_uuid == ticket_uuid, TicketTask.delete_at.is_(None)
            )
        )
    ).all()

    wanted = task_key(task_type, task_name)
    candidates = [str(uuid) for uuid, a_type, a_name in rows if task_key(a_type, a_name) == wanted]
    return MatchIndex(by_key={wanted: candidates}).look_up(wanted)


def duplicate_key_rows(keys: list[tuple]) -> dict[int, tuple[int, ...]]:
    """Map each row index sharing a key with another to the row numbers it collides with.

    Rows are numbered as the user sees them in a spreadsheet: the header is line 1, so the
    first data row is line 2. All colliding rows fail — the last one does not win. "Two rows
    with the same name" is very often two genuinely different stations, and silently keeping
    one of them would throw the other away (ADR-113).
    """
    positions: dict[tuple, list[int]] = {}
    for index, key in enumerate(keys):
        positions.setdefault(key, []).append(index)

    collisions: dict[int, tuple[int, ...]] = {}
    for shared in positions.values():
        if len(shared) > 1:
            for index in shared:
                collisions[index] = tuple(other + 2 for other in shared if other != index)
    return collisions
