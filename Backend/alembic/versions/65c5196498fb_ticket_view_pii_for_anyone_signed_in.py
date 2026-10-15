"""ticket.view_pii: the seeded roles to `all` (ADR-286: anyone signed in may call the requester)

Revision ID: 65c5196498fb
Revises: 6c5a9d3d3444
Create Date: 2026-09-30 12:00:00.000000

The team decided on 2026-09-28 that anyone signed in may see a requester's contact details:
volunteers could not reach the person they were going to help. The RBAC seed is an additive
bootstrap that never overwrites an existing grant (ADR-055), so the seed change alone would
leave every existing database masked. This moves the seeded roles whose grant is still at the
seed's old default — `user` at `own`, the team roles `admin` and `member` at `zone` — to `all`.

A grant someone set to another scope at runtime through /api/v1/admin/rbac is left alone: the
runtime database is the source of truth (ADR-055). So are per-user grants (widest wins, so a
role at `all` already covers them) and roles the seed does not define.

Downgrade moves those three roles back from `all` to their old defaults. It cannot tell a grant
that was already `all` before this revision, but none of these three could have been unless set
so by hand.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '65c5196498fb'
down_revision: str | Sequence[str] | None = '6c5a9d3d3444'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_SEED_DEFAULTS = {"user": "own", "admin": "zone", "member": "zone"}


def _move(role: str, old: str, new: str) -> None:
    op.execute(
        f"UPDATE role_permission_assign SET scope = '{new}' "
        f"WHERE scope = '{old}' "
        f"AND permission_uuid IN (SELECT uuid FROM permissions WHERE key = 'ticket.view_pii') "
        f"AND role_uuid IN (SELECT uuid FROM roles WHERE name = '{role}')"
    )


def upgrade() -> None:
    """Move each seeded role's ticket.view_pii grant still at its old default to `all`."""
    for role, old in _OLD_SEED_DEFAULTS.items():
        _move(role, old, "all")


def downgrade() -> None:
    """Move those roles' ticket.view_pii grants at `all` back to their old defaults."""
    for role, old in _OLD_SEED_DEFAULTS.items():
        _move(role, "all", old)
