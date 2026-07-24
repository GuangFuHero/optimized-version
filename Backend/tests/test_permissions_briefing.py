"""Unit tests for the briefing.* capability keys (ADR-AB-01).

Pure catalog tests — no DB. Verifies the keys exist with the agreed values, follow the
`<resource>.<action>` convention, are enum members (so `seed_rbac.py`'s `for perm in Perm`
loop registers them), and that briefing.view is deliberately NOT public.
"""

from app.core.permissions import PUBLIC_PERMS, Perm

BRIEFING_KEYS = {
    Perm.BRIEFING_VIEW: "briefing.view",
    Perm.BRIEFING_CREATE: "briefing.create",
    Perm.BRIEFING_EDIT: "briefing.edit",
    Perm.BRIEFING_DELETE: "briefing.delete",
}


def test_briefing_keys_exist_with_expected_values():
    """Common: the four briefing capability keys resolve to their agreed string values."""
    # Arrange / Act / Assert
    for perm, value in BRIEFING_KEYS.items():
        assert perm.value == value


def test_briefing_keys_are_enum_members_so_seed_registers_them():
    """Common: each briefing key is a Perm member, so the seed loop registers it."""
    for perm in BRIEFING_KEYS:
        assert perm in list(Perm)


def test_briefing_view_is_not_public():
    """Edge: briefings are internal material, so briefing.view must NOT be public."""
    assert Perm.BRIEFING_VIEW not in PUBLIC_PERMS
    # sanity: announcement.view IS public, so the assertion above is meaningful
    assert Perm.ANN_VIEW in PUBLIC_PERMS


def test_briefing_keys_follow_resource_action_convention():
    """Edge: every briefing key is `briefing.<action>` with a non-empty action."""
    for perm in BRIEFING_KEYS:
        resource, _, action = perm.value.partition(".")
        assert resource == "briefing"
        assert action  # non-empty


def test_briefing_keys_are_distinct_and_dont_collide_with_announcement():
    """Edge: briefing keys are unique and share no string value with announcement.* keys."""
    briefing_values = {p.value for p in BRIEFING_KEYS}
    announcement_values = {
        Perm.ANN_VIEW.value, Perm.ANN_PUBLISH.value, Perm.ANN_EDIT.value, Perm.ANN_DELETE.value,
    }
    assert len(briefing_values) == 4
    assert briefing_values.isdisjoint(announcement_values)
