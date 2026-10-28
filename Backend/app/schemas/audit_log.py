"""Pydantic schemas for the audit-log read API (Spec/026, ADR-358)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuditLogItem(BaseModel):
    """One recorded change. `client_ip` is filled for the platform view only."""

    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    table_name: str
    action: str
    row_id: UUID
    old_values: dict | None
    new_values: dict | None
    user_uuid: UUID | None
    context: dict | None
    client_ip: str | None = None
    created_at: datetime


class AuditExportRequest(BaseModel):
    """The filters of an export, the same as the list's (ADR-414).

    All optional; `from` and `to` bound `created_at`, as on the list.
    """

    model_config = ConfigDict(populate_by_name=True)

    table: str | None = None
    row_id: UUID | None = None
    actor_uuid: UUID | None = None
    since: datetime | None = Field(None, alias="from")
    until: datetime | None = Field(None, alias="to")
