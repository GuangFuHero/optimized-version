"""SQLAlchemy models for the ticket dedup fast layer (配對卡與去重稽核事件).

Scope note: this module only carries the two tables the fast layer writes —
``ticket_duplicate_pairs`` (one row = one "are these two the same request?" verdict) and
``ticket_dedup_audit_events`` (the decision trail that ``audit_logs`` deliberately does not
hold: ``audit_logs`` records row diffs, this records dedup decisions).

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


class TicketDuplicatePair(Base, UUIDPKMixin, TimestampMixin):
    """One verdict about one pair of tickets — machine-issued or admin-stamped.

    Rows are never hard-deleted: the normal lifecycle is an in-place UPDATE of the same row
    (``suggested`` → ``confirmed``/``rejected``/``dup_ignored``), and overturning a settled
    verdict is soft-delete + insert a new row, so the score snapshot on a card stays
    immutable. The partial UNIQUE index enforces at most one live card per ticket pair.
    """

    __tablename__ = "ticket_duplicate_pairs"
    __table_args__ = (
        CheckConstraint("ticket_low_id < ticket_high_id", name="ck_ticket_duplicate_pairs_order"),
        CheckConstraint(
            "similarity IS NULL OR (similarity >= 0 AND similarity <= 1)",
            name="ck_ticket_duplicate_pairs_similarity",
        ),
        CheckConstraint(_in_list("method", PAIR_METHODS), name="ck_ticket_duplicate_pairs_method"),
        CheckConstraint(
            _in_list("source_layer", PAIR_SOURCE_LAYERS), name="ck_ticket_duplicate_pairs_source_layer"
        ),
        CheckConstraint(_in_list("status", PAIR_STATUSES), name="ck_ticket_duplicate_pairs_status"),
        CheckConstraint(
            f"hint_outcome IS NULL OR {_in_list('hint_outcome', PAIR_HINT_OUTCOMES)}",
            name="ck_ticket_duplicate_pairs_hint_outcome",
        ),
        Index(
            "uq_ticket_duplicate_pairs_tickets",
            "ticket_low_id",
            "ticket_high_id",
            unique=True,
            postgresql_where=text("delete_at IS NULL"),
        ),
        Index("ix_ticket_duplicate_pairs_group", "duplicate_group_uuid"),
        Index(
            "ix_ticket_duplicate_pairs_status",
            "status",
            postgresql_where=text("delete_at IS NULL"),
        ),
    )

    # Ordered pair (low < high) so the same two tickets always land on the same row,
    # whichever one was submitted second.
    ticket_low_id: Mapped[str] = mapped_column(ForeignKey("tickets.uuid"))
    ticket_high_id: Mapped[str] = mapped_column(ForeignKey("tickets.uuid"))
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


class TicketDedupAuditEvent(Base, UUIDPKMixin):
    """A dedup decision event — the fast layer's only record of a *successful* hint.

    Without this table the fast layer would only ever record its failures (a ``dup_ignored``
    pair when the submitter went ahead anyway), leaving "how many duplicates did the hint
    prevent?" unmeasurable. Append-only: no ``updated_at``/``delete_at`` (same shape as
    ``audit_logs``).
    """

    __tablename__ = "ticket_dedup_audit_events"
    __table_args__ = (
        CheckConstraint(
            _in_list("event_type", AUDIT_EVENT_TYPES), name="ck_ticket_dedup_audit_events_type"
        ),
        CheckConstraint(
            _in_list("source_layer", PAIR_SOURCE_LAYERS),
            name="ck_ticket_dedup_audit_events_source_layer",
        ),
        Index("ix_ticket_dedup_audit_events_pair", "pair_uuid"),
        Index("ix_ticket_dedup_audit_events_group", "duplicate_group_uuid"),
    )

    event_type: Mapped[str] = mapped_column(Text)
    pair_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("ticket_duplicate_pairs.uuid"), nullable=True
    )
    duplicate_group_uuid: Mapped[_uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # For a fast-layer hint: primary = the existing ticket the hint pointed at, duplicate =
    # the ticket the submitter created anyway (NULL when they accepted the hint and never
    # created one — that absence IS the signal).
    primary_ticket_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("tickets.uuid"), nullable=True
    )
    duplicate_ticket_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("tickets.uuid"), nullable=True
    )
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
