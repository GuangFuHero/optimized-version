"""app/dedup_engine is the algorithm owner's code; it may read the database but not the backend (ADR-304).

Since ADR-304 the engine queries candidates itself, so SQLAlchemy and the ORM models are fair
game. What it must not reach is the backend's own layers — services, repositories, GraphQL, the
HTTP API — or open its own session: the backend hands it one, inside a savepoint it rolls back.
Otherwise every backend refactor would start touching algorithm code again.
"""

import ast
from pathlib import Path

CORE = Path(__file__).resolve().parents[2] / "app" / "dedup_engine"
FORBIDDEN = (
    "fastapi",
    "strawberry",
    "app.repositories",
    "app.services",
    "app.graphql",
    "app.db",  # the session comes from the backend; the engine never opens its own
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


def test_core_stays_out_of_the_backend():
    """No module under app/dedup_engine imports a web, session or backend-service layer."""
    offenders = sorted(
        f"{path.relative_to(CORE)}: {name}"
        for path in CORE.rglob("*.py")
        for name in _imports(path)
        if name.startswith(FORBIDDEN)
    )
    assert not offenders, f"app/dedup_engine must not import backend layers: {offenders}"
