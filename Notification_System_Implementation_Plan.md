# Notification System — Detailed Implementation Plan (通知系統實作計畫規格書)

| 欄位 | 說明 |
|---|---|
| 文件狀態 | Draft — Ready for Implementation |
| 依據規格 | [Notification_System_PRD.md](file:///Users/kaijenz/optimized-version/Notification_System_PRD.md) |
| 目標版本 | MVP |
| 核心技術棧 | Python 3.11+ / FastAPI / SQLAlchemy 2.0 (Async) / Alembic / PostgreSQL (PostGIS) / React |

---

## 1. 系統架構總覽 (System Architecture)

通知系統採 **「寫入時解析 (Write-time Resolution)」** 與 **「輪詢傳遞 (Polling Delivery)」** 機制。

```mermaid
flowchart TD
    subgraph Trigger_Layer [1. 業務異動觸發層 (Business Triggers)]
        T1[Work Zone 分派/解約] --> Hook[Notification Dispatcher / Service]
        T2[工單任務審核/狀態變更] --> Hook
        T3[任務指派成員] --> Hook
        T4[物資站異動/去重標記] --> Hook
        T5[全站公告發布] --> Hook
    end

    subgraph Resolution_Layer [2. 接收對象解析層 (Recipient Resolver)]
        Hook --> Resolver{依 Scope 解析接收對象}
        Resolver -->|own| R_Own[直接取得 target user_uuid]
        Resolver -->|team_admin| R_Admin[查詢該團隊 ngo_admin]
        Resolver -->|team_type:gov| R_Gov[查詢全體 Gov 成員 + 轄區 NGO Admin]
        Resolver -->|permission| R_Perm[查詢持 dedup 權限之人員]
        Resolver -->|all| R_All[全體啟用中之使用者]
    end

    subgraph Storage_Layer [3. 資料儲存與 API 層 (Storage & API)]
        R_Own & R_Admin & R_Gov & R_Perm & R_All --> BatchInsert[(notifications 資料表<br/>批次寫入)]
        BatchInsert --> API_List[GET /api/v1/notifications]
        BatchInsert --> API_Count[GET /api/v1/notifications/unread-count]
        BatchInsert --> API_Read[PATCH /api/v1/notifications/read]
        BatchInsert --> API_ReadAll[PATCH /api/v1/notifications/read-all]
    end

    subgraph Frontend_Layer [4. 前端互動層 (Frontend UI/UX)]
        API_Count -. 30s 輪詢 .-> Bell[小鈴鐺 Badge (1~9, 9+)]
        API_List -. 點擊展開 .-> Panel[下拉通知面板 + 樂觀已讀 + 導頁]
        API_Count -. 若含 urgent .-> Toast[緊急 Toast 快訊通知]
    end
```

---

## 2. 第一階段：資料庫模型與 Alembic Migration

### 2.1 ORM 模型定義 (`Backend/app/models/notification.py`)
建立 `Notification` 模型，繼承既有的 `UUIDPKMixin` 與 `TimestampMixin`：

```python
"""SQLAlchemy ORM model for user notifications."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Notification(Base, UUIDPKMixin, TimestampMixin):
    """ORM model representing an in-app notification for a user."""

    __tablename__ = "notifications"

    recipient_uuid: Mapped[str] = mapped_column(
        ForeignKey("users.uuid", ondelete="CASCADE"),
        index=True,
        nullable=False,
        comment="接收通知的使用者 UUID",
    )
    actor_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
        comment="觸發此事件的使用者 UUID (系統觸發為 NULL)",
    )

    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="通知類型 enum: zone_assigned, ticket_task_status_update...",
    )
    priority: Mapped[str] = mapped_column(
        String(20),
        default="medium",
        nullable=False,
        comment="優先級: urgent / high / medium / info",
    )

    # 多型引用 (Polymorphic Reference)，避免寫死 URL
    ref_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="關聯實體類型: work_zone / ticket_task / station / announcement",
    )
    ref_uuid: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="關聯實體之 UUID",
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="通知標題",
    )
    body: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="通知內文 (支援摘要截斷)",
    )

    read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="是否已讀",
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="已讀時間",
    )

    # 複合索引：優化高頻未讀數統計與分頁排序
    __table_args__ = (
        Index(
            "ix_notifications_recipient_unread",
            "recipient_uuid",
            "read",
            "delete_at",
        ),
        Index(
            "ix_notifications_recipient_created",
            "recipient_uuid",
            "created_at",
        ),
    )
```

### 2.2 Alembic Migration 規劃
1. 註冊新 Model 至 `Backend/app/models/__init__.py`。
2. 執行指令：
   ```bash
   alembic revision --autogenerate -m "create_notifications_table"
   ```
3. 檢查生成的 Migration 檔案，確認 Foreign Key 級聯刪除 (`CASCADE` / `SET NULL`) 與索引名稱。

---

## 3. 第二階段：接收者解析器與核心發送服務

### 3.1 接收對象解析器 (`Backend/app/services/notification_resolver.py`)
負責將各業務事件轉換為具體的 `recipient_uuid` 列表。嚴格遵循專案 **RBAC v1** 架構（`Role`, `Permission`, `UserRoleAssign`, `UserPermissionAssign`, `Team`）：

```python
"""Resolution logic mapping notification scopes to concrete recipient UUIDs."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.geo import BaseGeometry, Station
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.team import Team, TeamZoneAssign, WorkZone


class NotificationRecipientResolver:
    """Resolves recipient user UUIDs based on RBAC v1 and domain context."""

    @staticmethod
    async def resolve_own(user_uuid: str | None) -> list[str]:
        return [user_uuid] if user_uuid else []

    @staticmethod
    async def resolve_team_admin(
        db: AsyncSession, team_uuid: str, org_type: str = "ngo"
    ) -> list[str]:
        """找出指定團隊的管理員 (例如 ngo_admin 或 gov_admin)。
        
        嚴格過濾 User.team_uuid == team_uuid 與 Role.name == f"{org_type}_admin"。
        """
        admin_role_name = f"{org_type}_admin"
        stmt = (
            select(User.uuid)
            .join(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
            .join(Role, Role.uuid == UserRoleAssign.role_uuid)
            .where(
                User.delete_at.is_(None),
                User.team_uuid == team_uuid,
                Role.name == admin_role_name,
            )
        )
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]

    @staticmethod
    async def resolve_gov_and_zone_ngo(
        db: AsyncSession, station_uuid: str | None = None
    ) -> list[str]:
        """Q8 決議：全體 Gov 團隊人員 + 轄區涵蓋該站點的 NGO Admin。"""
        recipients: set[str] = set()

        # 1. 查詢所有 Gov 團隊人員 (teams.type == 'gov')
        gov_stmt = (
            select(User.uuid)
            .join(Team, Team.uuid == User.team_uuid)
            .where(
                User.delete_at.is_(None),
                Team.delete_at.is_(None),
                Team.type == "gov",
            )
        )
        gov_res = await db.execute(gov_stmt)
        recipients.update(str(uid) for uid in gov_res.scalars().all())

        # 2. 若有指定站點 UUID，透過 PostGIS 空間查詢找出涵蓋該站點的 WorkZone
        #    並找出被指派該 WorkZone 的 NGO 團隊 Admin
        if station_uuid:
            from sqlalchemy import func
            ngo_admin_stmt = (
                select(User.uuid)
                .join(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
                .join(Role, Role.uuid == UserRoleAssign.role_uuid)
                .join(Team, Team.uuid == User.team_uuid)
                .join(TeamZoneAssign, TeamZoneAssign.team_uuid == Team.uuid)
                .join(WorkZone, WorkZone.uuid == TeamZoneAssign.zone_uuid)
                .join(Station, Station.uuid == station_uuid)
                .where(
                    User.delete_at.is_(None),
                    Team.type == "ngo",
                    Role.name == "ngo_admin",
                    func.ST_Contains(WorkZone.geometry, Station.geometry),
                )
            )
            ngo_res = await db.execute(ngo_admin_stmt)
            recipients.update(str(uid) for uid in ngo_res.scalars().all())

        return list(recipients)

    @staticmethod
    async def resolve_permission(db: AsyncSession, capability_key: str) -> list[str]:
        """Q2 決議：查詢持有指定 capability key 的所有使用者 (Role 或 User 直接指派)。"""
        stmt = (
            select(User.uuid)
            .outerjoin(UserRoleAssign, UserRoleAssign.user_uuid == User.uuid)
            .outerjoin(RolePermissionAssign, RolePermissionAssign.role_uuid == UserRoleAssign.role_uuid)
            .outerjoin(UserPermissionAssign, UserPermissionAssign.user_uuid == User.uuid)
            .join(
                Permission,
                (Permission.uuid == RolePermissionAssign.permission_uuid)
                | (Permission.uuid == UserPermissionAssign.permission_uuid),
            )
            .where(
                User.delete_at.is_(None),
                Permission.key == capability_key,
            )
            .distinct()
        )
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]

    @staticmethod
    async def resolve_all_active(db: AsyncSession) -> list[str]:
        """全體啟用中的使用者。"""
        stmt = select(User.uuid).where(User.delete_at.is_(None))
        result = await db.execute(stmt)
        return [str(uid) for uid in result.scalars().all()]
```

### 3.2 核心寫入服務 (`Backend/app/services/notification_service.py`)
```python
"""Service for orchestrating and creating notification records."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.services.notification_resolver import NotificationRecipientResolver


class NotificationService:
    @staticmethod
    async def dispatch(
        db: AsyncSession,
        event_type: str,
        title: str,
        body: str,
        priority: str = "medium",
        actor_uuid: str | None = None,
        ref_type: str | None = None,
        ref_uuid: str | None = None,
        explicit_recipients: list[str] | None = None,
    ) -> list[Notification]:
        """建立並批次寫入通知，自動過濾觸發者自己。"""
        recipient_uuids = set(explicit_recipients or [])

        # 排除觸發者本人 (避免自己通知自己)
        if actor_uuid and actor_uuid in recipient_uuids:
            recipient_uuids.remove(actor_uuid)

        if not recipient_uuids:
            return []

        notifications = [
            Notification(
                recipient_uuid=uid,
                actor_uuid=actor_uuid,
                type=event_type,
                priority=priority,
                ref_type=ref_type,
                ref_uuid=ref_uuid,
                title=title,
                body=body,
            )
            for uid in recipient_uuids
        ]

        db.add_all(notifications)
        await db.flush()
        return notifications
```

---

## 4. 第三階段：觸發事件與業務端點串接 (Trigger Matrix)

| 事件名稱 (`type`) | 業務觸發位置 | 優先級 | 接收者解析方式 | 通知標題範例 |
|---|---|---|---|---|
| `zone_assigned` | `TeamZoneService.assign_zone()` | **Urgent** | `resolve_team_admin(team_uuid, "ngo")` | ⚠️ 新指派工作區域通知 |
| `zone_unassigned` | `TeamZoneService.unassign_zone()` | High | `resolve_team_admin(team_uuid, "ngo")` | 工作區域指派已解除 |
| `ticket_task_moderation_update` | `TicketTaskService.update_moderation()` | High | `task.created_by` + 被指派志工 | 工單審核狀態更新: {status} |
| `ticket_task_status_update` | `TicketTaskService.update_status()` | Medium | 該任務 `task_assignments.actor_uuid` | 工單進度更新: {status} |
| `task_assignment_created` | `TaskAssignmentService.create_assignment()` | High | 新被指派之 `actor_uuid` | 📋 您有新的任務指派 |
| `dedup_flag_ticket` | `TicketDedupService.flag_duplicate()` | Medium | `resolve_permission("dedup.ticket.manage")` | 重複工單待審核通知 |
| `dedup_flag_station` | `StationDedupService.flag_duplicate()` | Medium | `resolve_permission("dedup.station.manage")` | 重複物資站待審核通知 |
| `resource_station_updated` | `StationService.update_station()` | Medium | `resolve_gov_and_zone_ngo(station_uuid)` | 資源站狀態更新: {station_name} |
| `team_member_added` | `TeamService.add_member()` | High | 被加入之 `user_uuid` | 歡迎加入團隊: {team_name} |
| `announcement_published` | `AnnouncementService.publish()` | Medium | `resolve_all_active()` | 📢 全站重要公告: {title} |

---

## 5. 第四階段：RESTful API 端點與 Pydantic Schemas

### 5.1 Schemas 定義 (`Backend/app/schemas/notification.py`)
```python
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class NotificationItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: str
    recipient_uuid: str
    actor_uuid: str | None = None
    type: str
    priority: str
    ref_type: str | None = None
    ref_uuid: str | None = None
    title: str
    body: str
    read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class UnreadCountResponse(BaseModel):
    unread_count: int
    has_urgent: bool
```

### 5.2 Endpoints 實作規格 (`Backend/app/api/v1/endpoints/notifications.py`)

```python
@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1, description="頁碼"),
    page_size: int = Query(20, ge=1, le=100, description="每頁筆數 (上限 100)"),
    unread_only: bool = Query(False, description="僅篩選未讀通知"),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """取得當前使用者的分頁通知列表 (依 created_at DESC 排序)。"""
    ...

@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """超輕量輪詢端點：統計當前使用者未讀數量與是否存在 urgent 等級未讀。"""
    ...

@router.patch("/{uuid}/read", response_model=NotificationItem)
async def mark_notification_as_read(
    uuid: str,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """標記單筆通知為已讀。
    
    安全性檢查：若該通知不存在或 recipient_uuid != current_user.uuid，
    一律回傳 404 Not Found (防止跨使用者探測通知 UUID)。
    """
    ...

@router.patch("/read-all", response_model=dict)
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """一鍵將當前使用者的所有未讀通知標記為已讀。"""
    ...
```

---

## 6. 第五階段：前端 UI/UX 實作規範 (Frontend)

### 6.1 輪詢機制與狀態管理
* **常規輪詢**：前台啟動 `useInterval` 或 `useQuery`，每 30 秒呼叫 `GET /notifications/unread-count`。
* **分頁焦點與強制刷新**：
  * 當使用者切換瀏覽器分頁回到 App 時，監聽 `visibilitychange` 事件強制刷新。
  * 使用者進入 `/map` 或 `/tickets` 頁面時強制刷新未讀計數。
* **緊急 Toast 快訊**：
  * 當 `has_urgent == true` 且存在未提示過的緊急通知時，跳出全域 Toast：「⚠️ 收到緊急工作區指派，請儘速確認！」

### 6.2 UI 組件層級
1. **`NotificationBell` (頂端小鈴鐺)**：
   * 顯示紅色 Badge。
   * 數值呈現：`1` ~ `9`，大於 9 顯示 `9+`，0 則隱藏。
2. **`NotificationDropdown` (下拉通知面板)**：
   * 點擊小鈴鐺展開（Popover/Dropdown 模式，不跳頁）。
   * 支援無限滾動（每頁 20 筆）。
   * 左側優先級顏色飾條：
     * `urgent` ➔ 紅色 (`#EF4444`)
     * `high` ➔ 橘色 (`#F97316`)
     * `medium` ➔ 藍色 (`#3B82F6`)
     * `info` ➔ 灰色 (`#9CA3AF`)
   * 「全部標示為已讀」按鈕：點擊後立即樂觀更新前端狀態，背景發送 `PATCH /read-all`，並彈出輕量提示 Toast。
3. **Deep Linking 導頁跳轉規則**：
   * `ref_type == 'ticket_task'` ➔ 打開該工單詳情 Drawer。
   * `ref_type == 'work_zone'` ➔ 跳轉至地圖並自動聚焦至該區域中心。
   * `ref_type == 'station'` ➔ 跳轉至該物資站詳情。
   * `ref_type == 'announcement'` ➔ 開啟公告內容彈窗。

---

## 7. 第六階段：資料清理與保留排程 (Retention Worker)

建立定時清理任務（每日凌晨 03:00 執行）：

```python
"""Retention cleanup job for soft-deleting expired notifications."""

from sqlalchemy import and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.models.notification import Notification


async def cleanup_expired_notifications(db: AsyncSession) -> int:
    """
    Q4 決議：
    1. 已讀且 read_at 超過 30 天 ➔ 標記 delete_at = now()
    2. 建立超過 90 天 (無論讀否) ➔ 標記 delete_at = now()
    """
    stmt = (
        update(Notification)
        .where(
            Notification.delete_at.is_(None),
            or_(
                and_(
                    Notification.read.is_(True),
                    Notification.read_at < func.now() - func.cast("30 days", func.INTERVAL),
                ),
                Notification.created_at < func.now() - func.cast("90 days", func.INTERVAL),
            ),
        )
        .values(delete_at=func.now())
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount
```

---

## 8. 第七階段：測試與驗證計畫 (Testing Strategy)

1. **單元測試 (`tests/test_notification_resolver.py`)**：
   * 驗證 `resolve_team_admin` 是否只找出 `ngo_admin`。
   * 驗證 `resolve_permission` 是否正確篩選出具備 `dedup.ticket.manage` 之使用者。
   * 驗證 `dispatch` 是否正確排除 `actor_uuid`。
2. **API 整合測試 (`tests/test_notification_api.py`)**：
   * 驗證使用者只能讀取自己的通知（嚴格權限隔離）。
   * 驗證 `unread-count` 與 `has_urgent` 正確回傳。
   * 驗證 `PATCH /read` 與 `PATCH /read-all` 正確修改 `read` 與 `read_at`。
3. **端對端業務觸發測試 (`tests/test_notification_triggers.py`)**：
   * 模擬分派工作區 ➔ 驗證 `notifications` 表是否正確寫入 `urgent` 等級通知。
   * 模擬指派工單 ➔ 驗證被指派者收到 `task_assignment_created`。

---

## 9. 執行順序檢核表 (Step-by-Step Execution Plan)

- [ ] **Step 1**: 建立 `Backend/app/models/notification.py` 並生成 Alembic Migration。
- [ ] **Step 2**: 實作 `NotificationRecipientResolver` 與 `NotificationService`。
- [ ] **Step 3**: 實作 `Backend/app/schemas/notification.py` 與 `Backend/app/api/v1/endpoints/notifications.py`。
- [ ] **Step 4**: 在既有 Service 中埋入通知觸發點 (WorkZone, Ticket, Station, Announcement)。
- [ ] **Step 5**: 撰寫後端單元與整合測試並通過驗證。
- [ ] **Step 6**: 實作前端小鈴鐺組件、下拉通知面板、Toast 快訊與 Deep Link 導頁。
- [ ] **Step 7**: 配置定期清理排程任務 (Retention Worker)。
