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
    # Read the PK after flush but before commit: the session expires attributes on commit
    # (matching app/db/session.py), so touching them afterwards would need a reload.
    await db.flush()
    station_id = station_inside.uuid
    await db.commit()
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
    # dispatch() commits, so the objects it returns are expired — refresh before reading.
    await db.refresh(notifs[0])
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


@pytest.mark.asyncio
async def test_add_team_member_returns_usable_object_after_dispatch(db: AsyncSession):
    """A mutation that dispatches a notification must still hand back a readable object.

    Regression test: `dispatch()` commits, and sessions run with expire_on_commit=True
    (app/db/session.py), so every ORM object the caller still holds is expired at that
    point. `add_team_member` used to read `team.name` inside the dispatch arguments and
    return `target` straight after — both raised MissingGreenlet in async, 500ing
    POST /api/v1/admin/teams/{uuid}/members. This asserts the whole path the endpoint
    walks, including the attribute reads it performs on the return value.
    """
    from unittest.mock import AsyncMock, patch

    from app.services import admin as admin_service

    team = Team(name="慈濟基金會-花蓮聯絡處", type="ngo", status="active")
    role = Role(name="member", kind="team")
    db.add_all([team, role])
    await db.flush()
    team_id = team.uuid
    await db.commit()

    actor = User(name="Coordinator")
    target = User(name="新志工小明")
    db.add_all([actor, target])
    await db.flush()
    actor_id, target_id = actor.uuid, target.uuid
    await db.commit()

    actor_obj = await db.get(User, actor_id)
    with patch("app.services.admin.require_scope", new_callable=AsyncMock):
        returned = await admin_service.add_team_member(
            db,
            actor=actor_obj,
            team_uuid=str(team_id),
            user_uuid=str(target_id),
            team_role_name="member",
        )

    # Exactly what app/api/v1/endpoints/admin.py does with the return value.
    assert returned.uuid == target_id
    assert str(returned.team_uuid) == str(team_id)

    # And the notification itself landed.
    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_uuid == target_id,
                    Notification.type == "team_member_added",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1


