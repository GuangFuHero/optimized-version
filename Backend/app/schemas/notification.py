"""Pydantic schemas for notifications API requests and responses."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationItem(BaseModel):
    """Schema representing a single notification item."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    recipient_uuid: UUID
    actor_uuid: UUID | None = None
    type: str = Field(..., description="Notification event type")
    priority: str = Field(..., description="Priority: urgent, high, medium, info")
    ref_type: str | None = Field(None, description="Polymorphic entity type")
    ref_uuid: UUID | None = Field(None, description="Polymorphic entity UUID")
    title: str = Field(..., description="Notification title")
    body: str = Field(..., description="Notification body content")
    read: bool = Field(..., description="Read status")
    read_at: datetime | None = Field(None, description="Timestamp when read")
    created_at: datetime = Field(..., description="Creation timestamp")


class NotificationListResponse(BaseModel):
    """Paginated list of notifications."""

    items: list[NotificationItem]
    total: int = Field(..., description="Total matching notifications count")
    page: int = Field(..., description="Current page number (1-indexed)")
    page_size: int = Field(..., description="Items per page")
    has_more: bool = Field(..., description="Whether there are more items")


class UnreadCountResponse(BaseModel):
    """Lightweight unread count response with urgent flag for UI badge and toast."""

    unread_count: int = Field(..., description="Count of unread active notifications")
    has_urgent: bool = Field(..., description="Whether any unread notification has urgent priority")


class MarkAllReadResponse(BaseModel):
    """Response returned after marking all notifications as read."""

    updated_count: int = Field(..., description="Number of notifications marked as read")
