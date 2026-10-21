"""join requests: applications name a team, invite links, team housekeeping (Spec 026)

Revision ID: 11f0025d521b
Revises: 209c4375c3e1
Create Date: 2026-10-20 12:00:00.000000

`role_requests` gains the team a member request asks for, the name of a team to found, the
invite it came through and the applicant's details (ADR-350, ADR-355). `team_invites` holds
the 24-hour links (ADR-353); both of its times are database defaults so no client sets them.
`users.real_name` is written on approval (ADR-355); `teams` gains contact fields and a CHECK on
its status (ADR-356, ADR-357).

Data: a pending `government` / `ngo` application from Spec 019 names no team, so no one could
ever approve it. It is rejected with a note telling the applicant to apply again (ADR-350
point 9). Downgrading does not reopen them: there is no telling them apart from requests a
reviewer rejected.

`team_invites` is audited from the start; the trigger is created here, as 666b59ab2581 did.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = "11f0025d521b"
down_revision: str | Sequence[str] | None = "209c4375c3e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_NOTE = "申請流程已更新，請重新送出申請。"

# Mirrors app/models/role_request.py.
_TARGET_CHECK = (
    "NOT (team_uuid IS NOT NULL AND new_team_name IS NOT NULL)"
    " AND (requested_role <> 'data_auditor' OR (team_uuid IS NULL AND new_team_name IS NULL))"
    " AND (requested_role = 'data_auditor' OR applicant_phone IS NULL"
    " OR team_uuid IS NOT NULL OR new_team_name IS NOT NULL)"
)
_INVITE_CHECK = "invite_uuid IS NULL OR team_uuid IS NOT NULL"


def upgrade() -> None:
    """Add the invite table, the new columns and CHECKs, then close Spec 019's unapprovable rows."""
    op.create_table(
        "team_invites",
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, comment="主鍵 UUID"),
        sa.Column("token", sa.String(length=32), nullable=False),
        sa.Column("team_uuid", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.uuid"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.uuid"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now() + interval '24 hours'"),
            nullable=False,
        ),
        sa.UniqueConstraint("token", name="uq_team_invites_token"),
    )
    op.create_index("ix_team_invites_team_uuid", "team_invites", ["team_uuid"])
    op.execute(get_audit_trigger_sql("team_invites"))

    op.add_column("role_requests", sa.Column("team_uuid", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("role_requests", sa.Column("new_team_name", sa.String(length=100), nullable=True))
    op.add_column("role_requests", sa.Column("invite_uuid", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("role_requests", sa.Column("applicant_name", sa.String(length=100), nullable=True))
    op.add_column("role_requests", sa.Column("applicant_phone", sa.String(length=20), nullable=True))
    op.add_column("role_requests", sa.Column("applicant_email", sa.String(length=320), nullable=True))
    op.create_foreign_key(
        "role_requests_team_uuid_fkey", "role_requests", "teams", ["team_uuid"], ["uuid"]
    )
    op.create_foreign_key(
        "role_requests_invite_uuid_fkey", "role_requests", "team_invites", ["invite_uuid"], ["uuid"]
    )
    op.create_index("ix_role_requests_team_uuid", "role_requests", ["team_uuid"])
    op.create_index(
        "ix_role_requests_team_pending",
        "role_requests",
        ["team_uuid", "created_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_check_constraint("ck_role_requests_target", "role_requests", _TARGET_CHECK)
    op.create_check_constraint("ck_role_requests_invite", "role_requests", _INVITE_CHECK)

    op.add_column("users", sa.Column("real_name", sa.String(length=100), nullable=True))
    op.add_column("teams", sa.Column("contact_name", sa.String(length=100), nullable=True))
    op.add_column("teams", sa.Column("contact_phone", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        "ck_teams_status", "teams", "status IN ('active', 'suspended')"
    )

    op.execute(
        sa.text(
            "UPDATE role_requests SET status = 'rejected', review_note = :note, closed_at = now()"
            " WHERE status = 'pending' AND requested_role IN ('government', 'ngo')"
            " AND team_uuid IS NULL AND new_team_name IS NULL"
        ).bindparams(note=_LEGACY_NOTE)
    )


def downgrade() -> None:
    """Drop what upgrade added. Rejected legacy requests stay rejected (see the module docstring)."""
    op.drop_constraint("ck_teams_status", "teams", type_="check")
    op.drop_column("teams", "contact_phone")
    op.drop_column("teams", "contact_name")
    op.drop_column("users", "real_name")

    op.drop_constraint("ck_role_requests_invite", "role_requests", type_="check")
    op.drop_constraint("ck_role_requests_target", "role_requests", type_="check")
    op.drop_index("ix_role_requests_team_pending", table_name="role_requests")
    op.drop_index("ix_role_requests_team_uuid", table_name="role_requests")
    op.drop_constraint("role_requests_invite_uuid_fkey", "role_requests", type_="foreignkey")
    op.drop_constraint("role_requests_team_uuid_fkey", "role_requests", type_="foreignkey")
    added = (
        "applicant_email", "applicant_phone", "applicant_name", "invite_uuid", "new_team_name", "team_uuid"
    )
    for column in added:
        op.drop_column("role_requests", column)

    op.execute("DROP TRIGGER IF EXISTS audit_trigger_team_invites ON team_invites;")
    op.drop_index("ix_team_invites_team_uuid", table_name="team_invites")
    op.drop_table("team_invites")
