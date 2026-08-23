"""The timeline's field classification, and the guard that keeps it honest (ADR-144).

The whitelist is only worth anything if it cannot silently rot. These tests walk the real
SQLAlchemy models, so a column added by any future migration has to be classified — or the
build goes red.
"""

import os

os.environ["ENV"] = "testing"

import pytest

from app.graphql.masking import mask_email, mask_name, mask_phone
from app.services.history_fields import (
    EXCLUDED,
    FIELD_TIERS,
    HISTORY_MODELS,
    Tier,
    spec_for,
)


@pytest.mark.parametrize("table", sorted(HISTORY_MODELS))
def test_every_column_is_classified(table):
    """A column added to an audited table must get a tier or an explicit exclusion.

    This is the whole point of the whitelist being maintainable. Feature 011 added
    `search_text` to tickets and it went straight into every audit payload; nothing in the
    codebase would have flagged it. Now something does.
    """
    columns = {c.name for c in HISTORY_MODELS[table].__table__.columns}
    classified = set(FIELD_TIERS.get(table, {})) | set(EXCLUDED.get(table, {}))
    unclassified = columns - classified
    assert unclassified == set(), (
        f"{table} 有未分類的欄位: {sorted(unclassified)} — "
        f"請在 history_fields.py 給它一個 tier，或加進 EXCLUDED 並寫理由"
    )


@pytest.mark.parametrize("table", sorted(HISTORY_MODELS))
def test_no_column_is_both_tiered_and_excluded(table):
    """A column cannot be simultaneously exposed and withheld."""
    overlap = set(FIELD_TIERS.get(table, {})) & set(EXCLUDED.get(table, {}))
    assert overlap == set(), f"{table} 的 {sorted(overlap)} 同時被分層與排除"


@pytest.mark.parametrize("table", sorted(HISTORY_MODELS))
def test_classification_never_names_a_column_that_does_not_exist(table):
    """Catches a rename that updated the model but not this file.

    Without it, renaming `op_hour` would leave a whitelist entry pointing at nothing and
    the field would drop out of the timeline with no signal at all.
    """
    columns = {c.name for c in HISTORY_MODELS[table].__table__.columns}
    named = set(FIELD_TIERS.get(table, {})) | set(EXCLUDED.get(table, {}))
    assert named - columns == set(), f"{table} 分類到不存在的欄位: {sorted(named - columns)}"


@pytest.mark.parametrize("table", sorted(EXCLUDED))
def test_every_exclusion_states_a_reason(table):
    """ADR-143: an exclusion without a reason is indistinguishable from an oversight."""
    for column, reason in EXCLUDED[table].items():
        assert reason and reason.strip(), f"{table}.{column} 被排除但沒寫理由"


def test_contact_fields_reuse_the_existing_masking_helpers():
    """PII in the timeline is masked by exactly the same functions as the single-row query.

    A second masking implementation would be a second place for the rules to drift.
    """
    ticket = FIELD_TIERS["tickets"]
    assert ticket["contact_name"].mask is mask_name
    assert ticket["contact_email"].mask is mask_email
    assert ticket["contact_phone"].mask is mask_phone


def test_address_and_geometry_are_pii_without_a_masker():
    """ADR-141/142: withheld rather than masked, since inventing a partial address or a
    partial coordinate would fabricate plausible-looking location data."""
    for column in ("county", "city", "lane", "no", "floor", "room"):
        spec = FIELD_TIERS["secondary_locations"][column]
        assert spec.tier is Tier.PII and spec.mask is None, column
    geometry = FIELD_TIERS["base_geometries"]["geometry"]
    assert geometry.tier is Tier.PII and geometry.mask is None


def test_review_columns_are_audit_tier():
    """ADR-130: internal review notes need audit.view, not merely *.view_history."""
    assert FIELD_TIERS["tickets"]["review_note"].tier is Tier.AUDIT
    assert FIELD_TIERS["ticket_tasks"]["review_note"].tier is Tier.AUDIT
    assert FIELD_TIERS["ticket_tasks"]["moderation_status"].tier is Tier.AUDIT


def test_dedup_and_scoring_columns_are_excluded_everywhere():
    """ADR-113/143: nothing in the codebase writes these, so exposing them adds dead UI."""
    for table, column in (
        ("stations", "is_duplicate"),
        ("stations", "dedup_group_id"),
        ("stations", "confidence_score"),
        ("stations", "priority_score"),
        ("ticket_tasks", "is_duplicate"),
        ("ticket_tasks", "dedup_group_id"),
        ("ticket_tasks", "confidence_score"),
        ("station_properties", "weightings"),
    ):
        assert column in EXCLUDED[table], f"{table}.{column}"
        assert spec_for(table, column) is None


def test_the_only_foreign_key_kept_is_the_assignee():
    """ADR-143 drops foreign keys, with one deliberate exception: on a task assignment the
    actor_uuid *is* the event, so it stays and gets resolved to a name."""
    assert FIELD_TIERS["task_assignments"]["actor_uuid"].tier is Tier.PUBLIC
    for table, spec in FIELD_TIERS.items():
        for column in spec:
            if column.endswith("_uuid"):
                assert (table, column) == ("task_assignments", "actor_uuid"), f"{table}.{column}"


def test_delete_at_is_never_a_field_change():
    """ADR-135: a soft delete is an event type, not a column diff."""
    for table, model in HISTORY_MODELS.items():
        if "delete_at" in {c.name for c in model.__table__.columns}:
            assert spec_for(table, "delete_at") is None, table


def test_spec_for_returns_none_on_an_unknown_column():
    """Rows written by a branch this deployment has not merged are skipped, not fatal."""
    assert spec_for("tickets", "search_text") is None
    assert spec_for("tickets", "column_from_the_future") is None
    assert spec_for("no_such_table", "whatever") is None
