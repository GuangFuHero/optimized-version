"""A ticket's data check: the auditor's verdict, the scan's flag, and what voids a verdict.

- no_audit: nobody has checked the ticket as it now stands. Every ticket starts here.
- need_audit: the scan picked the ticket out for checking.
- audited: an auditor checked it and found it right.
- audit_issue: an auditor found something wrong with it, and the note says what.

A verdict holds for the content it was given on, which the ticket keeps (`audited_content`).
Once the content no longer matches, the verdict is void and the ticket is back to no_audit,
unless the scan has flagged it since: that flag stands until somebody checks the ticket.

Content is the requester's account of the request: the ticket's own words and answers, its
address, its disaster-field answers and its needs as filed. Who signed up, how many are still
wanted, a need taken off, the priority and the progress notes are how the request is being
handled, and do not count. The contact fields are left out because nothing changes them once a
ticket is filed.

Its own module, as `ticket_status` is, so every action that writes content calls the one rule.
"""

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.geo import BaseGeometry
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.repositories.geo_repository import secondary_location_repository
from app.repositories.tickets_repository import ticket_repository
from app.services.authz import require_scope
from app.services.notification_service import NotificationService

NO_AUDIT = "no_audit"
NEED_AUDIT = "need_audit"
AUDITED = "audited"
AUDIT_ISSUE = "audit_issue"
AUDIT_STATUSES = (NO_AUDIT, NEED_AUDIT, AUDITED, AUDIT_ISSUE)
# What an auditor can decide. need_audit is the scan's, and no_audit follows from the content.
VERDICTS = frozenset({AUDITED, AUDIT_ISSUE})

TICKET_FIELDS = (
    "title",
    "description",
    "disaster_types",
    "person_trapped_reported",
    "immediate_danger_reported",
)
# Every address column but the keys and bookkeeping, so a column added later counts by default.
ADDRESS_FIELDS = tuple(
    column.name
    for column in SecondaryLocation.__table__.columns
    if column.name not in {"uuid", "geometry_uuid", "created_at", "updated_at", "delete_at", "search_text"}
)
NEED_FIELDS = ("task_type", "task_name", "task_description")
PROPERTY_FIELDS = ("property_name", "property_value")


def _plain(value):
    """A column value as the JSON column stores it."""
    return str(value) if isinstance(value, UUID) else value


def _set_fields(row, fields) -> dict:
    """The fields of `row` that hold a value.

    An unset or blank field is left out rather than stored, so a missing row, an empty one and a
    form saving a blank field as "" all read the same to `content_changes` and to `content_hash`.
    """
    return {field: value for field in fields if not _blank(value := _plain(getattr(row, field)))}


def _ticket_fields(ticket: Tickets) -> dict:
    """The ticket's own content, its disaster types sorted.

    Their order is no change, and a row written outside the services that sort them, such as
    seed data, need not be in order.
    """
    fields = _set_fields(ticket, TICKET_FIELDS)
    if "disaster_types" in fields:
        fields["disaster_types"] = sorted(fields["disaster_types"])
    return fields


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


async def content_of(db: AsyncSession, ticket: Tickets) -> dict:
    """The ticket's content as a verdict is given on it. Reads what the session has flushed."""
    ticket_uuid = str(ticket.uuid)
    # The row an edit writes to (`_replace_secondary_location`), should a ticket ever hold two.
    address = await secondary_location_repository.get_by_geometry(db, ticket_uuid)
    answers: dict[str, list[str]] = {}
    for row in await db.scalars(
        select(TicketDisasterDetail).where(TicketDisasterDetail.ticket_uuid == ticket_uuid)
    ):
        answers.setdefault(row.property_name, []).append(row.value)
    needs = (
        await db.scalars(
            select(TicketTask).where(TicketTask.ticket_uuid == ticket_uuid, TicketTask.delete_at.is_(None))
        )
    ).all()
    properties = (
        (
            await db.scalars(
                select(TaskProperty).where(
                    TaskProperty.task_uuid.in_([need.uuid for need in needs]),
                    TaskProperty.delete_at.is_(None),
                )
            )
        ).all()
        if needs
        else []
    )
    return {
        "ticket": _ticket_fields(ticket),
        "address": _set_fields(address, ADDRESS_FIELDS) if address else {},
        # Sorted: the form sends the same answers back in whatever order, and that is no change.
        "disaster_details": {name: sorted(values) for name, values in answers.items()},
        "needs": {str(need.uuid): _set_fields(need, NEED_FIELDS) for need in needs},
        "properties": {
            str(prop.uuid): {"task_uuid": str(prop.task_uuid), **_set_fields(prop, PROPERTY_FIELDS)}
            for prop in properties
        },
    }


