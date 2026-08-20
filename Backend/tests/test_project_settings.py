"""Tests for the single-row project settings table and the dynamic-field config columns.

Feature 013 (Spec/013-project-settings-activity/decisions.md ADR-090/091/095).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, AUDITED_TABLES, get_audit_trigger_sql
from app.models.auth import User
from app.models.project_settings import ProjectSettings
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.repositories.config_repository import station_property_config_repository
from app.repositories.project_settings_repository import project_settings_repository

pytestmark = pytest.mark.asyncio


async def test_second_row_is_rejected(db):
    """The table holds exactly one row — the deployment's single disaster (ADR-090)."""
    db.add(ProjectSettings(name="花蓮 0816", disaster_types=["landslide", "flood"]))
    await db.commit()

    db.add(ProjectSettings(name="第二場災害", disaster_types=["fire"]))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_disaster_types_round_trips_as_a_list(db):
    """Mixed disasters are a set of types on one event, not separate events."""
    db.add(ProjectSettings(name="花蓮 0816", disaster_types=["landslide", "flood"]))
    await db.commit()
    value = await db.scalar(text("SELECT disaster_types FROM project_settings"))
    assert value == ["landslide", "flood"]


async def test_disaster_types_defaults_to_empty(db):
    """An unconfigured deployment enables every field (empty = no filter)."""
    db.add(ProjectSettings(name="未設定"))
    await db.commit()
    assert await db.scalar(text("SELECT disaster_types FROM project_settings")) == []


async def test_station_config_unique_key_is_enforced_by_the_database(db):
    """Upsert has always keyed on (type, property_name); the DB never guaranteed it (ADR-091)."""
    db.add(StationPropertyConfig(station_type="shelter", property_name="發電機", data_type="integer"))
    await db.commit()
    db.add(StationPropertyConfig(station_type="shelter", property_name="發電機", data_type="string"))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_task_config_unique_key_is_enforced_by_the_database(db):
    """The same (type, property_name) uniqueness holds for task configs."""
    db.add(TaskPropertyConfig(task_type="rescue", property_name="樓層", data_type="integer"))
    await db.commit()
    db.add(TaskPropertyConfig(task_type="rescue", property_name="樓層", data_type="string"))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_config_defaults(db):
    """New rows are enabled, unordered and enabled for every disaster type (ADR-095)."""
    cfg = StationPropertyConfig(station_type="shelter", property_name="發電機", data_type="integer")
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    assert cfg.disaster_types == []      # 空陣列 = 不分災害型別一律啟用
    assert cfg.is_active is True
    assert cfg.sort_order == 0
    assert cfg.label is None             # 前端回退顯示 property_name


# ──────────────────────────────────────────────
# Admin endpoints: GET / PATCH /admin/project-settings (ADR-090)
# ──────────────────────────────────────────────

SETTINGS_URL = "/api/v1/admin/project-settings"


def _auth_header(user_uuid: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user_uuid)})}"}


async def _make_project_admin(db) -> str:
    """Create a user holding project.view + project.edit; return their uuid as a str."""
    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    for perm in (Perm.PROJECT_VIEW, Perm.PROJECT_EDIT):
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        db.add(RolePermissionAssign(
            role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"
        ))
    user = User(name="Super Admin")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid


async def _make_plain_user(db) -> str:
    """Create a user with no role grants; return their uuid as a str."""
    user = User(name="Plain User")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


async def test_get_project_settings_is_empty_before_first_write(client, db_session):
    """An unconfigured deployment answers with the empty shape, not a 404."""
    admin_uuid = await _make_project_admin(db_session)

    resp = await client.get(SETTINGS_URL, headers=_auth_header(admin_uuid))

    assert resp.status_code == 200, resp.text
    assert resp.json()["disaster_types"] == []
    assert resp.json()["uuid"] is None


async def test_patch_creates_the_row_when_the_table_is_empty(client, db_session):
    """PATCH is an upsert: the first call creates the deployment's one row."""
    admin_uuid = await _make_project_admin(db_session)

    resp = await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid), json={
        "name": "花蓮 0816", "disaster_types": ["landslide", "flood"],
    })

    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "花蓮 0816"
    assert resp.json()["disaster_types"] == ["landslide", "flood"]
    assert await db_session.scalar(text("SELECT count(*) FROM project_settings")) == 1


