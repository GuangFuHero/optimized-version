"""Regenerate tests/dedup_engine/golden/<family>.json for the registered dedup engine (ADR-297).

    PYTHONPATH=. uv run python scripts/regen_dedup_golden.py

Refuses to write when the outputs changed but the engine version did not: the only way to
change the golden file is to bump `version` first, which is what makes "changed scoring
behaviour" and "new version" the same event.
"""

import json
import sys

from app.dedup_engine.registry import get_engine
from tests.dedup_engine.golden_cases import compute, golden_path


def main() -> int:
    """Write the golden file, or explain why not. Returns the process exit code."""
    engine = get_engine()
    path = golden_path(engine)
    new = {"version": engine.version, "cases": compute(engine)}
    rendered = json.dumps(new, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
        if old == new:
            print(f"{path.name} is already up to date for {engine.version}")
            return 0
        if old["version"] == engine.version:
            print(
                f"Outputs changed but the version is still {engine.version}. "
                "Bump the engine's `version` and add a CHANGELOG entry first.",
                file=sys.stderr,
            )
            return 1

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered, encoding="utf-8")
    print(f"wrote {path} for {engine.version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
