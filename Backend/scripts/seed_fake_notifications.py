"""Seed fake notifications, users, and teams for manual verification."""

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

# 將 Backend 根目錄加入 sys.path，確保無論在任何路徑執行腳本都能解析 app 模組
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.auth import User  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.rbac import Role, UserRoleAssign  # noqa: E402
from app.models.team import Team  # noqa: E402

engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed():
    """Seed test data for manual notification center verification."""
    async with AsyncSessionLocal() as db:
        print("🌱 開始產生假使用者、假團隊與假通知資料...")

        # 1. 建立或取得角色 (Roles)
        role_names = [
            ("ngo_admin", "team"),
            ("ngo_member", "team"),
            ("gov_admin", "team"),
            ("user", "platform"),
        ]
        roles = {}
        for r_name, r_kind in role_names:
            res = await db.execute(select(Role).where(Role.name == r_name))
            role = res.scalars().first()
            if not role:
                role = Role(name=r_name, kind=r_kind)
                db.add(role)
                await db.flush()
            roles[r_name] = role

        # 2. 建立或取得假團隊 (Teams)
        res_ngo = await db.execute(select(Team).where(Team.name == "花蓮慈濟搜救隊"))
        ngo_team = res_ngo.scalars().first()
        if not ngo_team:
            ngo_team = Team(name="花蓮慈濟搜救隊", type="ngo", status="active")
            db.add(ngo_team)
            await db.flush()

        res_gov = await db.execute(select(Team).where(Team.name == "花蓮縣災害應變中心"))
        gov_team = res_gov.scalars().first()
        if not gov_team:
            gov_team = Team(name="花蓮縣災害應變中心", type="gov", status="active")
            db.add(gov_team)
            await db.flush()

        # 3. 建立或取得五大 Persona 使用者
        personas = [
            ("Alice (陳隊長 - NGO Admin)", ngo_team.uuid, "ngo_admin"),
            ("Bob (林志工 - NGO Member)", ngo_team.uuid, "ngo_member"),
            ("Charlie (王專員 - Gov Admin)", gov_team.uuid, "gov_admin"),
            ("David (張民眾 - Volunteer)", None, "user"),
            ("Eve (李審核員 - Auditor)", None, "user"),
        ]
        users = {}
        for u_name, team_uid, r_name in personas:
            res = await db.execute(select(User).where(User.name == u_name))
            u = res.scalars().first()
            if not u:
                u = User(name=u_name)
                u.team_uuid = team_uid
                db.add(u)
                await db.flush()

                # 指派角色
                if r_name in roles:
                    db.add(UserRoleAssign(user_uuid=u.uuid, role_uuid=roles[r_name].uuid))
                    await db.flush()
            users[u_name] = u

        alice = users["Alice (陳隊長 - NGO Admin)"]
        bob = users["Bob (林志工 - NGO Member)"]
        charlie = users["Charlie (王專員 - Gov Admin)"]

        # 清除舊的假通知 (重跑自清，確保每次都是精確 3 則)
        await db.execute(delete(Notification))
        await db.commit()

        now = datetime.now(UTC)
        mock_notifications = [
            # --- Alice (NGO Admin): 3 則未讀 (含 1 則 Urgent，會觸發 Toast) ---
            Notification(
                recipient_uuid=alice.uuid,
                actor_uuid=charlie.uuid,
                type="zone_assigned",
                priority="urgent",
                ref_type="work_zone",
                ref_uuid=uuid.uuid4(),
                title="⚠️ 【緊急】新工作分區指派通知",
                body="您的團隊已獲指派花蓮市中正區第一應變分區，請儘速確認並安排志工分工。",
                read=False,
                created_at=now - timedelta(minutes=5),
            ),
            Notification(
                recipient_uuid=alice.uuid,
                actor_uuid=charlie.uuid,
                type="resource_station_updated",
                priority="medium",
                ref_type="station",
                ref_uuid=uuid.uuid4(),
                title="🏢 責任區物資站狀態更新：花蓮體育館",
                body="花蓮體育館收容所物資儲備更新：現存飲用水低於 20%，請評估補給。",
                read=False,
                created_at=now - timedelta(minutes=45),
            ),
            Notification(
                recipient_uuid=alice.uuid,
                type="announcement_published",
                priority="medium",
                ref_type="announcement",
                ref_uuid=uuid.uuid4(),
                title="📢 全站公告：中央災害應變中心二級開設",
                body="全島東部進入防颱整備階段，請各 NGO 隊伍確保通訊設備暢通。",
                read=False,
                created_at=now - timedelta(hours=2),
            ),
            Notification(
                recipient_uuid=alice.uuid,
                type="ticket_task_status_update",
                priority="medium",
                ref_type="ticket_task",
                ref_uuid=uuid.uuid4(),
                title="📋 工單狀態已更新：和平國小民生物資配送",
                body="工單任務狀態已變更為【已完成】。",
                read=True,
                read_at=now - timedelta(hours=1),
                created_at=now - timedelta(days=1),
            ),
            # --- Bob (NGO Member): 2 則未讀 (任務派工 High + 公告) ---
            Notification(
                recipient_uuid=bob.uuid,
                actor_uuid=alice.uuid,
                type="task_assignment_created",
                priority="high",
                ref_type="ticket_task",
                ref_uuid=uuid.uuid4(),
                title="📌 收到新的任務指派：長者撤離協助",
                body="陳隊長已指派您負責「吉安鄉長者撤離協助」任務，預計出發時間 14:00。",
                read=False,
                created_at=now - timedelta(minutes=15),
            ),
            Notification(
                recipient_uuid=bob.uuid,
                type="announcement_published",
                priority="medium",
                ref_type="announcement",
                ref_uuid=uuid.uuid4(),
                title="📢 全站公告：中央災害應變中心二級開設",
                body="全島東部進入防颱整備階段，請各 NGO 隊伍確保通訊設備暢通。",
                read=False,
                created_at=now - timedelta(hours=2),
            ),
            # --- Charlie (Gov Admin): 1 則未讀 ---
            Notification(
                recipient_uuid=charlie.uuid,
                type="resource_station_updated",
                priority="medium",
                ref_type="station",
                ref_uuid=uuid.uuid4(),
                title="🏢 資源物資站狀態更新：吉安國小收容中心",
                body="吉安國小收容中心目前已滿載，請引導民眾前往次要收容所。",
                read=False,
                created_at=now - timedelta(minutes=30),
            ),
        ]

        db.add_all(mock_notifications)
        await db.commit()

        # 生成可直接用於 Swagger "Authorize" 授權的 JWT Token
        from app.core.security import create_access_token

        alice_token = create_access_token({"sub": str(alice.uuid)})
        bob_token = create_access_token({"sub": str(bob.uuid)})
        charlie_token = create_access_token({"sub": str(charlie.uuid)})

        print("\n" + "=" * 80)
        print("✅ 假資料生成完成！Swagger 登入測試 Token 清單：")
        print("=" * 80)
        print("\n👤 1. Alice (NGO Admin - 陳隊長) | 未讀: 3 則 (含 Urgent ⚠️)")
        print(f"   Token: {alice_token}")
        print("\n👤 2. Bob (NGO Member - 林志工)   | 未讀: 2 則 (含 Task 📌)")
        print(f"   Token: {bob_token}")
        print("\n👤 3. Charlie (Gov Admin - 王專員) | 未讀: 1 則 🏢")
        print(f"   Token: {charlie_token}")
        print("\n" + "=" * 80)
        print("🔑 如何在 Swagger 登入測試：")
        print("1. 打開 http://localhost:8000/docs")
        print("2. 點擊右上角綠色的【Authorize 🔓】按鈕")
        print("3. 複製上方任一使用者的 Token 貼入 Value 欄位，點擊【Authorize】")
        print("4. 現在測試 /api/v1/notifications 就不會再出現 Not authenticated 了！")
        print("=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(seed())
