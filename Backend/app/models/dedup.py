"""SQLAlchemy models for the dedup fast layer (配對卡與去重稽核事件).

Scope note: this module only carries the two tables the fast layer writes —
``duplicate_pairs`` (one row = one "are these two the same request?" verdict) and
``dedup_audit_events`` (the decision trail that ``audit_logs`` deliberately does not hold:
``audit_logs`` records row diffs, this records dedup decisions).

Both tables are entity-agnostic rather than ticket-only: `entity_kind` says what the paired
uuids are (`'ticket'` / `'station'` / `'ticket_task'`), and the paired uuid columns carry no
FK — the same pair table serves whichever entity kind is being deduplicated, so it cannot
point at one specific table's primary key. The fast layer itself only ever writes
`entity_kind='ticket'`; the other two values exist in the CHECK so a later slice does not
have to migrate the constraint to add them.

The group/policy tables from the frozen contract (``ticket_duplicate_groups``,
``ticket_duplicate_group_members``, ``dedup_settings``, ``dedup_rule_versions``,
``dedup_score_components``, ``dedup_scan_runs``) belong to the slow layer and are NOT in
this slice. ``duplicate_group_uuid`` and ``rule_version_uuid`` are therefore plain UUID
columns here — the contract declares them as FKs, but the referenced tables do not exist
yet; the FK is added when those tables land.
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

# Value domains, mirrored into CHECK constraints below. Kept as module constants so the
# service layer never spells a status as a bare string (same spirit as app/core/permissions.py).
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
    # Contract §1.5's three additions. The fast layer never writes them — they belong to the
    # slow layer's group welding and detach flows — but the value domain is part of the
    # frozen contract, and a CHECK that omits them would have to be rewritten later to let
    # those flows land. Cheaper to be complete now than to migrate a constraint.
    "group_welded",
    "weld_kept",
    "member_detached",
)


def _in_list(column: str, values: tuple[str, ...]) -> str:
    """Render a SQL ``col IN ('a', 'b')`` fragment for a CHECK constraint."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class DuplicatePair(Base, UUIDPKMixin, TimestampMixin):
    """One verdict about one pair of entities — machine-issued or admin-stamped.

    Rows are never hard-deleted: the normal lifecycle is an in-place UPDATE of the same row
    (``suggested`` → ``confirmed``/``rejected``/``dup_ignored``), and overturning a settled
    verdict is soft-delete + insert a new row, so the score snapshot on a card stays
    immutable. The partial UNIQUE index enforces at most one live card per (entity_kind, pair).
    """

    __tablename__ = "duplicate_pairs"
    __table_args__ = (
        CheckConstraint("low_uuid < high_uuid", name="ck_duplicate_pairs_order"),
        CheckConstraint(
            "similarity IS NULL OR (similarity >= 0 AND similarity <= 1)",
            name="ck_duplicate_pairs_similarity",
        ),
        CheckConstraint(_in_list("method", PAIR_METHODS), name="ck_duplicate_pairs_method"),
        CheckConstraint(
            _in_list("source_layer", PAIR_SOURCE_LAYERS), name="ck_duplicate_pairs_source_layer"
        ),
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

    # What kind of entity low_uuid/high_uuid identify. The fast layer only ever writes
    # 'ticket'; 'station' and 'ticket_task' are in the domain for a later slice.
    entity_kind: Mapped[str] = mapped_column(Text)
    # Ordered pair (low < high) so the same two entities always land on the same row,
    # whichever one was submitted second. No FK: this table is shared across entity kinds
    # and cannot point at one specific table's primary key.
    low_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))
    high_uuid: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True))
    # No FK yet — ticket_duplicate_groups / dedup_rule_versions are slow-layer tables that
    # this slice does not create. See the module docstring.
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
    rescan_needed: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), default=False
    )
    rescanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DedupAuditEvent(Base, UUIDPKMixin):
    """A dedup decision event — the fast layer's only record of a *successful* hint.

    Without this table the fast layer would only ever record its failures (a ``dup_ignored``
    pair when the submitter went ahead anyway), leaving "how many duplicates did the hint
    prevent?" unmeasurable. Append-only: no ``updated_at``/``delete_at`` (same shape as
    ``audit_logs``).
    """

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
    # For a fast-layer hint: primary = the existing entity the hint pointed at, duplicate =
    # the entity the submitter created anyway (NULL when they accepted the hint and never
    # created one — that absence IS the signal). No FK: same cross-entity-kind reason as
    # DuplicatePair.low_uuid/high_uuid.
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
