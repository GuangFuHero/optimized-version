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

# What an applicant sent and the name a reviewer confirmed: read only by those who may decide
# the request (ADR-287 point 7, ADR-354 point 3, ADR-355 point 5). A data auditor holds audit.view
# at `all` and still does not read these, so the platform view masks them for anyone without
# role_request.review. Team admins read them for their own team's requests, as in their queue.
_APPLICANT_KEYS = {
    "role_requests": ("reason", "contact", "applicant_name", "applicant_phone", "applicant_email"),
    "users": ("real_name",),
}
REDACTED = "[redacted]"

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


def redact_applicant_details(table_name: str, values: dict | None) -> dict | None:
    """The row's values with what only reviewers read replaced (see _APPLICANT_KEYS)."""
    keys = _APPLICANT_KEYS.get(table_name)
    if values is None or keys is None:
        return values
    return {key: (REDACTED if key in keys and value is not None else value) for key, value in values.items()}


@dataclass
class AuditPage:
    """A page of the log and how the caller may read it."""

    rows: list[AuditLog]
    platform_view: bool
    reads_applicant_details: bool


async def list_audit_logs(
    db: AsyncSession, *, actor: User, filters: AuditFilters, limit: int, offset: int
) -> AuditPage:
    """Newest first."""
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
    reads_details = team_uuid is not None or (
        await resolve_scope(actor, Perm.ROLE_REQUEST_REVIEW, db) != Scope.NONE
    )
    return AuditPage(
        rows=list(rows.scalars().all()),
        platform_view=team_uuid is None,
        reads_applicant_details=reads_details,
    )
