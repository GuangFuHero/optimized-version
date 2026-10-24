"""The notices a dedup resolve sends once it has committed (Spec 028 §6, ADR-378).

Four kinds, each pointing at the primary ticket (`ref_type = "ticket"`), which is how everyone gets
there: the cancelled ticket is not shown any more. No phone or email in them — the notice stays in
the inbox while contacts may change again, so it says where to look instead. Each person gets at
most one notice of each kind, and the reviewer none (`dispatch` leaves out the actor).

Sent after the resolve committed: a failure is logged and swallowed, so a notice can never undo a
resolve (as `dedup_review.notify_new_cards`, ADR-345).
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


async def send_resolve_notices(db: AsyncSession, *, outcome, actor: User, actor_uuid) -> None:
    """Tell the people on moved and cancelled needs and both tickets' owners what the resolve did.

    `outcome` is a `dedup_resolve.ResolveOutcome`. The rollback that clears a failed notice expires
    every instance in the session, so `actor` is refreshed for the request that goes on reading it.
    """
    try:
        for notice in _notices(outcome):
            await NotificationService.dispatch(db, actor_uuid=actor_uuid, ref_type="ticket", **notice)
    except Exception:
        logger.exception("Sending the dedup resolve notices failed (pair kept %s)", outcome.plan.primary_uuid)
        await db.rollback()
        await db.refresh(actor)


def _notices(outcome) -> list[dict]:
    plan = outcome.plan
    primary, title = plan.primary_uuid, outcome.primary_title
    notices = []
    moved = sorted({person for people in outcome.moved_people.values() for person in people})
    if moved:
        notices.append(
            {
                "event_type": "dedup_task_merged",
                "title": f"你承接的需求已合併到「{title}」",
                "body": (
                    "這筆需求和另一張重複的單合併了，聯絡人改成這張單的聯絡人，請到單上查看。"
                    "你的承接照常有效。"
                ),
                "priority": "high",
                "ref_uuid": primary,
                "explicit_recipients": moved,
            }
        )
    canceled = sorted({person for people in outcome.canceled_people.values() for person in people})
    if canceled:
        notices.append(
            {
                "event_type": "dedup_task_canceled",
                "title": "你承接的需求已取消",
                "body": f"重複審核後，你承接的需求已取消，不用前往了。這件事改由「{title}」處理。",
                "priority": "high",
                "ref_uuid": primary,
                "explicit_recipients": canceled,
            }
        )
    if outcome.secondary_owner:
        notices.append(
            {
                "event_type": "dedup_ticket_merged",
                "title": f"你的求助「{outcome.secondary_title}」已併入「{title}」",
                "body": _secondary_body(outcome),
                "priority": "medium",
                "ref_uuid": primary,
                "explicit_recipients": [outcome.secondary_owner],
            }
        )
    if outcome.primary_owner and _primary_changed(plan):
        notices.append(
            {
                "event_type": "dedup_ticket_updated",
                "title": f"你的求助「{title}」已因重複審核更新",
                "body": "另一張重複的單併入了你的單，內容或需求有調整，請到單上確認。",
                "priority": "medium",
                "ref_uuid": primary,
                "explicit_recipients": [outcome.primary_owner],
            }
        )
    return notices


def _secondary_body(outcome) -> str:
    plan = outcome.plan
    parts = []
    names = outcome.task_names
    folded = [names[uuid] for uuid in plan.absorbed]
    moved = [names[k.uuid] for k in plan.kept_tasks if k.moved]
    canceled = [names[uuid] for uuid in plan.canceled_tasks if uuid in outcome.secondary_task_uuids]
    if folded:
        parts.append(f"併入：{'、'.join(folded)}")
    if moved:
        parts.append(f"移過去：{'、'.join(moved)}")
    if canceled:
        parts.append(f"取消：{'、'.join(canceled)}")
    summary = "；".join(parts) or "沒有需求移過去"
    return f"重複審核認定這兩張單是同一件事，你的單已取消。{summary}。之後請看這張單。"


def _primary_changed(plan) -> bool:
    return bool(
        plan.ticket_changes
        or plan.absorbed
        or plan.canceled_tasks
        or plan.property_changes
        or plan.property_moves
        or plan.canceled_properties
        or any(k.moved or k.changes for k in plan.kept_tasks)
    )
