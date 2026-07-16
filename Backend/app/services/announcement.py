"""Announcement write use-cases (site-wide notices).

Global admin content — checkpoint 1 only (no owner/geo scope), same flat-service style as
services/config.py. Each function owns its own authz (`require_scope`) + validation +
persistence. ADR-AB-02 (thin GraphQL resolver → service) / ADR-AB-03 (checkpoint-1-only).
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.announcement import Announcement
from app.models.auth import User
from app.repositories.announcements_repository import announcement_repository
from app.services.authz import require_scope


async def create(db: AsyncSession, *, actor: User, content: str) -> Announcement:
    """Create an active announcement appended at the end of the list (announcement.publish)."""
    await require_scope(actor, Perm.ANN_PUBLISH, db)
    return await announcement_repository.create_at_end(
        db, content=content, created_by=str(actor.uuid)
    )


async def update(db: AsyncSession, *, actor: User, uuid: UUID, content: str) -> Announcement:
    """Edit an announcement's content (announcement.edit). Raises ValueError if not found."""
    await require_scope(actor, Perm.ANN_EDIT, db)
    a = await announcement_repository.get_by_uuid_active(db, uuid)
    if not a:
        raise ValueError("Announcement not found")
    return await announcement_repository.update(db, db_obj=a, obj_in={"content": content})


async def move(db: AsyncSession, *, actor: User, uuid: UUID, up: bool) -> Announcement:
    """Move an active announcement up/down one position (announcement.edit)."""
    await require_scope(actor, Perm.ANN_EDIT, db)
    a = await announcement_repository.move(db, uuid=uuid, up=up)
    if a is None:
        raise ValueError("Announcement not found or not active")
    return a


async def set_active(db: AsyncSession, *, actor: User, uuid: UUID, active: bool) -> Announcement:
    """Activate (append at end) or deactivate (remove from order) an announcement (announcement.edit)."""
    await require_scope(actor, Perm.ANN_EDIT, db)
    a = await announcement_repository.set_active(db, uuid=uuid, active=active)
    if a is None:
        raise ValueError("Announcement not found")
    return a


async def delete(db: AsyncSession, *, actor: User, uuid: UUID) -> None:
    """Soft-delete an announcement and close the order gap (announcement.delete)."""
    await require_scope(actor, Perm.ANN_DELETE, db)
    ok = await announcement_repository.soft_delete_announcement(db, uuid=uuid)
    if not ok:
        raise ValueError("Announcement not found")
