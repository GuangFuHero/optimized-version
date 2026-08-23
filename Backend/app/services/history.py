"""Read-only change timeline for a single ticket or station (feature 016).

Everything here reads `audit_logs`; nothing in this module writes. The work is turning an
append-only ledger keyed by "which row changed" into a story about "what happened to this
resource", which takes four steps: expand the resource into a set of row ids (ADR-131),
fetch the matching audit rows down two different access paths (ADR-132), fold the rows of
one transaction into a single event (ADR-134), and finally hide what the caller may not
see (ADR-130).
"""

from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope
from app.core.security import resolve_scope
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import StationProperty
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services.history_fields import Tier, spec_for

TICKET = "ticket"
STATION = "station"

# Marks the rows of the union that are ticket_tasks, so one query yields both the full
# row-id set and the task ids that ADR-132's second access path needs.
_TASKS = "ticket_tasks"


@dataclass(frozen=True)
class ScopeIds:
    """Every audit `row_id` belonging to one resource, plus its task ids.

    `task_uuids` is carried separately because a hard-deleted assignment cannot be reached
    through `row_id` at all — it is found by matching the audit payload's `task_uuid`
    against these instead (ADR-132).
    """

    row_ids: set[UUID] = field(default_factory=set)
    task_uuids: set[UUID] = field(default_factory=set)


def _as_uuid(value) -> UUID:
    """Columns declared `Mapped[str]` over a UUID FK come back as either type."""
    return value if isinstance(value, UUID) else UUID(str(value))


async def resolve_scope_ids(db: AsyncSession, *, entity: str, uuid: str | UUID) -> ScopeIds:
    """Expand one resource into every audit row_id that belongs to its history (ADR-131).

    `audit_logs.row_id` is the primary key of the row that changed, not of the ticket the
    change belongs to, so this set has to exist before audit_logs can be queried at all.

    A ticket needs two hops: `task_assignments` and `task_properties` hang off
    `ticket_tasks`, not off the ticket. A station stops at one — its children all reference
    the station directly. Soft-deleted children are deliberately included; a deleted task's
    history is still that resource's history.

    Done as a single UNION ALL rather than a query per level: the levels are independent,
    so making the database walk them in one round trip costs nothing extra.
    """
    target = _as_uuid(uuid)

    if entity == TICKET:
        branches = [
            select(TicketTask.uuid, literal(_TASKS).label("src")).where(
                TicketTask.ticket_uuid == str(target)
            ),
            select(SecondaryLocation.uuid, literal("secondary_locations")).where(
                SecondaryLocation.geometry_uuid == str(target)
            ),
            select(TaskProperty.uuid, literal("task_properties"))
            .join(TicketTask, TicketTask.uuid == TaskProperty.task_uuid)
            .where(TicketTask.ticket_uuid == str(target)),
            select(TaskAssignment.uuid, literal("task_assignments"))
            .join(TicketTask, TicketTask.uuid == TaskAssignment.task_uuid)
            .where(TicketTask.ticket_uuid == str(target)),
        ]
    elif entity == STATION:
        branches = [
            select(SecondaryLocation.uuid, literal("secondary_locations")).where(
                SecondaryLocation.geometry_uuid == str(target)
            ),
            select(StationProperty.uuid, literal("station_properties")).where(
                StationProperty.station_uuid == str(target)
            ),
        ]
    else:
        raise ValueError(f"Unknown history entity: {entity!r}")

    rows = (await db.execute(union_all(*branches))).all()

    # The resource itself covers both of its joined-table-inheritance rows: base_geometries
    # and the subclass table share one uuid, so one id reaches both (ADR-134).
    ids = ScopeIds(row_ids={target})
    for row_uuid, src in rows:
        parsed = _as_uuid(row_uuid)
        ids.row_ids.add(parsed)
        if src == _TASKS:
            ids.task_uuids.add(parsed)
    return ids


async def entity_exists(db: AsyncSession, *, entity: str, uuid: str | UUID):
    """Load the resource the timeline is about, or None.

    Returned rather than merely checked because the endpoint needs the object itself for
    checkpoint 2 — `require_scope` decides `own`/`zone` by reading its `created_by` and
    `geometry`.
    """
    # Station, not BaseGeometry: the base table also holds tickets and closure areas, so
    # querying it would happily return a ticket for /history/stations/{uuid}.
    model = Tickets if entity == TICKET else Station
    result = await db.execute(select(model).where(model.uuid == str(uuid)))
    return result.scalars().first()


