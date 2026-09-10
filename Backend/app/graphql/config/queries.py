"""GraphQL queries for station and task property configuration schemas.

Read-checked per ADR-027: dynamic_field.view is NOT public (unlike station/ticket) — no
existing behavior requires anonymous access to config schema metadata, so it stays
login-gated. Checkpoint 1 only: these are global schema definitions, not user-owned rows.
"""

import strawberry

from app.core.permissions import Perm
from app.graphql.config.types import (
    DisasterTypeType,
    StationPropertyConfigType,
    TaskPropertyConfigType,
    TicketPropertyConfigType,
)
from app.graphql.context import check_permission
from app.repositories.config_repository import (
    station_property_config_repository,
    task_property_config_repository,
    ticket_property_config_repository,
)
from app.repositories.project_settings_repository import (
    disaster_type_repository,
    project_settings_repository,
)


@strawberry.type
class PropertyConfigQuery:
    """GraphQL queries for station and task property configuration schemas."""

    @strawberry.field
    async def station_property_configs(
        self, info: strawberry.types.Info, station_type: str, include_inactive: bool = False,
    ) -> list[StationPropertyConfigType]:
        """List property config entries for a station type (includes universal 'all' configs).

        Only fields enabled for the deployment's current disaster types and not deactivated
        are returned, ordered by sort_order, property_name, then uuid. Changing the disaster
        types in project settings is reflected here immediately — there is no "apply" step,
        which is exactly what splitting definition from activation bought (ADR-091).

        `includeInactive: true` is the management view (ADR-226): it also returns retired
        fields, which every form path hides, and is what makes a deactivated field
        recoverable at all. It needs dynamic_field.edit — seeing what someone retired belongs
        with the right to retire it, not with the right to fill in a form.

        Requires dynamic_field.view permission.
        """
        await check_permission(info, Perm.FIELD_VIEW)
        if include_inactive:
            await check_permission(info, Perm.FIELD_EDIT)
        db = info.context["db"]
        disaster_types = await project_settings_repository.get_current_disaster_types(db)
        items = await station_property_config_repository.list_by_type(
            db, station_type, disaster_types=disaster_types, include_inactive=include_inactive,
        )
        return [StationPropertyConfigType.from_model(c) for c in items]

    @strawberry.field
    async def task_property_configs(
        self, info: strawberry.types.Info, task_type: str, include_inactive: bool = False,
    ) -> list[TaskPropertyConfigType]:
        """List property config entries for a task type.

        Filtered, ordered and permission-checked on the same rules as
        station_property_configs above, `includeInactive` included.

        Requires dynamic_field.view permission.
        """
        await check_permission(info, Perm.FIELD_VIEW)
        if include_inactive:
            await check_permission(info, Perm.FIELD_EDIT)
        db = info.context["db"]
        disaster_types = await project_settings_repository.get_current_disaster_types(db)
        items = await task_property_config_repository.list_by_type(
            db, task_type, disaster_types=disaster_types, include_inactive=include_inactive,
        )
        return [TaskPropertyConfigType.from_model(c) for c in items]

    @strawberry.field
    async def ticket_property_configs(
        self,
        info: strawberry.types.Info,
        disaster_types: list[str],
        include_inactive: bool = False,
    ) -> list[TicketPropertyConfigType]:
        """List the disaster-specific fields a ticket with these disaster types should show.

        `disasterTypes` is the **ticket's own** set, not the deployment's — which is the one
        way this query differs from its station and task siblings, and it is deliberate. A
        deployment configured for {flood, landslide} must still render the fire questions on
        the one fire ticket that comes in, so `project_settings` gets no say here.

        Pass `[]` for a ticket nobody has classified yet and you get only the universal fields
        (those scoped to no particular disaster) — **not** all of them. The station and task
        queries read an empty list as "no filter" because there it means an unconfigured
        deployment; here it means an unclassified ticket, and showing every disaster's
        questions at once would be worse than showing none.

        A two-disaster ticket gets the union, each field once: `access_blocked` is a single
        row scoped to both 水災 and 土石流, so it cannot appear twice or disagree with itself.

        Ordered by property_name then uuid. Requires dynamic_field.view;
        `includeInactive: true` additionally requires dynamic_field.edit (ADR-226).
        """
        await check_permission(info, Perm.FIELD_VIEW)
        if include_inactive:
            await check_permission(info, Perm.FIELD_EDIT)
        db = info.context["db"]
        items = await ticket_property_config_repository.list_for_disasters(
            db, disaster_types, include_inactive=include_inactive,
        )
        return [TicketPropertyConfigType.from_model(c) for c in items]

    @strawberry.field
    async def disaster_types(
        self, info: strawberry.types.Info, include_inactive: bool = False
    ) -> list[DisasterTypeType]:
        """List the deployment's disaster vocabulary.

        This is the picker behind `tickets.disasterTypes`, `projectSettings.disasterTypes` and
        every field config's `disasterTypes`. All four agree by exact string equality on `key`.

        Gated by project.view rather than dynamic_field.view: the vocabulary is what the
        project settings are chosen from, not a property of any one field.
        `includeInactive: true` needs project.edit, on the ADR-226 reasoning — seeing what
        somebody retired belongs with the right to retire it.
        """
        await check_permission(info, Perm.PROJECT_VIEW)
        if include_inactive:
            await check_permission(info, Perm.PROJECT_EDIT)
        items = await disaster_type_repository.list_all(
            info.context["db"], include_inactive=include_inactive
        )
        return [DisasterTypeType.from_model(d) for d in items]
