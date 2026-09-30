"""Shared pytest fixtures for the auth test suite (db, seeded db, HTTP client, email capture)."""

import os

os.environ["ENV"] = "testing"

# pytest-xdist (`-n N`) runs each worker in its own process and exports its name — gw0, gw1, … —
# before this module is imported; unset in a plain run. Tests drop the database schema and flush
# their Redis db, so two workers sharing either would wipe each other mid-test: each worker gets
# its own database (`<name>_gw0`, …) and its own Redis db index below.
_XDIST_WORKER = os.getenv("PYTEST_XDIST_WORKER")

# Dedicated Postgres test DB (env-driven). Resolved BEFORE any `app.*` import so the application
# engine (app.db.session) binds to the test DB, not the dev `postgres` maintenance DB. Session
# tests use the real app engine (no get_db override), so this is what keeps them off dev `postgres`.
TEST_DB_URL = os.getenv(
    "TEST_DB_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/disaster_rescue_test",
)
if _XDIST_WORKER:
    TEST_DB_URL = f"{TEST_DB_URL}_{_XDIST_WORKER}"
# Maintenance DB used to bootstrap the dedicated test DB (CREATE DATABASE can't run in a txn).
_ADMIN_DB_URL = os.getenv(
    "TEST_ADMIN_DB_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
)
_TEST_DB_NAME = TEST_DB_URL.rsplit("/", 1)[-1]
assert _TEST_DB_NAME not in (
    "",
    "postgres",
), "TEST_DB_URL must point at a dedicated test DB, never the 'postgres' maintenance DB (it gets wiped)"
# Point the application engine at the test DB before app.core.config / app.db.session import.
os.environ["SQLALCHEMY_DATABASE_URL"] = TEST_DB_URL

import re  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import redis.asyncio as aioredis  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core import security  # noqa: E402
from app.core.redis import get_redis  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.messaging.email import get_email_sender  # noqa: E402
from app.messaging.sms import get_sms_sender  # noqa: E402
from app.models.auth import Base  # noqa: E402
from app.models.rbac import Role  # noqa: E402
from app.sso.google import get_google_verifier  # noqa: E402
from app.sso.line import get_line_verifier  # noqa: E402
from tests.fakes import FakeGoogleVerifier, FakeLineVerifier  # noqa: E402

TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15")  # dedicated logical DB
assert TEST_REDIS_URL.rsplit("/", 1)[-1] not in (
    "",
    "0",
), "TEST_REDIS_URL must use a non-0 db index (flushdb wipes it)"
if _XDIST_WORKER:
    # Redis has 16 logical dbs by default, so workers count down from the configured index:
    # gw0 keeps it, gw1 takes the one below, and so on. db 0 — where dev data lives — is never
    # reached; a run with more workers than indexes above it stops here instead.
    _redis_base, _redis_index = TEST_REDIS_URL.rsplit("/", 1)
    _worker_redis_index = int(_redis_index) - int(_XDIST_WORKER.removeprefix("gw"))
    assert _worker_redis_index >= 1, (
        f"{_XDIST_WORKER} has no Redis db left: TEST_REDIS_URL ends in /{_redis_index}, so at most "
        f"{_redis_index} workers fit. Pass a smaller -n."
    )
    TEST_REDIS_URL = f"{_redis_base}/{_worker_redis_index}"

_CODE_RE = re.compile(r"\b(\d{6})\b")


def pytest_collection_finish(session) -> None:
    """Stop a run whose collection split one test directory into two nodes.

    pytest 9 decides a fixture's visibility by node object, not node id (`_matchfactories` in
    _pytest/fixtures.py). Given `tests/test_graphql/a.py tests/b.py tests/test_graphql/c.py`
    it builds a second `test_graphql` node for `c.py`, so that directory's conftest — the
    autouse `setup_db`, its own `client` — never reaches `c.py`, which silently falls back to
    the `client` below. What surfaces is a missing role or "Future attached to a different
    loop", nowhere near the cause.
    """
    seen: dict[str, pytest.Directory] = {}
    for item in session.items:
        for node in item.listchain():
            if isinstance(node, pytest.Directory) and seen.setdefault(node.nodeid, node) is not node:
                raise pytest.UsageError(
                    f"{node.nodeid} was collected as two separate nodes, so its conftest fixtures "
                    "would reach only some of its tests. List the files of one directory next to "
                    "each other, or pass the directory itself."
                )