# --- fetching (ADR-132/139) ---

# Safety valve, not a paging mechanism: one resource's history is realistically tens of
# events. Anything past this is reported through `truncated` rather than silently cut.
AUDIT_CAP = 2000

_ASSIGNMENTS = "task_assignments"


def _payload_task_uuid():
    """`task_uuid` as written by the trigger, from whichever payload side exists.

    An INSERT has only new_values, a DELETE only old_values, so both have to be consulted.
    Mirrors the expression index in migration c4a91e77b0d3 exactly — if these two ever
    diverge the query silently stops using the index.
    """
    return func.coalesce(
        AuditLog.new_values["task_uuid"].astext,
        AuditLog.old_values["task_uuid"].astext,
    )


async def fetch_audit_rows(
    db: AsyncSession, *, ids: ScopeIds, cap: int = AUDIT_CAP
) -> tuple[list[AuditLog], bool]:
    """Every audit row belonging to this resource, newest first, plus a truncation flag.

    Two access paths, because one is not enough (ADR-132). The first covers everything
    reachable by row_id. The second exists only for assignments that were hard-deleted by
    `unassign_task_actor`: their row is gone from `task_assignments`, so their row_id can no
    longer be derived and the audit payload is the only way back to them.

    Live assignments are returned by both paths, so the union is de-duplicated on the audit
    row's own uuid.
    """
    primary = (
        select(AuditLog)
        .where(AuditLog.row_id.in_(ids.row_ids))
        .order_by(AuditLog.created_at.desc())
        .limit(cap + 1)
    )
    rows = list((await db.execute(primary)).scalars())
    truncated = len(rows) > cap
    rows = rows[:cap]

    if ids.task_uuids:
        secondary = (
            select(AuditLog)
            .where(
                AuditLog.table_name == _ASSIGNMENTS,
                _payload_task_uuid().in_([str(u) for u in ids.task_uuids]),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(cap + 1)
        )
        extra = list((await db.execute(secondary)).scalars())
        truncated = truncated or len(extra) > cap
        rows.extend(extra[:cap])

    deduped = {row.uuid: row for row in rows}
    return list(deduped.values()), truncated


# --- event derivation (ADR-134/135/136/137) ---

CREATED = "CREATED"
UPDATED = "UPDATED"
DELETED = "DELETED"
RESTORED = "RESTORED"
ASSIGNED = "ASSIGNED"
UNASSIGNED = "UNASSIGNED"

_GEOMETRIES = "base_geometries"
_SYSTEM_SOURCES = frozenset({"crawler", "gov", "ngo"})


@dataclass(frozen=True)
class Change:
    """One field that moved. `changed_only` carries the fact without the values (ADR-141)."""

    field: str
    table: str
    before: object = None
    after: object = None
    changed_only: bool = False


@dataclass
class Event:
    """One transaction's worth of audit rows, folded together (ADR-134)."""

    event_type: str
    at: object
    row_id: UUID
    tables: set[str] = field(default_factory=set)
    actor_uuid: UUID | None = None
    actor_kind: str = "system"
    changes: list[Change] = field(default_factory=list)
    raw: list[dict] = field(default_factory=list)


def _diff(old: dict | None, new: dict | None) -> dict[str, tuple]:
    """Columns whose value actually moved, as {column: (before, after)}.

    An INSERT has no old_values and a DELETE no new_values; both are treated as a move from
    or to nothing, so a creation still reports what it created.
    """
    old = old or {}
    new = new or {}
    return {
        key: (old.get(key), new.get(key))
        for key in old.keys() | new.keys()
        if old.get(key) != new.get(key)
    }


def _event_type(rows: list[AuditLog]) -> str:
    """What the caller should be told happened, which is not always what SQL did.

    A soft delete is an UPDATE on base_geometries setting delete_at, and it never touches
    the subclass table at all — reported literally it would read "modified the geometry
    record", and "who deleted this ticket" would be unanswerable (ADR-135).
    """
    for row in rows:
        if row.table_name == _ASSIGNMENTS:
            return ASSIGNED if row.action == "INSERT" else UNASSIGNED

        if row.table_name == _GEOMETRIES and row.action == "UPDATE":
            before = (row.old_values or {}).get("delete_at")
            after = (row.new_values or {}).get("delete_at")
            if before is None and after is not None:
                return DELETED
            if before is not None and after is None:
                return RESTORED

    if any(row.action == "INSERT" for row in rows):
        return CREATED
    if all(row.action == "DELETE" for row in rows):
        return DELETED
    return UPDATED


def _actor_kind(rows: list[AuditLog], user_uuid) -> str:
    """Who acted. A NULL user means the write never went through an HTTP request (ADR-136).

    `source` refines a system write only on INSERT. On an UPDATE it is merely the row's
    current source value, so a crawler-created station later edited by a person would
    otherwise be attributed back to the crawler (ADR-137).
    """
    if user_uuid is not None:
        return "user"
    for row in rows:
        if row.action == "INSERT":
            source = (row.new_values or {}).get("source")
            if source in _SYSTEM_SOURCES:
                return source
    return "system"


def build_events(rows: list[AuditLog]) -> list[Event]:
    """Fold audit rows into events, newest first (ADR-134).

    Rows are grouped by (row_id, created_at). That works because PostgreSQL's `now()` is the
    transaction timestamp, so every row written by one request shares a created_at exactly —
    which is what makes creating a ticket (two rows across base_geometries and tickets) read
    as one line instead of two. It is also why ordering *within* a transaction is
    impossible, a limitation that grouping removes the need for.
    """
    grouped: dict[tuple, list[AuditLog]] = {}
    for row in rows:
        grouped.setdefault((row.row_id, row.created_at), []).append(row)

    events = []
    for (row_id, at), group in grouped.items():
        user_uuid = next((r.user_uuid for r in group if r.user_uuid is not None), None)
        event = Event(
            event_type=_event_type(group),
            at=at,
            row_id=row_id,
            tables={r.table_name for r in group},
            actor_uuid=user_uuid,
            actor_kind=_actor_kind(group, user_uuid),
            raw=[{"old_values": r.old_values, "new_values": r.new_values} for r in group],
        )
        for row in group:
            for column, (before, after) in _diff(row.old_values, row.new_values).items():
                event.changes.append(
                    Change(
                        field=column, table=row.table_name,
                        before=before, after=after,
                    )
                )
        events.append(event)

    events.sort(key=lambda e: e.at, reverse=True)
    return events


# --- actor resolution (ADR-136) ---


@dataclass(frozen=True)
class ActorView:
    """How an actor is presented. `is_removed` is a flag, never a reason to hide the name.

    There is no "unknown" state: users are soft-deleted, so a uuid that appears here always
    resolves. Notion listed orphaned uuids as a known gap; it is not one (ADR-136).
    """

    uuid: UUID | None
    name: str | None
    kind: str
    is_removed: bool = False


def _referenced_user_uuids(events: list[Event]) -> set[str]:
    """Every user uuid the timeline will need a name for.

    Includes assignees, not just the person who acted: on a task assignment the interesting
    part is who the task went to (ADR-143's one kept foreign key).
    """
    referenced = {str(e.actor_uuid) for e in events if e.actor_uuid is not None}
    for event in events:
        for change in event.changes:
            if change.table == _ASSIGNMENTS and change.field == "actor_uuid":
                referenced.update(str(v) for v in (change.before, change.after) if v)
    return referenced


async def resolve_actors(db: AsyncSession, events: list[Event]) -> dict[str, tuple[str, bool]]:
    """Look up every referenced user in one query, as {uuid: (name, is_removed)}.

    Batched deliberately: resolving per event would put a query behind every row of the
    timeline, which is the N+1 this feature's REST shape was chosen to avoid in the first
    place (ADR-138).
    """
    referenced = _referenced_user_uuids(events)
    if not referenced:
        return {}
    rows = (
        await db.execute(
            select(User.uuid, User.name, User.delete_at).where(User.uuid.in_(referenced))
        )
    ).all()
    return {str(uuid): (name, delete_at is not None) for uuid, name, delete_at in rows}


def actor_view(event: Event, names: dict[str, tuple[str, bool]]) -> ActorView:
    """Present one event's actor."""
    if event.actor_uuid is None:
        return ActorView(uuid=None, name=None, kind=event.actor_kind)
    name, is_removed = names.get(str(event.actor_uuid), (None, False))
    return ActorView(
        uuid=event.actor_uuid, name=name, kind=event.actor_kind, is_removed=is_removed
    )


# --- visibility (ADR-130) ---

_GEOMETRY_COLUMN = "geometry"


@dataclass(frozen=True)
class Visibility:
    """What this caller may see beyond the public tier.

    Resolved once per request rather than per event: `resolve_scope` hits the DB, and the
    answer cannot change part-way through a single timeline.
    """

    pii: bool = False
    audit: bool = False


async def resolve_visibility(
    db: AsyncSession, *, actor, resource, cache: dict | None = None
) -> Visibility:
    """Which tiers this caller unlocks on this resource (ADR-130).

    PII reuses `ticket.view_pii` and runs checkpoint 2 against the resource, so it means the
    same thing here as it does on the single-row query. AUDIT needs only the capability:
    `audit.view` is granted `all` or not at all, and it is oversight over the whole platform
    by definition.
    """
    if actor is None:
        return Visibility()

    pii_scope = await resolve_scope(actor, Perm.TICKET_VIEW_PII, db, cache=cache)
    pii = pii_scope == Scope.ALL or (
        pii_scope != Scope.NONE
        and await in_scope(pii_scope, actor=actor, resource=resource, db=db)
    )
    audit = await resolve_scope(actor, Perm.AUDIT_VIEW, db, cache=cache) != Scope.NONE
    return Visibility(pii=pii, audit=audit)


def _render_value(value, names: dict[str, tuple[str, bool]], change: Change):
    """Assignment actors become names; everything else passes through.

    ADR-143 keeps exactly one foreign key, and it would be useless as a bare uuid.
    """
    if change.table == _ASSIGNMENTS and change.field == "actor_uuid" and value:
        name, _ = names.get(str(value), (None, False))
        return name
    return value


def _render_change(
    change: Change, *, entity: str, names: dict, visibility: Visibility
) -> dict | None:
    """One field change as the API reports it, or None when the caller may not see it."""
    spec = spec_for(entity, change.table, change.field)
    if spec is None:
        return None

    if spec.tier is Tier.AUDIT and not visibility.audit:
        return None

    # ADR-141: geometry never carries a value under any tier — WKB is unreadable and a
    # decoded coordinate is location data. The tier only decides whether the fact appears.
    if change.field == _GEOMETRY_COLUMN:
        if spec.tier is Tier.PII and not visibility.pii:
            return None
        return {"field": change.field, "before": None, "after": None, "changed": True}

    if spec.tier is Tier.PII and not visibility.pii:
        if spec.mask is None:
            # Nothing to reveal partially without inventing plausible location data, so the
            # change is reported as having happened and the values are withheld (ADR-142).
            return {"field": change.field, "before": None, "after": None, "changed": True}
        return {
            "field": change.field,
            "before": spec.mask(change.before),
            "after": spec.mask(change.after),
        }

    return {
        "field": change.field,
        "before": _render_value(change.before, names, change),
        "after": _render_value(change.after, names, change),
    }


def render_events(
    events: list[Event], *, entity: str, names: dict, visibility: Visibility
) -> list[dict]:
    """Serialise events, dropping whatever this caller may not see (ADR-130/145).

    Field names and raw values go out as they are; Chinese labels and status wording are the
    frontend's job, so the response stays re-sortable and filterable (ADR-145).

    An event whose every change was filtered away is still returned: "somebody edited this
    at 09:12, and you cannot see what" is true and useful, and hiding the event entirely
    would misrepresent the timeline as quieter than it was.
    """
    rendered = []
    for event in events:
        changes = [
            change
            for change in (
                _render_change(c, entity=entity, names=names, visibility=visibility)
                for c in event.changes
            )
            if change is not None
        ]
        actor = actor_view(event, names)
        payload = {
            "event_type": event.event_type,
            "at": event.at,
            "entity": entity,
            "actor": {
                "uuid": str(actor.uuid) if actor.uuid else None,
                "name": actor.name,
                "kind": actor.kind,
                "is_removed": actor.is_removed,
            },
            "changes": changes,
        }
        if visibility.audit:
            payload["raw"] = event.raw
        rendered.append(payload)
    return rendered
