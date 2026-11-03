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
        """Active teams by name, for the application form's picker and the back office's team directory.

        Signed in, no capability; `type` narrows to gov or NGO. The contact is filled only for a caller
        holding a team identity or super admin (ADR-357 point 5).
        """
        actor = require_authenticated(info)
        db = info.context["db"]
        teams = await team_repository.list_joinable(db, type_=type.value if type is not None else None)
        contacts = await role_request_service.sees_team_contacts(db, actor.uuid)
        return [
            RoleRequestTeam(
                uuid=team.uuid,
                name=team.name,
                type=RoleRequestTeamType(team.type),
                contact_name=team.contact_name if contacts else None,
                contact_phone=team.contact_phone if contacts else None,
            )
            for team in teams
        ]
