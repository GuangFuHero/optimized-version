"""A ticket's timeline as anyone may read it: what happened, never who (feature 016, ADR-421).

`history.py` tells the requester and the coordinators who did what, and is closed to everyone else:
who claimed which need is the requester's and the coordinators' business, so that nobody can follow
a volunteer from need to need (ADR-286), and staff names and review timings are kept from guests
(ADR-127). This reads the same audit rows (ADR-131/132) and tells what happened to the ticket in
terms nobody can be found by:

- **Who** is a role only: the requester, a volunteer, staff or the system. No name, no uuid.
- **A claim** is a count: one more volunteer for 清淤泥, now 2 of 5 (the prototype's own wording).
- **What changed** is told whenever a field moved (Carol, 2026-10-29), but in values only for the
  public tier of `history_fields.py`, less the free text. The rest is told as having changed, without
  the values, to everyone: the title, the description, the place, the contact details, the triage
  answers, and a need's name, description, progress note and details. A title or a name once held a
  phone number as easily as a description does, and an edit that took it out must not leave it here;
  so a need is named in every event by the name it has now. Only the data check is not told, nor the
  ticket's own status, which the events of its needs already tell (`_NOT_TOLD`).
  `resolve_visibility` is deliberately not used: a plain account holds `ticket.view_pii` at `all`
  (ADR-286), so under it anyone signed in would read the requester's name and phone here.
- **A merge** in 重複審核 is one event on the ticket kept, listing the needs it brought (ADR-421 point 6).
  What a need moved over or a claim folded in went through on the other ticket is that ticket's, and is
  not told here: only rows written while the need or claim was this ticket's.

Read-only, like `history.py`.
"""

import uuid as uuidlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.dedup import DedupAuditEvent
from app.repositories.tickets_repository import ticket_repository
from app.services import history

# Who acted, as the public timeline says it.
REQUESTER = "requester"
VOLUNTEER = "volunteer"
STAFF = "staff"
SYSTEM = "system"

# What happened. The frontend words each (ADR-145).
TICKET_CREATED = "ticket_created"
TICKET_UPDATED = "ticket_updated"
TICKET_MERGED = "ticket_merged"
NEED_ADDED = "need_added"
NEED_UPDATED = "need_updated"
NEED_FILLED = "need_filled"
NEED_STOPPED = "need_stopped"
NEED_REOPENED = "need_reopened"
NEED_REMOVED = "need_removed"
VOLUNTEER_JOINED = "volunteer_joined"
VOLUNTEER_LEFT = "volunteer_left"

_TICKETS = "tickets"
_GEOMETRIES = "base_geometries"
_LOCATIONS = "secondary_locations"
_TASKS = "ticket_tasks"
_ASSIGNMENTS = "task_assignments"
_PROPERTIES = "task_properties"

# Fields told with their values: the public tier of history_fields.py that is not free text. A guard test
# (test_history_public.py) holds every column history_fields.py classifies to one of these, a fact below,
# or `_NOT_TOLD`, so a column added or demoted there forces a decision here.
_TICKET_FIELDS = ("priority", "task_type", "disaster_types")
_NEED_FIELDS = ("quantity", "task_type")
# Told as having changed, without the values, column by the name it is told under: free text, whose old
# values may hold what an edit took out (ADR-421 point 4); the detail tier (ADR-284); and the contact
# details and triage answers, which no reader here may see (ADR-286). The three contact columns are one
# change.
_TICKET_FACTS = {
    "title": "title",
    "description": "description",
    "contact_name": "contact",
    "contact_email": "contact",
    "contact_phone": "contact",
    "person_trapped_reported": "person_trapped",
    "immediate_danger_reported": "immediate_danger",
}
_NEED_FACTS = {"task_name": "name", "task_description": "description", "progress_note": "progress_note"}
# A need's details: rows of name, value and quantity, told as one change to the need.
_PROPERTY_COLUMNS = ("property_name", "property_value", "quantity", "status", "comment")
# A detail taken off is soft-deleted, which history_fields.py keeps apart from the columns it classifies.
_PROPERTY_REMOVED = "delete_at"
# What history_fields.py classifies and this leaves out, and why.
_NOT_TOLD = {
    _TICKETS: {
        "status": "worked out from its needs, whose events already tell it",
        "audit_status": "the data check is staff's (ADR-421 point 4)",
        "audit_note": "the data check is staff's (ADR-421 point 4)",
    },
    _TASKS: {
        "status": "told as the event's kind: filled, stopped, reopened or removed",
        "source": "set when the need is filed, and never written again",
    },
}

_OPEN = "pending"
_FILLED = "fulfilled"
_CANCELED = "canceled"


