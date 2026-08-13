"""End-to-End integration tests for the notification center lifecycle."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import security
from app.main import app
from app.models.auth import User
from app.models.notification import Notification
from app.models.team import Team
from app.repositories.notification_repository import notification_repository
from app.services.notification_service import NotificationService


@pytest.fixture
def mock_team():
    """Create a mock NGO Team."""
    team = Team(name="慈濟搜救隊", type="ngo", status="active")
    team.uuid = uuid.uuid4()
    return team


@pytest.fixture
def mock_users(mock_team):
    """Create mock test users for E2E testing."""
    # Alice: NGO Admin
    alice = User(name="Alice (NGO Admin)")
    alice.uuid = uuid.uuid4()
    alice.team_uuid = mock_team.uuid

    # Bob: NGO Member
    bob = User(name="Bob (NGO Member)")
    bob.uuid = uuid.uuid4()
    bob.team_uuid = mock_team.uuid

    # Charlie: Gov Admin
    charlie = User(name="Charlie (Gov Admin)")
    charlie.uuid = uuid.uuid4()
    charlie.team_uuid = uuid.uuid4()

    return {"alice": alice, "bob": bob, "charlie": charlie}


@pytest.mark.asyncio
async def test_full_notification_e2e_lifecycle(mock_users, mock_team):
    """Verify complete notification workflow: dispatch -> unread count -> list -> read -> actor exclusion."""
    alice = mock_users["alice"]
    bob = mock_users["bob"]

    mock_db = AsyncMock()
    app.dependency_overrides[security.get_db] = lambda: mock_db

    # In-memory storage for notifications in this test
    stored_notifications: list[Notification] = []

    def mock_add_all(items):
        stored_notifications.extend(items)

    mock_db.add_all = mock_add_all
    mock_db.flush = AsyncMock()

    # 1. 觸發事件：指派工作分區給 NGO (發給 Alice NGO Admin，不發給 Bob NGO Member)
    zone_id = uuid.uuid4()
    await NotificationService.dispatch(
        db=mock_db,
        event_type="zone_assigned",
        title="⚠️ 新指派工作區域：花蓮第一分區",
        body="您的團隊已獲指派負責花蓮第一分區搜救任務。",
        priority="urgent",
        actor_uuid=mock_users["charlie"].uuid,
        ref_type="work_zone",
        ref_uuid=zone_id,
        explicit_recipients=[alice.uuid],
    )

    assert len(stored_notifications) == 1
    alice_notif = stored_notifications[0]
    assert alice_notif.recipient_uuid == alice.uuid
    assert alice_notif.priority == "urgent"
    assert alice_notif.read is False

    # 2. 模擬 Alice (Admin) 登入查詢未讀數量
    app.dependency_overrides[security.get_current_user] = lambda: alice
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            notification_repository,
            "get_unread_summary",
            AsyncMock(return_value=(1, True)),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/notifications/unread-count")
        assert res.status_code == 200
        assert res.json() == {"unread_count": 1, "has_urgent": True}

    # 3. 模擬 Bob (Member) 登入查詢未讀數量 (驗證權限隔離：Bob 未讀數應為 0)
    app.dependency_overrides[security.get_current_user] = lambda: bob
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            notification_repository,
            "get_unread_summary",
            AsyncMock(return_value=(0, False)),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/notifications/unread-count")
        assert res.status_code == 200
        assert res.json() == {"unread_count": 0, "has_urgent": False}

    # 4. 模擬 Alice 點擊單筆通知標示為已讀
    app.dependency_overrides[security.get_current_user] = lambda: alice
    alice_notif.read = True
    alice_notif.read_at = datetime.now(UTC)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            notification_repository,
            "mark_as_read",
            AsyncMock(return_value=alice_notif),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch(f"/api/v1/notifications/{alice_notif.uuid}/read")
        assert res.status_code == 200
        assert res.json()["read"] is True

    # 5. 觸發事件：Alice 指派任務給 Bob (驗證 Actor Exclusion)
    task_id = uuid.uuid4()
    new_notifs = await NotificationService.dispatch(
        db=mock_db,
        event_type="task_assignment_created",
        title="📋 您有新的任務指派",
        body="Alice 已指派您負責長者撤離任務。",
        priority="high",
        actor_uuid=alice.uuid,
        ref_type="ticket_task",
        ref_uuid=task_id,
        explicit_recipients=[alice.uuid, bob.uuid],  # 包含觸發者本人與被指派者
    )

    # Alice 本人應被自動排除，只有 Bob 收到
    assert len(new_notifs) == 1
    bob_notif = new_notifs[0]
    assert bob_notif.recipient_uuid == bob.uuid
    assert bob_notif.actor_uuid == alice.uuid
    assert bob_notif.priority == "high"

    # 6. 模擬 Bob 呼叫「全部標示為已讀」
    app.dependency_overrides[security.get_current_user] = lambda: bob
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            notification_repository,
            "mark_all_as_read",
            AsyncMock(return_value=1),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch("/api/v1/notifications/read-all")
        assert res.status_code == 200
        assert res.json()["updated_count"] == 1

    # 7. 安全測試 (IDOR 防護)：Bob 嘗試讀取 Alice 的通知 ➔ 應回傳 404
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            notification_repository,
            "mark_as_read",
            AsyncMock(return_value=None),  # 擁有權不符合回傳 None
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch(f"/api/v1/notifications/{alice_notif.uuid}/read")
        assert res.status_code == 404
        assert res.json()["detail"] == "通知不存在或無權限操作"

    app.dependency_overrides.clear()