def content_hash(content: dict) -> str:
    """A fingerprint of `content`: what an auditor saw, so a verdict can name the version it is on."""
    canonical = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def content_changes(audited: dict, current: dict, *, ticket_uuid: str) -> list[dict]:
    """Every field that differs between the audited content and the current one.

    A need taken off since, and the properties that went with it, are not changes: the
    requester may drop a need without the ticket needing another check.
    """
    changes = []

    def compare(entity: str, entity_uuid: str, before: dict, after: dict, fields) -> None:
        for field in fields:
            if before.get(field) != after.get(field):
                changes.append(
                    {
                        "entity": entity,
                        "entity_uuid": entity_uuid,
                        "field": field,
                        "audited_value": before.get(field),
                        "current_value": after.get(field),
                    }
                )

    compare("ticket", ticket_uuid, audited.get("ticket", {}), current["ticket"], TICKET_FIELDS)
    compare(
        "secondary_location",
        ticket_uuid,
        audited.get("address", {}),
        current["address"],
        ADDRESS_FIELDS,
    )
    audited_answers = audited.get("disaster_details", {})
    compare(
        "disaster_detail",
        ticket_uuid,
        audited_answers,
        current["disaster_details"],
        sorted(audited_answers.keys() | current["disaster_details"].keys()),
    )
    audited_needs = audited.get("needs", {})
    for need_uuid, need in current["needs"].items():
        compare("task", need_uuid, audited_needs.get(need_uuid, {}), need, NEED_FIELDS)
    audited_properties = audited.get("properties", {})
    for prop_uuid, prop in current["properties"].items():
        compare("task_property", prop_uuid, audited_properties.get(prop_uuid, {}), prop, PROPERTY_FIELDS)
    for prop_uuid, prop in audited_properties.items():
        if prop_uuid not in current["properties"] and prop["task_uuid"] in current["needs"]:
            compare("task_property", prop_uuid, prop, {}, PROPERTY_FIELDS)
    return changes


