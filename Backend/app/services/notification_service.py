"""Service orchestrating notification dispatch and creation."""

import uuid as _uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


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
        priority: str = "medium",
        actor_uuid: str | _uuid.UUID | None = None,
        ref_type: str | None = None,
        ref_uuid: str | _uuid.UUID | None = None,
        explicit_recipients: list[str | _uuid.UUID] | None = None,
    ) -> list[Notification]:
        """Create and batch-insert notifications for a resolved list of recipients.

        Automatically excludes actor_uuid so users are not notified of their own actions.
        """
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
            )
            for rec_uuid in recipient_set
        ]

        db.add_all(notifications)
        await db.flush()
        return notifications


notification_service = NotificationService()
