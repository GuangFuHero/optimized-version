"""Unit tests for the Notification ORM model schema and metadata."""

import uuid

from app.models.base import Base
from app.models.notification import Notification


def test_notification_model_metadata():
    """Verify that the notifications table is registered in Base.metadata with expected schema."""
    table = Base.metadata.tables.get("notifications")
    assert table is not None, "notifications table must exist in Base.metadata"

    # 1. 驗證所有必要欄位存在
    column_names = {c.name for c in table.columns}
    expected_columns = {
        "uuid",
        "recipient_uuid",
        "actor_uuid",
        "type",
        "priority",
        "ref_type",
        "ref_uuid",
        "title",
        "body",
        "read",
        "read_at",
        "created_at",
        "updated_at",
        "delete_at",
    }
    assert expected_columns.issubset(column_names), f"Missing columns: {expected_columns - column_names}"

    # 2. 驗證 Foreign Key 定義
    fks = {fk.parent.name: fk.target_fullname for fk in table.foreign_keys}
    assert fks.get("recipient_uuid") == "users.uuid"
    assert fks.get("actor_uuid") == "users.uuid"

    # 3. 驗證複合索引名稱
    index_names = {ix.name for ix in table.indexes}
    assert "ix_notifications_recipient_unread" in index_names
    assert "ix_notifications_recipient_created" in index_names


def test_notification_instantiation_defaults():
    """Verify creating a Notification instance has correct default values."""
    recipient_id = uuid.uuid4()
    notification = Notification(
        recipient_uuid=recipient_id,
        type="zone_assigned",
        title="⚠️ 新指派工作區域",
        body="您的團隊已獲指派責任分區。",
    )

    assert notification.recipient_uuid == recipient_id
    assert notification.actor_uuid is None
    assert notification.priority == "medium"
    assert notification.read is False
    assert notification.read_at is None
    assert notification.ref_type is None
    assert notification.ref_uuid is None
