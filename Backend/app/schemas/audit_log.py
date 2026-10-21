"""Pydantic schemas for the audit-log read API (Spec/026, ADR-358)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


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