@dataclass
class _Need:
    """A need as it stood after the latest transaction replayed.

    `ticket` is the ticket it was on then, which a merge changes; None until a row of its own says.
    """

    name: str | None = None
    required: int | None = None
    claims: set[str] = field(default_factory=set)
    ticket: str | None = None
    filed_at: str | None = None


@dataclass(frozen=True)
class _Merge:
    """A 重複審核 merge that kept this ticket: when, by whom, and the needs it brought."""

    at: datetime
    actor_uuid: str | None
    needs: tuple[str, ...]


@dataclass(frozen=True)
class PublicTimeline:
    """One page of the public timeline."""

    events: list[dict]
    total: int
    truncated: bool


def _values(row: AuditLog) -> dict:
    return row.new_values or row.old_values or {}


def _role(user_uuid, requester_uuid: str) -> str:
    if user_uuid is None:
        return SYSTEM
    return REQUESTER if str(user_uuid) == requester_uuid else STAFF


def _actor_role(row: AuditLog, requester_uuid: str) -> str:
    role = _role(row.user_uuid, requester_uuid)
    if (
        role == STAFF
        and row.table_name == _ASSIGNMENTS
        and str(_values(row).get("actor_uuid")) == str(row.user_uuid)
    ):
        return VOLUNTEER
    return role


def _fact(name: str) -> dict:
    return {"field": name, "before": None, "after": None, "changed": True}


def _value_changes(row: AuditLog, fields: tuple[str, ...], facts: dict[str, str]) -> list[dict]:
    old, new = row.old_values or {}, row.new_values or {}
    changes = [
        {"field": name, "before": old.get(name), "after": new.get(name)}
        for name in fields
        if old.get(name) != new.get(name)
    ]
    moved = dict.fromkeys(name for column, name in facts.items() if old.get(column) != new.get(column))
    return changes + [_fact(name) for name in moved]


def _details_moved(row: AuditLog) -> bool:
    old, new = row.old_values or {}, row.new_values or {}
    columns = (*_PROPERTY_COLUMNS, _PROPERTY_REMOVED)
    return row.action != "UPDATE" or any(old.get(c) != new.get(c) for c in columns)


def _need_status_kind(row: AuditLog) -> str | None:
    """What a need's status change means, or None when it did not move."""
    old, new = row.old_values or {}, row.new_values or {}
    before, after = old.get("status"), new.get("status")
    if before == after:
        return None
    if after == _CANCELED:
        return NEED_REMOVED
    if after == _FILLED:
        # Both end filled; only stopping by hand stamps the time (ADR-291). The stamp itself is left out
        # of the staff timeline (history_fields.py), so it is read here.
        stopped = old.get("recruiting_stopped_at") is None and new.get("recruiting_stopped_at") is not None
        return NEED_STOPPED if stopped else NEED_FILLED
    if before == _FILLED and after == _OPEN:
        return NEED_REOPENED
    return None