async def _gov_recipient_and_shelter(db: AsyncSession) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Seed a Gov user, a shelter station, and a `beds_available` property on it.

    Returns (gov_user_uuid, station_uuid, property_uuid). The Gov user is the expected
    recipient of `resource_station_updated` (resolve_gov_and_zone_ngo, §Q7).
    """
    from app.models.station_property import StationProperty

    gov_team = Team(name="光復鄉公所", type="gov", status="active")
    db.add(gov_team)
    await db.flush()

    gov_user = User(name="Gov 情資專員", team_uuid=gov_team.uuid)
    reporter = User(name="回報志工")
    db.add_all([gov_user, reporter])
    await db.flush()
    gov_uid, reporter_uid = gov_user.uuid, reporter.uuid

    station = Station(
        name="大進國小收容中心",
        type="shelter",
        geometry=WKTElement("SRID=4326;POINT(121.42 23.66)", srid=4326),
    )
    db.add(station)
    await db.flush()
    station_id = station.uuid

    prop = StationProperty(
        station_uuid=station_id,
        property_type="facility",
        property_name="beds_available",
        quantity=20,
        status="verified",
        weightings=1.0,
        created_by=str(reporter_uid),
    )
    db.add(prop)
    await db.flush()
    prop_id = prop.uuid
    await db.commit()
    return gov_uid, station_id, prop_id


@pytest.mark.asyncio
async def test_operational_property_update_notifies_gov(db: AsyncSession):
    """Changing an operational station property must fire `resource_station_updated`.

    The 7-field whitelist used to live in `update_station`, checking keys of the station
    mutation's `changes` dict. None of those names are columns on `stations` — every one
    of them is an EAV row in `station_properties` (Spec/Docs/mapping-stations.csv), so the
    branch was unreachable and no station update ever notified anyone. Beds dropping to
    zero is exactly the situational-awareness event the notification exists for.
    """
    from unittest.mock import AsyncMock, patch

    from app.services import station as station_service

    gov_uid, station_id, prop_id = await _gov_recipient_and_shelter(db)
    editor = User(name="站點管理員")
    db.add(editor)
    await db.flush()
    editor_id = editor.uuid
    await db.commit()

    editor_obj = await db.get(User, editor_id)
    with patch("app.services.station.require_scope", new_callable=AsyncMock):
        returned = await station_service.update_station_property(
            db, actor=editor_obj, uuid=str(prop_id), changes={"quantity": 0}
        )

    # The caller must still be able to read the object dispatch() left expired.
    assert returned.quantity == 0

    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_uuid == gov_uid,
                    Notification.type == "resource_station_updated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1, "Gov staff must be notified when beds_available changes"
    assert str(rows[0].ref_uuid) == str(station_id), "Deep link must point at the station"
    assert rows[0].ref_type == "station"


@pytest.mark.asyncio
async def test_non_operational_property_update_is_silent(db: AsyncSession):
    """Static descriptors must not notify — only fast-changing operational values do.

    `pet_friendly` is a real configured shelter property (alembic a2a8e4d8c51d) but it
    describes the venue, not its live status. Notifying on it would add noise to the same
    Gov inbox that needs to see beds hitting zero.
    """
    from unittest.mock import AsyncMock, patch

    from app.models.station_property import StationProperty
    from app.services import station as station_service

    gov_uid, station_id, _ = await _gov_recipient_and_shelter(db)

    editor = User(name="站點管理員")
    db.add(editor)
    await db.flush()
    editor_id = editor.uuid

    static_prop = StationProperty(
        station_uuid=station_id,
        property_type="facility",
        property_name="pet_friendly",
        quantity=None,
        comment="false",
        status="verified",
        weightings=1.0,
        created_by=str(editor_id),
    )
    db.add(static_prop)
    await db.flush()
    static_prop_id = static_prop.uuid
    await db.commit()

    editor_obj = await db.get(User, editor_id)
    with patch("app.services.station.require_scope", new_callable=AsyncMock):
        await station_service.update_station_property(
            db, actor=editor_obj, uuid=str(static_prop_id), changes={"comment": "true"}
        )

    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_uuid == gov_uid,
                    Notification.type == "resource_station_updated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert rows == [], "A static descriptor change must not notify"


@pytest.mark.asyncio
async def test_approved_suggestion_on_boolean_property_notifies_gov(db: AsyncSession):
    """Approving a suggestion that flips a Boolean operational value must notify Gov.

    Boolean/Enum property values live in `station_properties.comment`, and
    UpdateStationPropertyInput exposes no `comment` field — so the suggestion workflow is
    the *only* way `is_open`, `water_level`, `supply_rationed` and `power_stable` ever
    change. review_station_suggestion() applies the change with setattr + commit, bypassing
    update_station_property entirely, so it needs its own dispatch.
    """
    from unittest.mock import AsyncMock, patch

    from app.models.station_property import StationProperty, StationUpdateSuggestion
    from app.services import suggestion as suggestion_service

    gov_uid, station_id, _ = await _gov_recipient_and_shelter(db)

    reviewer = User(name="審核員")
    db.add(reviewer)
    await db.flush()
    reviewer_id = reviewer.uuid

    # A gas station property whose value is carried in `comment`, not `quantity`.
    prop = StationProperty(
        station_uuid=station_id,
        property_type="service",
        property_name="is_open",
        quantity=None,
        comment="true",
        status="verified",
        weightings=1.0,
        created_by=str(reviewer_id),
    )
    db.add(prop)
    await db.flush()

    sugg = StationUpdateSuggestion(
        target_type="station_property",
        target_uuid=str(prop.uuid),
        field_name="comment",
        new_value="false",
        status="pending",
        created_by=str(reviewer_id),
    )
    db.add(sugg)
    await db.flush()
    sugg_id = sugg.uuid
    await db.commit()

    reviewer_obj = await db.get(User, reviewer_id)
    with patch("app.services.suggestion.require_scope", new_callable=AsyncMock):
        reviewed = await suggestion_service.review_station_suggestion(
            db, actor=reviewer_obj, uuid=str(sugg_id), approve=True, review_note=None
        )

    # The endpoint reads the returned suggestion straight after; dispatch() committed.
    assert reviewed.status == "approved"

    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_uuid == gov_uid,
                    Notification.type == "resource_station_updated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1, "Approving an is_open change must notify Gov"
    assert str(rows[0].ref_uuid) == str(station_id)


@pytest.mark.asyncio
async def test_rejected_suggestion_does_not_notify(db: AsyncSession):
    """A rejected suggestion changes nothing, so it must not notify."""
    from unittest.mock import AsyncMock, patch

    from app.models.station_property import StationProperty, StationUpdateSuggestion
    from app.services import suggestion as suggestion_service

    gov_uid, station_id, _ = await _gov_recipient_and_shelter(db)

    reviewer = User(name="審核員")
    db.add(reviewer)
    await db.flush()
    reviewer_id = reviewer.uuid

    prop = StationProperty(
        station_uuid=station_id,
        property_type="service",
        property_name="is_open",
        quantity=None,
        comment="true",
        status="verified",
        weightings=1.0,
        created_by=str(reviewer_id),
    )
    db.add(prop)
    await db.flush()

    sugg = StationUpdateSuggestion(
        target_type="station_property",
        target_uuid=str(prop.uuid),
        field_name="comment",
        new_value="false",
        status="pending",
        created_by=str(reviewer_id),
    )
    db.add(sugg)
    await db.flush()
    sugg_id = sugg.uuid
    await db.commit()

    reviewer_obj = await db.get(User, reviewer_id)
    with patch("app.services.suggestion.require_scope", new_callable=AsyncMock):
        await suggestion_service.review_station_suggestion(
            db, actor=reviewer_obj, uuid=str(sugg_id), approve=False, review_note="無法查證"
        )

    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_uuid == gov_uid,
                    Notification.type == "resource_station_updated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert rows == [], "A rejected suggestion must not notify"


@pytest.mark.asyncio
async def test_rejected_property_edit_does_not_notify(db: AsyncSession):
    """Edits to a property already marked `rejected` must stay silent.

    station.contribute/station.edit are deliberately open, so anyone can keep editing
    discredited crowd data. Paging every Gov team member for it is noise.
    """
    from unittest.mock import AsyncMock, patch

    from app.models.station_property import StationProperty
    from app.services import station as station_service

    gov_uid, station_id, _ = await _gov_recipient_and_shelter(db)

    editor = User(name="投稿者")
    db.add(editor)
    await db.flush()
    editor_id = editor.uuid

    prop = StationProperty(
        station_uuid=station_id,
        property_type="facility",
        property_name="beds_available",
        quantity=999,
        status="rejected",
        weightings=1.0,
        created_by=str(editor_id),
    )
    db.add(prop)
    await db.flush()
    prop_id = prop.uuid
    await db.commit()

    editor_obj = await db.get(User, editor_id)
    with patch("app.services.station.require_scope", new_callable=AsyncMock):
        await station_service.update_station_property(
            db, actor=editor_obj, uuid=str(prop_id), changes={"quantity": 888}
        )

    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_uuid == gov_uid,
                    Notification.type == "resource_station_updated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert rows == [], "A rejected property's edits must not notify"


@pytest.mark.asyncio
async def test_urgent_notifications_sort_above_newer_ones(db: AsyncSession):
    """An urgent notification must outrank newer non-urgent ones in the panel.

    `zone_assigned` is the only urgent trigger and it is time-sensitive field-ops
    information. `createStation` — the highest-volume trigger, reachable by any logged-in
    account — used to be able to bury it, because the list was ordered by created_at alone.
    """
    from app.repositories.notification_repository import notification_repository

    recipient = User(name="收件人")
    db.add(recipient)
    await db.flush()
    rec_id = recipient.uuid
    await db.commit()

    # Oldest row is the urgent one; the two medium rows arrive after it.
    await NotificationService.dispatch(
        db,
        event_type="zone_assigned",
        title="⚠️ 【緊急】新工作分區指派",
        body="您的團隊已獲指派責任分區。",
        priority="urgent",
        explicit_recipients=[rec_id],
    )
    for n in range(2):
        await NotificationService.dispatch(
            db,
            event_type="resource_station_updated",
            title=f"🏢 新建物資資源站 {n}",
            body="新建物資資源站。",
            priority="medium",
            explicit_recipients=[rec_id],
        )

    rows = await notification_repository.list_for_recipient(db, recipient_uuid=rec_id)
    assert len(rows) == 3
    assert rows[0].priority == "urgent", "Urgent must lead even though it is the oldest row"
    # The rest keep pure recency order.
    assert [r.priority for r in rows[1:]] == ["medium", "medium"]
    assert rows[1].created_at >= rows[2].created_at
