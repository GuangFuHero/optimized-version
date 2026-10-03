"""SQLAlchemy models for the dedup fast layer (配對卡與去重稽核事件).

Both tables are shared across entity kinds: `entity_kind` says what the paired uuids point
at, so those uuid columns carry no FK. The slow-layer tables (groups, settings, rule
versions, scan runs) are not created yet, so `duplicate_group_uuid` / `rule_version_uuid`
are plain uuid columns until they land.
"""

import uuid as _uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    UUID,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin

# Value domains, mirrored into the CHECK constraints below.
ENTITY_KINDS = ("ticket", "station", "ticket_task")
PAIR_METHODS = ("fast_rule", "slow_vector", "slow_hybrid", "manual")
PAIR_SOURCE_LAYERS = ("fast", "slow", "manual", "system")
PAIR_STATUSES = ("dup_ignored", "suggested", "confirmed", "rejected")
PAIR_HINT_OUTCOMES = ("ignored_hint", "accepted_hint")
AUDIT_EVENT_TYPES = (
    "suggested",
    "hint_accepted",
    "ignored_by_submitter",
    "rejected",
    "confirmed",
    "merged",
    "unmerged",
    "manual_note",
    # Slow-layer values (contract §1.5), listed now so the CHECK needs no later migration.
    "group_welded",
    "weld_kept",
    "member_detached",
)


def _in_list(column: str, values: tuple[str, ...]) -> str:
    """Render a SQL ``col IN ('a', 'b')`` fragment for a CHECK constraint."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class DuplicatePair(Base, UUIDPKMixin, TimestampMixin):
    """One verdict about one pair of entities; at most one live (not soft-deleted) card per pair."""

    __tablename__ = "duplicate_pairs"
    __table_args__ = (
        CheckConstraint("low_uuid < high_uuid", name="ck_duplicate_pairs_order"),
        CheckConstraint(
            "similarity IS NULL OR (similarity >= 0 AND similarity <= 1)",
            name="ck_duplicate_pairs_similarity",
        ),
        CheckConstraint(_in_list("method", PAIR_METHODS), name="ck_duplicate_pairs_method"),
        CheckConstraint(_in_list("source_layer", PAIR_SOURCE_LAYERS), name="ck_duplicate_pairs_source_layer"),
        CheckConstraint(_in_list("status", PAIR_STATUSES), name="ck_duplicate_pairs_status"),
        CheckConstraint(
            f"hint_outcome IS NULL OR {_in_list('hint_outcome', PAIR_HINT_OUTCOMES)}",
            name="ck_duplicate_pairs_hint_outcome",
        ),
        CheckConstraint(_in_list("entity_kind", ENTITY_KINDS), name="ck_duplicate_pairs_entity_kind"),
        Index(
            "uq_duplicate_pairs_entities",
            "entity_kind",
            "low_uuid",
            "high_uuid",
            unique=True,
            postgresql_where=text("delete_at IS NULL"),
        ),
        Index("ix_duplicate_pairs_group", "duplicate_group_uuid"),
        Index(
            "ix_duplicate_pairs_status",
            "status",
            postgresql_where=text("delete_at IS NULL"),
        ),
    )

    entity_kind: Mapped[str] = mapped_column(Text)
    # Ordered (low < high) so a pair always lands on one row, whichever came second.
    low_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))
    high_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))
    duplicate_group_uuid: Mapped[_uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    rule_version_uuid: Mapped[_uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    similarity: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 4), nullable=True, comment="加權總分 0–1；人工建卡沒跑分時為 NULL"
    )
    score_components: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, comment="判定當下的分數拆帳快照（不可變）"
    )
    method: Mapped[str] = mapped_column(Text)
    source_layer: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    reason: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    hint_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    rescan_needed: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), default=False)
    rescanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DedupAuditEvent(Base, UUIDPKMixin):
    """An append-only dedup decision event; the only record of a hint the submitter accepted."""

    __tablename__ = "dedup_audit_events"
    __table_args__ = (
        CheckConstraint(_in_list("event_type", AUDIT_EVENT_TYPES), name="ck_dedup_audit_events_type"),
        CheckConstraint(
            _in_list("source_layer", PAIR_SOURCE_LAYERS),
            name="ck_dedup_audit_events_source_layer",
        ),
        CheckConstraint(_in_list("entity_kind", ENTITY_KINDS), name="ck_dedup_audit_events_entity_kind"),
        Index("ix_dedup_audit_events_pair", "pair_uuid"),
        Index("ix_dedup_audit_events_group", "duplicate_group_uuid"),
    )

    entity_kind: Mapped[str] = mapped_column(Text)
    event_type: Mapped[str] = mapped_column(Text)
    pair_uuid: Mapped[str | None] = mapped_column(ForeignKey("duplicate_pairs.uuid"), nullable=True)
    duplicate_group_uuid: Mapped[_uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # primary = the entity the hint pointed at; duplicate = the one created anyway (NULL if
    # the submitter accepted the hint).
    primary_uuid: Mapped[_uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    duplicate_uuid: Mapped[_uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_uuid: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)
    source_layer: Mapped[str] = mapped_column(Text)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    before_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    affected_refs: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reversible: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), comment="建立時間"
    )
