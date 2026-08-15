"""Database-backed integration tests for notification resolver and persistence.

Validates that SQL queries (Role matching, PostGIS spatial ST_Contains, permission lookups)
and dispatch persistence work seamlessly against real PostgreSQL and PostGIS.
"""

import uuid

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.notification import Notification
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService
from tests.conftest import TEST_DB_URL


@pytest.mark.asyncio
async def test_resolve_team_admin_real_db(db: AsyncSession):
    """Verify resolve_team_admin finds users with Role.name == 'admin' in the given team."""
    team = Team(name="花蓮救災隊", type="ngo", status="active")
    db.add(team)
    await db.flush()
    team_id = team.uuid

    admin_role = Role(name="admin", kind="team")
    member_role = Role(name="member", kind="team")
    db.add_all([admin_role, member_role])
    await db.flush()

    alice_admin = User(name="Alice 隊長", team_uuid=team_id)
    bob_member = User(name="Bob 隊員", team_uuid=team_id)
    db.add_all([alice_admin, bob_member])
    await db.flush()

    alice_id = alice_admin.uuid
    bob_id = bob_member.uuid

    db.add_all(
        [
            UserRoleAssign(user_uuid=alice_id, role_uuid=admin_role.uuid),
            UserRoleAssign(user_uuid=bob_id, role_uuid=member_role.uuid),
        ]
    )
    await db.commit()

    admins = await NotificationRecipientResolver.resolve_team_admin(db, team_uuid=team_id)
    assert admins == [str(alice_id)]


@pytest.mark.asyncio
async def test_resolve_gov_and_zone_ngo_with_postgis(db: AsyncSession):
    """Verify resolve_gov_and_zone_ngo resolves Gov staff and NGO Admins whose zone contains the station."""
    gov_team = Team(name="花蓮縣應變中心", type="gov", status="active")
    ngo_team = Team(name="慈濟搜救隊", type="ngo", status="active")
    db.add_all([gov_team, ngo_team])
    await db.flush()

    gov_team_id = gov_team.uuid
    ngo_team_id = ngo_team.uuid

    admin_role = Role(name="admin", kind="team")
    db.add(admin_role)
    await db.flush()

    gov_user = User(name="Charlie 政府專員", team_uuid=gov_team_id)
    ngo_admin = User(name="Alice NGO隊長", team_uuid=ngo_team_id)
    db.add_all([gov_user, ngo_admin])
    await db.flush()

    gov_uid = gov_user.uuid
    ngo_admin_uid = ngo_admin.uuid

    db.add(UserRoleAssign(user_uuid=ngo_admin_uid, role_uuid=admin_role.uuid))
    await db.flush()

    # 建立一個包含 (121.6, 23.99) 的多邊形工作分區
    polygon_wkt = "SRID=4326;POLYGON((121.5 23.9, 121.7 23.9, 121.7 24.1, 121.5 24.1, 121.5 23.9))"
    work_zone = WorkZone(
        name="第一搜救責任區",
        geometry=WKTElement(polygon_wkt, srid=4326),
    )
    db.add(work_zone)
    await db.flush()

    db.add(TeamZoneAssign(team_uuid=ngo_team_id, zone_uuid=work_zone.uuid, assigned_by=str(gov_uid)))
    await db.flush()

    # 建立位於多邊形內部的物資站 (POINT(121.6 23.99))
    station_inside = Station(
        name="吉安國小收容中心",
        geometry=WKTElement("SRID=4326;POINT(121.6 23.99)", srid=4326),
    )
    db.add(station_inside)
    await db.commit()

    station_id = station_inside.uuid
    recipients = await NotificationRecipientResolver.resolve_gov_and_zone_ngo(db, station_uuid=station_id)
    assert str(gov_uid) in recipients
    assert str(ngo_admin_uid) in recipients


@pytest.mark.asyncio
async def test_resolve_permission_scope_filtering(db: AsyncSession):
    """Verify resolve_permission only returns users with non-none scopes."""
    perm = Permission(key=Perm.AI_DUP_REVIEW.value, description="AI 重複審核")
    role_valid = Role(name="admin", kind="team")
    role_none = Role(name="guest", kind="team")
    db.add_all([perm, role_valid, role_none])
    await db.flush()

    db.add_all(
        [
            RolePermissionAssign(role_uuid=role_valid.uuid, permission_uuid=perm.uuid, scope="all"),
            RolePermissionAssign(role_uuid=role_none.uuid, permission_uuid=perm.uuid, scope="none"),
        ]
    )
    await db.flush()

    user_with_grant = User(name="審核員 A")
    user_with_none = User(name="無權限者 B")
    user_direct_grant = User(name="個別授權者 C")
    db.add_all([user_with_grant, user_with_none, user_direct_grant])
    await db.flush()

    uid_grant = user_with_grant.uuid
    uid_none = user_with_none.uuid
    uid_direct = user_direct_grant.uuid

    db.add_all(
        [
            UserRoleAssign(user_uuid=uid_grant, role_uuid=role_valid.uuid),
            UserRoleAssign(user_uuid=uid_none, role_uuid=role_none.uuid),
            UserPermissionAssign(user_uuid=uid_direct, permission_uuid=perm.uuid, scope="own"),
        ]
    )
    await db.commit()

    recipients = await NotificationRecipientResolver.resolve_permission(db, Perm.AI_DUP_REVIEW.value)
    assert str(uid_grant) in recipients
    assert str(uid_direct) in recipients
    assert str(uid_none) not in recipients


@pytest.mark.asyncio
async def test_notification_dispatch_persists_across_sessions(db: AsyncSession):
    """Verify notifications dispatched are committed and persist after the session is closed."""
    recipient = User(name="Recipient User")
    actor = User(name="Actor User")
    db.add_all([recipient, actor])
    await db.flush()

    rec_id = recipient.uuid
    act_id = actor.uuid
    await db.commit()

    notifs = await NotificationService.dispatch(
        db=db,
        event_type="zone_assigned",
        title="⚠️ 【緊急】新工作分區指派",
        body="您的團隊已獲指派責任分區。",
        priority="urgent",
        actor_uuid=act_id,
        ref_type="work_zone",
        ref_uuid=uuid.uuid4(),
        explicit_recipients=[rec_id],
    )
    assert len(notifs) == 1
    notif_uuid = notifs[0].uuid

    # 模擬連線結束，建立全新的 Engine 與 Session 查詢真實資料庫
    test_engine = create_async_engine(TEST_DB_URL, echo=False)
    session_factory = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as fresh_db:
        result = await fresh_db.execute(select(Notification).where(Notification.uuid == notif_uuid))
        persisted = result.scalars().first()
        assert persisted is not None, "Notification must be committed and visible in a fresh DB session"
        assert persisted.recipient_uuid == rec_id
        assert persisted.actor_uuid == act_id
        assert persisted.priority == "urgent"
        assert persisted.read is False
        assert persisted.created_at is not None

    await test_engine.dispose()
