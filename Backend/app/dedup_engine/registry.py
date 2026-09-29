"""The one place the backend gets its dedup engine from (Spec 020 §4).

Swapping the algorithm means changing what is registered here; tests replace it with monkeypatch.
`get_submission_engine` is the ADR-304 engine; `get_engine` is Phase 1's, kept until the backend
has switched over (plan Task 23).
"""

from app.dedup_engine.contract import DedupEngine, SnapshotEngine
from app.dedup_engine.fast import FastEngine
from app.dedup_engine.fast_v2 import FastEngine as FastEngineV2

_ENGINE: SnapshotEngine = FastEngine()
_SUBMISSION_ENGINE: DedupEngine = FastEngineV2()


def get_engine() -> SnapshotEngine:
    """Phase 1's engine."""
    return _ENGINE


def get_submission_engine() -> DedupEngine:
    """The ADR-304 engine every create path asks."""
    return _SUBMISSION_ENGINE