# The extensions live in a schema of their own, installed once per database, because the `db` and
# `db_session` fixtures drop `public` for every test. With the extensions in `public` each drop took
# about 1,600 extension objects with it (postgis 900, postgis_raster 500) and each test put them
# back — a serial run took 15 minutes instead of 9, and one lock per object ran Postgres out of
# shared lock memory as soon as a few pytest-xdist workers did it at once. `search_path` is set on
# the database, so every connection, the app's engine included, finds them unqualified.
_EXTENSION_SCHEMA = "extensions"
_EXTENSIONS = (
    "postgis",
    # gin_trgm_ops for the search_text indexes: without it Base.metadata.create_all fails —
    # not one test, the whole suite.
    "pg_trgm",
    # h3 + h3_postgis snap a ticket's point to a hexagon for callers without ticket.view_detail
    # (ADR-281). The resolvers call them at query time, so without them every anonymous ticket
    # read fails. h3_postgis brings postgis_raster in with it.
    "h3",
    "h3_postgis",
)


async def _extensions_outside_their_schema() -> int:
    """How many of the extensions are installed somewhere other than `_EXTENSION_SCHEMA`."""
    eng = create_async_engine(TEST_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        async with eng.connect() as conn:
            return await conn.scalar(
                text(
                    "SELECT count(*) FROM pg_extension e"
                    " JOIN pg_namespace n ON n.oid = e.extnamespace"
                    " WHERE e.extname = ANY(:names) AND n.nspname <> :schema"
                ),
                {"names": list(_EXTENSIONS), "schema": _EXTENSION_SCHEMA},
            )
    finally:
        await eng.dispose()


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _ensure_test_database():
    """Create the dedicated test DB and its extensions before any test.

    Tests never touch dev `postgres`. A test DB made before the extensions had a schema of their
    own keeps them in `public`, where the first per-test drop would take them — so it is dropped
    and made again, once. It holds nothing worth keeping: every test wipes it anyway.

    Two gotchas handled here:
    - asyncpg can't run ``CREATE DATABASE`` inside a transaction / prepared statement, so we use an
      AUTOCOMMIT engine and ``exec_driver_sql`` (which sends the statement unprepared).
    - the fixture is session-scoped with a session-scoped loop so pytest-asyncio doesn't raise a
      "fixture scoped to a different loop" error against the function-scoped test loops.
    """
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": _TEST_DB_NAME}
        )
        if exists and await _extensions_outside_their_schema():
            await conn.exec_driver_sql(f'DROP DATABASE "{_TEST_DB_NAME}" WITH (FORCE)')
            exists = False
        if not exists:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_TEST_DB_NAME}"')
        await conn.exec_driver_sql(
            f'ALTER DATABASE "{_TEST_DB_NAME}" SET search_path = public, {_EXTENSION_SCHEMA}'
        )
    await admin.dispose()

    eng = create_async_engine(TEST_DB_URL, isolation_level="AUTOCOMMIT")
    async with eng.connect() as conn:
        await conn.exec_driver_sql(f"CREATE SCHEMA IF NOT EXISTS {_EXTENSION_SCHEMA}")
        for extension in _EXTENSIONS:
            await conn.exec_driver_sql(
                f"CREATE EXTENSION IF NOT EXISTS {extension} SCHEMA {_EXTENSION_SCHEMA} CASCADE"
            )
    await eng.dispose()


async def _rebuild_public_schema(conn) -> None:
    """Drop every table and build them again from the models; the extensions are left alone."""
    await conn.execute(text("DROP SCHEMA public CASCADE;"))
    await conn.execute(text("CREATE SCHEMA public;"))
    await conn.run_sync(Base.metadata.create_all)



