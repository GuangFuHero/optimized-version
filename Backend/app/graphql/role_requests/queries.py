"""GraphQL queries for role requests. Thin per ADR-014; see app/services/role_request.py."""

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.role_requests.types import (
    MyRoleRequestsType,
    RoleRequestTeam,
    RoleRequestTeamType,
    RoleRequestType,
    TeamAdmin,
)
from app.repositories.team_repository import team_repository
from app.services import role_request as role_request_service


@strawberry.type
class RoleRequestQuery:
    """Queries for the caller's own applications."""

    @strawberry.field
    async def my_role_requests(self, info: strawberry.types.Info) -> MyRoleRequestsType:
        """The caller's applications, newest first, and whether the entry should offer to apply."""
        state = await role_request_service.my_role_requests(
            info.context["db"], actor=require_authenticated(info)
        )
        return MyRoleRequestsType(
            has_backoffice_identity=state.has_backoffice_identity,
            can_apply=state.can_apply,
            requests=[RoleRequestType.from_model(request) for request in state.requests],
        )

    @strawberry.field
    async def role_request_teams(
        self, info: strawberry.types.Info, type: RoleRequestTeamType | None = None
    ) -> list[RoleRequestTeam]:
        """Active teams by name, for the application form's picker and the back office's team directory.

        Signed in, no capability; `type` narrows to gov or NGO. Each team's admins are listed only for a
        caller who is a team admin or super admin (ADR-357 point 5), all teams' in one query.
        """
        actor = require_authenticated(info)
        db = info.context["db"]
        teams = await team_repository.list_joinable(db, type_=type.value if type is not None else None)
        admins = await role_request_service.team_directory_admins(
            db, actor.uuid, [team.uuid for team in teams]
        )
        return [
            RoleRequestTeam(
                uuid=team.uuid,
                name=team.name,
                type=RoleRequestTeamType(team.type),
                admins=None
                if admins is None
                else [
                    TeamAdmin(name=admin.name, phone=admin.phone, email=admin.email)
                    for admin in admins.get(team.uuid, [])
                ],
            )
            for team in teams
        ]
