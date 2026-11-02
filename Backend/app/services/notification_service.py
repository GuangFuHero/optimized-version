"""Service orchestrating notification dispatch and creation."""

import uuid as _uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

# The `params` keys each notice type stores, so a client can write the sentence itself. Every key is
# always present; a name the source row lacks is null, and the ids stay in ref_type/ref_uuid.
_STATION = ("station_name", "station_type")
_STATION_SUGGESTION = (*_STATION, "field", "property_name")  # property_name: null for a station field
_TASK = ("ticket_title", "task_name")
_ROLE_REQUEST = ("requested_role", "team_name", "new_team_name")  # government, ngo or data_auditor
PARAM_KEYS: dict[str, frozenset[str]] = {
    type_: frozenset(keys)
    for type_, keys in {
        "station_suggestion_created": _STATION_SUGGESTION,
        "station_suggestion_adopted": _STATION_SUGGESTION,
        "station_suggestion_adopted_edited": _STATION_SUGGESTION,
        "station_suggestion_not_adopted": _STATION_SUGGESTION,
        # change: "created" for a new station, "status" when property_name's live value changed.
        "resource_station_updated": (*_STATION, "change", "property_name"),
        "station_assigned": (*_STATION, "team_name"),
        "station_unassigned": (*_STATION, "team_name"),
        "zone_assigned": ("zone_name", "team_name"),
        "zone_unassigned": ("zone_name", "team_name"),
        "team_member_added": ("team_name", "role"),  # role: the team role granted, e.g. member/admin
        "team_suspended": ("team_name",),
        "role_request_submitted": (*_ROLE_REQUEST, "applicant_name"),
        "role_request_approved": _ROLE_REQUEST,
        "role_request_rejected": (*_ROLE_REQUEST, "review_note"),
        "announcement_published": ("placement",),  # the public excerpt, when there is one, is the body
        "dedup_review_pending": ("count",),
        "dedup_task_merged": ("primary_title",),
        # task_ticket: "secondary" for a need on the ticket merged away, "primary" for one on the kept one.
        "dedup_task_canceled": ("primary_title", "task_ticket"),
        "dedup_ticket_contact_changed": ("primary_title",),
        # The three lists hold need names: folded into a need of the kept ticket, moved to it, cancelled.
        "dedup_ticket_merged": (
            "primary_title",
            "secondary_title",
            "absorbed_tasks",
            "moved_tasks",
            "canceled_tasks",
        ),
        "dedup_ticket_updated": ("primary_title",),
        "ticket_deleted": ("ticket_title",),
        "task_deleted": _TASK,
        "task_assignment_created": _TASK,
        "task_assignment_removed": _TASK,
        "task_full": _TASK,
        "task_recruiting_stopped": _TASK,
        "task_claimed": (*_TASK, "assignee_name", "claimed", "quantity"),  # quantity: null when uncapped
        "ticket_audit_issue": ("ticket_title", "recipient"),  # recipient: requester or volunteer
    }.items()
}


def _to_uuid_obj(val: Any) -> _uuid.UUID | None:
    """Normalize a string or UUID object to a Python uuid.UUID instance."""
    if val is None:
        return None
    if isinstance(val, _uuid.UUID):
        return val
    try:
        return _uuid.UUID(str(val))
    except (ValueError, AttributeError):
        return None


class NotificationService:
    """Orchestrates event-to-notification conversion, recipient filtering, and batch DB persistence."""

    @staticmethod
    async def dispatch(
        db: AsyncSession,
        *,
        event_type: str,
        title: str,
        body: str,
        params: dict[str, Any],
        priority: str = "medium",
        actor_uuid: str | _uuid.UUID | None = None,
        ref_type: str | None = None,
        ref_uuid: str | _uuid.UUID | None = None,
        explicit_recipients: list[str | _uuid.UUID] | None = None,
    ) -> list[Notification]:
        """Create and batch-insert notifications for a resolved list of recipients.

        Automatically excludes actor_uuid so users are not notified of their own actions.
        `params` must carry exactly the keys PARAM_KEYS lists for `event_type`.

        Commits before returning. Production sessions use expire_on_commit=False
        (app/db/session.py), but the test suite runs with SQLAlchemy's default True
        (tests/conftest.py) so callers are held to the stricter contract: read anything you
        still need off your own ORM objects *before* calling this, and refresh the returned
        Notification instances before reading their attributes.
        """
        if set(params) != PARAM_KEYS[event_type]:
            raise ValueError(
                f"{event_type} needs params {sorted(PARAM_KEYS[event_type])}, not {sorted(params)}"
            )
        actor_obj = _to_uuid_obj(actor_uuid)
        ref_obj = _to_uuid_obj(ref_uuid)

        # Normalize and deduplicate recipient UUIDs
        recipient_set: set[_uuid.UUID] = set()
        for r in explicit_recipients or []:
            u = _to_uuid_obj(r)
            if u is not None:
                recipient_set.add(u)

        # 排除觸發者本人 (避免自己通知自己)
        if actor_obj and actor_obj in recipient_set:
            recipient_set.remove(actor_obj)

        if not recipient_set:
            return []

        notifications = [
            Notification(
                recipient_uuid=rec_uuid,
                actor_uuid=actor_obj,
                type=event_type,
                priority=priority,
                ref_type=ref_type,
                ref_uuid=ref_obj,
                title=title,
                body=body,
                params=params,
            )
            for rec_uuid in recipient_set
        ]

        db.add_all(notifications)
        await db.commit()
        return notifications


notification_service = NotificationService()