# The six disaster keys migration e7b249d0af31 seeds. The test schema comes from
# `Base.metadata.create_all`, which carries data from no migration, so any fixture whose test
# writes a disaster type has to seed them — since feature 018 the vocabulary is validated
# against this table and an unseeded one rejects every label.
DISASTER_TYPES = [
    ("flood", "水災"), ("landslide", "土石流"), ("epidemic", "疫情"),
    ("radiation", "核／輻射"), ("fire", "火災"), ("earthquake", "地震"),
]


def seed_disaster_types(session) -> None:
    """Add the six seeded disaster types to a session (caller commits)."""
    from app.models.disaster_type import DisasterType

    session.add_all(DisasterType(key=key, label=label) for key, label in DISASTER_TYPES)


async def schema_has_role(name: str) -> bool:
    """Whether the test DB still holds the schema and a role called `name`.

    tests/session/ and tests/test_graphql/ seed their roles once and reuse them, while the `db`
    and `db_session` fixtures below drop the whole schema for every test that uses them. A plain
    run happens never to put one of those between two session or GraphQL tests; under
    pytest-xdist a worker can run any file between two others, so "already seeded" has to be
    looked up rather than remembered.
    """
    engine = create_async_engine(TEST_DB_URL, echo=False)
    try:
        async with engine.connect() as conn:
            if not await conn.scalar(text("SELECT to_regclass('public.roles') IS NOT NULL")):
                return False
            return bool(
                await conn.scalar(
                    text("SELECT EXISTS (SELECT 1 FROM roles WHERE name = :name)"), {"name": name}
                )
            )
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def db():
    """Fresh schema per test, UNSEEDED (for model/repo/service/gate unit tests). Wipes the test DB."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await _rebuild_public_schema(conn)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    """Fresh schema + seeded default 'user' platform role per test (self-contained; wipes the test DB)."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await _rebuild_public_schema(conn)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)
    async with factory() as session:
        session.add(Role(name="user", kind="platform"))
        seed_disaster_types(session)
        await session.commit()
        yield session
    await engine.dispose()


async def token_for(redis, user_uuid, role=None, team=None) -> str:
    """Mint an access token backed by a real session (features 010 + 014).

    Two things make a production token work, and a test token has to have both:

    - an `act` claim naming the identity the session acts as (010). A bare
      `create_access_token(data={"sub": ...})` authenticates but holds no identity, which
      resolves to zero grants — correct fail-closed behaviour, but not what a test
      exercising permissions wants. Pass `role` (and `team`) to get one.
    - a live `session:{sid}` in Redis (014). `get_current_user` refuses a token whose
      session it cannot find, so a token minted without one authenticates nothing.

    Deliberately mints the same shape production does rather than letting tests bypass the
    session check: the check IS the feature, and revocation tests need a real session to
    revoke (ADR-105).

    `role=None` mints an authenticated token with no identity — for tests that only need
    "somebody is logged in" (linking an SSO account, setting a password, and so on).
    """
    from app.core.identity import encode_act
    from app.repositories.session_repository import SessionRepository

    act = None
    if role is not None:
        # Accepts a Role/Team instance or a plain uuid. Tests that create the role, then let
        # the request under test commit, would otherwise hand over an expired instance: the
        # session is expire_on_commit=True, so reading `.uuid` afterwards is a lazy reload
        # that AsyncSession cannot service. Passing the uuid captured up front sidesteps it.
        act = encode_act(
            str(getattr(role, "uuid", role)),
            str(getattr(team, "uuid", team)) if team is not None else None,
        )
    # The session records the identity too (ADR-188), so a refresh that does not name one
    # carries it forward. Passing it here keeps a test token the same shape as a real one;
    # without it the session would remember nothing and a refresh in a test would silently
    # fall back to the platform default.
    sid, _ = await SessionRepository(redis).create_session(str(user_uuid), "test", act=act)
    return create_access_token(data={"sub": str(user_uuid)}, sid=sid, act=act)