class _Replay:
    """The ticket's audit rows replayed oldest first, telling each transaction as public events."""

    def __init__(self, requester_uuid: str, ticket_uuid: str, ticket_needs: frozenset[str]):
        """Start from a ticket nobody has written yet; `ticket_needs` are the needs it has now."""
        self.requester_uuid = requester_uuid
        self.ticket_uuid = ticket_uuid
        self.ticket_needs = ticket_needs
        self.needs: dict[str, _Need] = defaultdict(_Need)
        self.events: list[dict] = []
        self._unnamed: list[tuple[dict, str]] = []

    def named(self) -> list[dict]:
        """The events told, oldest first, each need named as it is now (ADR-421 point 4)."""
        for view, uuid in self._unnamed:
            view["name"] = self.needs[uuid].name
        return self.events

    def transaction(self, at, rows: list[AuditLog], merge: _Merge | None = None) -> None:
        """Apply one transaction's rows, then tell what it did, with the headcounts as they stand after it.

        `rows` come in telling order (`_TABLE_ORDER`). Everything it did to the ticket itself is one event,
        however many of its tables one save wrote. Every row counts towards the headcounts, a need moved over
        bringing its claims; only this ticket's are told (`_ours`).
        """
        for row in rows:
            self._apply(row)
        rows = [row for row in rows if self._ours(row)]
        created = next((r for r in rows if r.table_name == _TICKETS and r.action == "INSERT"), None)
        if created is not None:
            # As the site lists a ticket's needs: filing a help request stamps them a microsecond apart in the
            # order the requester listed them, and needs written in one statement share `created_at`.
            filed = [
                str(r.row_id)
                for r in sorted(
                    (r for r in rows if r.table_name == _TASKS and r.action == "INSERT"),
                    key=lambda r: (str(r.new_values.get("created_at")), str(r.row_id)),
                )
            ]
            self._tell(at, created, TICKET_CREATED, needs=[self._view(uuid) for uuid in filed])
            return
        if merge is not None:
            # Before what it did to the ticket and its needs, which then read above it, newest first.
            self._tell_merge(at, merge)
        ticket_rows = [r for r in rows if r.table_name in _TICKET_TABLES]
        changes = {c["field"]: c for row in ticket_rows for c in self._ticket_changes(row)}
        if changes:
            self._tell(at, ticket_rows[0], TICKET_UPDATED, changes=list(changes.values()))
        # A need's details changed, by the need they belong to; told with whatever else the save did to it.
        details = {
            str(_values(r).get("task_uuid")): r
            for r in rows
            if r.table_name == _PROPERTIES and _details_moved(r)
        }
        # A claim or release that fills or reopens its need does so in the same transaction.
        claims = {str(_values(r).get("task_uuid")): r for r in rows if r.table_name == _ASSIGNMENTS}
        for row in rows:
            if row.table_name == _ASSIGNMENTS:
                self._tell_claim(at, row)
            elif row.table_name == _TASKS:
                self._tell_need(
                    at,
                    row,
                    details=details.pop(str(row.row_id), None) is not None,
                    claim=claims.get(str(row.row_id)),
                )
        for need, row in details.items():
            self._tell(at, row, NEED_UPDATED, need=self._view(need), changes=[_fact("properties")])

    def _view(self, uuid: str) -> dict:
        """A need as an event shows it: the headcount then, and a name `named` writes in at the end."""
        need = self.needs[uuid]
        view = {"name": None, "matched": len(need.claims), "required": need.required}
        self._unnamed.append((view, uuid))
        return view

    def _holds(self, need_uuid: str) -> bool:
        """Whether the need was this ticket's as last replayed, or, if no row of it said, if it is now."""
        ticket = self.needs[need_uuid].ticket
        return need_uuid in self.ticket_needs if ticket is None else ticket == self.ticket_uuid

    def _ours(self, row: AuditLog) -> bool:
        """Whether the row was written while what it changed was this ticket's, so this ticket's to tell."""
        if row.table_name == _TASKS:
            return self._holds(str(row.row_id))
        if row.table_name in (_ASSIGNMENTS, _PROPERTIES):
            # A claim or detail folded in from the other ticket's need belongs here from the merge on.
            return self._holds(str(_values(row).get("task_uuid")))
        return True

    def _apply(self, row: AuditLog) -> None:
        if row.table_name == _TASKS:
            need = self.needs[str(row.row_id)]
            values = {**(row.old_values or {}), **(row.new_values or {})}
            need.name = values.get("task_name", need.name)
            need.required = values.get("quantity", need.required)
            if values.get("ticket_uuid") is not None:
                need.ticket = str(values["ticket_uuid"])
            if row.action == "INSERT":
                need.filed_at = values.get("created_at")
        elif row.table_name == _ASSIGNMENTS:
            old_task = (row.old_values or {}).get("task_uuid")
            new_task = (row.new_values or {}).get("task_uuid")
            if old_task is not None:
                self.needs[str(old_task)].claims.discard(str(row.row_id))
            if new_task is not None:
                self.needs[str(new_task)].claims.add(str(row.row_id))

    @staticmethod
    def _ticket_changes(row: AuditLog) -> list[dict]:
        if row.table_name == _TICKETS:
            return _value_changes(row, _TICKET_FIELDS, _TICKET_FACTS) if row.action == "UPDATE" else []
        if row.table_name == _LOCATIONS:
            # The address added, corrected or removed.
            return [_fact("location")]
        old, new = row.old_values or {}, row.new_values or {}
        # Never the point itself (ADR-141); a soft delete or restore is not told, and a deleted ticket is
        # not found at all.
        return [_fact("location")] if old.get("geometry") != new.get("geometry") else []

    def _tell_claim(self, at, row: AuditLog) -> None:
        # A status or role moved in place is a volunteer's own progress, not told (ADR-421 point 2).
        kind = {"INSERT": VOLUNTEER_JOINED, "DELETE": VOLUNTEER_LEFT}.get(row.action)
        if kind is not None:
            self._tell(at, row, kind, need=self._view(str(_values(row).get("task_uuid"))))

    def _tell_need(self, at, row: AuditLog, *, details: bool, claim: AuditLog | None) -> None:
        need = self._view(str(row.row_id))
        if row.action == "INSERT":
            # Its details came with it.
            self._tell(at, row, NEED_ADDED, need=need)
            return
        changes = _value_changes(row, _NEED_FIELDS, _NEED_FACTS) + ([_fact("properties")] if details else [])
        kind = _need_status_kind(row)
        if kind in (NEED_FILLED, NEED_REOPENED):
            # Filled or reopened by a claim or a release, it was done by whoever claimed or released: the
            # need's own row is not an assignment, and alone would read as staff's. A save that filled or
            # reopened it by changing the headcount, as a merge can, tells what else it changed with it.
            self._tell(at, claim if claim is not None else row, kind, need=need, changes=changes)
        elif kind is not None:
            # Stopped or removed, the event says it all: stopping recruiting also lowers the headcount to
            # whoever is coming.
            self._tell(at, row, kind, need=need)
        elif changes:
            self._tell(at, row, NEED_UPDATED, need=need, changes=changes)

    def _tell_merge(self, at, merge: _Merge) -> None:
        # In the order the site lists them, each with its headcount after the merge.
        needs = sorted(dict.fromkeys(merge.needs), key=lambda uuid: (str(self.needs[uuid].filed_at), uuid))
        self._add(
            at,
            _role(merge.actor_uuid, self.requester_uuid),
            TICKET_MERGED,
            needs=[self._view(u) for u in needs],
        )

    def _tell(self, at, row: AuditLog, kind: str, **told) -> None:
        self._add(at, _actor_role(row, self.requester_uuid), kind, **told)

    def _add(self, at, role: str, kind: str, *, need=None, needs=None, changes=None) -> None:
        self.events.append(
            {
                "kind": kind,
                "at": at,
                "actor_role": role,
                "need": need,
                "needs": needs,
                "changes": changes or [],
            }
        )