async def lock_ticket(db: AsyncSession, ticket_uuid: str) -> Tickets | None:
    """Lock the ticket row and read it fresh, so a verdict and a content change take turns."""
    return await db.scalar(
        select(Tickets)
        .where(Tickets.uuid == ticket_uuid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def void_stale_verdict(db: AsyncSession, ticket_uuid: str) -> None:
    """Send a verdict back to no_audit once the ticket no longer matches what it was given on.

    Call it inside the writing action's transaction, after flushing the content change; the
    action commits. A ticket at no_audit or need_audit is left as it is.
    """
    ticket = await lock_ticket(db, ticket_uuid)
    if ticket is None or ticket.audit_status not in VERDICTS:
        return
    current = await content_of(db, ticket)
    if content_changes(ticket.audited_content or {}, current, ticket_uuid=str(ticket.uuid)):
        ticket.audit_status = NO_AUDIT
        await db.flush()


async def audit_ticket(
    db: AsyncSession, *, actor: User, uuid: str, status: str, note: str | None, seen_hash: str
) -> Tickets:
    """Give the verdict on the version of a ticket the auditor saw: audited, or audit_issue saying why.

    ticket.audit on the ticket. `seen_hash` is the `content_hash` of what the auditor read; if the
    ticket has changed since, the verdict is refused rather than given on content nobody checked.
    That is any change, a need taken off included, though taking one off does not void a verdict
    given earlier. The ticket row is locked first, so a content change cannot land between that check and the
    commit. The verdict records who gave it, when, and the content it was given on. An issue is
    told to the requester, who can put it right, and to everyone signed up for its needs, who may
    be on their way; neither notice carries the note or the auditor, which only staff read.
    """
    if status not in VERDICTS:
        raise ValueError(f"Unknown audit verdict: {status}")
    note = (note or "").strip() or None
    if status == AUDIT_ISSUE and note is None:
        raise ValueError("audit_note is required when marking an audit issue")
    ticket = await ticket_repository.get_by_uuid_active(db, uuid)
    if not ticket:
        raise ValueError("Ticket not found")
    await require_scope(actor, Perm.TICKET_AUDIT, db, resource=ticket)
    ticket = await lock_ticket(db, uuid)
    if ticket is None or ticket.delete_at is not None:
        raise ValueError("Ticket not found")

    # Read before anything is set: reading flushes, and the verdict should be one write.
    content = await content_of(db, ticket)
    if content_hash(content) != seen_hash:
        raise ValueError("The ticket has changed since it was loaded; reload it and audit again")
    ticket.audit_status = status
    ticket.audit_note = note
    ticket.audited_at = datetime.now(UTC)
    ticket.audited_by = str(actor.uuid)
    ticket.audited_content = content
    ticket_id, title, requester, actor_uid = ticket.uuid, ticket.title, ticket.created_by, actor.uuid
    volunteers = set()
    if status == AUDIT_ISSUE:
        on_needs = await db.scalars(
            select(TaskAssignment.actor_uuid)
            .join(TicketTask, TicketTask.uuid == TaskAssignment.task_uuid)
            .where(TicketTask.ticket_uuid == str(ticket_id), TicketTask.delete_at.is_(None))
        )
        volunteers = {str(person) for person in on_needs} - {str(requester), str(actor_uid)}
    await db.commit()

    if status == AUDIT_ISSUE:
        notices = [
            (
                [requester] if requester and str(requester) != str(actor_uid) else [],
                f"您的求助單「{title}」已被標記為內容有疑慮，請確認資料是否正確。",
            ),
            (list(volunteers), f"您報名的求助單「{title}」已被標記為內容有疑慮，資料可能有誤，請留意。"),
        ]
        for recipients, body in notices:
            await NotificationService.dispatch(
                db,
                event_type="ticket_audit_issue",
                title=f"求助單內容待確認：{title}",
                body=body,
                priority="high",
                # No actor: who audited is staff-only, and the notice reaches the requester.
                actor_uuid=None,
                ref_type="ticket",
                ref_uuid=ticket_id,
                explicit_recipients=recipients,
            )
    return await ticket_repository.get_by_uuid_active(db, str(ticket_id))


async def flag_need_audit(db: AsyncSession, ticket_uuids: list[str]) -> int:
    """The scan's flag: mark these tickets as needing an audit, and return how many it marked.

    A ticket with no verdict or one found right is flagged; one with an issue already has a
    verdict waiting on somebody, and a deleted one is skipped. No capability is asked, because the
    scan runs inside the backend rather than for a person, which is also why the change log
    records no user for it. Commits.
    """
    if not ticket_uuids:
        return 0
    tickets = Tickets.__table__
    live = select(BaseGeometry.uuid).where(
        BaseGeometry.uuid.in_(ticket_uuids), BaseGeometry.delete_at.is_(None)
    )
    result = await db.execute(
        tickets.update()
        .where(tickets.c.uuid.in_(live), tickets.c.audit_status.in_((NO_AUDIT, AUDITED)))
        .values(audit_status=NEED_AUDIT)
    )
    await db.commit()
    return result.rowcount


async def audit_history(db: AsyncSession, ticket_uuid: str) -> list[dict]:
    """Every move of the ticket's audit status, newest first, read from the change log.

    `kind` says what moved it: an auditor's `verdict` (the only kind with a note), the `scan`
    flagging it, or a `content_change` voiding a verdict.
    """
    rows = await db.scalars(
        select(AuditLog)
        .where(
            AuditLog.table_name == "tickets",
            AuditLog.row_id == UUID(str(ticket_uuid)),
            AuditLog.action == "UPDATE",
        )
        .order_by(AuditLog.created_at.desc())
    )
    entries = []
    for row in rows:
        old, new = row.old_values or {}, row.new_values or {}
        if old.get("audited_at") != new.get("audited_at"):
            kind = "verdict"
        elif old.get("audit_status") == new.get("audit_status"):
            continue
        elif new.get("audit_status") == NEED_AUDIT:
            kind = "scan"
        else:
            kind = "content_change"
        entries.append(
            {
                "kind": kind,
                "status": new.get("audit_status"),
                "note": new.get("audit_note") if kind == "verdict" else None,
                "at": row.created_at,
                "actor_uuid": str(row.user_uuid) if row.user_uuid else None,
            }
        )
    actors = {entry["actor_uuid"] for entry in entries if entry["actor_uuid"]}
    names = {}
    if actors:
        rows = await db.execute(select(User.uuid, User.name).where(User.uuid.in_(actors)))
        names = {str(uuid): name for uuid, name in rows.all()}
    for entry in entries:
        entry["actor_name"] = names.get(entry["actor_uuid"])
    return entries


async def changes_since_audit(db: AsyncSession, ticket: Tickets) -> list[dict] | None:
    """What differs from the content the last verdict was given on, or None if never audited."""
    if ticket.audited_at is None:
        return None
    current = await content_of(db, ticket)
    return content_changes(ticket.audited_content or {}, current, ticket_uuid=str(ticket.uuid))
