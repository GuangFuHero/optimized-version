"""Fail when `alembic/versions` has more than one head.

Two PRs that add a migration on the same parent are each fine alone, but once both are merged
`alembic upgrade head` refuses to run ("Multiple head revisions"). This reads the revision ids
straight from the migration sources instead of going through alembic's `ScriptDirectory`, which
imports every migration and so needs geoalchemy2 and the app on the path: here nothing is
installed, no database is involved, and no code from the PR is executed.

Usage: python scripts/check_alembic_heads.py [versions_dir]
"""

import ast
import os
import sys
from pathlib import Path

DEFAULT_VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _read_revisions(path: Path) -> tuple[str, tuple[str, ...]]:
    """Return (revision, down_revisions) from a migration's top-level assignments."""
    values: dict[str, object] = {}
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value:
            name, value = node.target.id, node.value
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name, value = node.targets[0].id, node.value
        else:
            continue
        if name in ("revision", "down_revision"):
            values[name] = ast.literal_eval(value)

    revision = values.get("revision")
    if not isinstance(revision, str) or "down_revision" not in values:
        raise ValueError(f"{path.name} does not declare `revision` and `down_revision`")
    down = values["down_revision"]
    if down is None:
        return revision, ()
    return revision, (down,) if isinstance(down, str) else tuple(down)


def find_heads(versions_dir: Path) -> dict[str, Path]:
    """Map each head revision to its file: the revisions no other migration descends from."""
    files: dict[str, Path] = {}
    parents: set[str] = set()
    for path in sorted(versions_dir.glob("*.py")):
        revision, down = _read_revisions(path)
        if revision in files:
            raise ValueError(f"{revision} is declared by both {files[revision].name} and {path.name}")
        files[revision] = path
        parents.update(down)
    return {revision: path for revision, path in files.items() if revision not in parents}


def main(argv: list[str]) -> int:
    """Print the verdict and return the process exit code."""
    versions_dir = Path(argv[1]) if len(argv) > 1 else DEFAULT_VERSIONS_DIR
    heads = find_heads(versions_dir)
    if len(heads) == 1:
        print(f"OK: one Alembic head, {next(iter(heads))}")
        return 0

    # Relative to the checkout root, which is where GitHub anchors an annotation's file path.
    root = Path.cwd()
    shown = {r: p.relative_to(root) if p.is_relative_to(root) else p for r, p in heads.items()}
    lines = [f"Alembic has {len(heads)} heads, so `alembic upgrade head` would fail:"]
    for revision, path in heads.items():
        parent = ", ".join(_read_revisions(path)[1])
        lines.append(f"  {revision}  {shown[revision]}  (continues {parent})")
    lines.append(
        "Fix: point the newer migration's `down_revision` at the other head, or add a merge "
        "migration with `alembic merge heads`."
    )
    print("\n".join(lines))
    if os.environ.get("GITHUB_ACTIONS"):
        for revision in heads:
            print(f"::error file={shown[revision]},title=Multiple Alembic heads::{len(heads)} heads")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
