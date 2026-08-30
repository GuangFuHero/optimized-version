"""Read/write use-cases for the deployment's single project settings row (ADR-090).

Flat-service style, same as config.py: these are global settings, not user-owned resources,
so each function is checkpoint 1 only — `project.view` / `project.edit` carry no per-row
scope. `project.edit` is its own capability rather than a reuse of `dynamic_field.edit`
because changing the disaster types flips the visibility of a whole batch of fields.
"""

import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import normalize_disaster_types
from app.core.permissions import Perm
from app.models.auth import User
from app.models.project_settings import ProjectSettings
from app.repositories.config_repository import disaster_types_in_use
from app.repositories.project_settings_repository import project_settings_repository
from app.services.authz import require_scope

logger = logging.getLogger(__name__)


class ProjectSettingsValidationError(Exception):
    """The requested settings change cannot be applied as given (mapped to 422)."""


@dataclass(frozen=True)
class ProjectSettingsUpdateResult:
    """The saved row, plus anything the caller should know about what they just saved."""

    settings: ProjectSettings
    warnings: tuple[str, ...] = ()


async def get_project_settings(db: AsyncSession, *, actor: User) -> ProjectSettings | None:
    """Return the settings row, or None while the deployment is still unconfigured."""
    await require_scope(actor, Perm.PROJECT_VIEW, db)
    return await project_settings_repository.get_singleton(db)


async def update_project_settings(
    db: AsyncSession, *, actor: User, values: dict
) -> ProjectSettingsUpdateResult:
    """Upsert the settings row: create it when the table is empty, update it otherwise.

    PATCH semantics — `values` holds only the fields the caller actually sent, so a partial
    body never clears the ones it omits. The single-row unique index guarantees a repeated
    call can never produce a second row.

    The very first call is a creation, and `name` is NOT NULL, so it must be supplied then.
    Refusing here beats defaulting to a placeholder: the console would otherwise show a
    nameless disaster with no way to tell that nobody ever named it.

    The row is read once, here, and handed to `upsert()` so it does not read it again.

    A saved `disaster_types` label that no configured field is scoped to comes back as a
    warning (ADR-169) — see `_unmatched_disaster_types`.
    """
    await require_scope(actor, Perm.PROJECT_EDIT, db)
    current = await project_settings_repository.get_singleton(db)
    if not values.get("name") and current is None:
        raise ProjectSettingsValidationError(
            "第一次設定必須提供 name（災害名稱）"
        )
    warnings = await _unmatched_disaster_types(db, values)
    settings = await project_settings_repository.upsert(db, values=values, current=current)
    return ProjectSettingsUpdateResult(settings=settings, warnings=warnings)


async def _unmatched_disaster_types(db: AsyncSession, values: dict) -> tuple[str, ...]:
    """Warn about saved disaster labels that no configured field is scoped to (ADR-169).

    Setting `disaster_types` re-scopes every dynamic field at once, and the match is exact
    string equality — so `"floods"` for `"flood"` is accepted, stores cleanly, and silently
    empties the station and task forms of every flood field. There is no vocabulary to
    validate against (ADR-091), so the check is indirect: a label that matches nothing that
    is configured is *probably* a typo, and possibly a disaster whose fields are not set up
    yet. That is a warning, never a rejection — configuring the disaster before its fields is
    a legitimate order to work in.

    Logged as well as returned: the response tells whoever is at the console, the log tells
    whoever is looking into "why did the flood fields disappear" days later.
    """
    if "disaster_types" not in values:
        return ()
    labels = normalize_disaster_types(values["disaster_types"])
    if not labels:
        return ()
    configured = await disaster_types_in_use(db)
    unmatched = [label for label in labels if label not in configured]
    if not unmatched:
        return ()
    logger.warning(
        "project_settings.disaster_types %s match no configured dynamic field (configured: %s)",
        unmatched, sorted(configured),
    )
    return tuple(
        f"災害型別「{label}」沒有對應到任何動態欄位，"
        "請確認拼字，或確認該型別的欄位尚未設定"
        for label in unmatched
    )
