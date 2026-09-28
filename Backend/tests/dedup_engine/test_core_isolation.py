"""app/dedup_engine is the algorithm owner's code and must stay pure (ADR-287).

A core that reaches the database or the web layer can no longer run in the offline tuning
harness, and every backend refactor would start touching algorithm code again.
"""

import ast
from pathlib import Path

CORE = Path(__file__).resolve().parents[2] / "app" / "dedup_engine"
FORBIDDEN = (
    "sqlalchemy",
    "geoalchemy2",
    "asyncpg",
    "fastapi",
    "strawberry",
    "app.models",
    "app.repositories",
    "app.services",
    "app.graphql",
    "app.db",
    "app.api",
)


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def test_core_package_exists():
    """The guard below passes vacuously if the package is missing, so check it is there."""
    assert (CORE / "contract.py").is_file()


def test_core_does_no_io():
    """No module under app/dedup_engine imports a database, web or backend-service layer."""
    offenders = sorted(
        f"{path.relative_to(CORE)}: {name}"
        for path in CORE.rglob("*.py")
        for name in _imports(path)
        if name.startswith(FORBIDDEN)
    )
    assert not offenders, f"app/dedup_engine must not import I/O layers: {offenders}"
