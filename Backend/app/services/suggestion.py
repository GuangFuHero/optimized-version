"""Station-update suggestion write actions (create / merge / revoke).

Same flat-service style as station.py. A merge decides every pending suggestion on the chosen
fields of one station, writes the reviewer's values, and records the before/after in a
`StationSuggestionMerge`, all in one commit. A revoke writes those before values back.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, literal_column, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.suggestions.fields import VALID_TARGET_TYPES, coerce_and_validate
from app.models.auth import User
from app.models.geo import Station, touch
from app.models.station_property import StationSuggestionMerge, StationUpdateSuggestion
from app.repositories.geo_repository import (
    station_property_repository,
    station_repository,
)
from app.services.authz import require_scope
from app.services.geo_validation import normalize_supply_status
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService
from app.services.station import OPERATIONAL_PROPERTY_NAMES, notify_operational_status_change

# Free text a caller can write on every submit; the audit trigger copies each write.
_MAX_TEXT = 1000

# A station field whose real change moves a stamp, and that stamp (ADR-333). A merge keeps the
# old stamp under "<stamp>_before" so a revoke can put it back; for status_changed_at that is
# the key merges stored before this map existed.
_STAMPS = {"operational_status": "status_changed_at", "supply_status": "supply_status_updated_at"}

# Maps a suggestion's target_type to the repository that owns that table.
_TARGET_REPOS = {
    "station": station_repository,
    "station_property": station_property_repository,
}


@dataclass(frozen=True)
class SuggestionDecision:
    """A reviewer's call on one field: apply `value` when `approve`, otherwise reject."""

    target_uuid: str
    field_name: str
    approve: bool
    value: str | None = None


async def create_station_suggestion(
    db: AsyncSession,
    *,
    actor: User,
    target_type: str,
    target_uuid: str,
    field_name: str,
    new_value: str,
    comment: str | None,
) -> StationUpdateSuggestion:
    """Propose a change to a station/station-property field (requires station.contribute).

    Resubmitting a field the caller already has pending updates that row instead of adding
    another, in one upsert so concurrent submits cannot race. Only a new row notifies reviewers.
    """
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
    actor_uid = actor.uuid

    if target_type not in VALID_TARGET_TYPES:
        raise ValueError(f"Unknown target_type '{target_type}'")
    target = await _TARGET_REPOS[target_type].get_by_uuid_active(db, target_uuid)
    if not target:
        raise ValueError(f"{target_type} not found")
    station_uuid = str(target.station_uuid if target_type == "station_property" else target.uuid)

    _check_length(new_value=new_value, comment=comment)
    value = str(coerce_and_validate(target_type, field_name, new_value))
    if target_type == "station" and field_name == "supply_status":
        # Stripped here as at merge, so one line however spaced is one proposal to the reviewer.
        # A blank stays "", the column being text; the merge stores it as null (ADR-333).
        value = value.strip()

    # xmax = 0 only on a freshly inserted row, which tells an insert from a resubmit.
    suggestion_uuid, inserted = (
        await db.execute(
            insert(StationUpdateSuggestion)
            .values(
                target_type=target_type,
                target_uuid=target_uuid,
                field_name=field_name,
                new_value=value,
                comment=comment,
                status="pending",
                created_by=str(actor_uid),
            )
            .on_conflict_do_update(
                index_elements=["created_by", "target_uuid", "field_name"],
                # A bound 'pending' stops matching the partial index once Postgres caches a generic
                # plan, so the predicate is literal SQL.
                index_where=text("status = 'pending'"),
                set_={"new_value": value, "comment": comment, "updated_at": func.now()},
            )
            .returning(StationUpdateSuggestion.uuid, literal_column("xmax = 0"))
        )
    ).one()
    await db.commit()
    suggestion = await db.get(StationUpdateSuggestion, suggestion_uuid, populate_existing=True)
    if not inserted:
        return suggestion

    recipients = await NotificationRecipientResolver.resolve_permission(
        db, Perm.STATION_REVIEW.value, station_uuid=station_uuid
    )
    await NotificationService.dispatch(
        db,
        event_type="station_suggestion_created",
        title="📝 新的站點修改建議",
        body=f"「{field_name}」有一筆新的修改建議待審核。",
        priority="medium",
        actor_uuid=actor_uid,
        ref_type="station_suggestion",
        ref_uuid=suggestion_uuid,
        explicit_recipients=recipients,
    )
    await db.refresh(suggestion)
    return suggestion


