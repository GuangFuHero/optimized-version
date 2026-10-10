"""The one place the backend gets its dedup engine from (Spec 020 §4).

Swapping the algorithm means changing what is registered here; tests replace it with monkeypatch.
"""

from app.dedup_engine.contract import DedupEngine
from app.dedup_engine.fast import FastEngine

_ENGINE: DedupEngine = FastEngine()


def get_engine() -> DedupEngine:
    """The engine every create path asks (ADR-304)."""
    return _ENGINE
