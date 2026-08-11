"""Endpoints for querying, counting, and marking notifications as read."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.repositories.notification_repository import notification_repository
from app.schemas.notification import (
    MarkAllReadResponse,
    NotificationItem,
    NotificationListResponse,
    UnreadCountResponse,
)

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1, description="頁碼 (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="每頁筆數 (上限 100)"),
    unread_only: bool = Query(False, description="僅篩選未讀通知"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
) -> NotificationListResponse:
    """取得當前登入使用者的分頁通知列表 (依建立時間降序排序)。"""
    skip = (page - 1) * page_size
    items = await notification_repository.list_for_recipient(
        db,
        recipient_uuid=current_user.uuid,
        skip=skip,
        limit=page_size,
        unread_only=unread_only,
    )
    total = await notification_repository.count_for_recipient(
        db,
        recipient_uuid=current_user.uuid,
        unread_only=unread_only,
    )
    return NotificationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=total > page * page_size,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
) -> UnreadCountResponse:
    """取得當前使用者之未讀通知數量與是否存在 urgent 等級未讀通知。"""
    count, has_urgent = await notification_repository.get_unread_summary(
        db,
        recipient_uuid=current_user.uuid,
    )
    return UnreadCountResponse(
        unread_count=count,
        has_urgent=has_urgent,
    )


@router.patch("/{uuid}/read", response_model=NotificationItem)
async def mark_notification_read(
    uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
) -> NotificationItem:
    """標記單筆通知為已讀。
    
    安全性保證：若該通知不存在或不屬於當前使用者，一律回傳 404 (防止跨使用者探測 ID)。
    """
    notification = await notification_repository.mark_as_read(
        db,
        uuid=uuid,
        recipient_uuid=current_user.uuid,
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="通知不存在或無權限操作",
        )
    return notification


@router.patch("/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
) -> MarkAllReadResponse:
    """一鍵將當前使用者的所有未讀通知標記為已讀。"""
    updated_count = await notification_repository.mark_all_as_read(
        db,
        recipient_uuid=current_user.uuid,
    )
    return MarkAllReadResponse(updated_count=updated_count)
