"""Shared fixtures and helpers for GraphQL integration tests."""

import uuid as uuid_mod
from contextlib import asynccontextmanager

import pytest_asyncio
from geoalchemy2.shape import from_shape
from httpx import ASGITransport, AsyncClient
from shapely.geometry import Point, Polygon
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.db.session import Base
from app.main import app
from app.models.auth import User
from app.models.geo import ClosureArea, Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.station_property import StationProperty
from app.models.ticket_task import TicketTask
from tests.conftest import TEST_DB_URL  # dedicated test DB, env-driven (single source of truth)

_db_initialized = False


@asynccontextmanager
async def test_db():
    """Async context manager: yields a session, auto-commits and disposes."""
    eng = create_async_engine(TEST_DB_URL, echo=False)
    factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=True)
    async with factory() as db:
        yield db
        await db.commit()
    await eng.dispose()


async def _grant(db, role: Role, perm_cache: dict, perm: Perm, scope: str) -> None:
    """Create (or reuse) a Permission row and grant `role` `perm` at `scope`."""
    permission = perm_cache.get(perm.value)
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        perm_cache[perm.value] = permission
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))


async def _ensure_db():
    """Create tables and seed RBAC roles (runs once)."""
    global _db_initialized
    if _db_initialized:
        return
    _db_initialized = True

    eng = create_async_engine(TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=True)
    async with factory() as db:
        login_role = Role(name="Login User", kind="platform")
        coordinator_role = Role(name="Field Coordinator", kind="platform")
        db.add_all([login_role, coordinator_role])
        await db.flush()

        perm_cache: dict[str, Permission] = {}

        # Mirrors the old "LoginUser_Map"/"LoginUser_Request" policies (read=all/none,
        # own-scoped edit/delete on tickets) using the new capability keys.
        # ticket.view = all, not own (ADR-030): viewing is public (ADR-027), logging in
        # must never narrow that. Only ticket.view_pii and edit/delete stay own-scoped.
        await _grant(db, login_role, perm_cache, Perm.STATION_VIEW, "all")
        await _grant(db, login_role, perm_cache, Perm.STATION_VIEW_PII, "own")
        await _grant(db, login_role, perm_cache, Perm.TICKET_VIEW, "all")
        await _grant(db, login_role, perm_cache, Perm.TICKET_VIEW_PII, "own")
        await _grant(db, login_role, perm_cache, Perm.TICKET_ADD, "all")
        await _grant(db, login_role, perm_cache, Perm.TICKET_EDIT, "own")
        await _grant(db, login_role, perm_cache, Perm.TICKET_DELETE, "own")
        await _grant(db, login_role, perm_cache, Perm.TICKET_ASSIGN, "own")

        # Mirrors the old "FieldCoordinator_Map"/"FieldCoordinator_Request" policies
        # (all-scoped everywhere) using the new capability keys.
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_VIEW, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_VIEW_PII, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_ADD, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_EDIT, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_DELETE, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_REVIEW, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.STATION_CONTRIBUTE, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.MAP_ADD, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.MAP_EDIT, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.MAP_DELETE, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.FIELD_VIEW, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.FIELD_EDIT, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_VIEW, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_VIEW_PII, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_ADD, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_EDIT, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_DELETE, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_ASSIGN, "all")
        await _grant(db, coordinator_role, perm_cache, Perm.TICKET_REVIEW, "all")

        # Content Admin: announcement management. ADR-026 dropped the Group/Policy tables in
        # favour of capability grants, so this role is the capability-era equivalent of the old
        # "ContentAdmin_content" policy. announcement.view is public (PUBLIC_PERMS) and needs no
        # grant, but is included so the role reads as a complete description of the fixture.
        content_role = Role(name="Content Admin", kind="platform")
        db.add(content_role)
        await db.flush()
        await _grant(db, content_role, perm_cache, Perm.ANN_VIEW, "all")
        await _grant(db, content_role, perm_cache, Perm.ANN_PUBLISH, "all")
        await _grant(db, content_role, perm_cache, Perm.ANN_EDIT, "all")
        await _grant(db, content_role, perm_cache, Perm.ANN_DELETE, "all")

        await db.commit()
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Ensure the test database schema and seed data are initialized before each test."""
    await _ensure_db()
    # Dispose the app-level engine pool so each test gets fresh connections
    # on the current event loop (avoids "Future attached to a different loop").
    from app.db.session import engine as app_engine
    await app_engine.dispose()


@pytest_asyncio.fixture
async def client():
    """Provide an async HTTP test client connected to the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _create_user_with_role(role_name: str) -> tuple[str, str]:
    """Create a user, assign to role, return (user_uuid, token)."""
    async with test_db() as db:
        name = f"test_{uuid_mod.uuid4().hex[:8]}"
        user = User(name=name)
        db.add(user)
        await db.flush()

        result = await db.execute(select(Role).where(Role.name == role_name))
        role = result.scalar_one()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))

        token = create_access_token(data={"sub": str(user.uuid)})
        return str(user.uuid), token


@pytest_asyncio.fixture
async def coordinator_auth():
    """Return (user_uuid, token) for a user with Field Coordinator permissions."""
    return await _create_user_with_role("Field Coordinator")


@pytest_asyncio.fixture
async def login_user_auth():
    """Return (user_uuid, token) for a user with Login User permissions."""
    return await _create_user_with_role("Login User")


@pytest_asyncio.fixture
async def content_admin_auth():
    """Return (user_uuid, token) for a user with content management permissions."""
    return await _create_user_with_role("Content Admin")


def auth_header(token: str) -> dict:
    """Build a Bearer authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def sample_station(coordinator_auth):
    """Seed a shelter-type station and return its UUID string."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            type="shelter",
            op_hour="08:00-18:00", level=3, comment="Test station",
            source="user", visibility="public",
        )
        db.add(station)
        await db.flush()
        return str(station.uuid)


@pytest_asyncio.fixture
async def sample_closure_area(coordinator_auth):
    """Seed a polygon closure area and return its UUID string."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        area = ClosureArea(
            geometry=from_shape(Polygon([
                (121.49, 24.99), (121.51, 24.99), (121.51, 25.01),
                (121.49, 25.01), (121.49, 24.99),
            ]), srid=4326),
            created_by=user_uuid,
            status="blocked", information_source="test",
            comment="Test closure area",
        )
        db.add(area)
        await db.flush()
        return str(area.uuid)


@pytest_asyncio.fixture
async def sample_ticket(coordinator_auth):
    """Seed a pending support ticket and return its UUID string."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            title="Need volunteers", description="Cleanup needed",
            contact_name="Test", contact_email="test@test.com",
            status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


@pytest_asyncio.fixture
async def sample_ticket_task(coordinator_auth, sample_ticket):
    """Seed a ticket task under the sample ticket and return its UUID string."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        task = TicketTask(
            ticket_uuid=sample_ticket,
            task_type="hr", task_name="Need medics",
            quantity=3, source="user", visibility="public",
            created_by=user_uuid,
        )
        db.add(task)
        await db.flush()
        return str(task.uuid)


@pytest_asyncio.fixture
async def sample_station_property(coordinator_auth, sample_station):
    """Seed a facility property for the sample station and return its UUID string."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        prop = StationProperty(
            station_uuid=sample_station,
            property_type="facility",
            property_name="restroom",
            quantity=2, status="pending", weightings=1.0,
            created_by=user_uuid,
        )
        db.add(prop)
        await db.flush()
        return str(prop.uuid)
