"""Tests for the /readyz readiness probe (the deploy gate)."""

import pytest

from app.core.redis import get_redis
from app.main import app


@pytest.mark.asyncio
async def test_readyz_ok_when_deps_up(client):
    """With DB and Redis reachable, /readyz returns 200 ready."""
    r = await client.get("/readyz")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}


@pytest.mark.asyncio
async def test_readyz_503_when_redis_down(client):
    """If Redis ping fails, /readyz returns 503 (deploy must not pass the gate)."""

    class DeadRedis:
        """Stub redis whose ping always fails."""

        async def ping(self):
            """Simulate an unreachable redis."""
            raise ConnectionError("redis down")

    app.dependency_overrides[get_redis] = lambda: DeadRedis()
    r = await client.get("/readyz")
    assert r.status_code == 503
