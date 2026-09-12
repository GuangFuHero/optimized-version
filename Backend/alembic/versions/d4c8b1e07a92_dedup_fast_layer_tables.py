"""dedup fast layer: pair cards + dedup audit events (+ pg_trgm)

Creates only the two tables the fast layer writes. The frozen contract also defines
ticket_duplicate_groups / ticket_duplicate_group_members / dedup_settings /
dedup_rule_versions / dedup_score_components / dedup_scan_runs — all slow-layer, all out of
scope here. `duplicate_group_uuid` and `rule_version_uuid` are created as plain uuid columns
(no FK) because their target tables do not exist yet; the FKs land with those tables.

Both tables are entity-agnostic: `entity_kind` says what `low_uuid`/`high_uuid` (and
`primary_uuid`/`duplicate_uuid` on the audit table) point at (`'ticket'` / `'station'` /
`'ticket_task'`), and those uuid columns carry no FK for the same reason — one shared table
cannot FK to whichever entity table `entity_kind` names. The fast layer only ever writes
`entity_kind='ticket'`.

pg_trgm backs the fast layer's text signal (`similarity()` over tickets.title +
tickets.description). The test/staging database already has pg_trgm 1.6 installed by hand;
recording it here is what keeps a rebuilt database from silently losing it.

Revision ID: d4c8b1e07a92
Revises: a1b2c3d4e5f6
Create Date: 2026-09-04 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4c8b1e07a92'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create pg_trgm, duplicate_pairs, and dedup_audit_events."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "duplicate_pairs",
        sa.Column("uuid", sa.UUID(as_uuid=True), nullable=False, comment="主鍵 UUID"),
        sa.Column("entity_kind", sa.Text(), nullable=False),
        sa.Column("low_uuid", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("high_uuid", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("duplicate_group_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("rule_version_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("similarity", sa.Numeric(5, 4), nullable=True, comment="加權總分 0–1；人工建卡沒跑分時為 NULL"),  # noqa: E501
        sa.Column("score_components", postgresql.JSONB(), nullable=True, comment="判定當下的分數拆帳快照（不可變）"),  # noqa: E501
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("source_layer", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("reason", postgresql.JSONB(), nullable=True),
        sa.Column("hint_outcome", sa.Text(), nullable=True),
        sa.Column("rescan_needed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("rescanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="建立時間"),  # noqa: E501
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="最後更新時間"),  # noqa: E501
        sa.Column("delete_at", sa.DateTime(timezone=True), nullable=True, comment="軟刪除時間"),
        sa.CheckConstraint("low_uuid < high_uuid", name="ck_duplicate_pairs_order"),
        sa.CheckConstraint(
            "similarity IS NULL OR (similarity >= 0 AND similarity <= 1)",
            name="ck_duplicate_pairs_similarity",
        ),
        sa.CheckConstraint(
            "method IN ('fast_rule', 'slow_vector', 'slow_hybrid', 'manual')",
            name="ck_duplicate_pairs_method",
        ),
        sa.CheckConstraint(
            "source_layer IN ('fast', 'slow', 'manual', 'system')",
            name="ck_duplicate_pairs_source_layer",
        ),
        sa.CheckConstraint(
            "status IN ('dup_ignored', 'suggested', 'confirmed', 'rejected')",
            name="ck_duplicate_pairs_status",
        ),
        sa.CheckConstraint(
            "hint_outcome IS NULL OR hint_outcome IN ('ignored_hint', 'accepted_hint')",
            name="ck_duplicate_pairs_hint_outcome",
        ),
        sa.CheckConstraint(
            "entity_kind IN ('ticket', 'station', 'ticket_task')",
            name="ck_duplicate_pairs_entity_kind",
        ),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.uuid"]),
        sa.PrimaryKeyConstraint("uuid"),
    )
    # Partial unique: at most one live card per (entity_kind, pair), while soft-deleted cards
    # (the "overturned verdict" archive) stay queryable.
    op.create_index(
        "uq_duplicate_pairs_entities",
        "duplicate_pairs",
        ["entity_kind", "low_uuid", "high_uuid"],
        unique=True,
        postgresql_where=sa.text("delete_at IS NULL"),
    )
    op.create_index(
        "ix_duplicate_pairs_group", "duplicate_pairs", ["duplicate_group_uuid"]
    )
    op.create_index(
        "ix_duplicate_pairs_status",
        "duplicate_pairs",
        ["status"],
        postgresql_where=sa.text("delete_at IS NULL"),
    )

    op.create_table(
        "dedup_audit_events",
        sa.Column("uuid", sa.UUID(as_uuid=True), nullable=False, comment="主鍵 UUID"),
        sa.Column("entity_kind", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("pair_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("duplicate_group_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("primary_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("duplicate_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("source_layer", sa.Text(), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("evidence", postgresql.JSONB(), nullable=True),
        sa.Column("before_state", postgresql.JSONB(), nullable=True),
        sa.Column("after_state", postgresql.JSONB(), nullable=True),
        sa.Column("affected_refs", postgresql.JSONB(), nullable=True),
        sa.Column("reversible", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="建立時間"),  # noqa: E501
        sa.CheckConstraint(
            "event_type IN ('suggested', 'hint_accepted', 'ignored_by_submitter', 'rejected', "
            "'confirmed', 'merged', 'unmerged', 'manual_note', "
            # Slow-layer values the fast layer never writes; included so the group welding and
            # detach flows land without having to rewrite this constraint (contract §1.5).
            "'group_welded', 'weld_kept', 'member_detached')",
            name="ck_dedup_audit_events_type",
        ),
        sa.CheckConstraint(
            "source_layer IN ('fast', 'slow', 'manual', 'system')",
            name="ck_dedup_audit_events_source_layer",
        ),
        sa.CheckConstraint(
            "entity_kind IN ('ticket', 'station', 'ticket_task')",
            name="ck_dedup_audit_events_entity_kind",
        ),
        sa.ForeignKeyConstraint(["pair_uuid"], ["duplicate_pairs.uuid"]),
        sa.ForeignKeyConstraint(["actor_uuid"], ["users.uuid"]),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_dedup_audit_events_pair", "dedup_audit_events", ["pair_uuid"])
    op.create_index(
        "ix_dedup_audit_events_group", "dedup_audit_events", ["duplicate_group_uuid"]
    )

    # Candidate retrieval filters on ST_DWithin(geometry::geography, ..., metres). The GIST
    # index geoalchemy2 already builds is on the *geometry* column and cannot serve a
    # geography operand — different operator class — so without this the submit path
    # sequentially scans every geometry row in the database. `::geography` here and
    # SQLAlchemy's `CAST(... AS geography)` in the repository parse to the same expression,
    # so the planner matches them.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_base_geometries_geography "
        "ON base_geometries USING GIST ((geometry::geography))"
    )


def downgrade() -> None:
    """Drop both dedup tables. pg_trgm is left installed — other work may already rely on it."""
    op.execute("DROP INDEX IF EXISTS ix_base_geometries_geography")
    op.drop_index("ix_dedup_audit_events_group", table_name="dedup_audit_events")
    op.drop_index("ix_dedup_audit_events_pair", table_name="dedup_audit_events")
    op.drop_table("dedup_audit_events")
    op.drop_index("ix_duplicate_pairs_status", table_name="duplicate_pairs")
    op.drop_index("ix_duplicate_pairs_group", table_name="duplicate_pairs")
    op.drop_index("uq_duplicate_pairs_entities", table_name="duplicate_pairs")
    op.drop_table("duplicate_pairs")
