"""dedup_audit_events: allow event_type 'verdict_revoked' (ADR-344)

Revision ID: a5e641c99923
Revises: 1649d30b0122
Create Date: 2026-10-20 13:00:00.000000

Spec 025 lets a reviewer undo a confirm or reject on a pair card. The undo is recorded as its own
event type, kept apart from `unmerged` (which undoes a merge), so this rebuilds the CHECK with the
new value.

Downgrade rebuilds the old CHECK, which Postgres validates against existing rows: while any
`verdict_revoked` event exists the downgrade fails rather than deleting that record.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a5e641c99923"
down_revision: str | Sequence[str] | None = "1649d30b0122"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NAME = "ck_dedup_audit_events_type"
_OLD_TYPES = (
    "suggested",
    "hint_accepted",
    "ignored_by_submitter",
    "hint_shown",
    "rejected",
    "confirmed",
    "merged",
    "unmerged",
    "manual_note",
    "group_welded",
    "weld_kept",
    "member_detached",
)
_NEW_TYPES = (*_OLD_TYPES, "verdict_revoked")


def _rebuild(types: tuple[str, ...]) -> None:
    op.drop_constraint(_NAME, "dedup_audit_events", type_="check")
    op.create_check_constraint(
        _NAME, "dedup_audit_events", f"event_type IN ({', '.join(repr(t) for t in types)})"
    )


def upgrade() -> None:
    """Add 'verdict_revoked' to the allowed event types."""
    _rebuild(_NEW_TYPES)


def downgrade() -> None:
    """Restore the old event types; fails while any verdict_revoked event exists."""
    _rebuild(_OLD_TYPES)
