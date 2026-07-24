"""Deployment-briefing use-cases (templates + generated briefings).

Global admin content — checkpoint 1 only (no owner/geo scope), same flat-service style as
services/config.py. Each function owns its own authz (`require_scope`) + validation +
persistence. The generate-from-template rule lives here (ADR-AB-04); the repository is pure CRUD.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.briefing import Briefing, BriefingTemplate
from app.repositories.briefings_repository import (
    briefing_repository,
    briefing_template_repository,
)
from app.services.authz import require_scope


def _update_fields(*, content: str | None, tags: list | None, state: str | None) -> dict:
    """Collect provided (non-None) content/tags/state fields for a partial update."""
    obj_in: dict = {}
    if content is not None:
        obj_in["content"] = content
    if tags is not None:
        obj_in["tags"] = tags
    if state is not None:
        obj_in["state"] = state
    return obj_in


# --- Templates ---------------------------------------------------------------------------

async def create_template(
    db: AsyncSession, *, actor: User, content: str, tags: list, state: str
) -> BriefingTemplate:
    """Create a briefing template (briefing.create)."""
    await require_scope(actor, Perm.BRIEFING_CREATE, db)
    return await briefing_template_repository.create(
        db,
        obj_in={"content": content, "tags": tags, "state": state, "created_by": str(actor.uuid)},
    )


async def update_template(
    db: AsyncSession, *, actor: User, uuid: UUID,
    content: str | None, tags: list | None, state: str | None,
) -> BriefingTemplate:
    """Edit a briefing template (briefing.edit). Raises ValueError if not found."""
    await require_scope(actor, Perm.BRIEFING_EDIT, db)
    t = await briefing_template_repository.get_by_uuid_active(db, uuid)
    if not t:
        raise ValueError("Briefing template not found")
    return await briefing_template_repository.update(
        db, db_obj=t, obj_in=_update_fields(content=content, tags=tags, state=state)
    )


async def delete_template(db: AsyncSession, *, actor: User, uuid: UUID) -> None:
    """Soft-delete a briefing template (briefing.delete). Raises ValueError if not found."""
    await require_scope(actor, Perm.BRIEFING_DELETE, db)
    t = await briefing_template_repository.get_by_uuid_active(db, uuid)
    if not t:
        raise ValueError("Briefing template not found")
    await briefing_template_repository.soft_delete(db, db_obj=t)


# --- Briefings ---------------------------------------------------------------------------

async def generate(
    db: AsyncSession, *, actor: User, template_uuid: UUID | None,
    content: str | None, tags: list | None, state: str | None,
) -> Briefing:
    """Generate a briefing (briefing.create).

    When ``content``/``tags``/``state`` are omitted and ``template_uuid`` refers to a live
    template, seed those values from it (ADR-AB-04: this business rule lives in the service,
    not the repository). An ad-hoc briefing (no template) defaults to empty content/tags and
    the ``briefing`` phase.
    """
    await require_scope(actor, Perm.BRIEFING_CREATE, db)
    template: BriefingTemplate | None = None
    if template_uuid is not None:
        template = await briefing_template_repository.get_by_uuid_active(db, template_uuid)
    if content is None:
        content = template.content if template else ""
    if tags is None:
        tags = list(template.tags) if template else []
    if state is None:
        state = template.state if template else "briefing"
    return await briefing_repository.create(
        db,
        obj_in={
            "template_uuid": template_uuid, "content": content, "tags": tags,
            "state": state, "created_by": str(actor.uuid),
        },
    )


async def update(
    db: AsyncSession, *, actor: User, uuid: UUID,
    content: str | None, tags: list | None, state: str | None,
) -> Briefing:
    """Edit a briefing (briefing.edit). Raises ValueError if not found."""
    await require_scope(actor, Perm.BRIEFING_EDIT, db)
    b = await briefing_repository.get_by_uuid_active(db, uuid)
    if not b:
        raise ValueError("Briefing not found")
    return await briefing_repository.update(
        db, db_obj=b, obj_in=_update_fields(content=content, tags=tags, state=state)
    )


async def delete(db: AsyncSession, *, actor: User, uuid: UUID) -> None:
    """Soft-delete a briefing (briefing.delete). Raises ValueError if not found."""
    await require_scope(actor, Perm.BRIEFING_DELETE, db)
    b = await briefing_repository.get_by_uuid_active(db, uuid)
    if not b:
        raise ValueError("Briefing not found")
    await briefing_repository.soft_delete(db, db_obj=b)
