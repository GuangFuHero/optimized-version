"""Tests for app.api.v1.api.rbac_test_enabled (T118/ADR-033).

Allowlist, not denylist — `staging` is a real deployed environment and must stay excluded
alongside `production`, so this pins the exact set rather than just "!= production".
"""

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
