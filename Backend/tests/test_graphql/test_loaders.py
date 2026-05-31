"""Verify DataLoaders collapse nested-field N+1 into single batched queries."""

import re

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import event

from app.db.session import engine as app_engine
from app.models.photo import Photo
from app.models.request import Tickets
from tests.test_graphql.conftest import test_db as _test_db_ctx


class _SelectCounter:
    """Count SELECT statements against a named table on the shared app engine."""

    def __init__(self, table: str):
        self.pattern = re.compile(rf"\bFROM\s+{table}\b", re.IGNORECASE)
        self.count = 0
        self._listener = None

    def _on_execute(self, conn, cursor, statement, params, context, executemany):
        if self.pattern.search(statement):
            self.count += 1

    def __enter__(self):
        self._listener = self._on_execute
        event.listen(app_engine.sync_engine, "before_cursor_execute", self._listener)
        return self

    def __exit__(self, *exc):
        event.remove(app_engine.sync_engine, "before_cursor_execute", self._listener)


@pytest.mark.asyncio
async def test_tickets_photos_uses_single_batched_query(client, coordinator_auth):
    """Asking for photos across N tickets must issue one SELECT against photos."""
    user_uuid, _ = coordinator_auth

    async with _test_db_ctx() as db:
        tickets: list[Tickets] = []
        for i in range(3):
            t = Tickets(
                geometry=from_shape(Point(121.5 + i * 0.001, 25.0), srid=4326),
                created_by=user_uuid,
                title=f"t{i}", description="d",
                contact_name="x", contact_email="x@x.x",
                status="pending", priority="medium",
                task_type="hr", visibility="public",
            )
            db.add(t)
            tickets.append(t)
        await db.flush()

        for t in tickets:
            for j in range(2):
                db.add(Photo(
                    ref_uuid=t.uuid, ref_type="ticket",
                    url=f"https://example/{t.uuid}/{j}.jpg",
                    created_by=user_uuid,
                ))
        await db.flush()

    with _SelectCounter("photos") as counter:
        resp = await client.post("/graphql", json={
            "query": "query { tickets { items { uuid photos { url } } } }"
        })

    assert resp.status_code == 200
    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["tickets"]["items"]
    assert sum(len(it["photos"]) for it in items) >= 6
    assert counter.count == 1, (
        f"expected 1 SELECT against photos, got {counter.count} (N+1 regression)"
    )
