"""Which environments get the development-only routes.

It is an allowlist that fails closed: staging is a real deployed environment, and an unset or
unknown ENV counts as live.
"""

import os
import subprocess
import sys
from pathlib import Path

from app.api.v1.api import rbac_test_enabled


def test_enabled_in_development():
    """Development is a known non-live environment."""
    assert rbac_test_enabled("development") is True


def test_enabled_in_testing():
    """Testing is a known non-live environment."""
    assert rbac_test_enabled("testing") is True


def test_disabled_in_staging():
    """Staging is a real, internet-reachable deploy target — must stay excluded."""
    assert rbac_test_enabled("staging") is False


def test_disabled_in_production():
    """Production must never expose raw permission probes."""
    assert rbac_test_enabled("production") is False


def test_disabled_for_unknown_env():
    """Allowlist semantics: an unrecognized value fails closed, not open."""
    assert rbac_test_enabled("whatever-typo") is False


def test_unset_env_is_production(tmp_path):
    """A deployment that forgets ENV gets none of the development-only routes, not all of them."""
    env = {key: value for key, value in os.environ.items() if key != "ENV"}
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
    # Run from an empty directory so a developer's .env cannot supply ENV.
    out = subprocess.run(
        [sys.executable, "-c", "from app.core.config import settings; print(settings.ENV)"],
        cwd=tmp_path, env=env, capture_output=True, text=True, check=True,
    )
    assert out.stdout.strip() == "production"