async def test_repeated_patch_never_creates_a_second_row(client, db_session):
    """The single-row invariant survives repeated writes (ADR-090)."""
    admin_uuid = await _make_project_admin(db_session)
    await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid),
                       json={"name": "花蓮 0816", "disaster_types": ["landslide"]})

    resp = await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid),
                              json={"disaster_types": ["fire"]})

    assert resp.status_code == 200, resp.text
    assert await db_session.scalar(text("SELECT count(*) FROM project_settings")) == 1
    # PATCH semantics: the omitted name kept its stored value.
    assert resp.json()["name"] == "花蓮 0816"
    assert resp.json()["disaster_types"] == ["fire"]


async def test_reads_are_refused_without_project_view(client, db_session):
    """Reading the settings requires project.view — not every logged-in user has it."""
    user_uuid = await _make_plain_user(db_session)

    resp = await client.get(SETTINGS_URL, headers=_auth_header(user_uuid))

    assert resp.status_code == 403, resp.text


async def test_writes_are_refused_without_project_edit(client, db_session):
    """Changing the disaster types requires project.edit (ADR-090)."""
    user_uuid = await _make_plain_user(db_session)

    resp = await client.patch(SETTINGS_URL, headers=_auth_header(user_uuid),
                              json={"name": "亂改", "disaster_types": ["fire"]})

    assert resp.status_code == 403, resp.text
    assert await db_session.scalar(text("SELECT count(*) FROM project_settings")) == 0


async def test_project_settings_changes_are_audited(client, db_session):
    """project_settings is in AUDITED_TABLES, so edits land in audit_logs (ADR-090)."""
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("project_settings")))
    await db_session.commit()
    admin_uuid = await _make_project_admin(db_session)

    await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid),
                       json={"name": "花蓮 0816", "disaster_types": ["landslide"]})
    await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid),
                       json={"disaster_types": ["fire"]})

    actions = list(await db_session.scalars(
        text("SELECT action FROM audit_logs WHERE table_name = 'project_settings' ORDER BY created_at")
    ))
    assert actions == ["INSERT", "UPDATE"]


async def test_project_settings_is_registered_as_audited():
    """Guards the wiring: forgetting the AUDITED_TABLES entry silently loses the trail."""
    assert "project_settings" in AUDITED_TABLES


# ──────────────────────────────────────────────
# Disaster-type label normalization (ADR-091 補充)
# ──────────────────────────────────────────────

async def test_settings_disaster_types_are_lowercased_on_write(client, db_session):
    """Labels are matched by exact string equality, so casing must not be a mismatch source."""
    admin_uuid = await _make_project_admin(db_session)

    resp = await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid), json={
        "name": "花蓮 0816", "disaster_types": ["Flood", " LANDSLIDE ", "flood"],
    })

    assert resp.status_code == 200, resp.text
    # lower-cased, trimmed, de-duplicated, original order kept
    assert resp.json()["disaster_types"] == ["flood", "landslide"]


async def test_config_disaster_types_are_lowercased_on_write(db):
    """The config side is normalized the same way, or the two sides could never match."""
    cfg = await station_property_config_repository.upsert(
        db, station_type="shelter", property_name="淹水深度", data_type="integer",
        enum_options=None, disaster_types=["Flood", "flood ", "LANDSLIDE"],
    )

    assert cfg.disaster_types == ["flood", "landslide"]


async def test_mixed_case_settings_still_match_config(client, db_session):
    """The whole point: a mis-cased setting must not silently blank out the field list."""
    admin_uuid = await _make_project_admin(db_session)
    await station_property_config_repository.upsert(
        db_session, station_type="shelter", property_name="淹水深度", data_type="integer",
        enum_options=None, disaster_types=["flood"],
    )

    await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid),
                       json={"name": "花蓮 0816", "disaster_types": ["Flood"]})

    types = await project_settings_repository.get_current_disaster_types(db_session)
    rows = await station_property_config_repository.list_by_type(
        db_session, "shelter", disaster_types=types
    )
    assert [r.property_name for r in rows] == ["淹水深度"]


async def test_empty_disaster_types_survives_normalization(db):
    """An empty list means "every disaster type" — it must not be confused with "not supplied"."""
    cfg = await station_property_config_repository.upsert(
        db, station_type="shelter", property_name="收容人數", data_type="integer",
        enum_options=None, disaster_types=[],
    )

    assert cfg.disaster_types == []