async def auth_headers_for(redis, user_uuid, role=None, team=None) -> dict:
    """Bearer headers for a token acting as the given identity, backed by a live session."""
    return {"Authorization": f"Bearer {await token_for(redis, user_uuid, role, team)}"}


def acting_as(user, role, team=None):
    """Attach the identity a real request would have resolved from the token (feature 010).

    Tests that build a `User` directly never go through `get_current_user`, so nothing sets
    `active_identity` — and without one the actor resolves to zero grants, which is the
    intended fail-closed behaviour but not what most tests are trying to exercise. Call this
    to say which identity the actor is acting as.

    `role` is a Role instance, `team` an optional Team; returns the user for chaining.
    """
    from app.core.identity import ActiveIdentity

    user.active_identity = ActiveIdentity(
        role_uuid=str(role.uuid),
        team_uuid=str(team.uuid) if team is not None else None,
        role_name=role.name,
        team_name=team.name if team is not None else None,
    )
    return user


class _Capturer:
    """Base capturer exposing the 6-digit code from the most recent message body."""

    def __init__(self):
        """Start with an empty message log."""
        self.messages = []

    @property
    def last_code(self):
        """Return the 6-digit code parsed from the most recent message body, or None."""
        if not self.messages:
            return None
        m = _CODE_RE.search(self.messages[-1][-1])  # body is the last tuple element
        return m.group(1) if m else None


class CaptureEmailSender(_Capturer):
    """Test EmailSender that records messages so tests can extract the verification code."""

    async def send(self, to, subject, html, text):
        """Record one outbound email instead of delivering it (text body parsed for the code)."""
        self.messages.append((to, subject, html, text))


class CaptureSmsSender(_Capturer):
    """Test SmsSender that records messages so tests can extract the verification code."""

    async def send(self, to, body):
        """Record one outbound SMS instead of delivering it."""
        self.messages.append((to, body))


@pytest_asyncio.fixture
async def redis():
    """One real redis (TEST_REDIS_URL, flushed per test) shared by the client fixture and by tests."""
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await r.flushdb()
    yield r
    await r.flushdb()
    await r.aclose()


@pytest_asyncio.fixture
async def client(db_session, redis):
    """HTTP client with db + redis + email-sender overrides bound to ONE fake redis."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[security.get_db] = override_get_db
    app.dependency_overrides[get_redis] = lambda: redis
    # The GraphQL context reads redis off app.state, not through the dependency, because it
    # calls get_current_user directly rather than via FastAPI (ADR-102). Overriding only the
    # dependency would leave that path pointing at whatever the lifespan left behind — and
    # the lifespan does not run under ASGITransport, so it points at nothing.
    app.state.redis = redis
    app.dependency_overrides[get_google_verifier] = lambda: FakeGoogleVerifier()
    app.dependency_overrides[get_line_verifier] = lambda: FakeLineVerifier()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
    del app.state.redis


@pytest_asyncio.fixture
async def fresh_app_engine():
    """Empty the app's own engine pool around a test that posts to /graphql through `client`.

    The GraphQL context opens its session through `get_db()` directly, not through the
    dependency `client` overrides, so it draws on the app engine's pool. A connection left
    there by another test belongs to that test's event loop and fails in any other —
    tests/test_graphql/conftest.py disposes the pool before each of its tests. Done afterwards
    too, so the test leaves nothing behind for the next.
    """
    from app.db.session import engine as app_engine

    await app_engine.dispose()
    yield
    await app_engine.dispose()


@pytest.fixture
def capture_email():
    """Override get_email_sender with a capturing double; exposes `.last_code`."""
    sender = CaptureEmailSender()
    app.dependency_overrides[get_email_sender] = lambda: sender
    yield sender
    app.dependency_overrides.pop(get_email_sender, None)


@pytest.fixture
def capture_sms():
    """Override get_sms_sender with a capturing double; exposes `.last_code`."""
    sender = CaptureSmsSender()
    app.dependency_overrides[get_sms_sender] = lambda: sender
    yield sender
    app.dependency_overrides.pop(get_sms_sender, None)
