"""Live verification script for notification data retention worker.

Usage:
    python3 scripts/verify_retention_live.py
"""

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

# 將 Backend 根目錄加入 sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.auth import User  # noqa: E402
from app.models.notification import Notification  # noqa: E402


async def verify_retention_live():
    """Verify retention cleanup accurately soft-deletes 30d read and 90d created notifications."""
    now = datetime.now(UTC)
    uids = [uuid.uuid4() for _ in range(4)]

    async with SessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalars().first()
        if not user:
            print("❌ 請先確保資料庫中有使用者！請先執行 python3 scripts/seed_fake_notifications.py")
            return

        # 1. 插入 4 筆測試通知
        n1_expired_read = Notification(
            uuid=uids[0],
            recipient_uuid=user.uuid,
            type="resource_station_updated",
            title="[過期已讀] 35天前物資更新",
            body="已讀且超過30天，應被清理",
            priority="medium",
            read=True,
            read_at=now - timedelta(days=35),
            created_at=now - timedelta(days=35),
        )
        n2_expired_created = Notification(
            uuid=uids[1],
            recipient_uuid=user.uuid,
            type="announcement_published",
            title="[過期未讀] 95天前緊急公告",
            body="建立超過90天，應被清理",
            priority="urgent",
            read=False,
            created_at=now - timedelta(days=95),
        )
        n3_fresh_read = Notification(
            uuid=uids[2],
            recipient_uuid=user.uuid,
            type="ticket_task_status_update",
            title="[新鮮已讀] 10天前任務完成",
            body="未滿30天，應保留",
            priority="medium",
            read=True,
            read_at=now - timedelta(days=10),
            created_at=now - timedelta(days=10),
        )
        n4_fresh_unread = Notification(
            uuid=uids[3],
            recipient_uuid=user.uuid,
            type="zone_assigned",
            title="[新鮮未讀] 5天前新工作分區",
            body="未滿90天，應保留",
            priority="high",
            read=False,
            created_at=now - timedelta(days=5),
        )

        db.add_all([n1_expired_read, n2_expired_created, n3_fresh_read, n4_fresh_unread])
        await db.commit()

    print("=" * 75)
    print("📦 1. 成功向資料庫寫入 4 筆不同生命週期的測試通知：")
    print("   - N1: [過期已讀] 已讀 35 天前 ➔ 預期: 軟刪除 (delete_at != None)")
    print("   - N2: [過期未讀] 建立 95 天前 ➔ 預期: 軟刪除 (delete_at != None)")
    print("   - N3: [新鮮已讀] 已讀 10 天前 ➔ 預期: 保留   (delete_at == None)")
    print("   - N4: [新鮮未讀] 建立 5 天前  ➔ 預期: 保留   (delete_at == None)")
    print("=" * 75)

    # 2. 呼叫 Retention Worker 邏輯
    print("\n🚀 2. 執行通知資料保留清理 (Retention Cleanup) ...")
    from app.services.retention import cleanup_expired_notifications

    async with SessionLocal() as db:
        cleaned_count = await cleanup_expired_notifications(db)
        print(f"✅ 清理完成！共軟刪除 {cleaned_count} 筆過期通知。")

    # 3. 檢查資料庫中這 4 筆的 delete_at 狀態
    async with SessionLocal() as db:
        print("\n🔍 3. 檢查資料庫實際軟刪除與保留狀態：")
        for i, uid in enumerate(uids):
            res = await db.execute(select(Notification).where(Notification.uuid == uid))
            item = res.scalars().first()
            is_deleted = item.delete_at is not None
            status_text = (
                f"❌ 已軟刪除 (delete_at = {str(item.delete_at)[:19]})"
                if is_deleted
                else "✅ 正常保留 (delete_at = None)"
            )
            print(f"   - N{i + 1}: {item.title:<24} ➔ {status_text}")

        # 斷言檢查
        res_n1 = await db.scalar(select(Notification.delete_at).where(Notification.uuid == uids[0]))
        res_n2 = await db.scalar(select(Notification.delete_at).where(Notification.uuid == uids[1]))
        res_n3 = await db.scalar(select(Notification.delete_at).where(Notification.uuid == uids[2]))
        res_n4 = await db.scalar(select(Notification.delete_at).where(Notification.uuid == uids[3]))

        assert res_n1 is not None, "N1 應該要被刪除"
        assert res_n2 is not None, "N2 應該要被刪除"
        assert res_n3 is None, "N3 應該要保留"
        assert res_n4 is None, "N4 應該要保留"

    print("\n" + "=" * 75)
    print("🎉 實機測試完全正確！過期的 2 筆被精確清理，新鮮的 2 筆完好保留！")
    print("=" * 75)


if __name__ == "__main__":
    asyncio.run(verify_retention_live())
