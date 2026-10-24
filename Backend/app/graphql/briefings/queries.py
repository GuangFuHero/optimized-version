"""GraphQL queries for briefing templates and briefings."""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.graphql.briefings.types import (
    BriefingState,
    BriefingStatusFilter,
    BriefingTemplateType,
    BriefingType,
)
from app.graphql.context import check_permission
from app.repositories.briefings_repository import (
    briefing_repository,
    briefing_template_repository,
)


async def _can_edit(info: strawberry.types.Info) -> bool:
    """Whether the caller holds pre_departure.edit; a denial reads as False rather than raising."""
    user = info.context["user"]
    if user is None:
        return False
    scope = await resolve_scope(user, Perm.PREDEP_EDIT, info.context["db"], cache=info.context["_rbac_cache"])
    return scope != Scope.NONE


@strawberry.type
class BriefingQuery:
    """GraphQL queries for briefing templates and generated briefings."""

    @strawberry.field
    async def briefing_templates(
        self,
        info: strawberry.types.Info,
        state: BriefingState | None = None,
        tag: str | None = None,
    ) -> list[BriefingTemplateType]:
        """List non-deleted templates, optionally filtered by state and/or tag.

        Requires pre_departure.publish, not the public pre_departure.view: a template is the
        authoring surface an editor picks from, and only a generated briefing is the notice
        volunteers read.
        """
        await check_permission(info, Perm.PREDEP_PUBLISH)
        items = await briefing_template_repository.list_templates(
            info.context["db"], state=state.value if state else None, tag=tag
        )
        return [BriefingTemplateType.from_model(t) for t in items]

    @strawberry.field
    async def briefing_template(self, info: strawberry.types.Info, uuid: UUID) -> BriefingTemplateType | None:
        """Fetch a single non-deleted template by UUID.

        Requires pre_departure.publish — see `briefing_templates` for why templates, unlike
        the briefings generated from them, are not public.
        """
        await check_permission(info, Perm.PREDEP_PUBLISH)
        m = await briefing_template_repository.get_by_uuid_active(info.context["db"], uuid)
        return BriefingTemplateType.from_model(m) if m else None

    @strawberry.field
    async def briefings(
        self,
        info: strawberry.types.Info,
        state: BriefingState | None = None,
        tag: str | None = None,
        status: BriefingStatusFilter = BriefingStatusFilter.PUBLISHED,
    ) -> list[BriefingType]:
        """List non-deleted briefings, optionally filtered by state and/or tag.

        PUBLISHED lists each state's live version and is public (pre_departure.view); DRAFT and ALL
        need pre_departure.edit.
        """
        await check_permission(info, Perm.PREDEP_VIEW)
        if status is not BriefingStatusFilter.PUBLISHED:
            await check_permission(info, Perm.PREDEP_EDIT)
        items = await briefing_repository.list_briefings(
            info.context["db"], status=status.value, state=state.value if state else None, tag=tag
        )
        return [BriefingType.from_model(b) for b in items]

    @strawberry.field
    async def briefing(self, info: strawberry.types.Info, uuid: UUID) -> BriefingType | None:
        """Fetch a single non-deleted briefing by UUID; one that isn't live needs pre_departure.edit.

        Without it the result is null rather than an error, so a hidden briefing looks like a missing one.
        """
        await check_permission(info, Perm.PREDEP_VIEW)
        m = await briefing_repository.get_by_uuid_active(info.context["db"], uuid)
        if m is None or (m.status != "published" and not await _can_edit(info)):
            return None
        return BriefingType.from_model(m)
