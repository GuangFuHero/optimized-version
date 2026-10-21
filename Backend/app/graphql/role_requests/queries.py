"""GraphQL queries for role requests. Thin per ADR-014; see app/services/role_request.py."""

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.role_requests.types import (
    MyRoleRequestsType,
    RoleRequestTeam,
    RoleRequestTeamType,
    RoleRequestType,
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
        """Active teams to pick from when applying, by name; `type` narrows to gov or NGO.

        Signed in, no capability: the applicant is in no team yet, and `GET /admin/teams` lists
        only the caller's own (Spec/026).
        """
        require_authenticated(info)
        teams = await team_repository.list_joinable(
            info.context["db"], type_=type.value if type is not None else None
        )
        return [
            RoleRequestTeam(uuid=team.uuid, name=team.name, type=RoleRequestTeamType(team.type))
            for team in teams
        ]
