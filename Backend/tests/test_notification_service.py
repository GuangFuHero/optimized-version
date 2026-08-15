"""Unit tests for NotificationRecipientResolver and NotificationService dispatch logic."""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService, _to_uuid_obj


def test_to_uuid_obj_normalization():
    """Verify uuid normalization helper handles str, UUID, and invalid inputs."""
    uid = uuid.uuid4()
    assert _to_uuid_obj(uid) == uid
    assert _to_uuid_obj(str(uid)) == uid
    assert _to_uuid_obj(None) is None
    assert _to_uuid_obj("invalid-uuid-string") is None


@pytest.mark.asyncio
async def test_resolve_own():
    """Verify resolve_own returns clean list with the single target user."""
    uid = uuid.uuid4()
    assert await NotificationRecipientResolver.resolve_own(uid) == [str(uid)]
    assert await NotificationRecipientResolver.resolve_own(str(uid)) == [str(uid)]
    assert await NotificationRecipientResolver.resolve_own(None) == []


@pytest.mark.asyncio
async def test_notification_dispatch_actor_exclusion():
    """Verify dispatch excludes actor_uuid from receiving notifications."""
    actor_id = uuid.uuid4()
    recipient_a = uuid.uuid4()
    recipient_b = uuid.uuid4()

    mock_db = AsyncMock()
    added_items = []

    def mock_add_all(items):
        added_items.extend(items)

    mock_db.add_all = mock_add_all
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    # Actor is included in explicit_recipients
    recipients = [actor_id, recipient_a, recipient_b]

    results = await NotificationService.dispatch(
        db=mock_db,
        event_type="ticket_task_status_update",
        title="工單狀態更新",
        body="任務已進入進行中狀態",
        priority="medium",
        actor_uuid=actor_id,
        ref_type="ticket_task",
        ref_uuid=uuid.uuid4(),
        explicit_recipients=recipients,
    )

    # Actor must be excluded -> only recipient_a and recipient_b receive notifications
    assert len(results) == 2
    recipient_uuids = {n.recipient_uuid for n in results}
    assert actor_id not in recipient_uuids
    assert recipient_a in recipient_uuids
    assert recipient_b in recipient_uuids

    for n in results:
        assert n.actor_uuid == actor_id
        assert n.type == "ticket_task_status_update"
        assert n.priority == "medium"
        assert n.read is False


@pytest.mark.asyncio
async def test_notification_dispatch_empty_recipients():
    """Verify dispatch returns empty list if no valid recipients or only actor."""
    actor_id = uuid.uuid4()
    mock_db = AsyncMock()

    # Case 1: Empty list
    res1 = await NotificationService.dispatch(
        db=mock_db,
        event_type="announcement_published",
        title="公告",
        body="內容",
        explicit_recipients=[],
    )
    assert res1 == []

    # Case 2: Only actor in list
    res2 = await NotificationService.dispatch(
        db=mock_db,
        event_type="announcement_published",
        title="公告",
        body="內容",
        actor_uuid=actor_id,
        explicit_recipients=[actor_id],
    )
    assert res2 == []
