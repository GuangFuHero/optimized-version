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
    ENTITY_TABLES,
    EXCLUDED,
    FIELD_TIERS,
    HISTORY_MODELS,
    Tier,
    spec_for,
)

# Every (entity, table) pair the timeline reads. The same table appears under both
# entities where it is shared, which is exactly what the classification has to cover.
PAIRS = sorted((entity, table) for entity, tables in ENTITY_TABLES.items() for table in tables)


@pytest.mark.parametrize("entity,table", PAIRS)
def test_every_column_is_classified(entity, table):
    """A column added to an audited table must get a tier or an explicit exclusion.

    This is the whole point of the whitelist being maintainable. Feature 011 added
    `search_text` to tickets and it went straight into every audit payload; nothing in the
    codebase would have flagged it. Now something does.
    """
    columns = {c.name for c in HISTORY_MODELS[table].__table__.columns}
    key = (entity, table)
    classified = set(FIELD_TIERS.get(key, {})) | set(EXCLUDED.get(key, {}))
    unclassified = columns - classified
    assert unclassified == set(), (
        f"{entity}/{table} 有未分類的欄位: {sorted(unclassified)} — "
        f"請在 history_fields.py 給它一個 tier，或加進 EXCLUDED 並寫理由"
    )


@pytest.mark.parametrize("entity,table", PAIRS)
def test_no_column_is_both_tiered_and_excluded(entity, table):
    """A column cannot be simultaneously exposed and withheld."""
    key = (entity, table)
    overlap = set(FIELD_TIERS.get(key, {})) & set(EXCLUDED.get(key, {}))
    assert overlap == set(), f"{entity}/{table} 的 {sorted(overlap)} 同時被分層與排除"


@pytest.mark.parametrize("entity,table", PAIRS)
def test_classification_never_names_a_column_that_does_not_exist(entity, table):
    """Catches a rename that updated the model but not this file.

    Without it, renaming `op_hour` would leave a whitelist entry pointing at nothing and
    the field would drop out of the timeline with no signal at all.
    """
    columns = {c.name for c in HISTORY_MODELS[table].__table__.columns}
    key = (entity, table)
    named = set(FIELD_TIERS.get(key, {})) | set(EXCLUDED.get(key, {}))
    assert named - columns == set(), (
        f"{entity}/{table} 分類到不存在的欄位: {sorted(named - columns)}")


@pytest.mark.parametrize("key", sorted(EXCLUDED))
def test_every_exclusion_states_a_reason(key):
    """ADR-143: an exclusion without a reason is indistinguishable from an oversight."""
    for column, reason in EXCLUDED[key].items():
        assert reason and reason.strip(), f"{key}.{column} 被排除但沒寫理由"


def test_contact_fields_reuse_the_existing_masking_helpers():
    """PII in the timeline is masked by exactly the same functions as the single-row query.

    A second masking implementation would be a second place for the rules to drift.
    """
    ticket = FIELD_TIERS[("ticket", "tickets")]
    assert ticket["contact_name"].mask is mask_name
    assert ticket["contact_email"].mask is mask_email
    assert ticket["contact_phone"].mask is mask_phone


def test_a_tickets_address_and_coordinate_are_pii_without_a_masker():
    """Address and coordinate are PII but carry no masker.

    ADR-141/142: they are withheld rather than masked, since inventing a partial address or
    a partial coordinate would fabricate plausible-looking location data.
    """
    for column in ("county", "city", "lane", "no", "floor", "room"):
        spec = FIELD_TIERS[("ticket", "secondary_locations")][column]
        assert spec.tier is Tier.PII and spec.mask is None, column
    geometry = FIELD_TIERS[("ticket", "base_geometries")]["geometry"]
    assert geometry.tier is Tier.PII and geometry.mask is None


def test_a_stations_address_and_coordinate_are_public():
    """ADR-142 (revised): a shelter's location is already on the public map.

    Gating it would protect nothing and would make the timeline read as though the station
    had never been corrected. The same two tables under a ticket stay PII — which is the
    whole reason the classification is keyed by (entity, table).
    """
    for column in ("county", "city", "lane", "no", "floor", "room"):
        assert FIELD_TIERS[("station", "secondary_locations")][column].tier is Tier.PUBLIC
    assert FIELD_TIERS[("station", "base_geometries")]["geometry"].tier is Tier.PUBLIC


def test_the_shared_tables_really_are_classified_differently():
    """The compound key would be pointless if both entities agreed on every column."""
    ticket_address = FIELD_TIERS[("ticket", "secondary_locations")]
    station_address = FIELD_TIERS[("station", "secondary_locations")]
    differing = {c for c in ticket_address if ticket_address[c].tier is not station_address[c].tier}
    assert differing, "shared tables are identical — the (entity, table) key buys nothing"


def test_review_columns_are_audit_tier():
    """ADR-130: internal review notes need audit.view, not merely *.view_history."""
    assert FIELD_TIERS[("ticket", "tickets")]["review_note"].tier is Tier.AUDIT
    assert FIELD_TIERS[("ticket", "ticket_tasks")]["review_note"].tier is Tier.AUDIT
    assert FIELD_TIERS[("ticket", "ticket_tasks")]["moderation_status"].tier is Tier.AUDIT


def test_dedup_and_scoring_columns_are_excluded_everywhere():
    """ADR-113/143: nothing in the codebase writes these, so exposing them adds dead UI."""
    for entity, table, column in (
        ("station", "stations", "is_duplicate"),
        ("station", "stations", "dedup_group_id"),
        ("station", "stations", "confidence_score"),
        ("station", "stations", "priority_score"),
        ("ticket", "ticket_tasks", "is_duplicate"),
        ("ticket", "ticket_tasks", "dedup_group_id"),
        ("ticket", "ticket_tasks", "confidence_score"),
        ("station", "station_properties", "weightings"),
    ):
        assert column in EXCLUDED[(entity, table)], f"{entity}/{table}.{column}"
        assert spec_for(entity, table, column) is None


def test_the_only_foreign_key_kept_is_the_assignee():
    """Foreign keys are dropped, with exactly one deliberate exception.

    ADR-143: on a task assignment the actor_uuid *is* the event, so it stays and gets
    resolved to a display name rather than emitted as a bare uuid.
    """
    assert FIELD_TIERS[("ticket", "task_assignments")]["actor_uuid"].tier is Tier.PUBLIC
    for (entity, table), spec in FIELD_TIERS.items():
        for column in spec:
            if column.endswith("_uuid"):
                assert table == "task_assignments" and column == "actor_uuid", (
                    f"{entity}/{table}.{column}")


def test_delete_at_is_never_a_field_change():
    """ADR-135: a soft delete is an event type, not a column diff."""
    for entity, table in PAIRS:
        columns = {c.name for c in HISTORY_MODELS[table].__table__.columns}
        if "delete_at" in columns:
            assert spec_for(entity, table, "delete_at") is None, f"{entity}/{table}"


def test_spec_for_returns_none_on_an_unknown_column():
    """Rows written by a branch this deployment has not merged are skipped, not fatal."""
    assert spec_for("ticket", "tickets", "search_text") is None
    assert spec_for("ticket", "tickets", "column_from_the_future") is None
    assert spec_for("ticket", "no_such_table", "whatever") is None
    assert spec_for("closure_area", "tickets", "title") is None
