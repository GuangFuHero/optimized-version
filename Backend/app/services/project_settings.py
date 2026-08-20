"""Read/write use-cases for the deployment's single project settings row (ADR-090).

Flat-service style, same as config.py: these are global settings, not user-owned resources,
so each function is checkpoint 1 only — `project.view` / `project.edit` carry no per-row
scope. `project.edit` is its own capability rather than a reuse of `dynamic_field.edit`
because changing the disaster types flips the visibility of a whole batch of fields.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.project_settings import ProjectSettings
from app.repositories.project_settings_repository import project_settings_repository
from app.services.authz import require_scope


class ProjectSettingsValidationError(Exception):
    """The requested settings change cannot be applied as given (mapped to 422)."""


async def get_project_settings(db: AsyncSession, *, actor: User) -> ProjectSettings | None:
    """Return the settings row, or None while the deployment is still unconfigured."""
    await require_scope(actor, Perm.PROJECT_VIEW, db)
    return await project_settings_repository.get_singleton(db)


async def update_project_settings(
    db: AsyncSession, *, actor: User, values: dict
) -> ProjectSettings:
    """Upsert the settings row: create it when the table is empty, update it otherwise.

    PATCH semantics — `values` holds only the fields the caller actually sent, so a partial
    body never clears the ones it omits. The single-row unique index guarantees a repeated
    call can never produce a second row.

    The very first call is a creation, and `name` is NOT NULL, so it must be supplied then.
    Refusing here beats defaulting to a placeholder: the console would otherwise show a
    nameless disaster with no way to tell that nobody ever named it.
    """
    await require_scope(actor, Perm.PROJECT_EDIT, db)
    if not values.get("name") and await project_settings_repository.get_singleton(db) is None:
        raise ProjectSettingsValidationError(
            "第一次設定必須提供 name（災害名稱）"
        )
    return await project_settings_repository.upsert(db, values=values)
