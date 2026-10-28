"""Reading the audit log (Spec/026, ADR-358).

The platform view (audit.view at `all`) reads every row. The team view (team.audit.view at
`team`) reads the rows about the caller's active team: its own row, the grants in it, its join
requests, invites and zone assignments. Not what members did while acting as the team — that is
the history timeline's, under its own capabilities.
"""

import json
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, active_team
from app.core.security import resolve_scope
from app.core.tabular import write_csv
from app.models.audit import TEAM_UUID_OF_ROW, AuditLog
from app.models.auth import User

MAX_PAGE = 100
# The most rows one export carries (ADR-414). More is refused rather than cut short.
MAX_EXPORT_ROWS = 10_000
EXPORT_COLUMNS = (
    "created_at",
    "table_name",
    "action",
    "row_id",
    "actor_uuid",
    "actor_name",
    "client_ip",
    "context",
    "old_values",
    "new_values",
)

# Personal data a data auditor holds audit.view at `all` for but must not read (ADR-359 point 5):
# what an applicant sent and the name a reviewer confirmed (ADR-287 point 7, ADR-355 point 5), and
# every account's login phone / email and SSO subject, which would otherwise undo that masking
# (PR #93 review). The platform view masks them for anyone without role_request.review. Team
# admins read their own team's applicants, as in their queue; the team view covers no account rows.
_APPLICANT_KEYS = {
    "role_requests": ("reason", "contact", "applicant_name", "applicant_phone", "applicant_email"),
    "users": ("real_name",),
    "user_contacts": ("value",),
    "user_identities": ("provider_subject",),
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


def _filtered(query, filters: AuditFilters):
    """`query` over AuditLog narrowed by what the caller asked for."""
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
    return query


async def _reads_applicant_details(db: AsyncSession, actor: User) -> bool:
    """Whether the platform view shows what only reviewers read (ADR-359 point 5)."""
    return await resolve_scope(actor, Perm.ROLE_REQUEST_REVIEW, db) != Scope.NONE


async def list_audit_logs(
    db: AsyncSession, *, actor: User, filters: AuditFilters, limit: int, offset: int
) -> AuditPage:
    """Newest first."""
    team_uuid = await _team_reach(db, actor)
    query = _filtered(select(AuditLog), filters)
    if team_uuid is not None:
        query = query.where(_about_team(team_uuid))
    rows = await db.execute(
        query.order_by(AuditLog.created_at.desc(), AuditLog.uuid).offset(offset).limit(min(limit, MAX_PAGE))
    )
    reads_details = team_uuid is not None or await _reads_applicant_details(db, actor)
    return AuditPage(
        rows=list(rows.scalars().all()),
        platform_view=team_uuid is None,
        reads_applicant_details=reads_details,
    )


class AuditExportTooLarge(ValueError):
    """More rows than one export carries. REST answers 422."""


def _cell(value) -> str:
    """One CSV cell: JSON for the stored values, ISO for times, '' for nothing."""
    if value is None:
        return ""
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


async def export_audit_logs(db: AsyncSession, *, actor: User, filters: AuditFilters) -> bytes:
    """The filtered log as CSV, newest first (ADR-414). audit.export at `all`, else 403.

    Always the platform view, with the IP. Applicant details are masked exactly as on screen for
    a holder without role_request.review, which the seed never makes but /admin/rbac could.
    """
    if await resolve_scope(actor, Perm.AUDIT_EXPORT, db) != Scope.ALL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
    count = await db.scalar(_filtered(select(func.count()).select_from(AuditLog), filters))
    if count > MAX_EXPORT_ROWS:
        raise AuditExportTooLarge(
            f"{count} changes match; one file carries at most {MAX_EXPORT_ROWS}. Narrow the date range."
        )
    query = _filtered(select(AuditLog, User.name).outerjoin(User, User.uuid == AuditLog.user_uuid), filters)
    rows = (await db.execute(query.order_by(AuditLog.created_at.desc(), AuditLog.uuid))).all()
    reads_details = await _reads_applicant_details(db, actor)
    return write_csv(
        EXPORT_COLUMNS, [_export_row(row, actor_name, reads_details) for row, actor_name in rows]
    )


def _export_row(row: AuditLog, actor_name: str | None, reads_details: bool) -> dict[str, str]:
    old, new = row.old_values, row.new_values
    if not reads_details:
        old = redact_applicant_details(row.table_name, old)
        new = redact_applicant_details(row.table_name, new)
    values = {
        "created_at": row.created_at,
        "table_name": row.table_name,
        "action": row.action,
        "row_id": row.row_id,
        "actor_uuid": row.user_uuid,
        "actor_name": actor_name,
        "client_ip": row.client_ip,
        "context": row.context,
        "old_values": old,
        "new_values": new,
    }
    return {key: _cell(value) for key, value in values.items()}
