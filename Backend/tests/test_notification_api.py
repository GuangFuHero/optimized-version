"""Integration tests for Notification REST API endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import security
from app.main import app
from app.models.auth import User
from app.models.notification import Notification


@pytest.fixture
def mock_user():
    """Create a mock logged-in User."""
    user = User(name="Test User")
    user.uuid = uuid.uuid4()
    return user


@pytest.fixture
def mock_notification(mock_user):
    """Create a mock Notification for the test user."""
    n = Notification(
        uuid=uuid.uuid4(),
        recipient_uuid=mock_user.uuid,
        actor_uuid=None,
        type="zone_assigned",
        priority="urgent",
        ref_type="work_zone",
        ref_uuid=uuid.uuid4(),
        title="⚠️ 緊急工作區指派",
        body="您的團隊已獲指派責任分區。",
        read=False,
        read_at=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    return n


@pytest.mark.asyncio
async def test_get_unread_count(mock_user):
    """Verify GET /api/v1/notifications/unread-count returns correct count and urgent flag."""
    app.dependency_overrides[security.get_current_user] = lambda: mock_user
    mock_db = AsyncMock()
    app.dependency_overrides[security.get_db] = lambda: mock_db

    with patch(
        "app.api.v1.endpoints.notifications.notification_repository.get_unread_summary",
        new_callable=AsyncMock,
    ) as mock_summary:
        mock_summary.return_value = (3, True)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/notifications/unread-count")

        assert res.status_code == 200
        data = res.json()
        assert data["unread_count"] == 3
        assert data["has_urgent"] is True

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_notifications(mock_user, mock_notification):
    """Verify GET /api/v1/notifications returns paginated list."""
    app.dependency_overrides[security.get_current_user] = lambda: mock_user
    mock_db = AsyncMock()
    app.dependency_overrides[security.get_db] = lambda: mock_db

    with patch(
        "app.api.v1.endpoints.notifications.notification_repository.list_for_recipient",
        new_callable=AsyncMock,
    ) as mock_list, patch(
        "app.api.v1.endpoints.notifications.notification_repository.count_for_recipient",
        new_callable=AsyncMock,
    ) as mock_count:
        mock_list.return_value = [mock_notification]
        mock_count.return_value = 1

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/notifications?page=1&page_size=20")

        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert data["page"] == 1
        assert data["page_size"] == 20
        assert data["has_more"] is False
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "⚠️ 緊急工作區指派"
        assert data["items"][0]["priority"] == "urgent"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_mark_notification_read_success(mock_user, mock_notification):
    """Verify PATCH /api/v1/notifications/{uuid}/read marks notification read."""
    app.dependency_overrides[security.get_current_user] = lambda: mock_user
    mock_db = AsyncMock()
    app.dependency_overrides[security.get_db] = lambda: mock_db

    mock_notification.read = True
    mock_notification.read_at = datetime.now(UTC)

    with patch(
        "app.api.v1.endpoints.notifications.notification_repository.mark_as_read",
        new_callable=AsyncMock,
    ) as mock_mark:
        mock_mark.return_value = mock_notification

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch(f"/api/v1/notifications/{mock_notification.uuid}/read")

        assert res.status_code == 200
        data = res.json()
        assert data["read"] is True

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_mark_notification_read_not_found(mock_user):
    """Verify PATCH /api/v1/notifications/{uuid}/read returns 404 for invalid/unauthorized notification."""
    app.dependency_overrides[security.get_current_user] = lambda: mock_user
    mock_db = AsyncMock()
    app.dependency_overrides[security.get_db] = lambda: mock_db

    with patch(
        "app.api.v1.endpoints.notifications.notification_repository.mark_as_read",
        new_callable=AsyncMock,
    ) as mock_mark:
        mock_mark.return_value = None

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch(f"/api/v1/notifications/{uuid.uuid4()}/read")

        assert res.status_code == 404
        assert res.json()["detail"] == "通知不存在或無權限操作"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_mark_all_notifications_read(mock_user):
    """Verify PATCH /api/v1/notifications/read-all marks all unread notifications."""
    app.dependency_overrides[security.get_current_user] = lambda: mock_user
    mock_db = AsyncMock()
    app.dependency_overrides[security.get_db] = lambda: mock_db

    with patch(
        "app.api.v1.endpoints.notifications.notification_repository.mark_all_as_read",
        new_callable=AsyncMock,
    ) as mock_mark_all:
        mock_mark_all.return_value = 5

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch("/api/v1/notifications/read-all")

        assert res.status_code == 200
        data = res.json()
        assert data["updated_count"] == 5

    app.dependency_overrides.clear()
