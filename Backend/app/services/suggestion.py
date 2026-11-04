"""Station-update suggestion actions (create / merge / revoke), and the submitter's own list.

Same flat-service style as station.py. A merge decides every pending suggestion on the chosen
fields of one station, writes the reviewer's values, and records the before/after in a
`StationSuggestionMerge`, all in one commit. A revoke writes those before values back.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, literal_column, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.suggestions.fields import VALID_TARGET_TYPES, coerce_and_validate
from app.models.auth import User
from app.models.geo import Station, touch
from app.models.station_property import StationProperty, StationSuggestionMerge, StationUpdateSuggestion
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
    # What the field holds now, so the submitter can later read "this → that" (ADR-420). Read after
    # the field is validated as suggestable: no other attribute of the row is ever copied out.
    current = getattr(target, field_name)
    previous = "" if current is None else str(current)
    station = target
    if target_type == "station_property":
        station = await station_repository.get_by_uuid_active(db, station_uuid)
    # Read before the commit expires the rows.
    params = {
        **_station_params(station),
        "field": field_name,
        "property_name": target.property_name if target_type == "station_property" else None,
    }

    # xmax = 0 only on a freshly inserted row, which tells an insert from a resubmit.
    suggestion_uuid, inserted = (
        await db.execute(
            insert(StationUpdateSuggestion)
            .values(
                target_type=target_type,
                target_uuid=target_uuid,
                field_name=field_name,
                new_value=value,
                previous_value=previous,
                comment=comment,
                status="pending",
                created_by=str(actor_uid),
            )
            .on_conflict_do_update(
                index_elements=["created_by", "target_uuid", "field_name"],
                # A bound 'pending' stops matching the partial index once Postgres caches a generic
                # plan, so the predicate is literal SQL.
                index_where=text("status = 'pending'"),
                set_={
                    "new_value": value,
                    "previous_value": previous,
                    "comment": comment,
                    "updated_at": func.now(),
                },
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
    label = _FIELD_LABELS.get(field_name, field_name)
    await NotificationService.dispatch(
        db,
        event_type="station_suggestion_created",
        title="📝 新的站點修改建議",
        body=f"{_where(params['station_name'])}「{label}」有一筆新的修改建議待審核。",
        params=params,
        priority="medium",
        actor_uuid=actor_uid,
        # The station, not the suggestion: a reviewer opens the station to review it (the admin
        # bell's 點了去哪裡, Design/後台/docs/通知鈴鐺.md), and no route reads one suggestion.
        ref_type="station",
        ref_uuid=station_uuid,
        explicit_recipients=recipients,
    )
    await db.refresh(suggestion)
    return suggestion


@dataclass(frozen=True)
class MySuggestion:
    """One of the caller's suggestions, with the merge that decided it and the station it is about.

    `station` is None once the station is deleted; `merge` is None while the row is pending, and for
    a row decided before merges were recorded.
    """

    suggestion: StationUpdateSuggestion
    merge: StationSuggestionMerge | None
    station: Station | None


async def list_my_station_suggestions(
    db: AsyncSession, *, actor: User, limit: int, skip: int = 0
) -> list[MySuggestion]:
    """The suggestions `actor` sent — the site's 我回報的站點 (ADR-420), `skip` rows in.

    Latest activity first: a resubmit or a decision moves a row up, both setting `updated_at`. No
    capability check, as for the caller's own tickets: losing station.contribute stops new
    suggestions, not the reading of old ones. A soft-deleted row drops off. The merges and stations
    are read in one query each, whatever the number of rows.
    """
    rows = list(
        (
            await db.scalars(
                select(StationUpdateSuggestion)
                .where(
                    StationUpdateSuggestion.created_by == str(actor.uuid),
                    StationUpdateSuggestion.delete_at.is_(None),
                )
                .order_by(StationUpdateSuggestion.updated_at.desc(), StationUpdateSuggestion.uuid.desc())
                .offset(skip)
                .limit(limit)
            )
        ).all()
    )

    merges: dict[str, StationSuggestionMerge] = {}
    merge_uuids = {str(row.merge_uuid) for row in rows if row.merge_uuid}
    if merge_uuids:
        found = await db.scalars(
            select(StationSuggestionMerge).where(StationSuggestionMerge.uuid.in_(merge_uuids))
        )
        merges = {str(merge.uuid): merge for merge in found}

    # A property's station even once the property is deleted: the suggestion was still about it.
    station_of_property: dict[str, str] = {}
    property_uuids = {row.target_uuid for row in rows if row.target_type == "station_property"}
    if property_uuids:
        found = await db.execute(
            select(StationProperty.uuid, StationProperty.station_uuid).where(
                StationProperty.uuid.in_(property_uuids)
            )
        )
        station_of_property = {str(uuid): str(station_uuid) for uuid, station_uuid in found}

    def station_uuid_of(row: StationUpdateSuggestion) -> str | None:
        if row.target_type == "station_property":
            return station_of_property.get(row.target_uuid)
        return row.target_uuid

    stations: dict[str, Station] = {}
    station_uuids = {uuid for uuid in map(station_uuid_of, rows) if uuid}
    if station_uuids:
        found = await db.scalars(
            select(Station).where(Station.uuid.in_(station_uuids), Station.delete_at.is_(None))
        )
        stations = {str(station.uuid): station for station in found}

    return [
        MySuggestion(
            suggestion=row,
            merge=merges.get(str(row.merge_uuid)) if row.merge_uuid else None,
            station=stations.get(station_uuid_of(row) or ""),
        )
        for row in rows
    ]


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
    A decided field closes every pending row on it. A rejected field rejects them all; an approved
    one approves the rows whose own value it wrote and marks the rest not_adopted, or, when the
    written value matches none of them, marks them all adopted_edited.
    Fields left out stay pending. Each suggester is told the outcome of their suggestion.
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

    # The database's clock, read under the station's lock; every stamp this merge writes carries it.
    decided_at = await db.scalar(select(func.clock_timestamp()))
    # The name the suggesters knew, read before a merge that renames the station writes the new one.
    station_params = _station_params(station)
    changes, touched = await _apply_decisions(db, station, decisions, rows_by_field, decided_at)
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
    written = {(c["target_uuid"], c["field_name"]): c["after"] for c in changes}
    for decision in decisions:
        key = (decision.target_uuid, decision.field_name)
        rows = rows_by_field[key]
        _set_outcomes(rows, decision.approve, written.get(key))
        for row in rows:
            row.reviewed_by = actor_uid
            row.review_note = review_note
            row.merge_uuid = merge.uuid
    # Read before the commit expires the rows.
    decided = [
        row for decision in decisions for row in rows_by_field[(decision.target_uuid, decision.field_name)]
    ]
    property_names = await _property_names(db, decided)
    outcomes = [
        (row.created_by, row.uuid, row.field_name, property_names.get(row.target_uuid), row.status)
        for row in decided
    ]

    operational = _operational_changes(touched, changes)
    await db.commit()
    await _notify_operational(db, operational, actor_uid)
    await _notify_suggesters(db, station_params, outcomes, actor_uid)
    # Refresh last: the commits above expire the merge.
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

    revoked_at = await db.scalar(select(func.clock_timestamp()))
    for change, target in zip(changes, targets, strict=True):
        _set_field(target, change["field_name"], change["before"], revoked_at)
        stamp = _STAMPS.get(change["field_name"])
        if stamp and f"{stamp}_before" in change:
            before = change[f"{stamp}_before"]
            setattr(target, stamp, datetime.fromisoformat(before) if before else None)
    merge.status = "revoked"
    merge.revoked_by = actor_uid
    merge.revoked_at = revoked_at
    touch(station, at=merge.revoked_at)
    await db.execute(
        update(StationUpdateSuggestion)
        .where(
            StationUpdateSuggestion.merge_uuid == merge.uuid,
            StationUpdateSuggestion.status.in_(("approved", "adopted_edited")),
        )
        .values(status="revoked")
    )

    operational = _operational_changes(targets, changes)
    await db.commit()
    await _notify_operational(db, operational, actor_uid)
    # Refresh last: both commits above expire the merge.
    await db.refresh(merge)
    return merge


async def _apply_decisions(
    db: AsyncSession, station: Station, decisions, rows_by_field, decided_at: datetime
):
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
        value = _merge_value(target_type, decision.field_name, decision.value)
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
        _set_field(target, decision.field_name, value, decided_at)
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


# How a notification names a field: the labels the public suggestion form shows for a station's fields
# and plain words for a property's; anything else keeps its column name.
_FIELD_LABELS = {
    "operational_status": "營運狀態",
    "op_hour": "服務時間",
    "name": "站點名稱",
    "description": "地址／位置說明",
    "type": "站點類型",
    "supply_status": "目前缺少",
    "property_name": "項目名稱",
    "quantity": "數量",
}


def _where(station_name: str | None) -> str:
    """The 「station」的 a notification opens with, or nothing for a station without a name."""
    return f"「{station_name}」的" if station_name else ""


def _station_params(station: Station | None) -> dict:
    """The station values a suggestion notice stores in its params."""
    return {
        "station_name": station.name if station else None,
        "station_type": station.type if station else None,
    }


async def _property_names(db: AsyncSession, rows: list[StationUpdateSuggestion]) -> dict[str, str]:
    """The property_name of each station property these suggestions are on, by its uuid."""
    uuids = {row.target_uuid for row in rows if row.target_type == "station_property"}
    if not uuids:
        return {}
    found = await db.execute(
        select(StationProperty.uuid, StationProperty.property_name).where(StationProperty.uuid.in_(uuids))
    )
    return {str(uuid): name for uuid, name in found}


async def _notify_suggesters(db: AsyncSession, station_params: dict, outcomes, actor_uid: str):
    """Tell each suggester whether their suggestion was adopted, adopted with edits, or not adopted.

    Not adopted covers both not_adopted and rejected rows, which read the same to a suggester.
    """
    where = _where(station_params["station_name"])
    for recipient, suggestion_uuid, field_name, property_name, status in outcomes:
        field = f"「{_FIELD_LABELS.get(field_name, field_name)}」"
        if status == "adopted_edited":
            event_type, title = "station_suggestion_adopted_edited", "📝 站點修改建議已納入參考"
            body = f"{where}{field}已參考你的建議修改。"
        else:
            result = "已採用" if status == "approved" else "未採用"
            event_type = (
                "station_suggestion_adopted" if status == "approved" else "station_suggestion_not_adopted"
            )
            title = f"📝 站點修改建議{result}"
            body = f"你對{where}{field}的修改建議{result}。"
        await NotificationService.dispatch(
            db,
            event_type=event_type,
            title=title,
            body=body,
            params={**station_params, "field": field_name, "property_name": property_name},
            actor_uuid=actor_uid,
            ref_type="station_suggestion",
            ref_uuid=suggestion_uuid,
            explicit_recipients=[recipient],
        )


def _merge_value(target_type: str, field_name: str, raw: str):
    """A value as a merge writes it: typed for its column, a supply status stripped."""
    value = coerce_and_validate(target_type, field_name, raw)
    if target_type == "station" and field_name == "supply_status":
        value = normalize_supply_status(value)
    return value


def _set_outcomes(rows: list[StationUpdateSuggestion], approve: bool, written) -> None:
    """Set each row's status from its field's decision and the value that decision wrote.

    Rows matching the written value are approved and the rest not_adopted; when none match, the
    reviewer edited the value, and every row counts as adopted with edits.
    """
    adopted = {row.uuid for row in rows if approve and _adopted(row, written)}
    for row in rows:
        if not approve:
            row.status = "rejected"
        elif not adopted:
            row.status = "adopted_edited"
        else:
            row.status = "approved" if row.uuid in adopted else "not_adopted"


def _adopted(row: StationUpdateSuggestion, written) -> bool:
    """Whether a merge wrote this suggestion's own value; one its field no longer accepts was not."""
    try:
        return _merge_value(row.target_type, row.field_name, row.new_value) == written
    except ValueError:
        return False


def _check_length(**fields: str | None) -> None:
    """Refuse free text over _MAX_TEXT characters."""
    for name, value in fields.items():
        if value is not None and len(value) > _MAX_TEXT:
            raise ValueError(f"'{name}' must be at most {_MAX_TEXT} characters")


def _set_field(target, field_name: str, value, at: datetime) -> None:
    """Write one field, moving its stamp (see _STAMPS) to `at` only when the value really changes."""
    stamp = _STAMPS.get(field_name)
    if stamp and value != getattr(target, field_name):
        setattr(target, stamp, at)
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
