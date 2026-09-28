"""The core's Python trigram similarity equals pg_trgm's `similarity()` (ADR-288).

Spec 019 scored text in SQL. fast-v1 scores it in Python so the algorithm owner can change the
method without touching the backend; this pins the two together so the move changes no score.
"""

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.dedup_engine.text import trigram_similarity
from tests.conftest import TEST_DB_URL

PAIRS = [
    ("民生街三段淹水需要抽水機 一樓積水到膝蓋，需要抽水機", "民生街三段淹水需要抽水機"),
    ("需要志工幫忙搬物資 倉庫缺人手", "民生街三段淹水需要抽水機"),
    ("光復國小臨時收容所", "光復國小 收容所"),
    ("Shelter at Guangfu Elementary", "guangfu elementary shelter"),
    ("A-1 臨時收容所", "A1臨時收容所"),
    ("抽水機x2、沙包 50 包", "需要抽水機兩台和沙包"),
    ("", "任何文字"),
    ("!!!", "???"),
]


@pytest_asyncio.fixture
async def conn():
    """A bare connection: this test needs pg_trgm, not the schema other fixtures rebuild."""
    engine = create_async_engine(TEST_DB_URL)
    async with engine.connect() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        yield connection
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(("a", "b"), PAIRS)
async def test_python_trigram_matches_pg_trgm(conn, a, b):
    """Same inputs, same score, to float4 precision."""
    expected = (await conn.execute(select(func.similarity(a, b)))).scalar_one()
    assert trigram_similarity(a, b) == pytest.approx(expected, abs=1e-6)
