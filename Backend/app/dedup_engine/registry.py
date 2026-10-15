"""The one place the backend gets its dedup engine from.

To swap the algorithm, register a different engine here; tests replace it with monkeypatch.
"""

from app.dedup_engine.contract import DedupEngine
from app.dedup_engine.fast import FastEngine

_ENGINE: DedupEngine = FastEngine()


def get_engine() -> DedupEngine:
    """Return the engine that every create path calls."""
    return _ENGINE
