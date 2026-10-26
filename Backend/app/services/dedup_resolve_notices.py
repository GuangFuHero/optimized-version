"""The notices a dedup resolve sends once it has committed (Spec 028 §6, ADR-379).

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
    """Every notice the resolve sends, in a fixed order; each points at the primary ticket."""
    notices = [
        *_moved(outcome),
        *_canceled(outcome),
        *_contact_changed(outcome),
        *_owners(outcome),
    ]
    return [{**notice, "ref_uuid": outcome.plan.primary_uuid} for notice in notices]


def _moved(outcome) -> list[dict]:
    moved = sorted({person for people in outcome.moved_people.values() for person in people})
    if not moved:
        return []
    return [
        {
            "event_type": "dedup_task_merged",
            "title": f"你承接的需求已合併到「{outcome.primary_title}」",
            "body": (
                "這筆需求和另一張重複的單合併了，聯絡人改成這張單的聯絡人，請到單上查看。你的承接照常有效。"
            ),
            "priority": "high",
            "explicit_recipients": moved,
        }
    ]


def _canceled(outcome) -> list[dict]:
    """People on a cancelled need, told in one of two ways (ADR-390).

    The other ticket's needs went to the primary; the primary's own just stopped, so only the
    people on the first are told where the matter went.
    """
    other, own = set(), set()
    for task, people in outcome.canceled_people.items():
        (other if task in outcome.secondary_task_uuids else own).update(people)
    own -= other  # one notice of a kind per person; the other ticket's wording also covers theirs
    title = outcome.primary_title
    notices = []
    if other:
        notices.append(
            {
                "event_type": "dedup_task_canceled",
                "title": "你承接的需求已取消",
                "body": f"重複審核後，你承接的需求已取消，不用前往了。這件事改由「{title}」處理。",
                "priority": "high",
                "explicit_recipients": sorted(other),
            }
        )
    if own:
        notices.append(
            {
                "event_type": "dedup_task_canceled",
                "title": "你承接的需求已取消",
                "body": f"「{title}」和另一張重複的單合併時，你承接的這筆需求取消了，不用前往了。",
                "priority": "high",
                "explicit_recipients": sorted(own),
            }
        )
    return notices


def _contact_changed(outcome) -> list[dict]:
    """The primary's own volunteers, when the resolve changed its contact (ADR-389)."""
    if not outcome.contact_changed or not outcome.staying_people:
        return []
    return [
        {
            "event_type": "dedup_ticket_contact_changed",
            "title": f"「{outcome.primary_title}」的聯絡人已更新",
            "body": "這張單和另一張重複的單合併後，聯絡人有更新，請到單上查看。你的承接照常有效。",
            "priority": "high",
            "explicit_recipients": list(outcome.staying_people),
        }
    ]


def _owners(outcome) -> list[dict]:
    """Both tickets' owners; someone who filed both hears once, by the merged notice (ADR-390)."""
    title = outcome.primary_title
    notices = []
    if outcome.secondary_owner:
        notices.append(
            {
                "event_type": "dedup_ticket_merged",
                "title": f"你的求助「{outcome.secondary_title}」已併入「{title}」",
                "body": _secondary_body(outcome),
                "priority": "medium",
                "explicit_recipients": [outcome.secondary_owner],
            }
        )
    if (
        outcome.primary_owner
        and outcome.primary_owner != outcome.secondary_owner
        and _primary_changed(outcome)
    ):
        notices.append(
            {
                "event_type": "dedup_ticket_updated",
                "title": f"你的求助「{title}」已因重複審核更新",
                "body": "另一張重複的單併入了你的單，內容或需求有調整，請到單上確認。",
                "priority": "medium",
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


def _primary_changed(outcome) -> bool:
    """Whether anything on the primary ticket changed (ADR-383).

    The other ticket's cancelled needs are not the primary's: picking A as it is, with every need
    of B cancelled, leaves A untouched and its owner is not told otherwise.
    """
    plan = outcome.plan
    own_canceled = [uuid for uuid in plan.canceled_tasks if uuid not in outcome.secondary_task_uuids]
    return bool(
        plan.ticket_changes
        or plan.absorbed
        or own_canceled
        or plan.property_changes
        or plan.property_moves
        or plan.canceled_properties
        or plan.moved_photos
        or plan.canceled_photos
        or plan.disaster_details is not None
        or any(k.moved or k.changes for k in plan.kept_tasks)
    )