async def merge_station_suggestions(
    db: AsyncSession,
    *,
    actor: User,
    station_uuid: str,
    decisions: list[SuggestionDecision],
    review_note: str | None = None,
) -> StationSuggestionMerge:
    """Decide the pending suggestions on the given fields of one station (requires station.review).

    Only fields with a pending suggestion can be decided; anything else is a station.edit.
    Every pending row on a decided field shares the decision, and fields left out stay pending.
    """
    _check_length(review_note=review_note)
    for decision in decisions:
        _check_length(**{decision.field_name: decision.value})
    station = await _lock_station(db, station_uuid)
    if not station:
        raise ValueError("Station not found")
    await require_scope(actor, Perm.STATION_REVIEW, db, resource=station)
    actor_uid = str(actor.uuid)

    if not decisions:
        raise ValueError("No fields to decide")
    keys = [(d.target_uuid, d.field_name) for d in decisions]
    if len(set(keys)) != len(keys):
        raise ValueError("Each field may be decided only once")

    pending = (
        (
            await db.execute(
                select(StationUpdateSuggestion).where(
                    StationUpdateSuggestion.target_uuid.in_({uuid for uuid, _ in keys}),
                    StationUpdateSuggestion.status == "pending",
                    StationUpdateSuggestion.delete_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    rows_by_field: dict[tuple[str, str], list[StationUpdateSuggestion]] = defaultdict(list)
    for row in pending:
        rows_by_field[(row.target_uuid, row.field_name)].append(row)

    changes, touched = await _apply_decisions(db, station, decisions, rows_by_field)
    # The database's clock, read under the station's lock, as every other stamp is.
    decided_at = await db.scalar(select(func.clock_timestamp()))
    if changes:
        # An approval is an update at its own time, even one that wrote a property or an unchanged value.
        touch(station, at=decided_at)

    merge = StationSuggestionMerge(
        station_uuid=str(station.uuid),
        changes=changes,
        review_note=review_note,
        status="applied",
        reviewed_by=actor_uid,
        created_at=decided_at,
    )
    db.add(merge)
    await db.flush()
    for decision in decisions:
        for row in rows_by_field[(decision.target_uuid, decision.field_name)]:
            row.status = "approved" if decision.approve else "rejected"
            row.reviewed_by = actor_uid
            row.review_note = review_note
            row.merge_uuid = merge.uuid

    operational = _operational_changes(touched, changes)
    await db.commit()
    await _notify_operational(db, operational, actor_uid)
    # Refresh last: both commits above expire the merge.
    await db.refresh(merge)
    return merge


async def revoke_station_suggestion_merge(
    db: AsyncSession, *, actor: User, uuid: str
) -> StationSuggestionMerge:
    """Write an applied merge's before values back (requires station.revoke).

    Refused when any merged field has changed since, so a revoke never overwrites a later edit.
    """
    merge = (
        await db.execute(
            select(StationSuggestionMerge).where(
                StationSuggestionMerge.uuid == uuid, StationSuggestionMerge.delete_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if not merge:
        raise ValueError("Merge not found")
    station = await _lock_station(db, merge.station_uuid)
    if not station:
        raise ValueError("Station not found")
    await require_scope(actor, Perm.STATION_REVOKE, db, resource=station)
    # Re-read under the station lock, so a revoke that waited sees the one before it.
    await db.refresh(merge)
    if merge.status != "applied":
        raise ValueError(f"Merge already {merge.status}")
    if not merge.changes:
        raise ValueError("Nothing to revoke: this merge applied no changes")
    actor_uid = str(actor.uuid)

    # A property deleted since the merge has nothing left to restore, so only live targets revert.
    changes, targets = [], []
    for change in merge.changes:
        target = await _revoke_target(db, station, change)
        if target is not None:
            changes.append(change)
            targets.append(target)
    drifted = [
        change["field_name"]
        for change, target in zip(changes, targets, strict=True)
        if getattr(target, change["field_name"]) != change["after"]
    ]
    if drifted:
        raise ValueError(f"Changed since the merge, cannot revoke: {', '.join(drifted)}")

    for change, target in zip(changes, targets, strict=True):
        _set_field(target, change["field_name"], change["before"])
        stamp = _STAMPS.get(change["field_name"])
        if stamp and f"{stamp}_before" in change:
            before = change[f"{stamp}_before"]
            setattr(target, stamp, datetime.fromisoformat(before) if before else None)
    merge.status = "revoked"
    merge.revoked_by = actor_uid
    merge.revoked_at = await db.scalar(select(func.clock_timestamp()))
    touch(station, at=merge.revoked_at)
    await db.execute(
        update(StationUpdateSuggestion)
        .where(
            StationUpdateSuggestion.merge_uuid == merge.uuid,
            StationUpdateSuggestion.status == "approved",
        )
        .values(status="revoked")
    )

    operational = _operational_changes(targets, changes)
    await db.commit()
    await _notify_operational(db, operational, actor_uid)
    # Refresh last: both commits above expire the merge.
    await db.refresh(merge)
    return merge


async def _apply_decisions(db: AsyncSession, station: Station, decisions, rows_by_field):
    """Validate each decision and write the approved values; return the changes and their targets."""
    changes: list[dict] = []
    touched = []
    for decision in decisions:
        rows = rows_by_field.get((decision.target_uuid, decision.field_name))
        if not rows:
            raise ValueError(f"No pending suggestion for '{decision.field_name}' on {decision.target_uuid}")
        target_type = rows[0].target_type
        target = await _station_target(db, station, target_type, decision.target_uuid)
        if not decision.approve:
            continue
        if decision.value is None:
            raise ValueError(f"'{decision.field_name}' needs a value to approve")
        value = coerce_and_validate(target_type, decision.field_name, decision.value)
        if target_type == "station" and decision.field_name == "supply_status":
            value = normalize_supply_status(value)
        before = getattr(target, decision.field_name)
        change = {
            "target_type": target_type,
            "target_uuid": decision.target_uuid,
            "field_name": decision.field_name,
            "before": before,
            "after": value,
        }
        stamp = _STAMPS.get(decision.field_name)
        if stamp:
            # A revoke restores the old value, so it restores when that value began too.
            began = getattr(target, stamp)
            change[f"{stamp}_before"] = began.isoformat() if began else None
        _set_field(target, decision.field_name, value)
        touched.append(target)
        changes.append(change)
    return changes, touched


async def _station_target(db: AsyncSession, station: Station, target_type: str, target_uuid: str):
    """Return the station itself or one of its active properties, refusing anything else."""
    if target_type == "station":
        if target_uuid != str(station.uuid):
            raise ValueError(f"{target_uuid} is not this station")
        return station
    prop = await station_property_repository.get_by_uuid_active(db, target_uuid)
    if not prop or str(prop.station_uuid) != str(station.uuid):
        raise ValueError(f"{target_uuid} is not a property of this station")
    return prop


async def _lock_station(db: AsyncSession, station_uuid) -> Station | None:
    """Load the active station FOR UPDATE, so merges and revokes on one station run one at a time."""
    return (
        await db.execute(
            select(Station)
            .where(Station.uuid == station_uuid, Station.delete_at.is_(None))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def _revoke_target(db: AsyncSession, station: Station, change: dict):
    """Return the change's target, or None for a property soft-deleted since the merge."""
    if change["target_type"] == "station_property":
        prop = await station_property_repository.get_by_uuid(db, change["target_uuid"])
        if prop and prop.delete_at is not None and str(prop.station_uuid) == str(station.uuid):
            return None
    return await _station_target(db, station, change["target_type"], change["target_uuid"])


def _check_length(**fields: str | None) -> None:
    """Refuse free text over _MAX_TEXT characters."""
    for name, value in fields.items():
        if value is not None and len(value) > _MAX_TEXT:
            raise ValueError(f"'{name}' must be at most {_MAX_TEXT} characters")


def _set_field(target, field_name: str, value) -> None:
    """Write one field, moving its stamp (see _STAMPS) only when the value really changes."""
    stamp = _STAMPS.get(field_name)
    if stamp and value != getattr(target, field_name):
        setattr(target, stamp, datetime.now(UTC))
    setattr(target, field_name, value)


def _operational_changes(targets: list, changes: list[dict]) -> set[tuple[str, str]]:
    """Collect (station_uuid, property_name) pairs whose operational value actually changed.

    Read as plain values before the commit, because notification runs after it.
    """
    found = set()
    for target, change in zip(targets, changes, strict=True):
        if (
            change["target_type"] == "station_property"
            and change["before"] != change["after"]
            and target.property_name in OPERATIONAL_PROPERTY_NAMES
            and target.status != "rejected"
        ):
            found.add((str(target.station_uuid), target.property_name))
    return found


async def _notify_operational(db: AsyncSession, pairs: set[tuple[str, str]], actor_uid: str) -> None:
    """Tell Gov and the covering NGO admins about each operational value a merge or revoke changed."""
    for station_uuid, property_name in sorted(pairs):
        await notify_operational_status_change(
            db, station_uuid=station_uuid, property_name=property_name, actor_uuid=actor_uid
        )
