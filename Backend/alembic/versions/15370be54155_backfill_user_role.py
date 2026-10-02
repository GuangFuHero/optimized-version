"""backfill the `user` platform grant (ADR-290: the site acts as `user`)

Revision ID: 15370be54155
Revises: 666b59ab2581
Create Date: 2026-09-30 12:00:00.000000

A request from the site acts as the caller's own `user` grant (ADR-289), and the permission
engine only ever reads grants an account actually holds. Registration grants `user`, but a
later platform grant used to *replace* it (`assign_role`, and `bootstrap_admin` through
`user_repository.assign_role` since ADR-184), so a super admin set up that way — and anyone
else whose platform role was reassigned — holds none. This gives every such account one, so
that "every account holds `user`" is true and the engine need not change.

Nothing is granted when there is no `user` role yet: on a fresh database the seed runs after
the migrations, and registration grants `user` from then on.

Downgrade removes nothing. It cannot tell a `user` grant added here from one granted since —
an approved data auditor keeps `user` beside `data_auditor` (ADR-288) — and taking `user` away
from an account that should hold it would lock it out of the site.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "15370be54155"
down_revision: str | Sequence[str] | None = "666b59ab2581"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Grant `user` to every account that does not hold it."""
    op.execute(
        "INSERT INTO user_role_assign (uuid, user_uuid, role_uuid, team_uuid, role_kind)"
        " SELECT gen_random_uuid(), users.uuid, roles.uuid, NULL, roles.kind"
        " FROM users CROSS JOIN roles"
        " WHERE roles.name = 'user' AND roles.kind = 'platform'"
        " AND NOT EXISTS ("
        "   SELECT 1 FROM user_role_assign held"
        "   WHERE held.user_uuid = users.uuid AND held.role_uuid = roles.uuid"
        "   AND held.team_uuid IS NULL"
        " )"
    )


def downgrade() -> None:
    """Leave every grant in place; see the module docstring."""
