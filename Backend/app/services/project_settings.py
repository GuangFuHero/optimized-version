"""Read/write use-cases for the deployment's single project settings row (ADR-090).

Flat-service style, same as config.py: these are global settings, not user-owned resources,
so each function is checkpoint 1 only — `project.view` / `project.edit` carry no per-row
scope. `project.edit` is its own capability rather than a reuse of `dynamic_field.edit`
because changing the disaster types flips the visibility of a whole batch of fields.
"""

import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import normalize_disaster_types, validate_disaster_types
from app.core.permissions import Perm
from app.models.auth import User
from app.models.disaster_type import DisasterType
from app.models.project_settings import ProjectSettings
from app.repositories.config_repository import disaster_types_in_use
from app.repositories.project_settings_repository import (
    disaster_type_repository,
    project_settings_repository,
)
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
    if "disaster_types" in values:
        # Feature 018: the vocabulary is closed now, so a label that is not a known key is
        # rejected outright rather than merely warned about. `_unmatched_disaster_types` below
        # still earns its place — it catches the *other* failure, a real disaster type that no
        # field has been configured for yet, which is legitimate and only worth a warning.
        #
        # Re-raised as ProjectSettingsValidationError because this path is REST, not GraphQL:
        # the admin endpoint maps that to 422, whereas a bare ValueError escapes as a 500 and
        # tells the operator nothing about which label was wrong.
        try:
            validated = await validate_disaster_types(db, values["disaster_types"])
        except ValueError as err:
            raise ProjectSettingsValidationError(str(err)) from err
        values = {**values, "disaster_types": validated}
    warnings = await _unmatched_disaster_types(db, values)
    settings = await project_settings_repository.upsert(db, values=values, current=current)
    return ProjectSettingsUpdateResult(settings=settings, warnings=warnings)


async def _unmatched_disaster_types(db: AsyncSession, values: dict) -> tuple[str, ...]:
    """Warn about saved disaster labels that no configured field is scoped to (ADR-169).

    Setting `disaster_types` re-scopes every dynamic field at once, and the match is exact
    string equality. Feature 018 closed the vocabulary, so the typo half of what this used to
    catch — `"floods"` for `"flood"` — is now a hard rejection upstream in
    `validate_disaster_types`, and what is left here is the case that is *not* an error: a
    perfectly real disaster type that nobody has configured any fields for yet. Still a
    warning, never a rejection — configuring the disaster before its fields is a legitimate
    order to work in.

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


async def list_disaster_types(
    db: AsyncSession, *, actor: User, include_inactive: bool = False
) -> list[DisasterType]:
    """List the deployment's disaster vocabulary (checkpoint 1 only).

    Gated by `project.view` rather than `dynamic_field.view`: the vocabulary is what
    `project_settings.disaster_types` is chosen from, so it belongs with the settings it
    configures, not with the fields that happen to reference it.

    `include_inactive` needs `project.edit` at the call site, on the same reasoning as
    ADR-226: seeing what somebody retired belongs with the right to retire it.
    """
    await require_scope(actor, Perm.PROJECT_VIEW, db)
    return await disaster_type_repository.list_all(db, include_inactive=include_inactive)


async def upsert_disaster_type(
    db: AsyncSession, *, actor: User, key: str, label: str | None = None,
    is_active: bool | None = None,
) -> DisasterType:
    """Add a disaster type, or edit an existing one's label / active flag (checkpoint 1 only).

    This is the reason the vocabulary is a table and not an enum (ADR-244): a disaster nobody
    planned for should cost an operator one mutation, not a deploy.

    Retiring is `is_active=False`, never a delete. Tickets already filed under a type keep
    referencing its key by string, so removing the row would leave them pointing at nothing
    and quietly drop their disaster-specific fields; deactivating stops new writes while
    leaving the history readable.
    """
    await require_scope(actor, Perm.PROJECT_EDIT, db)
    return await disaster_type_repository.upsert(
        db, key=key, label=label, is_active=is_active
    )
