"""Reading the audit log (Spec/026, ADR-358).

The platform view (audit.view at `all`) reads every row. The team view (team.audit.view at
`team`) reads the rows about the caller's active team: its own row, the grants in it, its join
requests, invites and zone assignments. Not what members did while acting as the team — that is
the history timeline's, under its own capabilities.
"""

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, active_team
from app.core.security import resolve_scope
from app.models.audit import TEAM_UUID_OF_ROW, AuditLog
from app.models.auth import User

MAX_PAGE = 100

# Tables whose rows name the team in a `team_uuid` column (ADR-358 point 4).
_TEAM_COLUMN_TABLES = ("user_role_assign", "user_permission_assign", "team_invites", "team_zone_assign")


@dataclass
class AuditFilters:
    """What the caller narrowed the log to. All optional."""

    table: str | None = None
    row_id: object = None
    actor_uuid: object = None
    since: datetime | None = None
    until: datetime | None = None


def _about_team(team_uuid: str):
    """Rows related to the team, as ADR-358 point 4 lists them."""
    # literal_column, not text(): it compares as SQL and keeps the expression the index is on.
    named_team = literal_column(TEAM_UUID_OF_ROW) == team_uuid
    granted_team = literal_column("(COALESCE(new_values, old_values) ->> 'granted_team_uuid')") == team_uuid
    return or_(
        and_(AuditLog.table_name == "teams", AuditLog.row_id == team_uuid),
        and_(AuditLog.table_name.in_(_TEAM_COLUMN_TABLES), named_team),
        and_(AuditLog.table_name == "role_requests", or_(named_team, granted_team)),
    )


async def _team_reach(db: AsyncSession, actor: User) -> str | None:
    """None for the platform view, else the team the caller may read; 403 if neither."""
    if await resolve_scope(actor, Perm.AUDIT_VIEW, db) == Scope.ALL:
        return None
    team_uuid = active_team(actor)
    if team_uuid is not None and await resolve_scope(actor, Perm.TEAM_AUDIT_VIEW, db) != Scope.NONE:
        return str(team_uuid)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")


async def list_audit_logs(
    db: AsyncSession, *, actor: User, filters: AuditFilters, limit: int, offset: int
) -> tuple[list[AuditLog], bool]:
    """Newest first; returns the rows and whether the caller has the platform view."""
    team_uuid = await _team_reach(db, actor)
    query = select(AuditLog)
    if team_uuid is not None:
        query = query.where(_about_team(team_uuid))
    if filters.table is not None:
        query = query.where(AuditLog.table_name == filters.table)
    if filters.row_id is not None:
        query = query.where(AuditLog.row_id == filters.row_id)
    if filters.actor_uuid is not None:
        query = query.where(AuditLog.user_uuid == filters.actor_uuid)
    if filters.since is not None:
        query = query.where(AuditLog.created_at >= filters.since)
    if filters.until is not None:
        query = query.where(AuditLog.created_at < filters.until)
    rows = await db.execute(
        query.order_by(AuditLog.created_at.desc(), AuditLog.uuid).offset(offset).limit(min(limit, MAX_PAGE))
    )
    return list(rows.scalars().all()), team_uuid is None
