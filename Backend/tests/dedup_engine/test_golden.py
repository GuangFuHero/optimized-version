"""Scoring behaviour is pinned per engine version (Spec 020 §8 item 10, ADR-297)."""

import json
import subprocess
import sys
from pathlib import Path

from app.dedup_engine.registry import get_engine
from tests.dedup_engine.golden_cases import compute, golden_path

BACKEND = Path(__file__).resolve().parents[2]


def test_outputs_match_the_golden_file_for_this_version():
    """The registered engine reproduces its golden file exactly, under the version recorded there."""
    engine = get_engine()
    golden = json.loads(golden_path(engine).read_text(encoding="utf-8"))
    assert golden["version"] == engine.version, (
        f"engine is {engine.version} but the golden file is {golden['version']}: "
        "run scripts/regen_dedup_golden.py"
    )
    # Round-trip through JSON so tuples and lists compare the way the file stores them.
    current = json.loads(json.dumps(compute(engine), ensure_ascii=False))
    assert current == golden["cases"], (
        f"scoring changed under {engine.version}: bump the engine version, add a CHANGELOG entry, "
        "then regenerate the golden file"
    )


def _run_regen(tmp_path, version: str, similarity_shift: float) -> subprocess.CompletedProcess:
    """Run the regen script against a copy of the golden file with a stand-in engine."""
    script = f"""
import sys
from dataclasses import dataclass, replace
from pathlib import Path
import app.dedup_engine.registry as registry
import tests.dedup_engine.golden_cases as cases
from app.dedup_engine.fast import FastEngine

class Shifted(FastEngine):
    version = {version!r}
    def score(self, submission, candidate, now):
        m = super().score(submission, candidate, now)
        return replace(m, similarity=min(1.0, m.similarity + {similarity_shift}))

registry._ENGINE = Shifted()
cases.GOLDEN_DIR = Path({str(tmp_path)!r})
sys.argv = ["regen"]
import runpy
runpy.run_path({str(BACKEND / "scripts" / "regen_dedup_golden.py")!r}, run_name="__main__")
"""
    return subprocess.run(
        [sys.executable, "-c", script], cwd=BACKEND, capture_output=True, text=True, env={"PYTHONPATH": "."}
    )


def test_regen_refuses_changed_outputs_without_a_version_bump(tmp_path):
    """Changing scores under the same version is rejected: the golden file stays as it was."""
    source = golden_path(get_engine())
    target = tmp_path / source.name
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    before = target.read_text(encoding="utf-8")

    result = _run_regen(tmp_path, version=get_engine().version, similarity_shift=0.01)

    assert result.returncode == 1, result.stdout + result.stderr
    assert "Bump the engine's `version`" in result.stderr
    assert target.read_text(encoding="utf-8") == before


def test_regen_accepts_changed_outputs_with_a_version_bump(tmp_path):
    """The same change under a new version rewrites the golden file with that version."""
    source = golden_path(get_engine())
    target = tmp_path / source.name
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    result = _run_regen(tmp_path, version="fast-v999", similarity_shift=0.01)

    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(target.read_text(encoding="utf-8"))["version"] == "fast-v999"
