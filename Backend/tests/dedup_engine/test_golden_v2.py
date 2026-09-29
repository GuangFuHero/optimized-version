"""fast-v2's outputs on fixed data are pinned per version (ADR-297).

Regenerate with `DEDUP_REGEN_GOLDEN=1 uv run pytest tests/dedup_engine/test_golden_v2.py`; it
refuses when outputs changed but the engine version did not.
"""

import json
import os
from dataclasses import replace

import pytest

from app.dedup_engine.fast_v2 import FastEngine
from tests.dedup_engine.golden_v2 import GOLDEN, compute, seed, write_golden

pytestmark = pytest.mark.asyncio


async def test_outputs_match_the_golden_file(db):
    """Same data, same submissions, same answers — under the version the file records."""
    await seed(db)
    engine = FastEngine()
    cases = await compute(engine, db)
    if os.getenv("DEDUP_REGEN_GOLDEN"):
        result = write_golden(GOLDEN, engine.version, cases)
        assert not result.startswith("refused"), result
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert golden["version"] == engine.version, "engine version changed: regenerate the golden file"
    assert cases == golden["cases"], f"scoring changed under {engine.version}: bump the version first"


async def test_regenerating_refuses_changed_outputs_without_a_bump(db, tmp_path):
    """The only way to change the golden file is a new version."""
    await seed(db)
    engine = FastEngine()
    path = tmp_path / "golden.json"
    assert write_golden(path, engine.version, await compute(engine, db)) == "written"

    class Shifted(FastEngine):
        async def check(self, db_, submission, now):
            return [
                replace(s, similarity=min(1.0, s.similarity + 0.01))
                for s in await super().check(db_, submission, now)
            ]

    shifted = await compute(Shifted(), db)
    assert write_golden(path, engine.version, shifted).startswith("refused")
    assert write_golden(path, "fast-v999", shifted) == "written"
    assert json.loads(path.read_text(encoding="utf-8"))["version"] == "fast-v999"
