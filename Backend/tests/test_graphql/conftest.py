import uuid as uuid_mod
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from httpx import ASGITransport, AsyncClient
from shapely.geometry import Point, Polygon
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.session import Base
from app.models.auth import Group, Policy, PolicyGroupAssign, User, UserGroupAssign
from app.models.geo import Station, ClosureArea
from app.models.request import HRRequirement, HRTaskSpecialty
from app.models.station_property import StationProperty
from app.core.security import get_password_hash, create_access_token, generate_salt

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

_db_initialized = False


@asynccontextmanager
async def test_db():
    """Async context manager: yields a session, auto-commits and disposes."""
    eng = create_async_engine(TEST_DB_URL, echo=False)
    factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        yield db
        await db.commit()
    await eng.dispose()


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

    factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        # Groups
        login_group = Group(name="Login User")
        coordinator_group = Group(name="Field Coordinator")
        db.add_all([login_group, coordinator_group])
        await db.flush()

        login_map = Policy(name="LoginUser_Map", read="all", create="none", edit="none", delete="none")
        login_req = Policy(name="LoginUser_Request", read="own", create="all", edit="own", delete="own")
        db.add_all([login_map, login_req])
        await db.flush()
        db.add(PolicyGroupAssign(group_uuid=login_group.uuid, policy_uuid=login_map.uuid))
        db.add(PolicyGroupAssign(group_uuid=login_group.uuid, policy_uuid=login_req.uuid))

        coord_map = Policy(name="FieldCoordinator_Map", read="all", create="all", edit="all", delete="all")
        coord_req = Policy(name="FieldCoordinator_Request", read="all", create="all", edit="all", delete="all")
        db.add_all([coord_map, coord_req])
        await db.flush()
        db.add(PolicyGroupAssign(group_uuid=coordinator_group.uuid, policy_uuid=coord_map.uuid))
        db.add(PolicyGroupAssign(group_uuid=coordinator_group.uuid, policy_uuid=coord_req.uuid))

        await db.commit()
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await _ensure_db()
    # Dispose the app-level engine pool so each test gets fresh connections
    # on the current event loop (avoids "Future attached to a different loop").
    from app.db.session import engine as app_engine
    await app_engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _create_user_with_role(group_name: str) -> tuple[str, str]:
    """Create a user, assign to group, return (user_uuid, token)."""
    async with test_db() as db:
        name = f"test_{uuid_mod.uuid4().hex[:8]}"
        salt = generate_salt()
        user = User(name=name, password=get_password_hash("pass123", salt))
        db.add(user)
        await db.flush()

        result = await db.execute(select(Group).where(Group.name == group_name))
        group = result.scalar_one()
        db.add(UserGroupAssign(user_uuid=user.uuid, group_uuid=group.uuid))

        token = create_access_token(data={"sub": str(user.uuid)})
        return str(user.uuid), token


@pytest_asyncio.fixture
async def coordinator_auth():
    return await _create_user_with_role("Field Coordinator")


@pytest_asyncio.fixture
async def login_user_auth():
    return await _create_user_with_role("Login User")


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def sample_station(coordinator_auth):
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            county="台北市", city="中正區",
            op_hour="08:00-18:00", level=3, comment="Test station",
        )
        db.add(station)
        await db.flush()
        return str(station.uuid)


@pytest_asyncio.fixture
async def sample_closure_area(coordinator_auth):
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        area = ClosureArea(
            geometry=from_shape(Polygon([
                (121.49, 24.99), (121.51, 24.99), (121.51, 25.01),
                (121.49, 25.01), (121.49, 24.99),
            ]), srid=4326),
            created_by=user_uuid,
            county="台北市", city="中正區",
            status="blocked", information_source="test",
            comment="Test closure area",
        )
        db.add(area)
        await db.flush()
        return str(area.uuid)


@pytest_asyncio.fixture
async def sample_ticket(coordinator_auth):
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        ticket = HRRequirement(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            title="Need volunteers", description="Cleanup needed",
            contact_name="Test", contact_email="test@test.com",
            status="pending", priority="urgent",
        )
        db.add(ticket)
        await db.flush()
        db.add(HRTaskSpecialty(
            req_uuid=ticket.uuid,
            specialty_description="Heavy lifting",
            quantity=5, status="pending",
        ))
        return str(ticket.uuid)


@pytest_asyncio.fixture
async def sample_station_property(coordinator_auth, sample_station):
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