_TICKET_TABLES = (_TICKETS, _GEOMETRIES, _LOCATIONS)
# Within one transaction, the order rows are told in: the ticket, who joined or left, then what that did to
# the need. Newest first, a need filled by a claim then reads above the claim that filled it.
_TABLE_ORDER = {_TICKETS: 0, _GEOMETRIES: 1, _LOCATIONS: 2, _ASSIGNMENTS: 3, _TASKS: 4}


def tell(
    rows: list[AuditLog],
    *,
    requester_uuid: str,
    ticket_uuid: str,
    ticket_needs: frozenset[str],
    merges: tuple[_Merge, ...] = (),
) -> list[dict]:
    """The public events a ticket's audit rows add up to, newest first.

    Rows written in one transaction share `created_at` (ADR-134), and are told together: filing a ticket
    with its needs is one event. Headcounts are those after each transaction, replayed from the start. A
    merge is written in the same transaction as the rows it changed, and is told with them, or alone when
    none of them is this ticket's to tell.
    """
    by_transaction: dict = defaultdict(list)
    for row in rows:
        by_transaction[row.created_at].append(row)
    merged = {merge.at: merge for merge in merges}
    for at in merged:
        by_transaction.setdefault(at, [])
    replay = _Replay(requester_uuid, ticket_uuid, ticket_needs)
    for at in sorted(by_transaction):
        # Rows of one table by the row they wrote, not as fetched, so that a save always reads the same.
        ordered = sorted(
            by_transaction[at],
            key=lambda r: (_TABLE_ORDER.get(r.table_name, len(_TABLE_ORDER)), str(r.row_id)),
        )
        replay.transaction(at, ordered, merged.get(at))
    return list(reversed(replay.named()))


async def _merges(db: AsyncSession, ticket_uuid: str) -> tuple[_Merge, ...]:
    """The 重複審核 merges that kept this ticket, from their `merged` events (Spec 028, ADR-375).

    The needs each brought: those moved over whole, and this ticket's needs that took in one of the other's.
    """
    events = await db.scalars(
        select(DedupAuditEvent).where(
            DedupAuditEvent.event_type == "merged",
            DedupAuditEvent.primary_uuid == uuidlib.UUID(ticket_uuid),
        )
    )
    merges = []
    for event in events.all():
        refs = event.affected_refs or {}
        needs = (*refs.get("moved", ()), *(refs.get("absorbed") or {}).values())
        merges.append(
            _Merge(
                at=event.created_at,
                actor_uuid=str(event.actor_uuid) if event.actor_uuid else None,
                needs=tuple(str(uuid) for uuid in needs),
            )
        )
    return tuple(merges)


async def load_public_timeline(
    db: AsyncSession, *, uuid: str, limit: int, offset: int
) -> PublicTimeline | None:
    """One page of a live ticket's public timeline; None when there is no such ticket.

    No caller is asked for: the board is public (ADR-027), and this tells nothing that depends on who reads
    it. A deleted ticket is not found, as on the site.
    """
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if ticket is None:
        return None
    ids = await history.resolve_scope_ids(db, entity=history.TICKET, uuid=uuid)
    rows, truncated = await history.fetch_audit_rows(db, ids=ids)
    events = tell(
        rows,
        requester_uuid=str(ticket.created_by),
        ticket_uuid=str(uuidlib.UUID(uuid)),
        ticket_needs=frozenset(str(need) for need in ids.task_uuids),
        merges=await _merges(db, uuid),
    )
    return PublicTimeline(events=events[offset : offset + limit], total=len(events), truncated=truncated)
